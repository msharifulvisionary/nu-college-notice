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

// কমা বা নতুন লাইন দিয়ে আলাদা করা একাধিক Chat ID পার্স করার হেল্পার
function parseWorkerChatIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const part of raw.split(/[,\n]+/)) {
    const clean = part.trim().replace(/^\./, '');
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      list.push(clean);
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
  errorMessage?: string;
}> {
  const res = await supabaseRest<SettingRow[]>(
    env,
    'settings?key=in.(telegram_bot_token,telegram_chat_id)&select=key,value'
  );

  if (!res.ok || !res.data) {
    return {
      ok: false,
      botToken: '',
      chatId: '',
      errorMessage: res.errorMessage || 'সেটিংস টেবিল থেকে তথ্য পড়া যায়নি।',
    };
  }

  let botToken = '';
  let chatId = '';

  for (const row of res.data) {
    if (row.key === 'telegram_bot_token') botToken = (row.value || '').trim();
    if (row.key === 'telegram_chat_id') chatId = (row.value || '').trim();
  }

  return { ok: true, botToken, chatId };
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
  });
}

async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJsonBody<{
    telegram_bot_token?: unknown;
    telegram_chat_id?: unknown;
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
    message: 'টেলিগ্রাম সেটিংস সফলভাবে ডাটাবেজে সংরক্ষণ করা হয়েছে।',
  });
}

async function handleTelegramTest(request: Request, env: Env): Promise<Response> {
  let customMessage = '';
  try {
    const body = (await request.json()) as { message?: unknown };
    if (body && typeof body.message === 'string') {
      customMessage = body.message.trim();
    }
  } catch {
    // খালি বডি অনুমোদিত
  }

  const settings = await fetchTelegramSettings(env);
  if (!settings.ok) {
    return jsonResponse({ ok: false, error: settings.errorMessage }, 500);
  }

  if (!settings.botToken || !settings.chatId) {
    return jsonResponse(
      {
        ok: false,
        error:
          'ডাটাবেজে Telegram Bot Token অথবা Chat ID সেভ করা নেই। অনুগ্রহ করে আগে সেটিংস সেভ করুন।',
      },
      400
    );
  }

  const chatIds = parseWorkerChatIdList(settings.chatId);
  if (chatIds.length === 0) {
    return jsonResponse(
      { ok: false, error: 'সঠিক Telegram Chat ID পাওয়া যায়নি।' },
      400
    );
  }

  const textToSend =
    customMessage ||
    '🧪 টেস্ট নোটিফিকেশন: Multi-College Notice Tracker ও টেলিগ্রাম বট সঠিকভাবে যুক্ত আছে!';

  let sentCount = 0;
  let lastError = '';
  let lastTgData: { ok?: boolean; description?: string; error_code?: number } = {};

  for (const cid of chatIds) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cid,
          text: textToSend,
          disable_web_page_preview: false,
        }),
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
          `টেলিগ্রাম মেসেজ পাঠানো যায়নি (HTTP ${tgRes.status})। টোকেন ও চ্যাট আইডি যাচাই করুন।`;
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
      chatIds.length > 1
        ? `টেলিগ্রাম টেস্ট মেসেজ ${sentCount}/${chatIds.length}টি চ্যাটে সফলভাবে পাঠানো হয়েছে!`
        : 'টেলিগ্রাম টেস্ট মেসেজ সফলভাবে পাঠানো হয়েছে!',
    telegram_response: { ok: true },
  });
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

  // বাংলাদেশ সময় (Asia/Dhaka = UTC+6) অনুযায়ী আজকের শুরুর ISO সময় বের করা হচ্ছে
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
    return jsonResponse(
      {
        ok: false,
        error:
          collegesRes.errorMessage ||
          noticesRes.errorMessage ||
          'ডাইজেস্টের জন্য ডাটা সংগ্রহ করা যায়নি।',
      },
      500
    );
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

  const digestText = lines.join('\n');
  const chatIds = parseWorkerChatIdList(settings.chatId);
  if (chatIds.length === 0) {
    return jsonResponse({ ok: false, error: 'সঠিক Telegram Chat ID পাওয়া যায়নি।' }, 400);
  }

  let sentCount = 0;
  let lastError = '';

  for (const cid of chatIds) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cid,
          text: digestText,
          disable_web_page_preview: true,
        }),
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
    message: `আজকের ডেইলি ডাইজেস্ট (${todayNotices.length} টি নোটিশ) সফলভাবে ${sentCount}টি টেলিগ্রাম চ্যাটে পাঠানো হয়েছে!`,
    summary: {
      date: dhakaDate,
      active_colleges: activeColleges.length,
      total_notices_today: todayNotices.length,
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

  const targetMap = new Map<string, { chatId: string; threadId?: number }>();
  const addTarget = (cid: string, threadId?: number | null) => {
    const clean = cid.trim().replace(/^\./, '');
    if (!clean) return;
    const key = `${clean}:${threadId && threadId > 0 ? threadId : ''}`;
    if (!targetMap.has(key)) {
      targetMap.set(key, {
        chatId: clean,
        ...(threadId && threadId > 0 ? { threadId } : {}),
      });
    }
  };

  if (targetMode === 'custom') {
    for (const cid of parseWorkerChatIdList(customChatIdsRaw)) {
      addTarget(cid);
    }
    if (targetMap.size === 0) {
      return jsonResponse(
        { ok: false, error: 'কাস্টম ব্রডকাস্টের জন্য অন্তত একটি Chat ID দিন।' },
        400
      );
    }
  } else {
    for (const cid of parseWorkerChatIdList(settings.chatId)) {
      addTarget(cid);
    }
    if (targetMode === 'all') {
      const collegesRes = await supabaseRest<CollegeRecord[]>(
        env,
        'colleges?is_active=eq.true&select=telegram_chat_id,telegram_thread_id'
      );
      if (collegesRes.ok && collegesRes.data) {
        for (const col of collegesRes.data) {
          const customList = parseWorkerChatIdList(col.telegram_chat_id);
          customList.forEach((cid, idx) => {
            addTarget(cid, idx === 0 ? col.telegram_thread_id : undefined);
          });
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
    sortMs: number;
  }>
> {
  let res = await supabaseRest<WebhookNoticeRow[]>(
    env,
    'notices?select=id,college_id,title,link,date,published_at,created_at,colleges(name)&order=published_at.desc.nullslast,created_at.desc&limit=120'
  );

  if (!res.ok && res.errorMessage && /published_at/i.test(res.errorMessage)) {
    res = await supabaseRest<WebhookNoticeRow[]>(
      env,
      'notices?select=id,college_id,title,link,date,created_at,colleges(name)&order=created_at.desc&limit=120'
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
      sortMs,
    };
  });

  items.sort((a, b) => b.sortMs - a.sortMs);
  return items;
}

async function sendTelegramBotReply(
  botToken: string,
  payload: {
    chat_id: string | number;
    text: string;
    message_thread_id?: number;
    reply_to_message_id?: number;
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

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const settingsRes = await supabaseRest<SettingRow[]>(
    env,
    'settings?key=in.(telegram_bot_token,telegram_webhook_secret)&select=key,value'
  );

  if (!settingsRes.ok || !settingsRes.data) {
    return jsonResponse({ ok: true });
  }

  let botToken = '';
  let expectedSecret = '';
  for (const row of settingsRes.data) {
    if (row.key === 'telegram_bot_token') botToken = (row.value || '').trim();
    if (row.key === 'telegram_webhook_secret') expectedSecret = (row.value || '').trim();
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

  let update: {
    message?: {
      message_id?: number;
      message_thread_id?: number;
      text?: string;
      from?: { first_name?: string; username?: string };
      chat?: { id?: number | string; type?: string; title?: string };
    };
    channel_post?: {
      message_id?: number;
      message_thread_id?: number;
      text?: string;
      chat?: { id?: number | string; type?: string; title?: string };
    };
  };

  try {
    update = (await request.json()) as typeof update;
  } catch {
    return jsonResponse({ ok: true });
  }

  const msg = update.message || update.channel_post;
  const rawText = (msg?.text || '').trim();
  const chatId = msg?.chat?.id;

  if (!msg || !rawText || chatId === undefined || chatId === null || !rawText.startsWith('/')) {
    return jsonResponse({ ok: true });
  }

  const cmdMatch = rawText.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!cmdMatch) {
    return jsonResponse({ ok: true });
  }

  const command = cmdMatch[1].toLowerCase();
  const rawArg = (cmdMatch[2] || '').trim();
  const isGroup = msg.chat?.type === 'group' || msg.chat?.type === 'supergroup';
  const replyToMessageId = isGroup && msg.message_id ? msg.message_id : undefined;

  if (command === 'start' || command === 'help') {
    const helpLines = [
      '🔔 <b>জাতীয় বিশ্ববিদ্যালয় ও কলেজ নোটিশ বট</b>',
      '',
      'নিচের কমান্ডগুলো ব্যবহার করে যেকোনো সময় সর্বশেষ নোটিশ দেখতে ও অ্যালার্ট চালু করতে পারবেন:',
      '• /latest — সর্বশেষ ৮টি নোটিশ দেখুন',
      '• /latest 10 — সর্বশেষ ১০টি নোটিশ দেখুন (৫–১০)',
      '• /notice &lt;কলেজ বা বিষয়&gt; — নির্দিষ্ট কলেজ বা কীওয়ার্ড দিয়ে খুঁজুন',
      '  <i>উদাহরণ:</i> <code>/notice ফরম</code> বা <code>/notice আজিজুল</code>',
      '• /subscribe &lt;কলেজ বা বিষয়&gt; — পার্সোনাল নোটিশ অ্যালার্ট চালু করুন',
      '  <i>উদাহরণ:</i> <code>/subscribe আজিজুল</code> বা <code>/subscribe ফরম</code>',
      '• /subscriptions — আপনার চালু থাকা সাবস্ক্রিপশন দেখুন',
      '• /unsubscribe [কীওয়ার্ড] — সাবস্ক্রিপশন বাতিল করুন',
      '• /colleges — সংযুক্ত সক্রিয় কলেজগুলোর তালিকা দেখুন',
      '• /help — কমান্ড সহায়িকা দেখুন',
    ];

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: helpLines.join('\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
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
        update.message?.from?.first_name ||
        update.message?.from?.username ||
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
    if (!rawArg || argLower === 'all' || rawArg === 'সব') {
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

    const footer = `\n🌐 সব নোটিশ একসাথে: ${escapeTelegramHtml(new URL(request.url).origin)}`;

    await sendTelegramBotReply(botToken, {
      chat_id: chatId,
      text: [headerTitle, '', ...formattedItems, footer].join('\n\n'),
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: replyToMessageId,
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
          allowed_updates: ['message', 'channel_post'],
        }),
      }),
      fetch(`https://api.telegram.org/bot${settings.botToken}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'latest', description: 'সর্বশেষ ৮টি নোটিশ দেখুন' },
            { command: 'notice', description: 'সর্বশেষ নোটিশ দেখুন বা খুঁজুন' },
            { command: 'subscribe', description: 'কলেজ বা বিষয়ের পার্সোনাল অ্যালার্ট নিন' },
            { command: 'subscriptions', description: 'চালু থাকা সাবস্ক্রিপশন দেখুন' },
            { command: 'unsubscribe', description: 'সাবস্ক্রিপশন বন্ধ করুন' },
            { command: 'colleges', description: 'সক্রিয় কলেজগুলোর তালিকা দেখুন' },
            { command: 'help', description: 'বট কমান্ড সহায়িকা' },
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
// মেইন Cloudflare Worker fetch ও scheduled (Cron) হ্যান্ডলার
// ============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // শুধুমাত্র /api/* রুটগুলো Worker নিজে হ্যান্ডেল করবে
    if (pathname.startsWith('/api/')) {
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
