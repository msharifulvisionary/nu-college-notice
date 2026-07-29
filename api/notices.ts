import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbGetRecentNotices } from '../src/lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const notices = await dbGetRecentNotices(limit);
    return res.status(200).json({ success: true, notices });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
