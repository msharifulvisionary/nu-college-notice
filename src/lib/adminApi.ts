import {
  AdminBroadcastPayload,
  AdminBroadcastResponse,
  AutomationStatusResponse,
  College,
  CollegePayload,
  ScanLogsResponse,
  TelegramSettingsResponse,
  TelegramWebhookStatus,
  TestRunRecord,
} from '../types';
import { getAdminSession, signOutAdmin } from './supabase';

export type UnauthorizedHandler = (reason?: string) => void;

async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
  onUnauthorized?: UnauthorizedHandler
): Promise<T> {
  const session = await getAdminSession();
  if (!session?.access_token) {
    onUnauthorized?.('অনুগ্রহ করে এডমিন হিসেবে লগইন করুন।');
    throw new Error('অনুগ্রহ করে এডমিন হিসেবে লগইন করুন।');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে: ${msg}`);
  }

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new Error(
        response.ok
          ? 'সার্ভার থেকে সঠিক JSON পাওয়া যায়নি।'
          : `সার্ভার ত্রুটি (HTTP ${response.status})`
      );
    }
  }

  if (response.status === 401 || response.status === 403) {
    const reason =
      (typeof parsed.error === 'string' && parsed.error) ||
      'আপনার সেশনের মেয়াদ শেষ হয়েছে বা এডমিন অনুমতি নেই। অনুগ্রহ করে আবার লগইন করুন।';
    await signOutAdmin();
    onUnauthorized?.(reason);
    throw new Error(reason);
  }

  if (!response.ok) {
    const errMsg =
      (typeof parsed.error === 'string' && parsed.error) ||
      (typeof parsed.message === 'string' && parsed.message) ||
      `রিকোয়েস্ট ব্যর্থ হয়েছে (HTTP ${response.status})`;
    throw new Error(errMsg);
  }

  return parsed as T;
}

export async function fetchAdminColleges(
  onUnauthorized?: UnauthorizedHandler
): Promise<College[]> {
  const res = await adminRequest<{ colleges: College[] }>(
    '/api/admin/colleges',
    { method: 'GET' },
    onUnauthorized
  );
  return res.colleges || [];
}

export async function createAdminCollege(
  payload: CollegePayload,
  onUnauthorized?: UnauthorizedHandler
): Promise<{ college: College; baseline_run_id?: string | null; message: string }> {
  return adminRequest<{ college: College; baseline_run_id?: string | null; message: string }>(
    '/api/admin/colleges',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    onUnauthorized
  );
}

export async function triggerAdminCollegeBaseline(
  collegeId: string,
  onUnauthorized?: UnauthorizedHandler
): Promise<{ test_run_id: string; status: string; message: string }> {
  return adminRequest<{ test_run_id: string; status: string; message: string }>(
    `/api/admin/colleges/${encodeURIComponent(collegeId)}/sync-baseline`,
    { method: 'POST' },
    onUnauthorized
  );
}

export async function updateAdminCollege(
  id: string,
  payload: Partial<CollegePayload>,
  onUnauthorized?: UnauthorizedHandler
): Promise<{ college: College; message: string }> {
  return adminRequest<{ college: College; message: string }>(
    `/api/admin/colleges/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    onUnauthorized
  );
}

export async function deleteAdminCollege(
  id: string,
  onUnauthorized?: UnauthorizedHandler
): Promise<{ deleted: boolean; id: string; message: string }> {
  return adminRequest<{ deleted: boolean; id: string; message: string }>(
    `/api/admin/colleges/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    onUnauthorized
  );
}

export async function fetchAdminSettings(
  onUnauthorized?: UnauthorizedHandler
): Promise<TelegramSettingsResponse> {
  return adminRequest<TelegramSettingsResponse>(
    '/api/admin/settings',
    { method: 'GET' },
    onUnauthorized
  );
}

export async function saveAdminSettings(
  payload: { telegram_bot_token?: string; telegram_chat_id: string },
  onUnauthorized?: UnauthorizedHandler
): Promise<TelegramSettingsResponse> {
  return adminRequest<TelegramSettingsResponse>(
    '/api/admin/settings',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    onUnauthorized
  );
}

export async function sendAdminTelegramTest(
  message: string | undefined,
  onUnauthorized?: UnauthorizedHandler
): Promise<{ ok: boolean; message?: string; error?: string }> {
  return adminRequest<{ ok: boolean; message?: string; error?: string }>(
    '/api/admin/telegram-test',
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    },
    onUnauthorized
  );
}

export async function sendAdminDailyDigest(
  onUnauthorized?: UnauthorizedHandler
): Promise<{ ok: boolean; message?: string; error?: string }> {
  return adminRequest<{ ok: boolean; message?: string; error?: string }>(
    '/api/admin/daily-digest',
    { method: 'POST' },
    onUnauthorized
  );
}

export async function sendAdminBroadcast(
  payload: AdminBroadcastPayload,
  onUnauthorized?: UnauthorizedHandler
): Promise<AdminBroadcastResponse> {
  return adminRequest<AdminBroadcastResponse>(
    '/api/admin/broadcast',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    onUnauthorized
  );
}

export async function triggerAdminScanAll(
  onUnauthorized?: UnauthorizedHandler
): Promise<{ test_run_id: string; status: string; message: string }> {
  return adminRequest<{ test_run_id: string; status: string; message: string }>(
    '/api/admin/scan-all',
    { method: 'POST' },
    onUnauthorized
  );
}

export async function triggerAdminTestRun(
  collegeId: string,
  onUnauthorized?: UnauthorizedHandler
): Promise<{ test_run_id: string; status: string; message: string }> {
  return adminRequest<{ test_run_id: string; status: string; message: string }>(
    '/api/admin/test-run',
    {
      method: 'POST',
      body: JSON.stringify({ college_id: collegeId }),
    },
    onUnauthorized
  );
}

export async function fetchAdminTestRunStatus(
  testRunId: string,
  onUnauthorized?: UnauthorizedHandler
): Promise<TestRunRecord> {
  const res = await adminRequest<{ test_run: TestRunRecord }>(
    `/api/admin/test-run/${encodeURIComponent(testRunId)}`,
    { method: 'GET' },
    onUnauthorized
  );
  return res.test_run;
}

export async function fetchAdminAutomation(
  onUnauthorized?: UnauthorizedHandler
): Promise<AutomationStatusResponse> {
  return adminRequest<AutomationStatusResponse>(
    '/api/admin/automation',
    { method: 'GET' },
    onUnauthorized
  );
}

export async function updateAdminAutomation(
  autoScanEnabled: boolean,
  onUnauthorized?: UnauthorizedHandler
): Promise<AutomationStatusResponse & { message?: string }> {
  return adminRequest<AutomationStatusResponse & { message?: string }>(
    '/api/admin/automation',
    {
      method: 'PUT',
      body: JSON.stringify({ auto_scan_enabled: autoScanEnabled }),
    },
    onUnauthorized
  );
}

export async function fetchAdminScanLogs(
  onUnauthorized?: UnauthorizedHandler
): Promise<ScanLogsResponse> {
  return adminRequest<ScanLogsResponse>(
    '/api/admin/scan-logs',
    { method: 'GET' },
    onUnauthorized
  );
}

export async function fetchAdminTelegramWebhook(
  onUnauthorized?: UnauthorizedHandler
): Promise<TelegramWebhookStatus> {
  return adminRequest<TelegramWebhookStatus>(
    '/api/admin/telegram-webhook',
    { method: 'GET' },
    onUnauthorized
  );
}

export async function registerAdminTelegramWebhook(
  onUnauthorized?: UnauthorizedHandler
): Promise<TelegramWebhookStatus> {
  return adminRequest<TelegramWebhookStatus>(
    '/api/admin/telegram-webhook',
    { method: 'POST' },
    onUnauthorized
  );
}
