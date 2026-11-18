export interface SelectorConfig {
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

export interface College {
  id: string;
  name: string;
  notice_url: string;
  selector_config: SelectorConfig;
  is_active: boolean;
  telegram_chat_id?: string | null;
  telegram_thread_id?: number | null;
  last_checked_at?: string | null;
  last_status?: 'unknown' | 'ok' | 'error' | string | null;
  last_error?: string | null;
  consecutive_failures?: number | null;
  created_at?: string;
}

export interface CollegePayload {
  name: string;
  notice_url: string;
  selector_config?: SelectorConfig;
  is_active: boolean;
  telegram_chat_id?: string | null;
  telegram_thread_id?: number | null;
}

export interface Notice {
  id: string;
  college_id: string;
  college_name?: string;
  title: string;
  link: string;
  date?: string;
  published_at?: string | null;
  content_hash: string;
  notified: boolean;
  notified_at?: string | null;
  created_at?: string;
}

export interface TelegramSettingsResponse {
  telegram_bot_token_masked: string;
  has_telegram_bot_token: boolean;
  telegram_chat_id: string;
  message?: string;
}

export interface AutomationStatusResponse {
  auto_scan_enabled: boolean;
  interval_minutes: number;
  last_auto_scan_at: string | null;
  last_auto_scan_status: string | null;
  last_auto_scan_message: string | null;
  cron_webhook_configured: boolean;
}

export interface TestRunSampleNotice {
  title: string;
  date: string | null;
  link: string;
}

export interface CollegeScanLogEntry {
  college_id: string;
  college_name: string;
  notice_url?: string;
  status: 'ok' | 'error';
  new_notices: number;
  sent_count: number;
  error_message?: string | null;
}

export interface TestRunResult {
  mode?: 'test' | 'normal' | 'baseline';
  trigger?: string;
  duration_ms?: number;
  college_name?: string;
  notice_url?: string;
  parsed_count?: number;
  saved_count?: number;
  sample?: TestRunSampleNotice[];
  total_colleges?: number;
  new_notices?: number;
  sent_count?: number;
  failed_colleges?: number;
  college_results?: CollegeScanLogEntry[];
  error?: {
    name?: string;
    message?: string;
    status?: number;
  };
}

export interface TestRunRecord {
  id: string;
  college_id: string | null;
  status: 'pending' | 'running' | 'success' | 'error';
  result: TestRunResult | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScanLogEntry extends TestRunRecord {
  college_name?: string | null;
}

export interface ScanLogsResponse {
  logs: ScanLogEntry[];
  colleges_health: College[];
}

export interface TelegramWebhookStatus {
  configured: boolean;
  webhook_url: string;
  expected_url: string;
  matches_expected: boolean;
  bot_username?: string | null;
  bot_name?: string | null;
  pending_update_count?: number;
  last_error_message?: string | null;
  last_error_date?: number | null;
  message?: string;
}

export interface SystemStatus {
  supabase_connected: boolean;
  telegram_configured: boolean;
  telegram_chat_id: string;
  supabase_url: string;
  node_env: string;
}
