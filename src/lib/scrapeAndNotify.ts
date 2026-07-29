import { generateNoticeHash } from './hash.js';
import { scrapeCollegeNotices } from './scraper.js';
import {
  dbGetColleges,
  dbGetNoticeCountForCollege,
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
        // 1. Check if there are existing records for this college in the database
        const existingCount = await dbGetNoticeCountForCollege(college.id);
        const isFirstRun = existingCount === 0;

        console.log(`[Scraper Engine] Found ${existingCount} existing notices in DB for ${college.name}`);

        // Slice top 20 recent notices (sorted by date, newest ones first)
        const recentNotices = scrapeRes.notices.slice(0, 20);
        log.scraped_count = recentNotices.length;

        if (isFirstRun) {
          // BASELINE SCAN: First time scraping this college
          // Save all top 20 notices as ALREADY NOTIFIED (notified = true) without sending Telegram messages
          let savedBaselineCount = 0;
          for (const item of recentNotices) {
            const hash = generateNoticeHash(item.title, item.link);
            await dbInsertNotice({
              college_id: college.id,
              title: item.title,
              link: item.link,
              date: item.date,
              content_hash: hash,
              notified: true, // Marked as notified so no Telegram alerts are dispatched on baseline
            });
            savedBaselineCount += 1;
          }
          console.log(`[Scraper Engine] Baseline scan complete for ${college.name}: ${savedBaselineCount} notices saved`);
        } else {
          // SUBSEQUENT SCANS: Check for new notices using notice URL (item.link)
          for (const item of recentNotices) {
            const hash = generateNoticeHash(item.title, item.link);
            // Check existence primarily by item.link
            const exists = await dbCheckNoticeExists(college.id, item.link, hash);

            if (!exists) {
              // Insert new unnotified notice
              await dbInsertNotice({
                college_id: college.id,
                title: item.title,
                link: item.link,
                date: item.date,
                content_hash: hash,
                notified: false,
              });

              log.new_count += 1;
              totalNewNotices += 1;
              console.log(`[Scraper Engine] 🆕 New notice detected for ${college.name}: "${item.title}" (${item.link})`);
            }
          }
          console.log(`[Scraper Engine] ${log.new_count} new notices detected for ${college.name}`);
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

  console.log(`[Scraper Engine] Sent ${sentCount} telegram messages (${errorCount} failed).`);

  return {
    timestamp,
    total_active_colleges: colleges.length,
    scraped_logs: logs,
    new_notices_found: totalNewNotices,
    notifications_sent: sentCount,
    notification_errors: errorCount,
  };
}
