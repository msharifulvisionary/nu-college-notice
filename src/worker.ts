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

  const cleanChatId = settings.chatId.replace(/^\./, '');
  const textToSend =
    customMessage ||
    '🧪 টেস্ট নোটিফিকেশন: Multi-College Notice Tracker ও টেলিগ্রাম বট সঠিকভাবে যুক্ত আছে!';

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: textToSend,
        disable_web_page_preview: false,
      }),
    });

    const tgData = (await tgRes.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      error_code?: number;
    };

    if (!tgRes.ok || !tgData.ok) {
      return jsonResponse(
        {
          ok: false,
          error:
            tgData.description ||
            `টেলিগ্রাম মেসেজ পাঠানো যায়নি (HTTP ${tgRes.status})। টোকেন ও চ্যাট আইডি যাচাই করুন।`,
          telegram_response: tgData,
        },
        400
      );
    }

    return jsonResponse({
      ok: true,
      message: 'টেলিগ্রাম টেস্ট মেসেজ সফলভাবে পাঠানো হয়েছে!',
      telegram_response: { ok: true },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { ok: false, error: `টেলিগ্রাম API-এর সাথে সংযোগ ব্যর্থ হয়েছে: ${msg}` },
      502
    );
  }
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
  const cleanChatId = settings.chatId.replace(/^\./, '');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: digestText,
        disable_web_page_preview: true,
      }),
    });

    const tgData = (await tgRes.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };

    if (!tgRes.ok || !tgData.ok) {
      return jsonResponse(
        {
          ok: false,
          error: tgData.description || `ডাইজেস্ট পাঠানো যায়নি (HTTP ${tgRes.status})।`,
        },
        400
      );
    }

    return jsonResponse({
      ok: true,
      message: `আজকের ডেইলি ডাইজেস্ট (${todayNotices.length} টি নোটিশ) সফলভাবে টেলিগ্রামে পাঠানো হয়েছে!`,
      summary: {
        date: dhakaDate,
        active_colleges: activeColleges.length,
        total_notices_today: todayNotices.length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { ok: false, error: `টেলিগ্রাম সংযোগে সমস্যা হয়েছে: ${msg}` },
      502
    );
  }
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
        result: { mode: 'normal' },
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
// মেইন Cloudflare Worker fetch ও scheduled (Cron) হ্যান্ডলার
// ============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // শুধুমাত্র /api/* রুটগুলো Worker নিজে হ্যান্ডেল করবে
    if (pathname.startsWith('/api/')) {
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

        // ৬. টেলিগ্রাম টেস্ট মেসেজ পাঠানো
        if (pathname === '/api/admin/telegram-test') {
          if (request.method === 'POST') return handleTelegramTest(request, env);
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
