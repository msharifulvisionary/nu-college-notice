import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

interface SelectorConfig {
  row_selector?: string;
  item?: string;
  date_selector?: string;
  date?: string;
  title_selector?: string;
  title?: string;
  link_selector?: string;
  link?: string;
  note?: string;
}

interface CollegeRow {
  id: string;
  name: string;
  notice_url: string;
  selector_config: SelectorConfig;
  is_active: boolean;
}

interface ScrapedNotice {
  title: string;
  link: string;
  date?: string;
}

interface NoticeInsertRow {
  college_id: string;
  title: string;
  link: string;
  date: string | null;
  content_hash: string;
  notified: boolean;
  notified_at: string | null;
}

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Scraper] Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function generateNoticeHash(title: string, link: string): string {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedLink = link.trim().toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${normalizedTitle}|${normalizedLink}`)
    .digest('hex');
}

async function scrapeCollegeNotices(
  noticeUrl: string,
  selectorConfig: SelectorConfig = {}
): Promise<ScrapedNotice[]> {
  const controller = new AbortController();
  const timeoutMs = 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(noticeUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const rowSelector = selectorConfig.row_selector || selectorConfig.item || 'table tbody tr';
    const titleSelector = selectorConfig.title_selector || selectorConfig.title || 'td:nth-child(3)';
    const linkSelector = selectorConfig.link_selector || selectorConfig.link || 'td:nth-child(4) a, a';
    const dateSelector = selectorConfig.date_selector || selectorConfig.date || 'td:nth-child(2)';

    const notices: ScrapedNotice[] = [];
    const seenLinks = new Set<string>();

    $(rowSelector).each((_, el) => {
      const $row = $(el);

      let title = titleSelector ? $row.find(titleSelector).text().trim() : '';
      if (!title) {
        title = $row.find('a').first().text().trim() || $row.text().trim();
      }
      title = title.replace(/\s+/g, ' ').trim();

      let href = linkSelector ? $row.find(linkSelector).first().attr('href') || '' : '';
      if (!href) {
        $row.find('a').each((__, aEl) => {
          const aHref = $(aEl).attr('href');
          const aText = $(aEl).text().toLowerCase();
          if (aHref && !href) {
            href = aHref;
          }
          if (aHref && (aText.includes('view') || aText.includes('দেখুন'))) {
            href = aHref;
          }
        });
      }

      if (!title || !href) return;

      let absoluteLink = href.trim();
      try {
        absoluteLink = new URL(absoluteLink, noticeUrl).href;
      } catch {
        // Keep raw href if URL resolution fails
      }

      if (seenLinks.has(absoluteLink)) return;
      seenLinks.add(absoluteLink);

      const dateText = dateSelector
        ? $row.find(dateSelector).text().replace(/\s+/g, ' ').trim()
        : '';

      notices.push({
        title,
        link: absoluteLink,
        date: dateText || undefined,
      });
    });

    // Keep only the top 20 most recent notices
    return notices.slice(0, 20);
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatTelegramMessage(collegeName: string, notice: ScrapedNotice): string {
  const dateLine = notice.date ? `\n📅 তারিখ: ${notice.date}` : '';
  return `🔔 নতুন নোটিশ — ${collegeName}${dateLine}\n\n📌 ${notice.title}\n🔗 ${notice.link}`;
}

async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return {
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set',
    };
  }

  const cleanChatId = TELEGRAM_CHAT_ID.replace(/^\./, '');
  const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        disable_web_page_preview: false,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function processCollege(college: CollegeRow): Promise<{ newCount: number; sentCount: number }> {
  console.log(`\n[College] Scraping ${college.name} (${college.notice_url})...`);

  const scrapedNotices = await scrapeCollegeNotices(college.notice_url, college.selector_config);
  console.log(`[College] Scraped ${scrapedNotices.length} recent notices (max 20) for ${college.name}`);

  if (scrapedNotices.length === 0) {
    console.warn(`[College] No notices matched selector for ${college.name}`);
    return { newCount: 0, sentCount: 0 };
  }

  // Check if this college has any existing rows in notices table (Baseline check)
  const { count: existingCount, error: countError } = await supabase
    .from('notices')
    .select('id', { count: 'exact', head: true })
    .eq('college_id', college.id);

  if (countError) {
    throw new Error(`Failed to count existing notices for ${college.name}: ${countError.message}`);
  }

  const totalExisting = existingCount ?? 0;
  console.log(`[DB] Found ${totalExisting} existing notices for ${college.name}`);

  const nowIso = new Date().toISOString();

  // BASELINE RUN: No existing notices for this college -> save top 20 with notified=true, NO Telegram
  if (totalExisting === 0) {
    const baselineRows: NoticeInsertRow[] = scrapedNotices.map((item) => ({
      college_id: college.id,
      title: item.title,
      link: item.link,
      date: item.date || null,
      content_hash: generateNoticeHash(item.title, item.link),
      notified: true,
      notified_at: nowIso,
    }));

    const { error: baselineError } = await supabase
      .from('notices')
      .upsert(baselineRows, { onConflict: 'link', ignoreDuplicates: true });

    if (baselineError) {
      throw new Error(`Baseline insert failed for ${college.name}: ${baselineError.message}`);
    }

    console.log(
      `[Baseline] Baseline scan complete for ${college.name}: ${baselineRows.length} notices saved (Telegram skipped)`
    );
    return { newCount: 0, sentCount: 0 };
  }

  // SUBSEQUENT RUNS: Duplicate-check primarily by notice link
  const scrapedLinks = scrapedNotices.map((n) => n.link);
  const { data: existingLinkRows, error: linkCheckError } = await supabase
    .from('notices')
    .select('link')
    .in('link', scrapedLinks);

  if (linkCheckError) {
    throw new Error(`Duplicate link check failed for ${college.name}: ${linkCheckError.message}`);
  }

  const existingLinks = new Set((existingLinkRows || []).map((row) => row.link as string));
  const candidateNotices = scrapedNotices.filter((item) => !existingLinks.has(item.link));

  console.log(`[Diff] ${candidateNotices.length} new notices detected for ${college.name}`);

  if (candidateNotices.length === 0) {
    return { newCount: 0, sentCount: 0 };
  }

  const newRows: NoticeInsertRow[] = candidateNotices.map((item) => ({
    college_id: college.id,
    title: item.title,
    link: item.link,
    date: item.date || null,
    content_hash: generateNoticeHash(item.title, item.link),
    notified: false,
    notified_at: null,
  }));

  const { data: insertedRows, error: upsertError } = await supabase
    .from('notices')
    .upsert(newRows, { onConflict: 'link', ignoreDuplicates: true })
    .select('id, title, link, date');

  if (upsertError) {
    throw new Error(`Upsert failed for ${college.name}: ${upsertError.message}`);
  }

  const genuinelyNew = insertedRows || [];
  console.log(`[DB] Inserted ${genuinelyNew.length} genuinely new notices for ${college.name}`);

  // Send oldest-to-newest so the latest notice lands last in Telegram
  let sentCount = 0;
  for (const row of [...genuinelyNew].reverse()) {
    const message = formatTelegramMessage(college.name, {
      title: row.title,
      link: row.link,
      date: row.date || undefined,
    });

    const tgResult = await sendTelegramMessage(message);
    if (tgResult.ok) {
      await supabase
        .from('notices')
        .update({ notified: true, notified_at: new Date().toISOString() })
        .eq('id', row.id);
      sentCount += 1;
      console.log(`[Telegram] Sent notice: ${row.title}`);
    } else {
      console.error(`[Telegram] Failed to send "${row.title}": ${tgResult.error}`);
    }
  }

  console.log(`[Telegram] Sent ${sentCount} telegram messages for ${college.name}`);
  return { newCount: genuinelyNew.length, sentCount };
}

async function main() {
  console.log(`[Scraper] Notice check started at ${new Date().toISOString()}`);

  const { data: colleges, error: collegesError } = await supabase
    .from('colleges')
    .select('id, name, notice_url, selector_config, is_active')
    .eq('is_active', true);

  if (collegesError) {
    console.error('[Scraper] Failed to load active colleges:', collegesError.message);
    process.exit(1);
  }

  const activeColleges = (colleges || []) as CollegeRow[];
  console.log(`[Scraper] Found ${activeColleges.length} active colleges`);

  let totalNew = 0;
  let totalSent = 0;
  let failedColleges = 0;

  for (const college of activeColleges) {
    try {
      const { newCount, sentCount } = await processCollege(college);
      totalNew += newCount;
      totalSent += sentCount;
    } catch (err: unknown) {
      failedColleges += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Error] ${college.name}: ${message}`);
    }
  }

  console.log(
    `\n[Scraper] Finished. New notices: ${totalNew}, Telegram sent: ${totalSent}, Failed colleges: ${failedColleges}`
  );
}

main().catch((err) => {
  console.error('[Scraper Fatal Error]:', err);
  process.exit(1);
});
