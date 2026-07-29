import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbGetColleges, dbAddCollege } from '../src/lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const colleges = await dbGetColleges();
      return res.status(200).json({ success: true, colleges });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, notice_url, selector_config, is_active } = req.body || {};
      if (!name || !notice_url) {
        return res.status(400).json({ success: false, error: 'College name and notice_url are required' });
      }

      const college = await dbAddCollege({
        name,
        notice_url,
        selector_config: selector_config || {
          row_selector: 'table tbody tr',
          date_selector: 'td:nth-child(2)',
          title_selector: 'td:nth-child(3)',
          link_selector: 'td:nth-child(4) a',
        },
        is_active: is_active !== false,
      });

      return res.status(201).json({ success: true, college });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
