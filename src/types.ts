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
  created_at?: string;
}

export interface CollegePayload {
  name: string;
  notice_url: string;
  selector_config: SelectorConfig;
  is_active: boolean;
}

export interface Notice {
  id: string;
  college_id: string;
  college_name?: string;
  title: string;
  link: string;
  date?: string;
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

export interface TestRunSampleNotice {
  title: string;
  date: string | null;
  link: string;
}

export interface TestRunResult {
  college_name?: string;
  notice_url?: string;
  parsed_count?: number;
  sample?: TestRunSampleNotice[];
  error?: {
    name?: string;
    message?: string;
    status?: number;
  };
}

export interface TestRunRecord {
  id: string;
  college_id: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result: TestRunResult | null;
  created_at?: string;
  updated_at?: string;
}

export interface SystemStatus {
  supabase_connected: boolean;
  telegram_configured: boolean;
  telegram_chat_id: string;
  supabase_url: string;
  node_env: string;
}
