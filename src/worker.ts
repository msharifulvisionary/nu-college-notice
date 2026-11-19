// ============================================================================
// Cloudflare Worker এন্ট্রিপয়েন্ট (Admin API + Static Assets হ্যান্ডলার)
// এখানে কোনো Node-নির্ভর প্যাকেজ (Express, axios, cheerio) ব্যবহার করা হয়নি।
// শুধুমাত্র Web Fetch API ব্যবহার করে Supabase REST/Auth, Telegram ও GitHub API কল করা হয়েছে।
// ============================================================================

export interface Env {
  // Cloudflare Static Assets বাইন্ডিং (wrangler.jsonc থেকে আসে)
  ASSETS: {
    fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
  };
  // Cloudflare Worker Secrets / Runtime Environment Variables
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string; // ফলব্যাক হিসেবে ব্যবহৃত হতে পারে
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ADMIN_EMAIL?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string; // ফরম্যাট: "owner/repo"
  GITHUB_BRANCH?: string; // অপশনাল (ডিফল্ট: "main")
  CRON_SECRET?: string; // অপশনাল (external cron-job.org ওয়েবহুকের জন্য)
}

interface SelectorConfig {
  note?: string;
  row_selector?: string;
  item?: string;
  date_selector?: string;
  date?: string;
  title_selector?: string;
  title?: string;
  link_selector?: string;
  link?: string;
  [key: string]: unknown;
}

interface CollegeRecord {
  id: string;
  name: string;
  notice_url: string;
  selector_config: SelectorConfig;
  is_active: boolean;
  telegram_chat_id?: string | null;
  telegram_thread_id?: number | null;
  last_checked_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  consecutive_failures?: number | null;
  created_at?: string;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at?: string;
}

interface TestRunRow {
  id: string;
  college_id: string | null;
  status: string;
  result: unknown;
  created_at?: string;
  updated_at?: string;
}

interface DigestNoticeRow {
  id: string;
  college_id: string;
  title: string;
  created_at: string;
  colleges?: { name?: string } | null;
}

// সাধারণ JSON রেসপন্স তৈরি করার হেল্পার
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// UUID ভ্যালিডেশন হেল্পার
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// টোকেন মাস্কিং হেল্পার (শুধুমাত্র শেষ ৪টি ক্যারেক্টার দেখায়)
function maskSecretToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '****';
  return `****${trimmed.slice(-4)}`;
}

// রিকোয়েস্ট থেকে নিরাপদভাবে JSON বডি পার্স করার হেল্পার
async function parseJsonBody<T>(
  request: Request
): Promise<{ data: T; errorResponse?: undefined } | { data?: undefined; errorResponse: Response }> {
  try {
    const data = (await request.json()) as T;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        errorResponse: jsonResponse({ error: 'সঠিক JSON অবজেক্ট পাঠানো হয়নি।' }, 400),
      };
    }
    return { data };
  } catch {
    return {
      errorResponse: jsonResponse({ error: 'অনুরোধের JSON ফরম্যাট সঠিক নয়।' }, 400),
    };
  }
}

// Supabase URL সাধারণ ফরম্যাটে আনার হেল্পার (শেষের "/" বাদ দেয়)
function getCleanSupabaseUrl(env: Env): string {
  return (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

// GITHUB_REPO থেকে "owner/repo" অংশ বের করার হেল্পার
function normalizeGithubRepo(rawRepo: string | undefined): string {
  return (rawRepo || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

// কাস্টম টেলিগ্রাম Thread ID যাচাই করার হেল্পার
function parseOptionalThreadId(raw: unknown): { valid: boolean; value: number | null } {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: true, value: null };
  }
  const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num) || num <= 0) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}

// কাস্টম টেলিগ্রাম Chat ID পরিষ্কার করার হেল্পার
function cleanOptionalChatId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^\./, '');
  return trimmed || null;
}

interface WorkerTelegramTarget {
  chatId: string;
  threadId?: number;
}

// কমা বা নতুন লাইন দিয়ে আলাদা করা Chat ID (এবং ঐচ্ছিক #topic বা :topic) পার্স করার হেল্পার
function parseWorkerTelegramTargets(
  raw: string | null | undefined,
  fallbackThreadId?: number | null
): WorkerTelegramTarget[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const targets: WorkerTelegramTarget[] = [];
  const defaultThread =
    typeof fallbackThreadId === 'number' && Number.isInteger(fallbackThreadId) && fallbackThreadId > 0
      ? fallbackThreadId
      : undefined;

  for (const part of raw.split(/[,\n]+/)) {
    const trimmed = part.trim().replace(/^\./, '');
    if (!trimmed) continue;

    let chatId = trimmed;
    let threadId = defaultThread;

    const topicMatch = trimmed.match(/^(-?\d+|@[a-zA-Z0-9_]+)\s*[#:\/]\s*(\d+)$/);
    if (topicMatch) {
      chatId = topicMatch[1].trim();
      const parsedTopic = Number(topicMatch[2]);
      if (Number.isInteger(parsedTopic) && parsedTopic > 0) {
        threadId = parsedTopic;
      }
    }

    const dedupeKey = `${chatId}#${threadId || ''}`;
    if (chatId && !seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      targets.push({ chatId, ...(threadId ? { threadId } : {}) });
    }
  }
  return targets;
}

// শুধু ইউনিক Chat ID তালিকা বের করার হেল্পার (Admin sender যাচাই ও সাবস্ক্রিপশনের জন্য)
function parseWorkerChatIdList(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const t of parseWorkerTelegramTargets(raw)) {
    if (!seen.has(t.chatId)) {
      seen.add(t.chatId);
      list.push(t.chatId);
    }
  }
  return list;
}

// Supabase PostgREST API কল করার হেল্পার (Service Role Key সহ)
async function supabaseRest<T>(
  env: Env,
  pathAndQuery: string,
  options: {
    method?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<{ ok: boolean; status: number; data: T | null; errorMessage?: string }> {
  const baseUrl = getCleanSupabaseUrl(env);
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!baseUrl || !serviceKey) {
    return {
      ok: false,
      status: 500,
      data: null,
      errorMessage: 'Worker-এ SUPABASE_URL বা SUPABASE_SERVICE_ROLE_KEY সেট করা নেই।',
    };
  }

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  if (options.prefer) {
    headers['Prefer'] = options.prefer;
  }

  try {
    const res = await fetch(`${baseUrl}/rest/v1/${pathAndQuery}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const rawText = await res.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const errObj = parsed as { message?: string; error?: string; details?: string } | null;
      const errMsg =
        errObj?.message || errObj?.error || errObj?.details || `Supabase ত্রুটি (HTTP ${res.status})`;
      return {
        ok: false,
        status: res.status,
        data: null,
        errorMessage: errMsg,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsed as T,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      data: null,
      errorMessage: `Supabase সংযোগে সমস্যা হয়েছে: ${msg}`,
    };
  }
}

// ============================================================================
// এডমিন প্রমাণীকরণ (Supabase Auth Token যাচাই + ADMIN_EMAIL ম্যাচিং)
// ============================================================================
async function verifyAdminRequest(
  request: Request,
  env: Env
): Promise<{ email: string; errorResponse?: undefined } | { email?: undefined; errorResponse: Response }> {
  const baseUrl = getCleanSupabaseUrl(env);
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();

  const missingSecrets: string[] = [];
  if (!baseUrl) missingSecrets.push('SUPABASE_URL');
  if (!serviceKey) missingSecrets.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!adminEmail) missingSecrets.push('ADMIN_EMAIL');

  if (missingSecrets.length > 0) {
    return {
      errorResponse: jsonResponse(
        {
          error: `সার্ভারে প্রয়োজনীয় Worker Runtime সিক্রেট (${missingSecrets.join(
            ', '
          )}) কনফিগার করা নেই। Cloudflare Worker > Settings > Variables and Secrets অংশে এগুলো যোগ করে পুনরায় ডিপ্লয় করুন (Build variables-এ দিলে রানটাইমে পাওয়া যায় না)।`,
        },
        500
      ),
    };
  }

  const authHeader = request.headers.get('Authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = tokenMatch?.[1]?.trim();

  if (!accessToken) {
    return {
      errorResponse: jsonResponse(
        { error: 'অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে এডমিন হিসেবে লগইন করুন।' },
        401
      ),
    };
  }

  try {
    // Supabase Auth থেকে টোকেন যাচাই করে ইউজারের তথ্য আনা হচ্ছে
    const userRes = await fetch(`${baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      return {
        errorResponse: jsonResponse(
          { error: 'আপনার লগইন সেশনের মেয়াদ শেষ হয়েছে বা টোকেন সঠিক নয়। পুনরায় লগইন করুন।' },
          401
        ),
      };
    }

    const userData = (await userRes.json()) as { email?: string };
    const userEmail = (userData.email || '').trim().toLowerCase();

    if (!userEmail || userEmail !== adminEmail) {
      return {
        errorResponse: jsonResponse(
          { error: 'এই একাউন্টের এডমিন ড্যাশবোর্ড ব্যবহারের অনুমতি নেই।' },
          403
        ),
      };
    }

    return { email: userEmail };
  } catch {
    return {
      errorResponse: jsonResponse(
        { error: 'লগইন টোকেন যাচাই করার সময় নেটওয়ার্ক সমস্যা হয়েছে।' },
        502
      ),
    };
  }
}

// ============================================================================
// সেটিংস টেবিল থেকে টেলিগ্রাম বট টোকেন ও চ্যাট আইডি পড়ার হেল্পার
// ============================================================================
async function fetchTelegramSettings(env: Env): Promise<{
  ok: boolean;
  botToken: string;
  chatId: string;
  threadId: number | null;
  errorMessage?: string;
}> {
  const res = await supabaseRest<SettingRow[]>(
    env,
    'settings?key=in.(telegram_bot_token,telegram_chat_id,telegram_thread_id)&select=key,value'
  );

  if (!res.ok || !res.data) {
    return {
      ok: false,
      botToken: '',
      chatId: '',
      threadId: null,
      errorMessage: res.errorMessage || 'সেটিংস টেবিল থেকে তথ্য পড়া যায়নি।',
    };
  }

  let botToken = '';
  let chatId = '';
  let threadId: number | null = null;

  for (const row of res.data) {
    if (row.key === 'telegram_bot_token') botToken = (row.value || '').trim();
    if (row.key === 'telegram_chat_id') chatId = (row.value || '').trim();
    if (row.key === 'telegram_thread_id') {
      const parsedNum = Number((row.value || '').trim());
      if (Number.isInteger(parsedNum) && parsedNum > 0) {
        threadId = parsedNum;
      }
    }
  }

  return { ok: true, botToken, chatId, threadId };
}

// ============================================================================
// কলেজ সংক্রান্ত হ্যান্ডলারসমূহ (/api/admin/colleges)
// ============================================================================
async function handleGetColleges(env: Env): Promise<Response> {
  const res = await supabaseRest<CollegeRecord[]>(
    env,
    'colleges?select=*&order=created_at.desc'
  );

  if (!res.ok) {
    return jsonResponse(
      { error: `কলেজ তালিকা লোড করতে সমস্যা হয়েছে: ${res.errorMessage}` },
      res.status >= 400 ? res.status : 500
    );
  }

  return jsonResponse({ colleges: res.data || [] });
}

async function handleCreateCollege(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJsonBody<{
    name?: unknown;
    notice_url?: unknown;
    selector_config?: unknown;
    is_active?: unknown;
    telegram_chat_id?: unknown;
    telegram_thread_id?: unknown;
  }>(request);
  if (parsed.errorResponse || !parsed.data) return parsed.errorResponse as Response;

  const name = typeof parsed.data.name === 'string' ? parsed.data.name.trim() : '';
  const noticeUrl = typeof parsed.data.notice_url === 'string' ? parsed.data.notice_url.trim() : '';
  const isActive = typeof parsed.data.is_active === 'boolean' ? parsed.data.is_active : true;
  const telegramChatId = cleanOptionalChatId(parsed.data.telegram_chat_id);
  const parsedThread = parseOptionalThreadId(parsed.data.telegram_thread_id);

  if (!name) {
    return jsonResponse({ error: 'কলেজের নাম অবশ্যই দিতে হবে।' }, 400);
  }

  try {
    const urlObj = new URL(noticeUrl);
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return jsonResponse({ error: 'সঠিক HTTP বা HTTPS নোটিশ বোর্ড URL দিন।' }, 400);
    }
  } catch {
    return jsonResponse({ error: 'সঠিক নোটিশ বোর্ড URL ফরম্যাট দিন।' }, 400);
  }

  if (!parsedThread.valid) {
    return jsonResponse(
      { error: 'টেলিগ্রাম Topic / Thread ID অবশ্যই একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।' },
      400
    );
  }

  const rawSelectorConfig = parsed.data.selector_config;
  const selectorConfig =
    rawSelectorConfig &&
    typeof rawSelectorConfig === 'object' &&
    !Array.isArray(rawSelectorConfig)
      ? rawSelectorConfig
      : {
          row_selector: 'table tbody tr',
          date_selector: 'td:nth-child(2)',
          title_selector: 'td:nth-child(3)',
          link_selector: 'td:nth-child(4) a, a',
        };

  const res = await supabaseRest<CollegeRecord[]>(env, 'colleges', {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      {
        name,
        notice_url: noticeUrl,
        selector_config: selectorConfig,
        is_active: isActive,
        telegram_chat_id: telegramChatId,
        telegram_thread_id: parsedThread.value,
      },
    ],
  });

  if (!res.ok || !res.data || res.data.length === 0) {
    return jsonResponse(
      { error: `নতুন কলেজ সেভ করতে ব্যর্থ হয়েছে: ${res.errorMessage}` },
      res.status >= 400 ? res.status : 500
    );
  }

  const newCollege = res.data[0];

  // নতুন কলেজ যোগ হওয়ার সাথে সাথেই সর্বশেষ ২০টি নোটিশ বেসলাইন হিসেবে সেভ করার জন্য ব্যাকগ্রাউন্ড রান চালু করা হচ্ছে
  let baselineRunId: string | null = null;
  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);
  if (githubToken && githubRepo) {
    const createBaselineRes = await supabaseRest<TestRunRow[]>(env, 'test_runs', {
      method: 'POST',
      prefer: 'return=representation',
      body: [
        {
          college_id: newCollege.id,
          status: 'pending',
          result: { mode: 'baseline' },
        },
      ],
    });

    if (createBaselineRes.ok && createBaselineRes.data && createBaselineRes.data.length > 0) {
      baselineRunId = createBaselineRes.data[0].id;
      const dispatchRes = await dispatchScraperWorkflow(env, baselineRunId, {
        mode: 'baseline',
        college_id: newCollege.id,
        test_run_id: baselineRunId,
      });
      if (!dispatchRes.ok) {
        baselineRunId = null;
      }
    }
  }

  return jsonResponse(
    {
      college: newCollege,
      baseline_run_id: baselineRunId,
      message: baselineRunId
        ? 'নতুন কলেজ যুক্ত হয়েছে এবং সর্বশেষ ২০টি নোটিশ সংগ্রহ শুরু হয়েছে।'
        : 'নতুন কলেজ সফলভাবে যুক্ত হয়েছে।',
    },
    201
  );
}

async function handleUpdateCollege(request: Request, env: Env, id: string): Promise<Response> {
  if (!isValidUuid(id)) {
    return jsonResponse({ error: 'সঠিক কলেজ ID দেওয়া হয়নি।' }, 400);
  }

  const parsed = await parseJsonBody<{
    name?: unknown;
    notice_url?: unknown;
    selector_config?: unknown;
    is_active?: unknown;
    telegram_chat_id?: unknown;
    telegram_thread_id?: unknown;
  }>(request);
  if (parsed.errorResponse || !parsed.data) return parsed.errorResponse as Response;

  const updates: Record<string, unknown> = {};

  if (parsed.data.name !== undefined) {
    if (typeof parsed.data.name !== 'string' || !parsed.data.name.trim()) {
      return jsonResponse({ error: 'কলেজের নাম ফাঁকা রাখা যাবে না।' }, 400);
    }
    updates.name = parsed.data.name.trim();
  }

  if (parsed.data.notice_url !== undefined) {
    if (typeof parsed.data.notice_url !== 'string') {
      return jsonResponse({ error: 'সঠিক নোটিশ বোর্ড URL দিন।' }, 400);
    }
    const cleanUrl = parsed.data.notice_url.trim();
    try {
      const urlObj = new URL(cleanUrl);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return jsonResponse({ error: 'সঠিক HTTP বা HTTPS নোটিশ বোর্ড URL দিন।' }, 400);
      }
    } catch {
      return jsonResponse({ error: 'সঠিক নোটিশ বোর্ড URL ফরম্যাট দিন।' }, 400);
    }
    updates.notice_url = cleanUrl;
  }

  if (parsed.data.selector_config !== undefined) {
    if (
      !parsed.data.selector_config ||
      typeof parsed.data.selector_config !== 'object' ||
      Array.isArray(parsed.data.selector_config)
    ) {
      return jsonResponse({ error: 'selector_config অবশ্যই একটি বৈধ JSON অবজেক্ট হতে হবে।' }, 400);
    }
    updates.selector_config = parsed.data.selector_config;
  }

  if (parsed.data.is_active !== undefined) {
    if (typeof parsed.data.is_active !== 'boolean') {
      return jsonResponse({ error: 'is_active মান অবশ্যই true বা false হতে হবে।' }, 400);
    }
    updates.is_active = parsed.data.is_active;
  }

  if (parsed.data.telegram_chat_id !== undefined) {
    updates.telegram_chat_id = cleanOptionalChatId(parsed.data.telegram_chat_id);
  }

  if (parsed.data.telegram_thread_id !== undefined) {
    const parsedThread = parseOptionalThreadId(parsed.data.telegram_thread_id);
    if (!parsedThread.valid) {
      return jsonResponse(
        { error: 'টেলিগ্রাম Topic / Thread ID অবশ্যই একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।' },
        400
      );
    }
    updates.telegram_thread_id = parsedThread.value;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: 'আপডেট করার জন্য কোনো তথ্য পাঠানো হয়নি।' }, 400);
  }

  const res = await supabaseRest<CollegeRecord[]>(env, `colleges?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: updates,
  });

  if (!res.ok) {
    return jsonResponse(
      { error: `কলেজের তথ্য আপডেট করা যায়নি: ${res.errorMessage}` },
      res.status >= 400 ? res.status : 500
    );
  }

  if (!res.data || res.data.length === 0) {
    return jsonResponse({ error: 'এই ID দিয়ে কোনো কলেজ পাওয়া যায়নি।' }, 404);
  }

  return jsonResponse({
    college: res.data[0],
    message: 'কলেজের তথ্য সফলভাবে আপডেট করা হয়েছে।',
  });
}

async function handleDeleteCollege(env: Env, id: string): Promise<Response> {
  if (!isValidUuid(id)) {
    return jsonResponse({ error: 'সঠিক কলেজ ID দেওয়া হয়নি।' }, 400);
  }

  // notices টেবিলে ON DELETE CASCADE থাকায় কলেজ ডিলিট হলে নোটিশগুলো স্বয়ংক্রিয়ভাবে ডিলিট হবে
  const res = await supabaseRest<CollegeRecord[]>(env, `colleges?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=representation',
  });

  if (!res.ok) {
    return jsonResponse(
      { error: `কলেজ মুছে ফেলতে সমস্যা হয়েছে: ${res.errorMessage}` },
      res.status >= 400 ? res.status : 500
    );
  }

  if (!res.data || res.data.length === 0) {
    return jsonResponse({ error: 'এই ID দিয়ে কোনো কলেজ পাওয়া যায়নি।' }, 404);
  }

  return jsonResponse({
    deleted: true,
    id,
    message: 'কলেজ এবং এর সংশ্লিষ্ট নোটিশগুলো ডাটাবেজ থেকে মুছে ফেলা হয়েছে।',
  });
}

// ============================================================================
// টেলিগ্রাম সেটিংস, টেস্ট মেসেজ ও ডেইলি ডাইজেস্ট হ্যান্ডলারসমূহ
// ============================================================================
async function handleGetSettings(env: Env): Promise<Response> {
  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ error: settings.errorMessage }, 500);
  }

  return jsonResponse({
    telegram_bot_token_masked: maskSecretToken(settings.botToken),
    has_telegram_bot_token: Boolean(settings.botToken),
    telegram_chat_id: settings.chatId,
    telegram_thread_id: settings.threadId,
  });
}

async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJsonBody<{
    telegram_bot_token?: unknown;
    telegram_chat_id?: unknown;
    telegram_thread_id?: unknown;
  }>(request);
  if (parsed.errorResponse || !parsed.data) return parsed.errorResponse as Response;

  const rawToken =
    typeof parsed.data.telegram_bot_token === 'string' ? parsed.data.telegram_bot_token.trim() : '';
  const rawChatId =
    typeof parsed.data.telegram_chat_id === 'string' ? parsed.data.telegram_chat_id.trim() : undefined;

  const nowIso = new Date().toISOString();
  const rowsToUpsert: SettingRow[] = [];

  // যদি নতুন টোকেন দেওয়া হয় (এবং সেটি মাস্ক করা স্ট্রিং না হয়), তবেই টোকেন আপডেট হবে; ফাঁকা থাকলে পুরনো টোকেন অক্ষত থাকবে
  if (rawToken && !rawToken.startsWith('****')) {
    rowsToUpsert.push({
      key: 'telegram_bot_token',
      value: rawToken,
      updated_at: nowIso,
    });
  }

  if (rawChatId !== undefined) {
    const cleanChatId = rawChatId.replace(/^\./, '');
    if (!cleanChatId) {
      return jsonResponse({ error: 'Telegram Chat ID ফাঁকা রাখা যাবে না।' }, 400);
    }
    rowsToUpsert.push({
      key: 'telegram_chat_id',
      value: cleanChatId,
      updated_at: nowIso,
    });
  }

  if (parsed.data.telegram_thread_id !== undefined) {
    const parsedThread = parseOptionalThreadId(parsed.data.telegram_thread_id);
    if (!parsedThread.valid) {
      return jsonResponse(
        { error: 'ডিফল্ট Topic / Thread ID অবশ্যই একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।' },
        400
      );
    }
    rowsToUpsert.push({
      key: 'telegram_thread_id',
      value: parsedThread.value ? String(parsedThread.value) : '',
      updated_at: nowIso,
    });
  }

  if (rowsToUpsert.length === 0) {
    return jsonResponse({ error: 'সেভ করার জন্য অন্তত Chat ID বা নতুন Bot Token দিন।' }, 400);
  }

  const upsertRes = await supabaseRest<SettingRow[]>(env, 'settings?on_conflict=key', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: rowsToUpsert,
  });

  if (!upsertRes.ok) {
    return jsonResponse(
      { error: `টেলিগ্রাম সেটিংস সেভ করতে সমস্যা হয়েছে: ${upsertRes.errorMessage}` },
      upsertRes.status >= 400 ? upsertRes.status : 500
    );
  }

  const latest = await fetchTelegramSettings(env);
  return jsonResponse({
    telegram_bot_token_masked: maskSecretToken(latest.botToken),
    has_telegram_bot_token: Boolean(latest.botToken),
    telegram_chat_id: latest.chatId,
    telegram_thread_id: latest.threadId,
    message: 'টেলিগ্রাম সেটিংস সফলভাবে ডাটাবেজে সংরক্ষণ করা হয়েছে।',
  });
}

async function handleTelegramTest(request: Request, env: Env): Promise<Response> {
  let customMessage = '';
  let overrideChatId = '';
  let overrideThreadId: number | null = null;
  try {
    const body = (await request.json()) as {
      message?: unknown;
      chat_id?: unknown;
      thread_id?: unknown;
    };
    if (body && typeof body.message === 'string') {
      customMessage = body.message.trim();
    }
    if (body && typeof body.chat_id === 'string') {
      overrideChatId = body.chat_id.trim();
    }
    if (body && body.thread_id !== undefined && body.thread_id !== null && body.thread_id !== '') {
      const parsedThread = parseOptionalThreadId(body.thread_id);
      if (!parsedThread.valid) {
        return jsonResponse(
          { ok: false, error: 'Topic / Thread ID অবশ্যই একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।' },
          400
        );
      }
      overrideThreadId = parsedThread.value;
    }
  } catch {
    // খালি বডি অনুমোদিত
  }

  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ ok: false, error: settings.errorMessage }, 500);
  }

  if (!settings.botToken) {
    return jsonResponse(
      {
        ok: false,
        error: 'ডাটাবেজে Telegram Bot Token সেভ করা নেই। অনুগ্রহ করে আগে টোকেন সেভ করুন।',
      },
      400
    );
  }

  const rawTargetChat = overrideChatId || settings.chatId;
  const fallbackThread =
    overrideThreadId !== null
      ? overrideThreadId
      : overrideChatId
        ? null
        : settings.threadId;
  const targets = parseWorkerTelegramTargets(rawTargetChat, fallbackThread);

  if (targets.length === 0) {
    return jsonResponse(
      { ok: false, error: 'সঠিক Telegram Chat ID পাওয়া যায়নি। আগে সেটিংস সেভ করুন বা Chat ID দিন।' },
      400
    );
  }

  const textToSend =
    customMessage ||
    '🧪 টেস্ট নোটিফিকেশন: Multi-College Notice Tracker ও টেলিগ্রাম বট সঠিকভাবে যুক্ত আছে!';

  let sentCount = 0;
  let lastError = '';
  let lastTgData: { ok?: boolean; description?: string; error_code?: number } = {};

  for (const target of targets) {
    try {
      const payload: Record<string, unknown> = {
        chat_id: target.chatId,
        text: textToSend,
        disable_web_page_preview: false,
      };
      if (target.threadId) {
        payload.message_thread_id = target.threadId;
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const tgData = (await tgRes.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        error_code?: number;
      };
      lastTgData = tgData;

      if (tgRes.ok && tgData.ok) {
        sentCount += 1;
      } else {
        lastError =
          tgData.description ||
          `টেলিগ্রাম মেসেজ পাঠানো যায়নি (HTTP ${tgRes.status})। টোকেন, চ্যাট ও টপিক আইডি যাচাই করুন।`;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (sentCount === 0) {
    return jsonResponse(
      {
        ok: false,
        error: lastError || 'টেলিগ্রাম API-এর সাথে সংযোগ ব্যর্থ হয়েছে।',
        telegram_response: lastTgData,
      },
      400
    );
  }

  return jsonResponse({
    ok: true,
    message:
      targets.length > 1
        ? `টেলিগ্রাম টেস্ট মেসেজ ${sentCount}/${targets.length}টি চ্যাট/টপিকে সফলভাবে পাঠানো হয়েছে!`
        : targets[0].threadId
          ? `টেলিগ্রাম টেস্ট মেসেজ সফলভাবে সুপারগ্রুপ টপিক #${targets[0].threadId}-এ পাঠানো হয়েছে!`
          : 'টেলিগ্রাম টেস্ট মেসেজ সফলভাবে পাঠানো হয়েছে!',
    telegram_response: { ok: true },
  });
}

async function buildDailyDigestData(env: Env): Promise<{
  ok: boolean;
  text?: string;
  dhakaDate?: string;
  activeCollegesCount?: number;
  todayNoticesCount?: number;
  error?: string;
}> {
  const now = new Date();
  const dhakaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now);
  const startOfDhakaDayUtc = new Date(`${dhakaDate}T00:00:00+06:00`).toISOString();

  const [collegesRes, noticesRes] = await Promise.all([
    supabaseRest<CollegeRecord[]>(
      env,
      'colleges?select=id,name,is_active,last_status,consecutive_failures'
    ),
    supabaseRest<DigestNoticeRow[]>(
      env,
      `notices?created_at=gte.${encodeURIComponent(startOfDhakaDayUtc)}&select=id,college_id,title,created_at,colleges(name)`
    ),
  ]);

  if (!collegesRes.ok || !noticesRes.ok) {
    return {
      ok: false,
      error:
        collegesRes.errorMessage ||
        noticesRes.errorMessage ||
        'ডাইজেস্টের জন্য ডাটা সংগ্রহ করা যায়নি।',
    };
  }

  const allColleges = collegesRes.data || [];
  const activeColleges = allColleges.filter((c) => c.is_active);
  const errorColleges = activeColleges.filter((c) => c.last_status === 'error');
  const todayNotices = noticesRes.data || [];

  const countsByCollege = new Map<string, { name: string; count: number }>();
  for (const n of todayNotices) {
    const collegeName = n.colleges?.name || 'অজানা কলেজ';
    const current = countsByCollege.get(n.college_id) || { name: collegeName, count: 0 };
    current.count += 1;
    countsByCollege.set(n.college_id, current);
  }

  const lines: string[] = [
    `📊 দৈনিক নোটিশ ডাইজেস্ট (${dhakaDate})`,
    '',
    `🏫 সক্রিয় কলেজ: ${activeColleges.length} টি`,
    `📰 আজকের মোট নতুন নোটিশ: ${todayNotices.length} টি`,
  ];

  if (countsByCollege.size > 0) {
    lines.push('', '📌 কলেজভিত্তিক সারসংক্ষেপ:');
    for (const item of countsByCollege.values()) {
      lines.push(`• ${item.name}: ${item.count} টি`);
    }
  } else {
    lines.push('', 'ℹ️ আজ এখনো কোনো নতুন নোটিশ যুক্ত হয়নি।');
  }

  if (errorColleges.length > 0) {
    lines.push('', `⚠️ স্ক্যান সমস্যাযুক্ত কলেজ (${errorColleges.length} টি):`);
    for (const errCol of errorColleges) {
      lines.push(`• ${errCol.name} (টানা ${errCol.consecutive_failures || 1} বার ব্যর্থ)`);
    }
  }

  return {
    ok: true,
    text: lines.join('\n'),
    dhakaDate,
    activeCollegesCount: activeColleges.length,
    todayNoticesCount: todayNotices.length,
  };
}

// এডমিন থেকে তাৎক্ষণিক আজকের ডেইলি ডাইজেস্ট পাঠানোর হ্যান্ডলার
async function handleSendDailyDigest(env: Env): Promise<Response> {
  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ ok: false, error: settings.errorMessage }, 500);
  }

  if (!settings.botToken || !settings.chatId) {
    return jsonResponse(
      {
        ok: false,
        error: 'ডাটাবেজে Telegram Bot Token বা Chat ID সেভ করা নেই। আগে সেটিংস সেভ করুন।',
      },
      400
    );
  }

  const digestData = await buildDailyDigestData(env);
  if (!digestData.ok || !digestData.text) {
    return jsonResponse({ ok: false, error: digestData.error || 'ডাইজেস্ট তৈরি করা যায়নি।' }, 500);
  }

  const digestText = digestData.text;
  const targets = parseWorkerTelegramTargets(settings.chatId, settings.threadId);
  if (targets.length === 0) {
    return jsonResponse({ ok: false, error: 'সঠিক Telegram Chat ID পাওয়া যায়নি।' }, 400);
  }

  let sentCount = 0;
  let lastError = '';

  for (const target of targets) {
    try {
      const payload: Record<string, unknown> = {
        chat_id: target.chatId,
        text: digestText,
        disable_web_page_preview: true,
      };
      if (target.threadId) {
        payload.message_thread_id = target.threadId;
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const tgData = (await tgRes.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
      };

      if (tgRes.ok && tgData.ok) {
        sentCount += 1;
      } else {
        lastError = tgData.description || `ডাইজেস্ট পাঠানো যায়নি (HTTP ${tgRes.status})।`;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (sentCount === 0) {
    return jsonResponse(
      { ok: false, error: lastError || 'টেলিগ্রাম সংযোগে সমস্যা হয়েছে।' },
      400
    );
  }

  return jsonResponse({
    ok: true,
    message: `আজকের ডেইলি ডাইজেস্ট (${digestData.todayNoticesCount || 0} টি নোটিশ) সফলভাবে ${sentCount}টি টেলিগ্রাম চ্যাট/টপিকে পাঠানো হয়েছে!`,
    summary: {
      date: digestData.dhakaDate,
      active_colleges: digestData.activeCollegesCount || 0,
      total_notices_today: digestData.todayNoticesCount || 0,
    },
  });
}

// এডমিন ম্যানুয়াল ব্রডকাস্ট প্যানেল হ্যান্ডলার (POST /api/admin/broadcast)
async function handleAdminBroadcast(request: Request, env: Env): Promise<Response> {
  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ ok: false, error: settings.errorMessage }, 500);
  }

  if (!settings.botToken) {
    return jsonResponse(
      { ok: false, error: 'আগে Telegram Bot Token ও Chat ID সেভ করুন।' },
      400
    );
  }

  const parsed = await parseJsonBody<{
    message?: unknown;
    image_url?: unknown;
    target?: unknown;
    custom_chat_ids?: unknown;
  }>(request);
  if (parsed.errorResponse || !parsed.data) return parsed.errorResponse as Response;

  const rawMessage = typeof parsed.data.message === 'string' ? parsed.data.message.trim() : '';
  const rawImageUrl = typeof parsed.data.image_url === 'string' ? parsed.data.image_url.trim() : '';
  const targetMode =
    parsed.data.target === 'default' || parsed.data.target === 'custom' ? parsed.data.target : 'all';
  const customChatIdsRaw =
    typeof parsed.data.custom_chat_ids === 'string' ? parsed.data.custom_chat_ids.trim() : '';

  if (!rawMessage) {
    return jsonResponse({ ok: false, error: 'ব্রডকাস্ট মেসেজ ফাঁকা রাখা যাবে না।' }, 400);
  }

  if (rawImageUrl) {
    try {
      const imgUrl = new URL(rawImageUrl);
      if (imgUrl.protocol !== 'http:' && imgUrl.protocol !== 'https:') {
        return jsonResponse({ ok: false, error: 'সঠিক HTTP বা HTTPS ইমেজ URL দিন।' }, 400);
      }
    } catch {
      return jsonResponse({ ok: false, error: 'ইমেজ URL ফরম্যাট সঠিক নয়।' }, 400);
    }
  }

  const targetMap = new Map<string, WorkerTelegramTarget>();
  const addTarget = (target: WorkerTelegramTarget) => {
    const key = `${target.chatId}#${target.threadId || ''}`;
    if (!targetMap.has(key)) {
      targetMap.set(key, target);
    }
  };

  if (targetMode === 'custom') {
    for (const t of parseWorkerTelegramTargets(customChatIdsRaw)) {
      addTarget(t);
    }
    if (targetMap.size === 0) {
      return jsonResponse(
        { ok: false, error: 'কাস্টম ব্রডকাস্টের জন্য অন্তত একটি Chat ID দিন।' },
        400
      );
    }
  } else {
    for (const t of parseWorkerTelegramTargets(settings.chatId, settings.threadId)) {
      addTarget(t);
    }
    if (targetMode === 'all') {
      const collegesRes = await supabaseRest<CollegeRecord[]>(
        env,
        'colleges?is_active=eq.true&select=telegram_chat_id,telegram_thread_id'
      );
      if (collegesRes.ok && collegesRes.data) {
        for (const col of collegesRes.data) {
          if (col.telegram_chat_id && col.telegram_chat_id.trim()) {
            for (const t of parseWorkerTelegramTargets(col.telegram_chat_id, col.telegram_thread_id)) {
              addTarget(t);
            }
          } else if (typeof col.telegram_thread_id === 'number' && col.telegram_thread_id > 0) {
            for (const t of parseWorkerTelegramTargets(settings.chatId, col.telegram_thread_id)) {
              addTarget(t);
            }
          }
        }
      }
    }
  }

  const targets = Array.from(targetMap.values());
  if (targets.length === 0) {
    return jsonResponse(
      { ok: false, error: 'কোনো ডিফল্ট বা যুক্ত টেলিগ্রাম চ্যানেল/গ্রুপ পাওয়া যায়নি।' },
      400
    );
  }

  let sentCount = 0;
  let failedCount = 0;
  let lastError = '';

  const formattedBroadcast = `📢 এডমিন ঘোষণা\n\n${rawMessage}`;

  for (const target of targets) {
    let delivered = false;
    if (rawImageUrl) {
      const caption =
        formattedBroadcast.length > 1000
          ? `${formattedBroadcast.slice(0, 997)}...`
          : formattedBroadcast;
      const photoBody: Record<string, unknown> = {
        chat_id: target.chatId,
        photo: rawImageUrl,
        caption,
      };
      if (target.threadId) photoBody.message_thread_id = target.threadId;

      try {
        const pRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(photoBody),
        });
        const pJson = (await pRes.json().catch(() => ({}))) as { ok?: boolean; description?: string };
        if (pRes.ok && pJson.ok) {
          delivered = true;
        } else {
          lastError = pJson.description || `Photo HTTP ${pRes.status}`;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!delivered) {
      const msgBody: Record<string, unknown> = {
        chat_id: target.chatId,
        text: rawImageUrl ? `${formattedBroadcast}\n\n🖼️ ছবি: ${rawImageUrl}` : formattedBroadcast,
        disable_web_page_preview: false,
      };
      if (target.threadId) msgBody.message_thread_id = target.threadId;

      try {
        const mRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody),
        });
        const mJson = (await mRes.json().catch(() => ({}))) as { ok?: boolean; description?: string };
        if (mRes.ok && mJson.ok) {
          delivered = true;
        } else {
          lastError = mJson.description || `HTTP ${mRes.status}`;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (delivered) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  if (sentCount === 0) {
    return jsonResponse(
      {
        ok: false,
        sent_count: 0,
        total_targets: targets.length,
        failed_count: failedCount,
        error: lastError || 'কোনো গ্রুপ বা চ্যানেলে ব্রডকাস্ট পাঠানো যায়নি।',
      },
      400
    );
  }

  return jsonResponse({
    ok: true,
    sent_count: sentCount,
    total_targets: targets.length,
    failed_count: failedCount,
    message:
      failedCount > 0
        ? `মোট ${sentCount}/${targets.length}টি গ্রুপ/চ্যানেলে ব্রডকাস্ট পাঠানো হয়েছে (${failedCount}টি ব্যর্থ)।`
        : `সফলভাবে সবগুলো (${sentCount}টি) গ্রুপ/চ্যানেলে ঘোষণা ব্রডকাস্ট করা হয়েছে!`,
  });
}

// ============================================================================
// GitHub Actions workflow_dispatch ট্রিগার হেল্পার (টেস্ট রান ও সব-স্ক্যান)
// ============================================================================
async function dispatchScraperWorkflow(
  env: Env,
  runId: string,
  inputs: { mode: 'test' | 'normal' | 'baseline'; college_id: string; test_run_id: string }
): Promise<Response> {
  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);
  const githubBranch = (env.GITHUB_BRANCH || 'main').trim() || 'main';

  const dispatchUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/notice-check.yml/dispatches`;

  try {
    const ghRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nu-college-notice-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: githubBranch,
        inputs,
      }),
    });

    if (!ghRes.ok) {
      const ghBody = await ghRes.text().catch(() => '');
      let ghMessage = `GitHub API ত্রুটি (HTTP ${ghRes.status})`;
      try {
        const ghJson = JSON.parse(ghBody) as { message?: string };
        if (ghJson?.message) ghMessage = ghJson.message;
      } catch {
        // কাঁচা টেক্সট ইগনোর
      }

      await supabaseRest(env, `test_runs?id=eq.${encodeURIComponent(runId)}`, {
        method: 'PATCH',
        body: {
          status: 'error',
          updated_at: new Date().toISOString(),
          result: {
            mode: inputs.mode,
            error: {
              name: 'GitHubDispatchError',
              message: `GitHub Actions ওয়ার্কফ্লো ট্রিগার করা যায়নি: ${ghMessage}`,
              status: ghRes.status,
            },
          },
        },
      });

      return jsonResponse(
        {
          error: `GitHub Actions ওয়ার্কফ্লো শুরু করতে ব্যর্থ হয়েছে: ${ghMessage}`,
        },
        502
      );
    }

    return jsonResponse(
      {
        test_run_id: runId,
        status: 'pending',
        message:
          inputs.mode === 'normal'
            ? 'সব সক্রিয় কলেজের স্ক্যান শুরু হয়েছে। ফলাফল পেতে কয়েক সেকেন্ড অপেক্ষা করুন...'
            : 'টেস্ট রান শুরু হয়েছে। ফলাফল পেতে কয়েক সেকেন্ড অপেক্ষা করুন...',
      },
      202
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseRest(env, `test_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        status: 'error',
        updated_at: new Date().toISOString(),
        result: {
          mode: inputs.mode,
          error: {
            name: 'NetworkError',
            message: `GitHub API সংযোগে ত্রুটি: ${msg}`,
          },
        },
      },
    });

    return jsonResponse(
      { error: `GitHub Actions-এ রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে: ${msg}` },
      502
    );
  }
}

// ============================================================================
// টেস্ট রান ও সব-কলেজ স্ক্যান হ্যান্ডলারসমূহ
// ============================================================================
async function handleTriggerTestRun(request: Request, env: Env): Promise<Response> {
  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);

  const missingGhSecrets: string[] = [];
  if (!githubToken) missingGhSecrets.push('GITHUB_TOKEN');
  if (!githubRepo) missingGhSecrets.push('GITHUB_REPO');

  if (missingGhSecrets.length > 0) {
    return jsonResponse(
      {
        error: `Worker-এ প্রয়োজনীয় সিক্রেট (${missingGhSecrets.join(
          ', '
        )}) কনফিগার করা নেই। Cloudflare Worker > Settings > Variables and Secrets অংশে যোগ করুন।`,
      },
      500
    );
  }

  const parsed = await parseJsonBody<{ college_id?: unknown }>(request);
  if (parsed.errorResponse || !parsed.data) return parsed.errorResponse as Response;

  const collegeId = typeof parsed.data.college_id === 'string' ? parsed.data.college_id.trim() : '';
  if (!isValidUuid(collegeId)) {
    return jsonResponse({ error: 'সঠিক কলেজ ID দেওয়া হয়নি।' }, 400);
  }

  const collegeRes = await supabaseRest<CollegeRecord[]>(
    env,
    `colleges?id=eq.${encodeURIComponent(collegeId)}&select=id,name,notice_url`
  );
  if (!collegeRes.ok) {
    return jsonResponse(
      { error: `কলেজের তথ্য যাচাই করা যায়নি: ${collegeRes.errorMessage}` },
      500
    );
  }
  if (!collegeRes.data || collegeRes.data.length === 0) {
    return jsonResponse({ error: 'এই ID দিয়ে কোনো কলেজ খুঁজে পাওয়া যায়নি।' }, 404);
  }

  const createRunRes = await supabaseRest<TestRunRow[]>(env, 'test_runs', {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      {
        college_id: collegeId,
        status: 'pending',
        result: { mode: 'test' },
      },
    ],
  });

  if (!createRunRes.ok || !createRunRes.data || createRunRes.data.length === 0) {
    return jsonResponse(
      { error: `টেস্ট রান রেকর্ড তৈরি করা যায়নি: ${createRunRes.errorMessage}` },
      500
    );
  }

  const testRun = createRunRes.data[0];
  return dispatchScraperWorkflow(env, testRun.id, {
    mode: 'test',
    college_id: collegeId,
    test_run_id: testRun.id,
  });
}

// সব সক্রিয় কলেজ একসাথে স্ক্যান করার হ্যান্ডলার (POST /api/admin/scan-all)
async function handleTriggerScanAll(env: Env): Promise<Response> {
  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);

  const missingGhSecrets: string[] = [];
  if (!githubToken) missingGhSecrets.push('GITHUB_TOKEN');
  if (!githubRepo) missingGhSecrets.push('GITHUB_REPO');

  if (missingGhSecrets.length > 0) {
    return jsonResponse(
      {
        error: `Worker-এ প্রয়োজনীয় সিক্রেট (${missingGhSecrets.join(
          ', '
        )}) কনফিগার করা নেই। Cloudflare Worker > Settings > Variables and Secrets অংশে যোগ করুন।`,
      },
      500
    );
  }

  const createRunRes = await supabaseRest<TestRunRow[]>(env, 'test_runs', {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      {
        college_id: null,
        status: 'pending',
        result: { mode: 'normal', trigger: 'manual' },
      },
    ],
  });

  if (!createRunRes.ok || !createRunRes.data || createRunRes.data.length === 0) {
    return jsonResponse(
      { error: `স্ক্যান রেকর্ড তৈরি করা যায়নি: ${createRunRes.errorMessage}` },
      500
    );
  }

  const scanRun = createRunRes.data[0];
  return dispatchScraperWorkflow(env, scanRun.id, {
    mode: 'normal',
    college_id: '',
    test_run_id: scanRun.id,
  });
}

async function handleGetTestRun(env: Env, id: string): Promise<Response> {
  if (!isValidUuid(id)) {
    return jsonResponse({ error: 'সঠিক টেস্ট রান ID দেওয়া হয়নি।' }, 400);
  }

  const res = await supabaseRest<TestRunRow[]>(
    env,
    `test_runs?id=eq.${encodeURIComponent(id)}&select=id,college_id,status,result,created_at,updated_at`
  );

  if (!res.ok) {
    return jsonResponse(
      { error: `টেস্ট রানের ফলাফল আনতে সমস্যা হয়েছে: ${res.errorMessage}` },
      res.status >= 400 ? res.status : 500
    );
  }

  if (!res.data || res.data.length === 0) {
    return jsonResponse({ error: 'এই টেস্ট রানটি খুঁজে পাওয়া যায়নি।' }, 404);
  }

  return jsonResponse({ test_run: res.data[0] });
}

// নির্দিষ্ট কলেজের সর্বশেষ ২০টি নোটিশ ম্যানুয়ালি বেসলাইন সিঙ্ক করার হ্যান্ডলার
async function handleTriggerCollegeBaseline(env: Env, collegeId: string): Promise<Response> {
  if (!isValidUuid(collegeId)) {
    return jsonResponse({ error: 'সঠিক কলেজ ID দেওয়া হয়নি।' }, 400);
  }

  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);
  if (!githubToken || !githubRepo) {
    return jsonResponse(
      { error: 'Worker-এ GITHUB_TOKEN বা GITHUB_REPO কনফিগার করা নেই।' },
      500
    );
  }

  const collegeRes = await supabaseRest<CollegeRecord[]>(
    env,
    `colleges?id=eq.${encodeURIComponent(collegeId)}&select=id,name`
  );
  if (!collegeRes.ok || !collegeRes.data || collegeRes.data.length === 0) {
    return jsonResponse({ error: 'এই ID দিয়ে কোনো কলেজ খুঁজে পাওয়া যায়নি।' }, 404);
  }

  const createRunRes = await supabaseRest<TestRunRow[]>(env, 'test_runs', {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      {
        college_id: collegeId,
        status: 'pending',
        result: { mode: 'baseline' },
      },
    ],
  });

  if (!createRunRes.ok || !createRunRes.data || createRunRes.data.length === 0) {
    return jsonResponse(
      { error: `বেসলাইন সিঙ্ক রেকর্ড তৈরি করা যায়নি: ${createRunRes.errorMessage}` },
      500
    );
  }

  const run = createRunRes.data[0];
  return dispatchScraperWorkflow(env, run.id, {
    mode: 'baseline',
    college_id: collegeId,
    test_run_id: run.id,
  });
}

// ============================================================================
// অটো-স্ক্যান ও ২০-মিনিট ক্রন শিডিউলার হ্যান্ডলারসমূহ
// ============================================================================
async function readAutomationStatus(env: Env): Promise<{
  ok: boolean;
  auto_scan_enabled: boolean;
  interval_minutes: number;
  last_auto_scan_at: string | null;
  last_auto_scan_status: string | null;
  last_auto_scan_message: string | null;
  cron_webhook_configured: boolean;
  errorMessage?: string;
}> {
  const res = await supabaseRest<SettingRow[]>(
    env,
    'settings?key=in.(auto_scan_enabled,last_auto_scan_at,last_auto_scan_status,last_auto_scan_message)&select=key,value'
  );

  if (!res.ok || !res.data) {
    return {
      ok: false,
      auto_scan_enabled: true,
      interval_minutes: 20,
      last_auto_scan_at: null,
      last_auto_scan_status: null,
      last_auto_scan_message: null,
      cron_webhook_configured: Boolean((env.CRON_SECRET || '').trim()),
      errorMessage: res.errorMessage,
    };
  }

  const map = new Map<string, string>();
  for (const row of res.data) {
    map.set(row.key, (row.value || '').trim());
  }

  const enabledVal = map.get('auto_scan_enabled');
  return {
    ok: true,
    auto_scan_enabled: enabledVal ? enabledVal.toLowerCase() !== 'false' : true,
    interval_minutes: 20,
    last_auto_scan_at: map.get('last_auto_scan_at') || null,
    last_auto_scan_status: map.get('last_auto_scan_status') || null,
    last_auto_scan_message: map.get('last_auto_scan_message') || null,
    cron_webhook_configured: Boolean((env.CRON_SECRET || '').trim()),
  };
}

async function handleGetAutomation(env: Env): Promise<Response> {
  const status = await readAutomationStatus(env);
  if (!status.ok) {
    return jsonResponse(
      { error: `অটো-স্ক্যান তথ্য আনতে সমস্যা হয়েছে: ${status.errorMessage}` },
      500
    );
  }
  return jsonResponse({
    auto_scan_enabled: status.auto_scan_enabled,
    interval_minutes: status.interval_minutes,
    last_auto_scan_at: status.last_auto_scan_at,
    last_auto_scan_status: status.last_auto_scan_status,
    last_auto_scan_message: status.last_auto_scan_message,
    cron_webhook_configured: status.cron_webhook_configured,
  });
}

async function handleUpdateAutomation(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJsonBody<{ auto_scan_enabled?: unknown }>(request);
  if (parsed.errorResponse || !parsed.data) return parsed.errorResponse as Response;

  if (typeof parsed.data.auto_scan_enabled !== 'boolean') {
    return jsonResponse({ error: 'auto_scan_enabled মান অবশ্যই true বা false হতে হবে।' }, 400);
  }

  const nowIso = new Date().toISOString();
  const upsertRes = await supabaseRest<SettingRow[]>(env, 'settings?on_conflict=key', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [
      {
        key: 'auto_scan_enabled',
        value: parsed.data.auto_scan_enabled ? 'true' : 'false',
        updated_at: nowIso,
      },
    ],
  });

  if (!upsertRes.ok) {
    return jsonResponse(
      { error: `অটো-স্ক্যান সেটিং আপডেট করা যায়নি: ${upsertRes.errorMessage}` },
      500
    );
  }

  const latest = await readAutomationStatus(env);
  return jsonResponse({
    auto_scan_enabled: latest.auto_scan_enabled,
    interval_minutes: latest.interval_minutes,
    last_auto_scan_at: latest.last_auto_scan_at,
    last_auto_scan_status: latest.last_auto_scan_status,
    last_auto_scan_message: latest.last_auto_scan_message,
    cron_webhook_configured: latest.cron_webhook_configured,
    message: parsed.data.auto_scan_enabled
      ? 'প্রতি ২০ মিনিটে স্বয়ংক্রিয় স্ক্যান চালু করা হয়েছে।'
      : 'স্বয়ংক্রিয় স্ক্যান সাময়িকভাবে বন্ধ করা হয়েছে।',
  });
}

async function triggerScheduledAutoScan(
  env: Env,
  source: 'cloudflare_cron' | 'external_cron'
): Promise<{ triggered: boolean; reason: string; runId?: string }> {
  const automation = await readAutomationStatus(env);
  if (!automation.auto_scan_enabled) {
    return { triggered: false, reason: 'disabled' };
  }

  // সাম্প্রতিক ৮ মিনিটের ভেতর আরেকটি অটো-স্ক্যান চলে থাকলে ডুপ্লিকেট ট্রিগার এড়ানো হবে
  if (automation.last_auto_scan_at) {
    const lastMs = Date.parse(automation.last_auto_scan_at);
    if (!Number.isNaN(lastMs) && Date.now() - lastMs < 8 * 60 * 1000) {
      return { triggered: false, reason: 'too_recent' };
    }
  }

  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);
  if (!githubToken || !githubRepo) {
    const nowIso = new Date().toISOString();
    await supabaseRest(env, 'settings?on_conflict=key', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: [
        { key: 'last_auto_scan_at', value: nowIso, updated_at: nowIso },
        { key: 'last_auto_scan_status', value: 'error', updated_at: nowIso },
        {
          key: 'last_auto_scan_message',
          value: 'GITHUB_TOKEN বা GITHUB_REPO কনফিগার করা নেই।',
          updated_at: nowIso,
        },
      ],
    });
    return { triggered: false, reason: 'missing_github_secrets' };
  }

  const createRunRes = await supabaseRest<TestRunRow[]>(env, 'test_runs', {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      {
        college_id: null,
        status: 'pending',
        result: { mode: 'normal', trigger: source },
      },
    ],
  });

  const runId = createRunRes.ok && createRunRes.data?.[0]?.id ? createRunRes.data[0].id : '';
  const dispatchRes = await dispatchScraperWorkflow(env, runId, {
    mode: 'normal',
    college_id: '',
    test_run_id: runId,
  });

  const nowIso = new Date().toISOString();
  await supabaseRest(env, 'settings?on_conflict=key', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: [
      { key: 'last_auto_scan_at', value: nowIso, updated_at: nowIso },
      {
        key: 'last_auto_scan_status',
        value: dispatchRes.ok ? 'dispatched' : 'error',
        updated_at: nowIso,
      },
      {
        key: 'last_auto_scan_message',
        value: dispatchRes.ok
          ? `${source === 'cloudflare_cron' ? 'Cloudflare Cron' : 'Cron Webhook'} থেকে স্ক্যান শুরু হয়েছে`
          : 'GitHub Actions ট্রিগার করতে ব্যর্থ হয়েছে',
        updated_at: nowIso,
      },
    ],
  });

  return {
    triggered: dispatchRes.ok,
    reason: dispatchRes.ok ? 'dispatched' : 'dispatch_failed',
    runId: runId || undefined,
  };
}

// ============================================================================
// হেলথ ও স্ক্যান হিস্ট্রি লগ হ্যান্ডলার (GET /api/admin/scan-logs)
// ============================================================================
async function handleGetScanLogs(env: Env): Promise<Response> {
  const [runsRes, collegesRes] = await Promise.all([
    supabaseRest<TestRunRow[]>(
      env,
      'test_runs?order=created_at.desc&limit=60&select=id,college_id,status,result,created_at,updated_at'
    ),
    supabaseRest<CollegeRecord[]>(
      env,
      'colleges?select=id,name,notice_url,is_active,last_checked_at,last_status,last_error,consecutive_failures,created_at&order=created_at.desc'
    ),
  ]);

  if (!runsRes.ok) {
    return jsonResponse(
      { error: `স্ক্যান লগ লোড করতে সমস্যা হয়েছে: ${runsRes.errorMessage}` },
      runsRes.status >= 400 ? runsRes.status : 500
    );
  }

  const collegesList = collegesRes.ok && collegesRes.data ? collegesRes.data : [];
  const collegeNameById = new Map<string, string>();
  for (const c of collegesList) {
    collegeNameById.set(c.id, c.name);
  }

  const logs = (runsRes.data || []).map((run) => {
    const resultObj =
      run.result && typeof run.result === 'object' ? (run.result as Record<string, unknown>) : null;
    const resultCollegeName =
      typeof resultObj?.college_name === 'string' ? resultObj.college_name : null;

    return {
      ...run,
      college_name:
        resultCollegeName || (run.college_id ? collegeNameById.get(run.college_id) || null : null),
    };
  });

  return jsonResponse({
    logs,
    colleges_health: collegesList,
  });
}

// ============================================================================
// টেলিগ্রাম বট ইন্টারেক্টিভ কমান্ড (/latest, /notice, /colleges, /help) ও Webhook
// ============================================================================
const WORKER_BN_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const WORKER_MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  জানু: 1,
  জানুয়ারি: 1,
  জানুয়ারি: 1,
  feb: 2,
  february: 2,
  ফেব্রু: 2,
  ফেব্রুয়ারি: 2,
  ফেব্রুয়ারি: 2,
  mar: 3,
  march: 3,
  মার্চ: 3,
  apr: 4,
  april: 4,
  এপ্রিল: 4,
  may: 5,
  মে: 5,
  jun: 6,
  june: 6,
  জুন: 6,
  jul: 7,
  july: 7,
  জুলাই: 7,
  aug: 8,
  august: 8,
  আগস্ট: 8,
  অগাস্ট: 8,
  sep: 9,
  sept: 9,
  september: 9,
  সেপ্টেম্বর: 9,
  oct: 10,
  october: 10,
  অক্টোবর: 10,
  nov: 11,
  november: 11,
  নভেম্বর: 11,
  dec: 12,
  december: 12,
  ডিসেম্বর: 12,
};

function parseWorkerNoticeDateMs(rawDate?: string | null): number | null {
  if (!rawDate) return null;
  const cleaned = rawDate
    .replace(/[০-৯]/g, (d) => WORKER_BN_DIGITS[d] || d)
    .replace(/(\d+)(st|nd|rd|th|ই|শে|লা|রা|ঠা)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const buildMs = (y: number, m: number, d: number): number | null => {
    if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const ms = Date.parse(
      `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+06:00`
    );
    return Number.isNaN(ms) ? null : ms;
  };

  const isoMatch = cleaned.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const ms = buildMs(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (ms !== null) return ms;
  }

  const dmyMatch = cleaned.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    const ms = buildMs(year, month, day);
    if (ms !== null) return ms;
  }

  const tokens = cleaned.toLowerCase().split(/[\s-]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const month = WORKER_MONTH_MAP[tokens[i]];
    if (!month) continue;
    const prevNum = i > 0 ? Number(tokens[i - 1]) : NaN;
    const nextNum = i + 1 < tokens.length ? Number(tokens[i + 1]) : NaN;
    const next2Num = i + 2 < tokens.length ? Number(tokens[i + 2]) : NaN;

    if (Number.isInteger(prevNum) && prevNum >= 1 && prevNum <= 31 && Number.isInteger(nextNum) && nextNum >= 1990) {
      const ms = buildMs(nextNum, month, prevNum);
      if (ms !== null) return ms;
    }
    if (Number.isInteger(nextNum) && nextNum >= 1 && nextNum <= 31 && Number.isInteger(next2Num) && next2Num >= 1990) {
      const ms = buildMs(next2Num, month, nextNum);
      if (ms !== null) return ms;
    }
  }

  const nativeMs = Date.parse(cleaned);
  return Number.isNaN(nativeMs) ? null : nativeMs;
}

function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toBengaliNumber(num: number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/\d/g, (d) => bnDigits[Number(d)] || d);
}

interface WebhookNoticeRow {
  id: string;
  college_id: string;
  title: string;
  link: string;
  date?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  colleges?: { name?: string } | Array<{ name?: string }> | null;
}

async function fetchSortedNoticesForBot(env: Env): Promise<
  Array<{
    id: string;
    college_name: string;
    title: string;
    link: string;
    date: string;
    createdAt: string;
    sortMs: number;
  }>
> {
  let res = await supabaseRest<WebhookNoticeRow[]>(
    env,
    'notices?select=id,college_id,title,link,date,published_at,created_at,colleges(name)&order=published_at.desc.nullslast,created_at.desc&limit=150'
  );

  if (!res.ok && res.errorMessage && /published_at/i.test(res.errorMessage)) {
    res = await supabaseRest<WebhookNoticeRow[]>(
      env,
      'notices?select=id,college_id,title,link,date,created_at,colleges(name)&order=created_at.desc&limit=150'
    );
  }

  if (!res.ok || !res.data) return [];

  const items = res.data.map((row) => {
    const rel = Array.isArray(row.colleges) ? row.colleges[0] : row.colleges;
    const pubMs = row.published_at ? Date.parse(row.published_at) : NaN;
    const parsedDateMs = parseWorkerNoticeDateMs(row.date);
    const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
    const sortMs = !Number.isNaN(pubMs)
      ? pubMs
      : parsedDateMs !== null
      ? parsedDateMs
      : !Number.isNaN(createdMs)
      ? createdMs
      : 0;

    return {
      id: row.id,
      college_name: rel?.name || 'কলেজ নোটিশ',
      title: row.title,
      link: row.link,
      date: row.date || '',
      createdAt: row.created_at || '',
      sortMs,
    };
  });

  items.sort((a, b) => b.sortMs - a.sortMs);
  return items;
}

function buildNoticeQuickKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📰 আজকের নোটিশ', callback_data: 'cmd:today' },
        { text: '📝 ফরম পূরণ', callback_data: 'cmd:form' },
      ],
      [
        { text: '📅 পরীক্ষা ও রুটিন', callback_data: 'cmd:routine' },
        { text: '⏳ ডেডলাইন', callback_data: 'cmd:deadlines' },
      ],
    ],
  };
}

function matchesBotCategory(
  title: string,
  category: 'routine' | 'form' | 'result' | 'admission'
): boolean {
  const lower = title.toLowerCase();
  if (category === 'form') {
    return /ফরম|ফর্ম|form\s*fill|form\s*up/i.test(lower);
  }
  if (category === 'routine') {
    return /পরীক্ষা|রুটিন|সময়সূচ|সময়সূচ|exam|routine|schedule|স্থগিত|সংশোধিত/i.test(lower);
  }
  if (category === 'result') {
    return /ফলাফল|ফল|রেজাল্ট|result/i.test(lower);
  }
  return /ভর্তি|admission|মেধা\s*তালিকা|merit/i.test(lower);
}

function formatDhakaDateOnly(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(ms));
  } catch {
    return '';
  }
}

function formatDhakaDateTime(iso?: string | null): string {
  if (!iso) return 'তথ্য নেই';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'তথ্য নেই';
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}

async function answerTelegramCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    }),
  }).catch(() => {});
}

async function sendTelegramBotReply(
  botToken: string,
  payload: {
    chat_id: string | number;
    text: string;
    message_thread_id?: number;
    reply_to_message_id?: number;
    reply_markup?: unknown;
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: payload.chat_id,
    text: payload.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (payload.message_thread_id) {
    body.message_thread_id = payload.message_thread_id;
  }
  if (payload.reply_to_message_id) {
    body.reply_to_message_id = payload.reply_to_message_id;
  }
  if (payload.reply_markup) {
    body.reply_markup = payload.reply_markup;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const settingsRes = await supabaseRest<SettingRow[]>(
    env,
    'settings?key=in.(telegram_bot_token,telegram_webhook_secret,telegram_chat_id)&select=key,value'
  );

  if (!settingsRes.ok || !settingsRes.data) {
    return jsonResponse({ ok: true });
  }

  let botToken = '';
  let expectedSecret = '';
  let adminChatIdsRaw = '';
  for (const row of settingsRes.data) {
    if (row.key === 'telegram_bot_token') botToken = (row.value || '').trim();
    if (row.key === 'telegram_webhook_secret') expectedSecret = (row.value || '').trim();
    if (row.key === 'telegram_chat_id') adminChatIdsRaw = (row.value || '').trim();
  }

  if (expectedSecret) {
    const incomingSecret = (request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '').trim();
    if (incomingSecret !== expectedSecret) {
      return jsonResponse({ error: 'অননুমোদিত টেলিগ্রাম Webhook অনুরোধ।' }, 401);
    }
  }

  if (!botToken) {
    return jsonResponse({ ok: true });
  }

  interface WorkerSubscriptionItem {
    chat_id: string;
    name?: string;
    keywords: string[];
    created_at?: string;
  }

  interface WorkerUpcomingDeadline {
    college_name: string;
    title: string;
    link: string;
    deadline_date: string;
  }

  interface TelegramMessageObject {
    message_id?: number;
    message_thread_id?: number;
    text?: string;
    from?: { id?: number | string; first_name?: string; username?: string };
    chat?: { id?: number | string; type?: string; title?: string };
  }

  let update: {
    message?: TelegramMessageObject;
    channel_post?: TelegramMessageObject;
    callback_query?: {
      id: string;
      from?: { id?: number | string; first_name?: string; username?: string };
      message?: TelegramMessageObject;
      data?: string;
    };
  };

  try {
    update = (await request.json()) as typeof update;
  } catch {
    return jsonResponse({ ok: true });
  }

  let msg: TelegramMessageObject | undefined;
  let command = '';
  let rawArg = '';
  let fromUser: { id?: number | string; first_name?: string; username?: string } | undefined;
  let fromCallback = false;

  if (update.callback_query?.data && update.callback_query.message) {
    fromCallback = true;
    msg = update.callback_query.message;
    fromUser = update.callback_query.from;
    await answerTelegramCallbackQuery(botToken, update.callback_query.id);
    const cbMatch = update.callback_query.data.match(/^cmd:([a-zA-Z0-9_]+)(?:\s+([\s\S]*))?$/);
    if (!cbMatch) {
      return jsonResponse({ ok: true });
    }
    command = cbMatch[1].toLowerCase();
    rawArg = (cbMatch[2] || '').trim();
  } else {
    msg = update.message || update.channel_post;
    fromUser = update.message?.from;
    const rawText = (msg?.text || '').trim();
    if (!msg || !rawText || !rawText.startsWith('/')) {
      return jsonResponse({ ok: true });
    }
    const cmdMatch = rawText.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
    if (!cmdMatch) {
      return jsonResponse({ ok: true });
    }
    command = cmdMatch[1].toLowerCase();
    rawArg = (cmdMatch[2] || '').trim();
  }

  const chatId = msg?.chat?.id;
  if (!msg || chatId === undefined || chatId === null) {
    return jsonResponse({ ok: true });
  }

  const isGroup = msg.chat?.type === 'group' || msg.chat?.type === 'supergroup';
  const replyToMessageId = !fromCallback && isGroup && msg.message_id ? msg.message_id : undefined;

  const adminChatList = parseWorkerChatIdList(adminChatIdsRaw);
  const adminChatSet = new Set(adminChatList);
  const isAdminSender =
    adminChatSet.has(String(chatId)) ||
    (fromUser?.id !== undefined && adminChatSet.has(String(fromUser.id)));

  const appOrigin = new URL(request.url).origin;

  if (command === 'start' || command === 'help') {
    const helpLines = [
      '🔔 <b>জাতীয় বিশ্ববিদ্যালয় ও কলেজ নোটিশ বট</b>',
      '',
      '<b>শিক্ষার্থীদের কমান্ডসমূহ:</b>',
      '• /latest — সর্বশেষ ৮টি নোটিশ দেখুন (বা <code>/latest 10</code>)',
      '• /today — আজ সারাদিনে প্রকাশিত নতুন নোটিশ',
      '• /notice &lt;কলেজ বা বিষয়&gt; — নির্দিষ্ট কলেজ বা কীওয়ার্ড দিয়ে খুঁজুন',
      '• /routine — পরীক্ষা ও রুটিন সংক্রান্ত নোটিশ',
      '• /form — ফরম পূরণ সংক্রান্ত নোটিশ',
      '• /result — ফলাফল সংক্রান্ত নোটিশ',
      '• /admission — ভর্তি সংক্রান্ত নোটিশ',
      '• /deadlines — আসন্ন ফরম পূরণ/ভর্তির শেষ তারিখ',
      '• /subscribe &lt;কলেজ বা বিষয়&gt; — পার্সোনাল ইনবক্স অ্যালার্ট',
      '• /subscriptions · /unsubscribe — সাবস্ক্রিপশন পরিচালনা',
      '• /colleges — সংযুক্ত সক্রিয় কলেজগুলোর তালিকা',
      '• /request &lt;কলেজের নাম ও লিংক&gt; — নতুন কলেজ যুক্ত করার অনুরোধ',
    ];

    if (isAdminSender) {
      helpLines.push(
        '',
        '<b>🔐 এডমিন কন্ট্রোল কমান্ড:</b>',
        '• /status — সব কলেজের স্ক্যান ও হেলথ অবস্থা',
        '• /scan — এখনই সব কলেজের ম্যানুয়াল স্ক্যান শুরু',
        '• /digest — আজকের ডেইলি ডাইজেস্ট রিপোর্ট',
        '• /stats — সাবস্ক্রাইবার ও সিস্টেম পরিসংখ্যান'
      );
    }

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: helpLines.join('\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
      reply_markup: buildNoticeQuickKeyboard(),
    });
    return jsonResponse({ ok: true });
  }

  // এডমিন কন্ট্রোল কমান্ডসমূহ (/status, /health, /scan, /digest, /stats)
  if (command === 'status' || command === 'health' || command === 'scan' || command === 'digest' || command === 'stats') {
    if (!isAdminSender) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: '⛔ এই কমান্ডটি শুধুমাত্র বট এডমিনের জন্য সংরক্ষিত।',
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    if (command === 'status' || command === 'health') {
      const [automation, colRes] = await Promise.all([
        readAutomationStatus(env),
        supabaseRest<CollegeRecord[]>(
          env,
          'colleges?select=id,name,is_active,last_status,consecutive_failures,last_error,last_checked_at&order=name.asc'
        ),
      ]);

      const colleges = colRes.ok && colRes.data ? colRes.data : [];
      const activeColleges = colleges.filter((c) => c.is_active);
      const failingColleges = activeColleges.filter((c) => c.last_status === 'error');
      const healthyCount = activeColleges.length - failingColleges.length;

      const lines = [
        '🩺 <b>সিস্টেম হেলথ ও অটো-স্ক্যান স্ট্যাটাস</b>',
        '',
        `⚙️ অটো-স্ক্যান (২০ মি.): ${automation.auto_scan_enabled ? '✅ চালু' : '⏸️ বন্ধ'}`,
        `🕒 সর্বশেষ স্ক্যান: ${escapeTelegramHtml(formatDhakaDateTime(automation.last_auto_scan_at))}`,
      ];
      if (automation.last_auto_scan_message) {
        lines.push(`📝 সারাংশ: ${escapeTelegramHtml(automation.last_auto_scan_message)}`);
      }
      lines.push(
        '',
        `🏫 সক্রিয় কলেজ: ${toBengaliNumber(activeColleges.length)} টি (সুস্থ: ${toBengaliNumber(healthyCount)} টি · সমস্যা: ${toBengaliNumber(failingColleges.length)} টি)`
      );

      if (failingColleges.length > 0) {
        lines.push('', '⚠️ <b>সমস্যাযুক্ত কলেজসমূহ:</b>');
        for (const fc of failingColleges.slice(0, 8)) {
          lines.push(
            `• <b>${escapeTelegramHtml(fc.name)}</b> (টানা ${toBengaliNumber(fc.consecutive_failures || 1)} বার ব্যর্থ)` +
              (fc.last_error ? `\n  <i>কারণ: ${escapeTelegramHtml(fc.last_error.slice(0, 100))}</i>` : '')
          );
        }
      } else if (activeColleges.length > 0) {
        lines.push('', '✅ সবগুলো সক্রিয় কলেজের নোটিশ বোর্ড স্বাভাবিকভাবে কাজ করছে।');
      }

      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: lines.join('\n'),
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    if (command === 'scan') {
      const githubToken = (env.GITHUB_TOKEN || '').trim();
      const githubRepo = normalizeGithubRepo(env.GITHUB_REPO);
      if (!githubToken || !githubRepo) {
        await sendTelegramBotReply(botToken, {
          chat_id: chatId,
          text: '⚠️ Cloudflare Worker-এ GITHUB_TOKEN বা GITHUB_REPO কনফিগার করা নেই।',
          message_thread_id: msg.message_thread_id,
          reply_to_message_id: replyToMessageId,
        });
        return jsonResponse({ ok: true });
      }

      const createRunRes = await supabaseRest<TestRunRow[]>(env, 'test_runs', {
        method: 'POST',
        prefer: 'return=representation',
        body: [
          {
            college_id: null,
            status: 'pending',
            result: { mode: 'normal', trigger: 'telegram_admin' },
          },
        ],
      });

      const runId = createRunRes.ok && createRunRes.data?.[0]?.id ? createRunRes.data[0].id : '';
      const dispatchRes = await dispatchScraperWorkflow(env, runId, {
        mode: 'normal',
        college_id: '',
        test_run_id: runId,
      });

      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: dispatchRes.ok
          ? '🚀 <b>সব সক্রিয় কলেজের ম্যানুয়াল স্ক্যান শুরু হয়েছে!</b>\nনতুন নোটিশ পেলে টেলিগ্রামে চলে আসবে এবং হেলথ লগ ড্যাশবোর্ডে ফলাফল দেখতে পারবেন।'
          : '❌ GitHub Actions স্ক্যান শুরু করা যায়নি। ড্যাশবোর্ড বা Worker লগ যাচাই করুন।',
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    if (command === 'digest') {
      const digestData = await buildDailyDigestData(env);
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text:
          digestData.ok && digestData.text
            ? digestData.text
            : `❌ ডাইজেস্ট তৈরি করা যায়নি: ${escapeTelegramHtml(digestData.error || 'অজানা ত্রুটি')}`,
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    if (command === 'stats') {
      const [colRes, noticesRes, settingsExtraRes] = await Promise.all([
        supabaseRest<CollegeRecord[]>(env, 'colleges?select=id,is_active'),
        supabaseRest<Array<{ id: string }>>(env, 'notices?select=id&limit=1000'),
        supabaseRest<SettingRow[]>(
          env,
          'settings?key=in.(telegram_subscriptions,upcoming_deadlines)&select=key,value'
        ),
      ]);

      const allColleges = colRes.ok && colRes.data ? colRes.data : [];
      const activeCount = allColleges.filter((c) => c.is_active).length;
      const noticesCount = noticesRes.ok && noticesRes.data ? noticesRes.data.length : 0;

      let subs: WorkerSubscriptionItem[] = [];
      let deadlines: WorkerUpcomingDeadline[] = [];
      if (settingsExtraRes.ok && settingsExtraRes.data) {
        for (const r of settingsExtraRes.data) {
          if (r.key === 'telegram_subscriptions' && r.value) {
            try {
              const p = JSON.parse(r.value);
              if (Array.isArray(p)) subs = p;
            } catch {
              // ignore
            }
          }
          if (r.key === 'upcoming_deadlines' && r.value) {
            try {
              const p = JSON.parse(r.value);
              if (Array.isArray(p)) deadlines = p;
            } catch {
              // ignore
            }
          }
        }
      }

      const kwFreq = new Map<string, number>();
      for (const s of subs) {
        for (const kw of s.keywords || []) {
          const cleanKw = String(kw || '').trim();
          if (cleanKw) kwFreq.set(cleanKw, (kwFreq.get(cleanKw) || 0) + 1);
        }
      }
      const topKeywords = Array.from(kwFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const lines = [
        '📈 <b>সিস্টেম ও সাবস্ক্রাইবার পরিসংখ্যান</b>',
        '',
        `🏫 মোট কলেজ: ${toBengaliNumber(allColleges.length)} টি (সক্রিয়: ${toBengaliNumber(activeCount)} টি)`,
        `📰 সংগৃহীত নোটিশ: ${toBengaliNumber(noticesCount)}${noticesCount >= 1000 ? '+' : ''} টি`,
        `⭐ পার্সোনাল সাবস্ক্রাইবার: ${toBengaliNumber(subs.length)} জন`,
        `⏳ চলমান ডেডলাইন ট্র্যাক: ${toBengaliNumber(deadlines.length)} টি`,
      ];

      if (topKeywords.length > 0) {
        lines.push('', '🔥 <b>জনপ্রিয় সাবস্ক্রিপশন কীওয়ার্ড:</b>');
        for (const [kw, cnt] of topKeywords) {
          lines.push(`• <code>${escapeTelegramHtml(kw)}</code> (${toBengaliNumber(cnt)} জন)`);
        }
      }

      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: lines.join('\n'),
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }
  }

  // শিক্ষার্থীর নতুন কলেজ যোগ করার অনুরোধ (/request)
  if (command === 'request') {
    if (!rawArg) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text:
          '📩 <b>নতুন কলেজ যোগ করার অনুরোধ বা মতামত পাঠাতে লিখুন:</b>\n\n' +
          '<code>/request কলেজের নাম এবং নোটিশ বোর্ড লিংক</code>\n' +
          '<i>উদাহরণ:</i> <code>/request ঢাকা কলেজ https://dhakacollege.edu.bd/notices</code>',
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    const requesterName =
      fromUser?.first_name ||
      (fromUser?.username ? `@${fromUser.username}` : '') ||
      msg.chat?.title ||
      `Chat ${chatId}`;
    const requesterHandle = fromUser?.username ? ` (@${fromUser.username})` : '';
    const adminAlertText =
      `📩 <b>নতুন কলেজ অনুরোধ / মতামত</b>\n\n` +
      `👤 প্রেরক: <b>${escapeTelegramHtml(requesterName)}</b>${escapeTelegramHtml(requesterHandle)}\n` +
      `🆔 Chat ID: <code>${escapeTelegramHtml(String(chatId))}</code>\n\n` +
      `💬 বার্তা:\n${escapeTelegramHtml(rawArg)}`;

    for (const adminCid of adminChatList) {
      await sendTelegramBotReply(botToken, {
        chat_id: adminCid,
        text: adminAlertText,
      });
    }

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: '✅ আপনার অনুরোধটি এডমিনের কাছে সফলভাবে পাঠানো হয়েছে। ধন্যবাদ!',
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
    });
    return jsonResponse({ ok: true });
  }

  // আসন্ন ফরম পূরণ / ভর্তির শেষ তারিখ (/deadlines)
  if (command === 'deadlines' || command === 'deadline') {
    const dlRes = await supabaseRest<SettingRow[]>(
      env,
      'settings?key=eq.upcoming_deadlines&select=key,value'
    );
    let deadlines: WorkerUpcomingDeadline[] = [];
    if (dlRes.ok && dlRes.data?.[0]?.value) {
      try {
        const parsedDl = JSON.parse(dlRes.data[0].value);
        if (Array.isArray(parsedDl)) deadlines = parsedDl;
      } catch {
        deadlines = [];
      }
    }

    const todayDhaka = formatDhakaDateOnly(Date.now());
    const todayMs = Date.parse(`${todayDhaka}T00:00:00+06:00`);

    const activeDeadlines = deadlines
      .map((d) => {
        const dlMs = Date.parse(`${d.deadline_date}T00:00:00+06:00`);
        const daysLeft = Number.isNaN(dlMs)
          ? -999
          : Math.round((dlMs - todayMs) / (24 * 60 * 60 * 1000));
        return { ...d, daysLeft };
      })
      .filter((d) => d.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 10);

    if (activeDeadlines.length === 0) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: 'ℹ️ এই মুহূর্তে কোনো আসন্ন ফরম পূরণ বা ভর্তির শেষ তারিখ ডাটাবেজে সংরক্ষিত নেই।',
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
        reply_markup: buildNoticeQuickKeyboard(),
      });
      return jsonResponse({ ok: true });
    }

    const formattedDeadlines = activeDeadlines.map((item, idx) => {
      const remLabel =
        item.daysLeft === 0
          ? '🚨 আজই শেষ দিন!'
          : item.daysLeft === 1
          ? '⚠️ আগামীকাল শেষ (১ দিন বাকি)'
          : `⏳ আর ${toBengaliNumber(item.daysLeft)} দিন বাকি`;
      return `${toBengaliNumber(idx + 1)}. <b>${escapeTelegramHtml(item.college_name)}</b> — ${remLabel}\n📅 শেষ তারিখ: <code>${escapeTelegramHtml(item.deadline_date)}</code>\n<a href="${escapeTelegramHtml(item.link)}">${escapeTelegramHtml(item.title)}</a>`;
    });

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: [`⏳ <b>আসন্ন ফরম পূরণ ও ভর্তির শেষ তারিখসমূহ:</b>`, '', ...formattedDeadlines].join('\n\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
      reply_markup: buildNoticeQuickKeyboard(),
    });
    return jsonResponse({ ok: true });
  }

  // আজকের সব নতুন নোটিশ (/today)
  if (command === 'today') {
    const todayDhaka = formatDhakaDateOnly(Date.now());
    const allNotices = await fetchSortedNoticesForBot(env);
    const todayItems = allNotices.filter((n) => {
      const pubDay = n.sortMs > 0 ? formatDhakaDateOnly(n.sortMs) : '';
      const createdDay = n.createdAt ? formatDhakaDateOnly(Date.parse(n.createdAt)) : '';
      return pubDay === todayDhaka || createdDay === todayDhaka;
    });

    const selected = todayItems.slice(0, 10);
    if (selected.length === 0) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: `ℹ️ আজ (${escapeTelegramHtml(todayDhaka)}) এখনো কোনো নতুন নোটিশ যুক্ত হয়নি।`,
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
        reply_markup: buildNoticeQuickKeyboard(),
      });
      return jsonResponse({ ok: true });
    }

    const formattedItems = selected.map((item, idx) => {
      const datePart = item.date ? ` · 📅 ${escapeTelegramHtml(item.date)}` : '';
      return `${toBengaliNumber(idx + 1)}. <b>${escapeTelegramHtml(item.college_name)}</b>${datePart}\n<a href="${escapeTelegramHtml(item.link)}">${escapeTelegramHtml(item.title)}</a>`;
    });

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: [
        `📰 <b>আজকের নোটিশসমূহ (${escapeTelegramHtml(todayDhaka)} · ${toBengaliNumber(selected.length)}টি):</b>`,
        '',
        ...formattedItems,
        `\n🌐 সব নোটিশ একসাথে: ${escapeTelegramHtml(appOrigin)}`,
      ].join('\n\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
      reply_markup: buildNoticeQuickKeyboard(),
    });
    return jsonResponse({ ok: true });
  }

  // ক্যাটাগরি শর্টকাট কমান্ড (/routine, /form, /result, /admission)
  if (command === 'routine' || command === 'form' || command === 'result' || command === 'admission') {
    const categoryTitles: Record<'routine' | 'form' | 'result' | 'admission', string> = {
      routine: '📅 পরীক্ষা ও রুটিন সংক্রান্ত নোটিশ',
      form: '📝 ফরম পূরণ সংক্রান্ত নোটিশ',
      result: '📊 ফলাফল সংক্রান্ত নোটিশ',
      admission: '🎓 ভর্তি সংক্রান্ত নোটিশ',
    };

    const allNotices = await fetchSortedNoticesForBot(env);
    let filtered = allNotices.filter((n) => matchesBotCategory(n.title, command));
    if (rawArg) {
      const q = rawArg.toLowerCase();
      filtered = filtered.filter(
        (n) => n.college_name.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)
      );
    }

    const selected = filtered.slice(0, 8);
    if (selected.length === 0) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: `ℹ️ এই মুহূর্তে <b>${categoryTitles[command]}</b> পাওয়া যায়নি।`,
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
        reply_markup: buildNoticeQuickKeyboard(),
      });
      return jsonResponse({ ok: true });
    }

    const formattedItems = selected.map((item, idx) => {
      const datePart = item.date ? ` · 📅 ${escapeTelegramHtml(item.date)}` : '';
      return `${toBengaliNumber(idx + 1)}. <b>${escapeTelegramHtml(item.college_name)}</b>${datePart}\n<a href="${escapeTelegramHtml(item.link)}">${escapeTelegramHtml(item.title)}</a>`;
    });

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: [
        `<b>${categoryTitles[command]} (${toBengaliNumber(selected.length)}টি):</b>`,
        '',
        ...formattedItems,
        `\n🌐 সব নোটিশ একসাথে: ${escapeTelegramHtml(appOrigin)}`,
      ].join('\n\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
      reply_markup: buildNoticeQuickKeyboard(),
    });
    return jsonResponse({ ok: true });
  }

  if (command === 'subscribe' || command === 'unsubscribe' || command === 'subscriptions' || command === 'mysubs') {
    const subQuery = await supabaseRest<SettingRow[]>(
      env,
      'settings?key=eq.telegram_subscriptions&select=key,value'
    );
    let subscriptions: WorkerSubscriptionItem[] = [];
    if (subQuery.ok && subQuery.data?.[0]?.value) {
      try {
        const parsedSubs = JSON.parse(subQuery.data[0].value);
        if (Array.isArray(parsedSubs)) {
          subscriptions = parsedSubs;
        }
      } catch {
        subscriptions = [];
      }
    }

    const chatKey = String(chatId);
    const existingIdx = subscriptions.findIndex((s) => String(s.chat_id) === chatKey);

    if (command === 'subscriptions' || command === 'mysubs') {
      const currentKeywords = existingIdx >= 0 ? subscriptions[existingIdx].keywords || [] : [];
      const text =
        currentKeywords.length > 0
          ? `⭐ <b>আপনার সক্রিয় নোটিশ সাবস্ক্রিপশনসমূহ:</b>\n\n${currentKeywords
              .map((kw, i) => `${toBengaliNumber(i + 1)}. <code>${escapeTelegramHtml(kw)}</code>`)
              .join('\n')}\n\n❌ বাদ দিতে লিখুন: <code>/unsubscribe কীওয়ার্ড</code> বা সব বাদ দিতে <code>/unsubscribe সব</code>`
          : 'ℹ️ আপনার কোনো পার্সোনাল সাবস্ক্রিপশন চালু নেই।\n\nনতুন অ্যালার্ট পেতে লিখুন:\n<code>/subscribe আজিজুল</code> অথবা <code>/subscribe ফরম</code>';
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text,
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    if (command === 'subscribe') {
      if (!rawArg) {
        await sendTelegramBotReply(botToken, {
          chat_id: chatId,
          text:
            '⭐ <b>পার্সোনাল অ্যালার্ট চালু করতে কলেজের নাম বা বিষয় লিখুন:</b>\n\n' +
            'উদাহরণ:\n' +
            '• <code>/subscribe আজিজুল</code>\n' +
            '• <code>/subscribe ফরম</code>\n' +
            '• <code>/subscribe সব</code> (সব নোটিশ পেতে)',
          message_thread_id: msg.message_thread_id,
          reply_to_message_id: replyToMessageId,
        });
        return jsonResponse({ ok: true });
      }

      const keyword = rawArg.replace(/\s+/g, ' ').trim().slice(0, 60);
      const displayName =
        msg.chat?.title ||
        fromUser?.first_name ||
        fromUser?.username ||
        chatKey;

      if (existingIdx >= 0) {
        const current = subscriptions[existingIdx];
        const exists = current.keywords.some((k) => k.toLowerCase() === keyword.toLowerCase());
        if (!exists) {
          current.keywords = [...current.keywords, keyword].slice(0, 15);
        }
        current.name = displayName;
      } else {
        subscriptions.push({
          chat_id: chatKey,
          name: displayName,
          keywords: [keyword],
          created_at: new Date().toISOString(),
        });
      }

      await supabaseRest(env, 'settings?on_conflict=key', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: [
          {
            key: 'telegram_subscriptions',
            value: JSON.stringify(subscriptions),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const activeKeywords =
        subscriptions.find((s) => String(s.chat_id) === chatKey)?.keywords || [keyword];

      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text:
          `✅ "<b>${escapeTelegramHtml(keyword)}</b>" সাবস্ক্রিপশন চালু হয়েছে!\n\n` +
          `এখন থেকে এই সম্পর্কিত নতুন নোটিশ প্রকাশিত হলেই আপনার ইনবক্সে অ্যালার্ট চলে যাবে।\n` +
          `📌 সক্রিয় তালিকা: ${activeKeywords.map((k) => `<code>${escapeTelegramHtml(k)}</code>`).join(', ')}`,
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    // /unsubscribe
    if (existingIdx < 0) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: 'ℹ️ আপনার কোনো সক্রিয় সাবস্ক্রিপশন পাওয়া যায়নি।',
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    const argLower = rawArg.toLowerCase();
    let replyMsg = '';
    if (!rawArg || argLower === 'all' || argLower === 'সব') {
      subscriptions.splice(existingIdx, 1);
      replyMsg = '✅ আপনার সবগুলো পার্সোনাল নোটিশ সাবস্ক্রিপশন বন্ধ করা হয়েছে।';
    } else {
      const prevList = subscriptions[existingIdx].keywords || [];
      const nextList = prevList.filter((k) => k.toLowerCase() !== argLower);
      if (nextList.length === prevList.length) {
        replyMsg = `ℹ️ "<b>${escapeTelegramHtml(rawArg)}</b>" আপনার সাবস্ক্রিপশন তালিকায় পাওয়া যায়নি। তালিকা দেখতে লিখুন <code>/subscriptions</code>`;
      } else {
        if (nextList.length === 0) {
          subscriptions.splice(existingIdx, 1);
        } else {
          subscriptions[existingIdx].keywords = nextList;
        }
        replyMsg = `✅ "<b>${escapeTelegramHtml(rawArg)}</b>" সাবস্ক্রিপশন থেকে বাদ দেওয়া হয়েছে।`;
      }
    }

    await supabaseRest(env, 'settings?on_conflict=key', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: [
        {
          key: 'telegram_subscriptions',
          value: JSON.stringify(subscriptions),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: replyMsg,
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
    });
    return jsonResponse({ ok: true });
  }

  if (command === 'colleges') {
    const colRes = await supabaseRest<CollegeRecord[]>(
      env,
      'colleges?is_active=eq.true&select=id,name,notice_url&order=name.asc'
    );
    const colleges = colRes.ok && colRes.data ? colRes.data : [];

    if (colleges.length === 0) {
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: 'ℹ️ বর্তমানে কোনো সক্রিয় কলেজ যুক্ত নেই।',
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
      });
      return jsonResponse({ ok: true });
    }

    const lines = [
      `🏫 <b>মনিটরকৃত সক্রিয় কলেজসমূহ (${toBengaliNumber(colleges.length)} টি):</b>`,
      '',
      ...colleges.map(
        (c, idx) =>
          `${toBengaliNumber(idx + 1)}. <b>${escapeTelegramHtml(c.name)}</b>\n🔗 <a href="${escapeTelegramHtml(c.notice_url)}">নোটিশ বোর্ড দেখুন</a>`
      ),
    ];

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: lines.join('\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
    });
    return jsonResponse({ ok: true });
  }

  if (command === 'latest' || command === 'notice' || command === 'notices') {
    let limit = 8;
    let queryTerm = '';

    if (rawArg) {
      const asciiArg = rawArg.replace(/[০-৯]/g, (d) => WORKER_BN_DIGITS[d] || d).trim();
      const numOnlyMatch = asciiArg.match(/^(\d{1,2})$/);
      const leadingNumMatch = asciiArg.match(/^(\d{1,2})\s+([\s\S]+)$/);

      if (numOnlyMatch) {
        limit = Math.min(10, Math.max(1, Number(numOnlyMatch[1])));
      } else if (leadingNumMatch) {
        limit = Math.min(10, Math.max(1, Number(leadingNumMatch[1])));
        queryTerm = leadingNumMatch[2].trim();
      } else {
        queryTerm = rawArg;
      }
    }

    const allNotices = await fetchSortedNoticesForBot(env);
    const filtered = queryTerm
      ? allNotices.filter((n) => {
          const q = queryTerm.toLowerCase();
          return (
            n.title.toLowerCase().includes(q) || n.college_name.toLowerCase().includes(q)
          );
        })
      : allNotices;

    const selected = filtered.slice(0, limit);

    if (selected.length === 0) {
      const emptyMsg = queryTerm
        ? `ℹ️ "<b>${escapeTelegramHtml(queryTerm)}</b>" সম্পর্কিত কোনো নোটিশ পাওয়া যায়নি।`
        : 'ℹ️ ডাটাবেজে এখনো কোনো নোটিশ সংরক্ষিত নেই।';
      await sendTelegramBotReply(botToken, {
        chat_id: chatId,
        text: emptyMsg,
        message_thread_id: msg.message_thread_id,
        reply_to_message_id: replyToMessageId,
        reply_markup: buildNoticeQuickKeyboard(),
      });
      return jsonResponse({ ok: true });
    }

    const headerTitle = queryTerm
      ? `🔎 <b>"${escapeTelegramHtml(queryTerm)}" সম্পর্কিত সর্বশেষ ${toBengaliNumber(selected.length)}টি নোটিশ:</b>`
      : `📰 <b>সর্বশেষ ${toBengaliNumber(selected.length)}টি নোটিশ:</b>`;

    const formattedItems = selected.map((item, idx) => {
      const datePart = item.date ? ` · 📅 ${escapeTelegramHtml(item.date)}` : '';
      return `${toBengaliNumber(idx + 1)}. <b>${escapeTelegramHtml(item.college_name)}</b>${datePart}\n<a href="${escapeTelegramHtml(item.link)}">${escapeTelegramHtml(item.title)}</a>`;
    });

    const footer = `\n🌐 সব নোটিশ একসাথে: ${escapeTelegramHtml(appOrigin)}`;

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: [headerTitle, '', ...formattedItems, footer].join('\n\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
      reply_markup: buildNoticeQuickKeyboard(),
    });
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
}

async function handleGetTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ error: settings.errorMessage }, 500);
  }

  const expectedUrl = `${new URL(request.url).origin}/api/telegram/webhook`;
  if (!settings.botToken) {
    return jsonResponse({
      configured: false,
      webhook_url: '',
      expected_url: expectedUrl,
      matches_expected: false,
      bot_username: null,
      bot_name: null,
    });
  }

  try {
    const [meRes, infoRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${settings.botToken}/getMe`),
      fetch(`https://api.telegram.org/bot${settings.botToken}/getWebhookInfo`),
    ]);

    const meData = (await meRes.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string };
    };
    const infoData = (await infoRes.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: {
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
        last_error_date?: number;
      };
    };

    const currentUrl = infoData.result?.url || '';
    return jsonResponse({
      configured: Boolean(currentUrl),
      webhook_url: currentUrl,
      expected_url: expectedUrl,
      matches_expected: currentUrl === expectedUrl,
      bot_username: meData.result?.username || null,
      bot_name: meData.result?.first_name || null,
      pending_update_count: infoData.result?.pending_update_count ?? 0,
      last_error_message: infoData.result?.last_error_message || null,
      last_error_date: infoData.result?.last_error_date || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `টেলিগ্রাম Webhook তথ্য আনা যায়নি: ${msg}` }, 502);
  }
}

async function handleRegisterTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ error: settings.errorMessage }, 500);
  }

  if (!settings.botToken) {
    return jsonResponse(
      { error: 'আগে Telegram Bot Token ও Chat ID সেভ করুন।' },
      400
    );
  }

  // Webhook সিক্রেট না থাকলে স্বয়ংক্রিয়ভাবে তৈরি করে ডাটাবেজে সেভ করা হচ্ছে
  const secretQuery = await supabaseRest<SettingRow[]>(
    env,
    'settings?key=eq.telegram_webhook_secret&select=key,value'
  );
  let webhookSecret =
    secretQuery.ok && secretQuery.data?.[0]?.value ? secretQuery.data[0].value.trim() : '';

  if (!webhookSecret) {
    webhookSecret = crypto.randomUUID().replace(/-/g, '');
    await supabaseRest(env, 'settings?on_conflict=key', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: [
        {
          key: 'telegram_webhook_secret',
          value: webhookSecret,
          updated_at: new Date().toISOString(),
        },
      ],
    });
  }

  const expectedUrl = `${new URL(request.url).origin}/api/telegram/webhook`;

  try {
    const [setRes, cmdRes, meRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${settings.botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: expectedUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'channel_post', 'callback_query'],
        }),
      }),
      fetch(`https://api.telegram.org/bot${settings.botToken}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'latest', description: 'সর্বশেষ ৮টি নোটিশ দেখুন' },
            { command: 'today', description: 'আজকের নতুন নোটিশগুলো দেখুন' },
            { command: 'notice', description: 'কলেজ বা বিষয় দিয়ে নোটিশ খুঁজুন' },
            { command: 'routine', description: 'পরীক্ষা ও রুটিন সংক্রান্ত নোটিশ' },
            { command: 'form', description: 'ফরম পূরণ সংক্রান্ত নোটিশ' },
            { command: 'result', description: 'ফলাফল সংক্রান্ত নোটিশ' },
            { command: 'admission', description: 'ভর্তি সংক্রান্ত নোটিশ' },
            { command: 'deadlines', description: 'আসন্ন ফরম পূরণ/ভর্তির শেষ তারিখ' },
            { command: 'subscribe', description: 'কলেজ বা বিষয়ের পার্সোনাল অ্যালার্ট নিন' },
            { command: 'subscriptions', description: 'চালু থাকা সাবস্ক্রিপশন দেখুন' },
            { command: 'unsubscribe', description: 'সাবস্ক্রিপশন বন্ধ করুন' },
            { command: 'colleges', description: 'সক্রিয় কলেজগুলোর তালিকা দেখুন' },
            { command: 'request', description: 'নতুন কলেজ যোগ করার অনুরোধ পাঠান' },
            { command: 'help', description: 'সব কমান্ড সহায়িকা দেখুন' },
          ],
        }),
      }),
      fetch(`https://api.telegram.org/bot${settings.botToken}/getMe`),
    ]);

    const setData = (await setRes.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    const meData = (await meRes.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string };
    };
    await cmdRes.text().catch(() => '');

    if (!setRes.ok || !setData.ok) {
      return jsonResponse(
        {
          error:
            setData.description ||
            `টেলিগ্রাম Webhook চালু করা যায়নি (HTTP ${setRes.status})।`,
        },
        400
      );
    }

    return jsonResponse({
      configured: true,
      webhook_url: expectedUrl,
      expected_url: expectedUrl,
      matches_expected: true,
      bot_username: meData.result?.username || null,
      bot_name: meData.result?.first_name || null,
      pending_update_count: 0,
      last_error_message: null,
      last_error_date: null,
      message:
        'টেলিগ্রাম বট কমান্ড (/latest, /notice, /colleges) ও Webhook সফলভাবে চালু হয়েছে!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `টেলিগ্রাম Webhook সেটআপ ব্যর্থ হয়েছে: ${msg}` }, 502);
  }
}

// ============================================================================
// নোটিশ PDF / ইমেজ প্রিভিউ এক্সট্র্যাকশন ও নিরাপদ ডাউনলোড প্রক্সি হ্যান্ডলার
// ============================================================================
const PREVIEW_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

const MAX_PREVIEW_MEDIA_BYTES = 25 * 1024 * 1024; // সর্বোচ্চ ২৫ মেগাবাইট

function isSafeExternalHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!host) return false;

    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host === '::' ||
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return false;
    }

    // প্রাইভেট IPv4 রেঞ্জ ব্লক (SSRF সুরক্ষা)
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return false;
      }
    }

    if (host.includes('::ffff:')) {
      const mapped = host.split('::ffff:').pop() || '';
      if (
        mapped.startsWith('127.') ||
        mapped.startsWith('10.') ||
        mapped.startsWith('192.168.') ||
        mapped.startsWith('169.254.')
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function decodeBasicHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ');
}

function normalizePreviewMediaUrl(rawUrl: string): string {
  const trimmed = decodeBasicHtmlEntities(rawUrl).trim();
  try {
    const parsed = new URL(trimmed);

    // Google Docs / Drive Viewer মোড়ক থেকে মূল URL বের করা
    if (
      (parsed.hostname === 'docs.google.com' || parsed.hostname === 'drive.google.com') &&
      (parsed.pathname.includes('/viewer') || parsed.pathname.includes('/gview'))
    ) {
      const inner = parsed.searchParams.get('url');
      if (inner && isSafeExternalHttpUrl(inner)) {
        return normalizePreviewMediaUrl(inner);
      }
    }

    // Google Drive শেয়ার লিংক -> সরাসরি ডাউনলোড লিংক
    if (parsed.hostname.includes('drive.google.com')) {
      const fileIdMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const idParam = parsed.searchParams.get('id');
      const fileId = fileIdMatch?.[1] || idParam;
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }
  } catch {
    // ignore parse failure
  }
  return trimmed;
}

function looksLikePdfLink(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.toLowerCase();
    return (
      pathname.endsWith('.pdf') ||
      (parsed.hostname.includes('drive.google.com') && parsed.search.includes('export=download')) ||
      (parsed.hostname.includes('res.cloudinary.com') &&
        (pathname.includes('/raw/') || pathname.endsWith('.pdf')))
    );
  } catch {
    return /\.pdf(\?|#|$)/i.test(rawUrl);
  }
}

function looksLikeImageLink(rawUrl: string): boolean {
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    return /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(pathname);
  } catch {
    return /\.(jpg|jpeg|png|webp|gif|bmp)(\?|#|$)/i.test(rawUrl);
  }
}

function buildSafePreviewFilename(
  title: string,
  sourceUrl: string,
  kind: 'pdf' | 'image',
  contentType = ''
): string {
  const lowerCt = contentType.toLowerCase();
  const defaultExt =
    kind === 'pdf'
      ? 'pdf'
      : lowerCt.includes('png')
        ? 'png'
        : lowerCt.includes('webp')
          ? 'webp'
          : lowerCt.includes('gif')
            ? 'gif'
            : 'jpg';

  try {
    const pathname = new URL(sourceUrl).pathname;
    const rawSegment = decodeURIComponent(pathname.split('/').pop() || '');
    const allowed = kind === 'pdf' ? /\.pdf$/i : /\.(jpg|jpeg|png|webp|gif)$/i;
    if (allowed.test(rawSegment) && rawSegment.length > 4 && rawSegment.length <= 90) {
      return rawSegment.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
  } catch {
    // fallback below
  }

  const asciiSlug = title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);

  return `${asciiSlug || 'college_notice'}.${defaultExt}`;
}

interface PreviewAttachmentCandidate {
  kind: 'pdf' | 'image';
  url: string;
  filename: string;
  previewUrl: string;
  downloadUrl: string;
}

function makePreviewAttachmentObject(
  kind: 'pdf' | 'image',
  mediaUrl: string,
  title: string,
  contentType = ''
): PreviewAttachmentCandidate {
  const filename = buildSafePreviewFilename(title, mediaUrl, kind, contentType);
  const encodedUrl = encodeURIComponent(mediaUrl);
  const encodedName = encodeURIComponent(filename);
  return {
    kind,
    url: mediaUrl,
    filename,
    previewUrl: `/api/media-proxy?url=${encodedUrl}&filename=${encodedName}`,
    downloadUrl: `/api/media-proxy?url=${encodedUrl}&download=1&filename=${encodedName}`,
  };
}

function extractHtmlAttribute(tag: string, attrName: string): string {
  const pattern = new RegExp(
    `\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  );
  const match = tag.match(pattern);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function extractAttachmentsAndTextFromHtml(
  html: string,
  baseUrl: string,
  fallbackTitle: string
): {
  pageTitle: string | null;
  textExcerpt: string | null;
  attachments: PreviewAttachmentCandidate[];
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch
    ? decodeBasicHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    : null;

  // স্ক্রিপ্ট, স্টাইল, SVG বাদ দেওয়া
  const cleanHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');

  // নেভ, হেডার, ফুটার বাদ দিয়ে মূল কনটেন্ট স্কোপ তৈরি (ফাঁকা হলে পুরো পেইজ ফলব্যাক)
  const mainMatch =
    cleanHtml.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[0] ||
    cleanHtml
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ');

  const scanScope = mainMatch.trim().length > 80 ? mainMatch : cleanHtml;

  const pdfCandidates: PreviewAttachmentCandidate[] = [];
  const imageCandidates: PreviewAttachmentCandidate[] = [];
  const seenUrls = new Set<string>();

  const pushUrl = (rawAttr: string, preferKind?: 'pdf' | 'image') => {
    const trimmed = decodeBasicHtmlEntities(rawAttr).trim();
    if (
      !trimmed ||
      trimmed === '#' ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:')
    ) {
      return;
    }

    let resolved = '';
    try {
      resolved = normalizePreviewMediaUrl(new URL(trimmed, baseUrl).href);
    } catch {
      return;
    }

    if (!isSafeExternalHttpUrl(resolved) || seenUrls.has(resolved)) return;

    if (looksLikeImageLink(resolved)) {
      const lower = resolved.toLowerCase();
      if (
        lower.includes('logo') ||
        lower.includes('favicon') ||
        lower.includes('avatar') ||
        lower.endsWith('.svg')
      ) {
        return;
      }
      seenUrls.add(resolved);
      imageCandidates.push(makePreviewAttachmentObject('image', resolved, fallbackTitle));
      return;
    }

    if (looksLikePdfLink(resolved) || preferKind === 'pdf') {
      seenUrls.add(resolved);
      pdfCandidates.push(makePreviewAttachmentObject('pdf', resolved, fallbackTitle));
    }
  };

  // ১. Anchor ট্যাগ (<a href="...">)
  const scanTagsInScope = (scopeHtml: string) => {
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let aMatch: RegExpExecArray | null;
    while ((aMatch = anchorRegex.exec(scopeHtml)) !== null) {
      const attrs = aMatch[1] || '';
      const innerText = (aMatch[2] || '').replace(/<[^>]+>/g, ' ').trim();
      const href = extractHtmlAttribute(`<a ${attrs}>`, 'href');
      if (!href) continue;

      const hasDownloadHint =
        /\bdownload\b/i.test(attrs) ||
        /ডাউনলোড|download|pdf|পিডিএফ|view\s*notice|attachment/i.test(innerText) ||
        looksLikePdfLink(href) ||
        looksLikeImageLink(href) ||
        href.toLowerCase().includes('drive.google.com');

      if (hasDownloadHint) {
        pushUrl(
          href,
          looksLikeImageLink(href)
            ? 'image'
            : looksLikePdfLink(href) || href.toLowerCase().includes('drive.google.com')
              ? 'pdf'
              : undefined
        );
      }
    }

    // ২. iframe / embed / object ট্যাগ
    const embedRegex = /<(iframe|embed|object)\b([^>]*)>/gi;
    let eMatch: RegExpExecArray | null;
    while ((eMatch = embedRegex.exec(scopeHtml)) !== null) {
      const fullTag = eMatch[0];
      const src =
        extractHtmlAttribute(fullTag, 'src') ||
        extractHtmlAttribute(fullTag, 'data');
      if (!src) continue;
      const normalizedSrc = src.toLowerCase();
      if (
        normalizedSrc.includes('.pdf') ||
        normalizedSrc.includes('drive.google.com') ||
        normalizedSrc.includes('docs.google.com') ||
        normalizedSrc.includes('pdfjs') ||
        normalizedSrc.includes('viewer')
      ) {
        pushUrl(src, 'pdf');
      }
    }

    // ৩. Img ট্যাগ (স্ক্যান করা নোটিশ ছবি খুঁজতে — লোগো/আইকন/ছোট ছবি বাদ দিয়ে)
    const imgRegex = /<img\b([^>]*)>/gi;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = imgRegex.exec(scopeHtml)) !== null) {
      const fullTag = iMatch[0];
      const src =
        extractHtmlAttribute(fullTag, 'data-src') ||
        extractHtmlAttribute(fullTag, 'data-lazy-src') ||
        extractHtmlAttribute(fullTag, 'src');
      if (!src || src.startsWith('data:image/svg')) continue;

      const lowerSrc = src.toLowerCase();
      const alt = extractHtmlAttribute(fullTag, 'alt').toLowerCase();
      const cls = extractHtmlAttribute(fullTag, 'class').toLowerCase();
      const widthNum = Number(extractHtmlAttribute(fullTag, 'width') || 0);
      const heightNum = Number(extractHtmlAttribute(fullTag, 'height') || 0);

      if ((widthNum > 0 && widthNum < 90) || (heightNum > 0 && heightNum < 90)) continue;
      if (
        lowerSrc.includes('logo') ||
        lowerSrc.includes('icon') ||
        lowerSrc.includes('favicon') ||
        lowerSrc.includes('avatar') ||
        lowerSrc.includes('spinner') ||
        lowerSrc.includes('loading') ||
        lowerSrc.includes('emoji') ||
        lowerSrc.includes('flag') ||
        lowerSrc.endsWith('.svg') ||
        alt.includes('logo') ||
        cls.includes('logo') ||
        cls.includes('avatar')
      ) {
        continue;
      }

      let resolvedImg = '';
      try {
        resolvedImg = normalizePreviewMediaUrl(new URL(decodeBasicHtmlEntities(src), baseUrl).href);
      } catch {
        continue;
      }
      if (!isSafeExternalHttpUrl(resolvedImg) || seenUrls.has(resolvedImg)) continue;
      seenUrls.add(resolvedImg);
      imageCandidates.push(makePreviewAttachmentObject('image', resolvedImg, fallbackTitle));
    }
  };

  scanTagsInScope(scanScope);
  if (pdfCandidates.length === 0 && imageCandidates.length === 0 && scanScope !== cleanHtml) {
    scanTagsInScope(cleanHtml);
  }

  // ৩খ. Next.js / React SSR JSON বা inline স্ক্রিপ্ট থেকে PDF / ছবির URL খোঁজার ফলব্যাক
  if (pdfCandidates.length === 0 && imageCandidates.length === 0) {
    const rawMediaUrlRegex =
      /(?:https?:\/\/|\/)[^\s"'<>\\)]+?\.(?:pdf|jpe?g|png|webp)(?:\?[^\s"'<>\\)]*)?/gi;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = rawMediaUrlRegex.exec(html)) !== null) {
      const candidate = rMatch[0];
      const lower = candidate.toLowerCase();
      if (
        lower.includes('logo') ||
        lower.includes('favicon') ||
        lower.includes('icon') ||
        lower.includes('avatar') ||
        lower.includes('/_next/static/') ||
        lower.includes('/assets/')
      ) {
        continue;
      }
      pushUrl(candidate);
      if (pdfCandidates.length + imageCandidates.length >= 6) break;
    }
  }

  // ৪. পরিষ্কার টেক্সট সারসংক্ষেপ (যদি HTML নোটিশ হয়)
  const plainText = decodeBasicHtmlEntities(
    scanScope
      .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 3000);

  return {
    pageTitle: pageTitle || null,
    textExcerpt: plainText || null,
    attachments: [...pdfCandidates, ...imageCandidates].slice(0, 8),
  };
}

async function fetchWithPreviewHeaders(
  targetUrl: string,
  timeoutMs = 13000,
  options?: { userAgentIndex?: number; omitReferer?: boolean }
): Promise<Response> {
  let originHeader = '';
  try {
    originHeader = `${new URL(targetUrl).origin}/`;
  } catch {
    originHeader = '';
  }

  const uaIdx = (options?.userAgentIndex || 0) % PREVIEW_USER_AGENTS.length;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': PREVIEW_USER_AGENTS[uaIdx],
        Accept: 'text/html,application/pdf,image/*,*/*;q=0.8',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
        ...(!options?.omitReferer && originHeader ? { Referer: originHeader } : {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildWorkerProxyTargetUrl(proxyTemplate: string, targetUrl: string): string {
  const trimmed = proxyTemplate.trim();
  if (!trimmed) return targetUrl;
  if (trimmed.includes('{url}')) {
    return trimmed.replace(/\{url\}/g, encodeURIComponent(targetUrl));
  }
  if (trimmed.endsWith('=') || trimmed.endsWith('?')) {
    return `${trimmed}${encodeURIComponent(targetUrl)}`;
  }
  return `${trimmed.replace(/\/+$/, '')}/${targetUrl}`;
}

function looksLikeWorkerSpaHtml(html: string): boolean {
  const lower = html.toLowerCase();
  const hasMount =
    lower.includes('id="root"') ||
    lower.includes("id='root'") ||
    lower.includes('id="app"') ||
    lower.includes('id="__next"') ||
    lower.includes('id="__nuxt"');
  const hasModule = lower.includes('type="module"') || lower.includes("type='module'");
  return hasMount || hasModule;
}

interface CachedNoticeAttachmentRecord {
  attachments?: Array<{ kind: 'pdf' | 'image'; url: string; filename?: string }>;
  textExcerpt?: string | null;
  pageTitle?: string | null;
}

async function readCachedNoticePreview(
  env: Env,
  rawUrl: string,
  normalizedUrl: string,
  noticeTitle: string
): Promise<{
  attachments: PreviewAttachmentCandidate[];
  textExcerpt: string | null;
  pageTitle: string | null;
} | null> {
  try {
    const cacheRes = await supabaseRest<SettingRow[]>(
      env,
      'settings?key=eq.notice_attachments_cache&select=key,value'
    );
    if (!cacheRes.ok || !cacheRes.data?.[0]?.value) return null;
    const parsedMap = JSON.parse(cacheRes.data[0].value) as Record<
      string,
      CachedNoticeAttachmentRecord
    >;
    if (!parsedMap || typeof parsedMap !== 'object') return null;

    const entry = parsedMap[rawUrl] || parsedMap[normalizedUrl];
    if (!entry) return null;

    const rawList = Array.isArray(entry.attachments) ? entry.attachments : [];
    const attachments: PreviewAttachmentCandidate[] = [];
    for (const item of rawList) {
      if (!item?.url || !isSafeExternalHttpUrl(item.url)) continue;
      const cleanMediaUrl = normalizePreviewMediaUrl(item.url);
      attachments.push(
        makePreviewAttachmentObject(
          item.kind === 'image' ? 'image' : 'pdf',
          cleanMediaUrl,
          noticeTitle
        )
      );
    }

    if (attachments.length === 0 && !entry.textExcerpt) return null;

    return {
      attachments,
      textExcerpt: entry.textExcerpt || null,
      pageTitle: entry.pageTitle || noticeTitle,
    };
  } catch {
    return null;
  }
}

async function handleNoticePreview(request: Request, env: Env): Promise<Response> {
  const reqUrl = new URL(request.url);
  const rawNoticeUrl = (reqUrl.searchParams.get('url') || '').trim();
  const noticeTitle = (reqUrl.searchParams.get('title') || 'college_notice').trim();

  if (!rawNoticeUrl || !isSafeExternalHttpUrl(rawNoticeUrl)) {
    return jsonResponse({ error: 'সঠিক ও নিরাপদ নোটিশ লিংক পাওয়া যায়নি।' }, 400);
  }

  const normalizedUrl = normalizePreviewMediaUrl(rawNoticeUrl);

  // ০. স্ক্র্যাপার থেকে সংরক্ষিত ক্যাশ (বিশেষ করে SPA / Playwright নোটিশের জন্য)
  const cachedPreview = await readCachedNoticePreview(env, rawNoticeUrl, normalizedUrl, noticeTitle);
  if (cachedPreview && cachedPreview.attachments.length > 0) {
    return new Response(
      JSON.stringify({
        kind: cachedPreview.attachments[0].kind,
        originalUrl: rawNoticeUrl,
        finalUrl: normalizedUrl,
        pageTitle: cachedPreview.pageTitle,
        textExcerpt: cachedPreview.textExcerpt,
        attachments: cachedPreview.attachments,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=180',
        },
      }
    );
  }

  // সরাসরি PDF বা ছবি URL হলে নেটওয়ার্ক অপেক্ষা ছাড়াই ফাস্ট রেসপন্স
  if (looksLikePdfLink(normalizedUrl)) {
    const item = makePreviewAttachmentObject('pdf', normalizedUrl, noticeTitle, 'application/pdf');
    return new Response(
      JSON.stringify({
        kind: 'pdf',
        originalUrl: rawNoticeUrl,
        finalUrl: normalizedUrl,
        pageTitle: noticeTitle,
        textExcerpt: null,
        attachments: [item],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  }

  if (looksLikeImageLink(normalizedUrl)) {
    const item = makePreviewAttachmentObject('image', normalizedUrl, noticeTitle);
    return new Response(
      JSON.stringify({
        kind: 'image',
        originalUrl: rawNoticeUrl,
        finalUrl: normalizedUrl,
        pageTitle: noticeTitle,
        textExcerpt: null,
        attachments: [item],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  }

  try {
    let res = await fetchWithPreviewHeaders(normalizedUrl, 12000);

    // যদি 403 বা 404 আসে, তাহলে encodeURI / Referer ছাড়া / ট্রেইলিং স্ল্যাশ রিট্রাই করা হবে
    if (!res.ok && (res.status === 404 || res.status === 403 || res.status === 406)) {
      const candidatesToTry: string[] = [];
      const encoded = encodeURI(normalizedUrl);
      if (encoded !== normalizedUrl) candidatesToTry.push(encoded);
      if (!normalizedUrl.endsWith('/')) {
        candidatesToTry.push(`${normalizedUrl}/`);
      } else if (normalizedUrl.length > 10) {
        candidatesToTry.push(normalizedUrl.slice(0, -1));
      }

      // একবার Referer ছাড়া মোবাইল UA দিয়ে চেষ্টা
      const noRefRes = await fetchWithPreviewHeaders(normalizedUrl, 10000, {
        userAgentIndex: 1,
        omitReferer: true,
      }).catch(() => null);
      if (noRefRes && noRefRes.ok) {
        res = noRefRes;
      } else {
        for (const altUrl of candidatesToTry) {
          if (!isSafeExternalHttpUrl(altUrl)) continue;
          const altRes = await fetchWithPreviewHeaders(altUrl, 10000, {
            userAgentIndex: 1,
            omitReferer: true,
          }).catch(() => null);
          if (altRes && altRes.ok) {
            res = altRes;
            break;
          }
        }
      }
    }

    // সংশ্লিষ্ট কলেজের কাস্টম proxy_url থাকলে তা দিয়ে চেষ্টা
    if (!res.ok) {
      const origin = new URL(normalizedUrl).origin;
      const colRes = await supabaseRest<CollegeRecord[]>(
        env,
        `colleges?select=notice_url,selector_config`
      );
      if (colRes.ok && colRes.data) {
        const matchedCollege = colRes.data.find((c) => {
          try {
            return new URL(c.notice_url).origin === origin;
          } catch {
            return false;
          }
        });
        const proxyTpl =
          typeof matchedCollege?.selector_config?.proxy_url === 'string'
            ? matchedCollege.selector_config.proxy_url.trim()
            : '';
        if (proxyTpl) {
          const proxiedUrl = buildWorkerProxyTargetUrl(proxyTpl, normalizedUrl);
          if (isSafeExternalHttpUrl(proxiedUrl)) {
            const pRes = await fetchWithPreviewHeaders(proxiedUrl, 12000).catch(() => null);
            if (pRes && pRes.ok) {
              res = pRes;
            }
          }
        }
      }
    }

    const finalUrl = res.url || normalizedUrl;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok) {
      // যদি ক্যাশে শুধু textExcerpt থাকে সেটি দেখাবে
      if (cachedPreview?.textExcerpt) {
        return jsonResponse({
          kind: 'webpage',
          originalUrl: rawNoticeUrl,
          finalUrl,
          pageTitle: cachedPreview.pageTitle || noticeTitle,
          textExcerpt: cachedPreview.textExcerpt,
          attachments: [],
        });
      }

      // যদি 404 সাবপাথ হয় এবং মূল সাইট একটি React/JS SPA হয়, তাহলে পরিষ্কার SPA বার্তা দেবে
      if (res.status === 404) {
        const parsedTarget = new URL(normalizedUrl);
        if (parsedTarget.pathname && parsedTarget.pathname !== '/') {
          const originRes = await fetchWithPreviewHeaders(`${parsedTarget.origin}/`, 8000).catch(
            () => null
          );
          if (originRes && originRes.ok) {
            const originHtml = await originRes.text().catch(() => '');
            if (looksLikeWorkerSpaHtml(originHtml)) {
              return jsonResponse({
                kind: 'webpage',
                isSpaSite: true,
                originalUrl: rawNoticeUrl,
                finalUrl,
                pageTitle: noticeTitle,
                textExcerpt: null,
                attachments: [],
                error:
                  'এই কলেজের নোটিশ পেইজটি একটি JavaScript (SPA) ওয়েবসাইটে তৈরি, তাই সরাসরি রুট ছাড়া সাব-লিংক থেকে ফাইল টানা যায়নি। এডমিন প্যানেল থেকে "সিঙ্ক (২০টি)" বা স্ক্যান চালালে এটি ক্যাশ হয়ে প্রিভিউ দেখাবে, অথবা নিচের বাটন থেকে মূল সাইট দেখতে পারেন।',
              });
            }
          }
        }
      }

      return jsonResponse(
        {
          kind: 'webpage',
          originalUrl: rawNoticeUrl,
          finalUrl,
          pageTitle: noticeTitle,
          textExcerpt: null,
          attachments: [],
          error: `কলেজ সার্ভার থেকে ফাইল পাওয়া যায়নি (HTTP ${res.status})। নিচের বাটন থেকে মূল নোটিশ ওয়েবসাইটে দেখতে পারেন।`,
        },
        200
      );
    }

    if (contentType.includes('application/pdf')) {
      const item = makePreviewAttachmentObject('pdf', finalUrl, noticeTitle, contentType);
      return new Response(
        JSON.stringify({
          kind: 'pdf',
          originalUrl: rawNoticeUrl,
          finalUrl,
          pageTitle: noticeTitle,
          textExcerpt: null,
          attachments: [item],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    if (contentType.startsWith('image/') && !contentType.includes('svg')) {
      const item = makePreviewAttachmentObject('image', finalUrl, noticeTitle, contentType);
      return new Response(
        JSON.stringify({
          kind: 'image',
          originalUrl: rawNoticeUrl,
          finalUrl,
          pageTitle: noticeTitle,
          textExcerpt: null,
          attachments: [item],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    const html = await res.text();
    const extracted = extractAttachmentsAndTextFromHtml(html, finalUrl, noticeTitle);
    const isSpa = extracted.attachments.length === 0 && looksLikeWorkerSpaHtml(html);
    const detectedKind: 'pdf' | 'image' | 'webpage' =
      extracted.attachments.length > 0 ? extracted.attachments[0].kind : 'webpage';

    return new Response(
      JSON.stringify({
        kind: detectedKind,
        isSpaSite: isSpa,
        originalUrl: rawNoticeUrl,
        finalUrl,
        pageTitle: extracted.pageTitle || noticeTitle,
        textExcerpt: extracted.textExcerpt || cachedPreview?.textExcerpt || null,
        attachments: extracted.attachments,
        ...(isSpa && !extracted.textExcerpt
          ? {
              error:
                'এই নোটিশ পেইজটি JavaScript (SPA) নির্ভর হওয়ায় ব্রাউজার রেন্ডারিং ছাড়া ভেতরের ফাইল দেখা যাচ্ছে না। এডমিন প্যানেল থেকে "সিঙ্ক (২০টি)" বা স্ক্যান চালালে এটি স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।',
            }
          : {}),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      {
        kind: 'webpage',
        originalUrl: rawNoticeUrl,
        finalUrl: normalizedUrl,
        pageTitle: noticeTitle,
        textExcerpt: null,
        attachments: [],
        error: `নোটিশ পেইজ লোড করা যায়নি: ${msg}`,
      },
      200
    );
  }
}

async function resolveGoogleDriveConfirmationResponse(
  initialRes: Response,
  initialUrl: string
): Promise<Response> {
  const ct = (initialRes.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html') || !initialUrl.includes('drive.google.com')) {
    return initialRes;
  }

  const html = await initialRes.text();
  // Google Drive বড় ফাইলের ক্ষেত্রে usercontent ডাউনলোড ফর্ম দেখায়
  const formActionMatch = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download[^"]*)"/i);
  if (formActionMatch?.[1]) {
    const actionUrl = new URL(decodeBasicHtmlEntities(formActionMatch[1]));
    const hiddenRegex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = hiddenRegex.exec(html)) !== null) {
      const tag = hMatch[0];
      const name = extractHtmlAttribute(tag, 'name');
      const val = extractHtmlAttribute(tag, 'value');
      if (name) {
        actionUrl.searchParams.set(name, decodeBasicHtmlEntities(val));
      }
    }
    return fetchWithPreviewHeaders(actionUrl.toString(), 18000);
  }

  const confirmLinkMatch = html.match(/href="([^"]*export=download[^"]*confirm=[^"]*)"/i);
  if (confirmLinkMatch?.[1]) {
    const nextUrl = new URL(decodeBasicHtmlEntities(confirmLinkMatch[1]), 'https://drive.google.com').href;
    if (isSafeExternalHttpUrl(nextUrl)) {
      return fetchWithPreviewHeaders(nextUrl, 18000);
    }
  }

  return new Response(html, {
    status: initialRes.status,
    headers: initialRes.headers,
  });
}

async function handleMediaProxy(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const rawTargetUrl = (reqUrl.searchParams.get('url') || '').trim();
  const isDownload =
    reqUrl.searchParams.get('download') === '1' ||
    reqUrl.searchParams.get('download') === 'true';
  const requestedFilename = (reqUrl.searchParams.get('filename') || '').trim();

  if (!rawTargetUrl || !isSafeExternalHttpUrl(rawTargetUrl)) {
    return jsonResponse({ error: 'সঠিক ও নিরাপদ মিডিয়া লিংক দেওয়া হয়নি।' }, 400);
  }

  const normalizedUrl = normalizePreviewMediaUrl(rawTargetUrl);
  if (!isSafeExternalHttpUrl(normalizedUrl)) {
    return jsonResponse({ error: 'অবৈধ মিডিয়া লিংক।' }, 400);
  }

  try {
    let upstreamRes = await fetchWithPreviewHeaders(normalizedUrl, 18000);
    upstreamRes = await resolveGoogleDriveConfirmationResponse(upstreamRes, upstreamRes.url || normalizedUrl);

    if (!upstreamRes.ok) {
      return jsonResponse(
        { error: `মূল সার্ভার থেকে ফাইল আনা যায়নি (HTTP ${upstreamRes.status})।` },
        502
      );
    }

    const declaredLength = Number(upstreamRes.headers.get('content-length') || 0);
    if (declaredLength > MAX_PREVIEW_MEDIA_BYTES) {
      return jsonResponse({ error: 'ফাইলটি ২৫ মেগাবাইটের চেয়ে বড় হওয়ায় প্রিভিউ করা সম্ভব নয়।' }, 413);
    }

    let contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
    const finalUrl = upstreamRes.url || normalizedUrl;

    if (contentType.includes('text/html')) {
      return jsonResponse(
        { error: 'উক্ত লিংকে সরাসরি PDF বা ছবি পাওয়া যায়নি (HTML পেইজ এসেছে)।' },
        422
      );
    }

    if (!contentType || contentType.includes('application/octet-stream')) {
      if (looksLikePdfLink(finalUrl) || /\.pdf$/i.test(requestedFilename)) {
        contentType = 'application/pdf';
      } else if (/\.png(\?|#|$)/i.test(finalUrl) || /\.png$/i.test(requestedFilename)) {
        contentType = 'image/png';
      } else if (/\.webp(\?|#|$)/i.test(finalUrl) || /\.webp$/i.test(requestedFilename)) {
        contentType = 'image/webp';
      } else if (/\.gif(\?|#|$)/i.test(finalUrl) || /\.gif$/i.test(requestedFilename)) {
        contentType = 'image/gif';
      } else if (looksLikeImageLink(finalUrl)) {
        contentType = 'image/jpeg';
      }
    }

    const buffer = await upstreamRes.arrayBuffer();
    if (buffer.byteLength === 0) {
      return jsonResponse({ error: 'ফাইলটি খালি পাওয়া গেছে।' }, 422);
    }
    if (buffer.byteLength > MAX_PREVIEW_MEDIA_BYTES) {
      return jsonResponse({ error: 'ফাইলটি ২৫ মেগাবাইটের চেয়ে বড়।' }, 413);
    }

    // PDF সিগনেচার (%PDF) যাচাই করে octet-stream থেকে application/pdf নির্ধারণ
    const headerBytes = new Uint8Array(buffer.slice(0, 5));
    const asciiPrefix = String.fromCharCode(...headerBytes);
    if (asciiPrefix.startsWith('%PDF')) {
      contentType = 'application/pdf';
    }

    const detectedKind: 'pdf' | 'image' = contentType.includes('pdf') ? 'pdf' : 'image';
    const safeFilename = (
      requestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_') ||
      buildSafePreviewFilename('college_notice', finalUrl, detectedKind, contentType)
    ).slice(0, 100);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `ফাইল প্রক্সি লোড ব্যর্থ হয়েছে: ${msg}` }, 502);
  }
}

// ============================================================================
// মেইন Cloudflare Worker fetch ও scheduled (Cron) হ্যান্ডলার
// ============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // শুধুমাত্র /api/* রুটগুলো Worker নিজে হ্যান্ডেল করবে
    if (pathname.startsWith('/api/')) {
      // পাবলিক ও এডমিন নোটিশ প্রিভিউ (PDF/ইমেজ/টেক্সট ডিটেকশন)
      if (pathname === '/api/notice-preview') {
        if (request.method !== 'GET') {
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }
        return handleNoticePreview(request, env);
      }

      // পাবলিক ও এডমিন মিডিয়া প্রক্সি (ফোনে ইনলাইন প্রিভিউ ও সরাসরি ডাউনলোড)
      if (pathname === '/api/media-proxy') {
        if (request.method !== 'GET') {
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }
        return handleMediaProxy(request);
      }

      // টেলিগ্রাম বট ইন্টারেক্টিভ Webhook (/latest, /notice, /colleges, /help)
      if (pathname === '/api/telegram/webhook') {
        if (request.method !== 'POST') {
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }
        return handleTelegramWebhook(request, env);
      }

      // অপশনাল External Cron Webhook (যেমন cron-job.org ব্যাকআপের জন্য)
      if (pathname === '/api/cron/scan') {
        if (request.method !== 'POST' && request.method !== 'GET') {
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }
        const expectedSecret = (env.CRON_SECRET || '').trim();
        if (!expectedSecret) {
          return jsonResponse({ error: 'CRON_SECRET কনফিগার করা নেই।' }, 503);
        }
        const authHeader = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const querySecret = (url.searchParams.get('secret') || '').trim();
        if (authHeader !== expectedSecret && querySecret !== expectedSecret) {
          return jsonResponse({ error: 'অননুমোদিত Cron অনুরোধ।' }, 401);
        }
        const cronResult = await triggerScheduledAutoScan(env, 'external_cron');
        return jsonResponse(cronResult, cronResult.triggered ? 202 : 200);
      }

      // সব /api/admin/* রুটের জন্য এডমিন প্রমাণীকরণ বাধ্যতামূলক
      if (pathname.startsWith('/api/admin/')) {
        const auth = await verifyAdminRequest(request, env);
        if (auth.errorResponse) return auth.errorResponse;

        // ১. কলেজ তালিকা পড়া ও নতুন কলেজ যোগ করা
        if (pathname === '/api/admin/colleges') {
          if (request.method === 'GET') return handleGetColleges(env);
          if (request.method === 'POST') return handleCreateCollege(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ২. নির্দিষ্ট কলেজের ২০টি নোটিশ বেসলাইন সিঙ্ক করা
        const baselineMatch = pathname.match(/^\/api\/admin\/colleges\/([^/]+)\/sync-baseline$/);
        if (baselineMatch) {
          const collegeId = decodeURIComponent(baselineMatch[1]);
          if (request.method === 'POST') return handleTriggerCollegeBaseline(env, collegeId);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৩. নির্দিষ্ট কলেজ আপডেট (PATCH) বা ডিলিট (DELETE)
        const collegeIdMatch = pathname.match(/^\/api\/admin\/colleges\/([^/]+)$/);
        if (collegeIdMatch) {
          const collegeId = decodeURIComponent(collegeIdMatch[1]);
          if (request.method === 'PATCH') return handleUpdateCollege(request, env, collegeId);
          if (request.method === 'DELETE') return handleDeleteCollege(env, collegeId);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৪. টেলিগ্রাম সেটিংস পড়া ও সেভ করা
        if (pathname === '/api/admin/settings') {
          if (request.method === 'GET') return handleGetSettings(env);
          if (request.method === 'PUT') return handleUpdateSettings(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৫. অটো-স্ক্যান ও ক্রন স্ট্যাটাস পড়া ও পরিবর্তন করা
        if (pathname === '/api/admin/automation') {
          if (request.method === 'GET') return handleGetAutomation(env);
          if (request.method === 'PUT') return handleUpdateAutomation(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৫খ. হেলথ ও স্ক্যান হিস্ট্রি লগ পড়া
        if (pathname === '/api/admin/scan-logs') {
          if (request.method === 'GET') return handleGetScanLogs(env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৫গ. টেলিগ্রাম ইন্টারেক্টিভ বট কমান্ড Webhook অবস্থা ও রেজিস্ট্রেশন
        if (pathname === '/api/admin/telegram-webhook') {
          if (request.method === 'GET') return handleGetTelegramWebhook(request, env);
          if (request.method === 'POST') return handleRegisterTelegramWebhook(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৬. টেলিগ্রাম টেস্ট মেসেজ পাঠানো
        if (pathname === '/api/admin/telegram-test') {
          if (request.method === 'POST') return handleTelegramTest(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৬খ. এডমিন ম্যানুয়াল ব্রডকাস্ট প্যানেল (সব গ্রুপ/চ্যানেলে এক ক্লিকে ঘোষণা)
        if (pathname === '/api/admin/broadcast') {
          if (request.method === 'POST') return handleAdminBroadcast(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৭. ডেইলি ডাইজেস্ট রিপোর্ট পাঠানো
        if (pathname === '/api/admin/daily-digest') {
          if (request.method === 'POST') return handleSendDailyDigest(env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৮. সব সক্রিয় কলেজ একসাথে এখনই স্ক্যান করা
        if (pathname === '/api/admin/scan-all') {
          if (request.method === 'POST') return handleTriggerScanAll(env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ৯. নির্দিষ্ট কলেজের জন্য টেস্ট রান শুরু করা
        if (pathname === '/api/admin/test-run') {
          if (request.method === 'POST') return handleTriggerTestRun(request, env);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }

        // ১০. নির্দিষ্ট টেস্ট/বেসলাইন রানের ফলাফল পোল করা
        const testRunIdMatch = pathname.match(/^\/api\/admin\/test-run\/([^/]+)$/);
        if (testRunIdMatch) {
          const runId = decodeURIComponent(testRunIdMatch[1]);
          if (request.method === 'GET') return handleGetTestRun(env, runId);
          return jsonResponse({ error: 'এই HTTP মেথড অনুমোদিত নয়।' }, 405);
        }
      }

      // অজানা /api/* রুটের জন্য ৪0৪ JSON রেসপন্স
      return jsonResponse({ error: 'অনুরোধকৃত API এন্ডপয়েন্ট পাওয়া যায়নি।' }, 404);
    }

    // বাকি সব রিকোয়েস্ট Static Assets (SPA) থেকে পরিবেশন করা হবে
    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _controller: { scheduledTime?: number; cron?: string },
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
  ): Promise<void> {
    ctx.waitUntil(triggerScheduledAutoScan(env, 'cloudflare_cron'));
  },
};
