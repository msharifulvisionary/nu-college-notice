import type { VercelRequest, VercelResponse } from '@vercel/node';
import { testSupabaseConnection } from '../src/lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabaseConnected = await testSupabaseConnection();
    return res.status(200).json({
      supabase_connected: supabaseConnected,
      telegram_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      telegram_chat_id: process.env.TELEGRAM_CHAT_ID || 'Not set',
      supabase_url: process.env.SUPABASE_URL || 'Not set',
      node_env: process.env.NODE_ENV || 'production',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
