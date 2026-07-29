import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runScrapeAndNotify } from '../src/lib/scrapeAndNotify.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[Scraper API] Scraping started...');

  // Allow both GET and POST requests for cron-job.org, browser URL access, or manual triggers
  if (req.method !== 'GET' && req.method !== 'POST') {
    console.warn(`[Scraper API] Rejected method: ${req.method}`);
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use GET or POST.',
    });
  }

  // Check secret token parameter (?token=xxxx)
  const secretToken = process.env.CRON_SECRET || 'a8f3k29dLp9Xq7Rm4Zt1Wv6Yn0Bc5Hj';
  const providedToken = (req.query?.token as string) || (req.body?.token as string);

  if (secretToken && providedToken !== secretToken) {
    console.warn('[Scraper API] Unauthorized access attempt: Token mismatch');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing token parameter (?token=xxxx)',
    });
  }

  try {
    const customBotToken = (req.body?.botToken || req.query?.botToken) as string;
    const customChatId = (req.body?.chatId || req.query?.chatId) as string;

    const result = await runScrapeAndNotify({
      botToken: customBotToken,
      chatId: customChatId,
    });

    console.log(`[Scraper API] Scraping finished: ${result.new_notices_found} new notices found.`);

    return res.status(200).json({
      success: true,
      message: 'Scrape and notification process completed successfully.',
      data: result,
    });
  } catch (err: any) {
    console.error('[Scraper API Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error executing scrape and notify task',
    });
  }
}
