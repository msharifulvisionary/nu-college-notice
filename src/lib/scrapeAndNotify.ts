import { generateNoticeHash } from './hash.js';
import { scrapeCollegeNotices } from './scraper.js';
import {
  dbGetColleges,
  dbCheckNoticeExists,
  dbInsertNotice,
  dbGetPendingNotices,
  dbMarkNoticeNotified,
} from './db.js';
import { sendTelegramMessage, formatNoticeTelegramMessage } from './telegram.js';

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

/**
 * মূল স্ক্র্যাপিং ও নোটিফিকেশন সিস্টেম এক্সিকিউটর (Cron/API Endpoint)
 */
export async function runScrapeAndNotify(
  telegramOptions?: { botToken?: string; chatId?: string }
): Promise<ScrapeAndNotifyResult> {
  const timestamp = new Date().toISOString();
  console.log(`[Scraper Engine] Cron task initiated at ${timestamp}`);

  // 1. Fetch active colleges
  const colleges = await dbGetColleges(true);
  const logs: ScrapeRunLog[] = [];
  let totalNewNotices = 0;

  // 2. Iterate through each college independently with try-catch
  for (const college of colleges) {
    const log: ScrapeRunLog = {
      college_id: college.id,
      college_name: college.name,
      scraped_count: 0,
      new_count: 0,
      status: 'success',
    };

    try {
      console.log(`[Scraper Engine] Scraping ${college.name} (${college.notice_url})...`);
      
      const scrapeRes = await scrapeCollegeNotices(college.notice_url, college.selector_config);

      if (!scrapeRes.success) {
        log.status = 'error';
        log.error_message = scrapeRes.error || 'Scraping failed';
        console.warn(`[Scraper Engine] ${college.name} scrape failed: ${log.error_message}`);
      } else {
        log.scraped_count = scrapeRes.notices.length;
        console.log(`[Scraper Engine] Found ${scrapeRes.notices.length} notice items for ${college.name}`);

        for (const item of scrapeRes.notices) {
          // Generate unique sha256 hash
          const hash = generateNoticeHash(item.title, item.link);

          // Check if already exists in database
          const exists = await dbCheckNoticeExists(college.id, hash);

          if (!exists) {
            // Insert new unnotified notice
            await dbInsertNotice({
              college_id: college.id,
              title: item.title,
              link: item.link,
              date: item.date,
              content_hash: hash,
            });

            log.new_count += 1;
            totalNewNotices += 1;
            console.log(`[Scraper Engine] 🆕 New notice detected for ${college.name}: "${item.title}"`);
          }
        }
      }
    } catch (err: any) {
      log.status = 'error';
      log.error_message = err.message || 'Unexpected scraping loop error';
      console.error(`[Scraper Engine] Error processing ${college.name}:`, err);
    }

    logs.push(log);
  }

  // 3. Process pending unnotified notices and send Telegram notifications
  const pendingNotices = await dbGetPendingNotices();
  console.log(`[Scraper Engine] Total pending notifications to dispatch: ${pendingNotices.length}`);

  let sentCount = 0;
  let errorCount = 0;

  for (const notice of pendingNotices) {
    const message = formatNoticeTelegramMessage(
      notice.college_name || 'College',
      notice.title,
      notice.link,
      notice.date
    );

    const sendRes = await sendTelegramMessage(message, telegramOptions);

    if (sendRes.success) {
      await dbMarkNoticeNotified(notice.id);
      sentCount += 1;
      console.log(`[Telegram Sent]: ${notice.college_name} - ${notice.title}`);
    } else {
      errorCount += 1;
      console.error(`[Telegram Failed]: ${notice.title} -> ${sendRes.error}`);
    }
  }

  return {
    timestamp,
    total_active_colleges: colleges.length,
    scraped_logs: logs,
    new_notices_found: totalNewNotices,
    notifications_sent: sentCount,
    notification_errors: errorCount,
  };
}
