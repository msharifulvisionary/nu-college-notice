export interface College {
  id: string;
  name: string;
  notice_url: string;
  selector_config: {
    note?: string;
    row_selector?: string;
    item?: string;
    date_selector?: string;
    date?: string;
    title_selector?: string;
    title?: string;
    link_selector?: string;
    link?: string;
  };
  is_active: boolean;
  created_at?: string;
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

export interface ScrapeRunLog {
  college_id: string;
  college_name: string;
  scraped_count: number;
  new_count: number;
  status: 'success' | 'error';
  error_message?: string;
}

export interface ScrapeAndNotifyResult {
  timestamp: string;
  total_active_colleges: number;
  scraped_logs: ScrapeRunLog[];
  new_notices_found: number;
  notifications_sent: number;
  notification_errors: number;
}

export interface SystemStatus {
  supabase_connected: boolean;
  telegram_configured: boolean;
  telegram_chat_id: string;
  supabase_url: string;
  node_env: string;
}
