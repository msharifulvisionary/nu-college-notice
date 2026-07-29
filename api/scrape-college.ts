import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeCollegeNotices } from '../src/lib/scraper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { notice_url, selector_config } = req.body || {};
    if (!notice_url) {
      return res.status(400).json({ success: false, error: 'notice_url is required' });
    }

    const result = await scrapeCollegeNotices(
      notice_url,
      selector_config || {
        row_selector: 'table tbody tr',
        date_selector: 'td:nth-child(2)',
        title_selector: 'td:nth-child(3)',
        link_selector: 'td:nth-child(4) a',
      }
    );

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
