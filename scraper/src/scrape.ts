import crypto from 'node:crypto';
import fs from 'node:fs';
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
  telegram_chat_id?: string | null;
  telegram_thread_id?: number | null;
  consecutive_failures?: number | null;
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
  published_at?: string | null;
  content_hash: string;
  notified: boolean;
  notified_at: string | null;
}

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ENV_TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
const ENV_TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim() || '';

const SCRAPE_MODE = (process.env.SCRAPE_MODE || 'normal').trim().toLowerCase();
const TEST_COLLEGE_ID = (process.env.TEST_COLLEGE_ID || '').trim();
const TEST_RUN_ID = (process.env.TEST_RUN_ID || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Scraper] Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

interface TelegramRuntimeConfig {
  botToken: string;
  chatId: string;
  lastDailyDigestDate: string;
  autoScanEnabled: boolean;
}

interface TelegramTarget {
  botToken: string;
  chatId: string;
  threadId?: number;
}

class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

async function loadTelegramConfig(): Promise<TelegramRuntimeConfig> {
  let dbToken = '';
  let dbChatId = '';
  let lastDailyDigestDate = '';
  let autoScanEnabled = true;

  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'telegram_bot_token',
        'telegram_chat_id',
        'last_daily_digest_date',
        'auto_scan_enabled',
      ]);

    if (error) {
      console.warn(`[Settings] Could not read settings table (${error.message}); using env fallback.`);
    } else if (data) {
      for (const row of data) {
        if (row.key === 'telegram_bot_token' && typeof row.value === 'string') {
          dbToken = row.value.trim();
        }
        if (row.key === 'telegram_chat_id' && typeof row.value === 'string') {
          dbChatId = row.value.trim();
        }
        if (row.key === 'last_daily_digest_date' && typeof row.value === 'string') {
          lastDailyDigestDate = row.value.trim();
        }
        if (row.key === 'auto_scan_enabled' && typeof row.value === 'string') {
          autoScanEnabled = row.value.trim().toLowerCase() !== 'false';
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Settings] Settings query exception (${message}); using env fallback.`);
  }

  return {
    botToken: dbToken || ENV_TELEGRAM_BOT_TOKEN,
    chatId: dbChatId || ENV_TELEGRAM_CHAT_ID,
    lastDailyDigestDate,
    autoScanEnabled,
  };
}

const BENGALI_DIGITS_MAP: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const NOTICE_MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  জানু: 1,
  জানুয়ারি: 1,
  জানুয়ারি: 1,
  feb: 2,
  february: 2,
  ফেব্রু: 2,
  ফেব্রুয়ারি: 2,
  ফেব্রুয়ারি: 2,
  mar: 3,
  march: 3,
  মার্চ: 3,
  apr: 4,
  april: 4,
  এপ্রিল: 4,
  may: 5,
  মে: 5,
  jun: 6,
  june: 6,
  জুন: 6,
  jul: 7,
  july: 7,
  জুলাই: 7,
  aug: 8,
  august: 8,
  আগস্ট: 8,
  অগাস্ট: 8,
  sep: 9,
  sept: 9,
  september: 9,
  সেপ্টেম্বর: 9,
  oct: 10,
  october: 10,
  অক্টোবর: 10,
  nov: 11,
  november: 11,
  নভেম্বর: 11,
  dec: 12,
  december: 12,
  ডিসেম্বর: 12,
};

function parseNoticePublishedAt(rawDate?: string | null, orderIndex = 0): string {
  const fallbackMs = Date.now() - orderIndex * 1000;
  if (!rawDate) return new Date(fallbackMs).toISOString();

  const cleaned = rawDate
    .replace(/[০-৯]/g, (d) => BENGALI_DIGITS_MAP[d] || d)
    .replace(/(\d+)(st|nd|rd|th|ই|শে|লা|রা|ঠা)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return new Date(fallbackMs).toISOString();

  const buildMs = (year: number, month: number, day: number): number | null => {
    if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const ms = Date.parse(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}T18:00:00+06:00`
    );
    return Number.isNaN(ms) ? null : ms - orderIndex * 1000;
  };

  const isoMatch = cleaned.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const ms = buildMs(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (ms !== null) return new Date(ms).toISOString();
  }

  const dmyMatch = cleaned.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    const ms = buildMs(year, month, day);
    if (ms !== null) return new Date(ms).toISOString();
  }

  const tokens = cleaned.toLowerCase().split(/[\s-]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const month = NOTICE_MONTH_MAP[tokens[i]];
    if (!month) continue;
    const prevNum = i > 0 ? Number(tokens[i - 1]) : NaN;
    const nextNum = i + 1 < tokens.length ? Number(tokens[i + 1]) : NaN;
    const next2Num = i + 2 < tokens.length ? Number(tokens[i + 2]) : NaN;

    if (Number.isInteger(prevNum) && prevNum >= 1 && prevNum <= 31 && Number.isInteger(nextNum) && nextNum >= 1990) {
      const ms = buildMs(nextNum, month, prevNum);
      if (ms !== null) return new Date(ms).toISOString();
    }
    if (Number.isInteger(nextNum) && nextNum >= 1 && nextNum <= 31 && Number.isInteger(next2Num) && next2Num >= 1990) {
      const ms = buildMs(next2Num, month, nextNum);
      if (ms !== null) return new Date(ms).toISOString();
    }
  }

  const nativeMs = Date.parse(cleaned);
  return new Date(Number.isNaN(nativeMs) ? fallbackMs : nativeMs - orderIndex * 1000).toISOString();
}

function generateNoticeHash(title: string, link: string): string {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedLink = link.trim().toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${normalizedTitle}|${normalizedLink}`)
    .digest('hex');
}

function extractNoticesFromHtml(
  html: string,
  baseUrl: string,
  selectorConfig: SelectorConfig = {}
): { notices: ScrapedNotice[]; totalMatched: number } {
  const $ = cheerio.load(html);

  const rowSelector = selectorConfig.row_selector || selectorConfig.item || 'table tbody tr';
  const titleSelector = selectorConfig.title_selector || selectorConfig.title || 'td:nth-child(3)';
  const linkSelector = selectorConfig.link_selector || selectorConfig.link || 'td:nth-child(4) a, a';
  const dateSelector = selectorConfig.date_selector || selectorConfig.date || 'td:nth-child(2)';

  const notices: ScrapedNotice[] = [];
  const seenLinks = new Set<string>();

  const normalizeAbsoluteLink = (rawHref: string): string => {
    const trimmed = rawHref.trim();
    try {
      return new URL(trimmed, baseUrl).href;
    } catch {
      return trimmed;
    }
  };

  // Tier 1: Configured / default table row selectors
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

    const absoluteLink = normalizeAbsoluteLink(href);
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

  // Tier 2: Classic fallback selectors for non-standard table/list notice layouts
  if (notices.length === 0) {
    $('.notice-list .notice-item, .notice-item, ul.list-group li, table tr').each((_, el) => {
      const $row = $(el);
      if ($row.closest('nav, header, footer').length > 0) return;
      if ($row.find('th').length > 0 && $row.find('td').length === 0) return;

      const $link = $row.find('a[href]').first();
      const rawHref = ($link.attr('href') || '').trim();
      if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) return;

      const title = ($link.text().trim() || $row.text().trim()).replace(/\s+/g, ' ').trim();
      if (!title || title.length < 4) return;

      const absoluteLink = normalizeAbsoluteLink(rawHref);
      if (seenLinks.has(absoluteLink)) return;
      seenLinks.add(absoluteLink);

      const dateText = $row
        .find('.date, time, td:first-child, td:nth-child(2)')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      notices.push({
        title,
        link: absoluteLink,
        date: dateText && dateText !== title ? dateText : undefined,
      });
    });
  }

  // Tier 3: Modern card / SPA semantic notice links (e.g., <a href="/notice/..."><h3>...</h3></a>)
  if (notices.length === 0) {
    const genericActionRegex =
      /^(বিস্তারিত(\s*পড়ুন|\s*দেখুন)?|read\s*more|view(\s*more)?|see\s*more|দেখুন|ডাউনলোড(\s*করুন)?|download|pdf|click\s*here|সকল\s*নোটিশ(\s*দেখুন)?)$/i;
    const noticeHrefRegex =
      /(\/notices?\/|[?&](notice|notice_id|circular|slug)=|\.pdf(\?|$)|drive\.google\.com|res\.cloudinary\.com)/i;
    const nonNoticePathRegex =
      /^\/(about|college-history|contact|teachers?|staff|routines?|exam-routines?|syllabus|books?|pdf-books|gallery|admission|login|admin|faq|reviews?|donation|emergency|campus-map|notes?|lectures?|experiments?|merit|attendance|subject-list|subject-index|physics-tools|physics-formula|fun-features)/i;
    const dateValueRegex =
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[০-৯]{1,4}[-/\s][০-৯অ-হ]+|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)/i;

    let baseOrigin = '';
    try {
      baseOrigin = new URL(baseUrl).origin;
    } catch {
      baseOrigin = '';
    }

    $('a[href]').each((_, el) => {
      const $link = $(el);
      if ($link.closest('nav, header, footer, [role="navigation"]').length > 0) return;

      const rawHref = ($link.attr('href') || '').trim();
      if (
        !rawHref ||
        rawHref === '#' ||
        rawHref.startsWith('#') ||
        rawHref.startsWith('javascript:') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:')
      ) {
        return;
      }

      const absoluteLink = normalizeAbsoluteLink(rawHref);
      let linkPathname = '';
      try {
        linkPathname = new URL(absoluteLink).pathname;
      } catch {
        linkPathname = '';
      }

      if (
        absoluteLink === baseUrl ||
        nonNoticePathRegex.test(linkPathname) ||
        (baseOrigin &&
          (absoluteLink === `${baseOrigin}/` ||
            absoluteLink === `${baseOrigin}/notices` ||
            absoluteLink === `${baseOrigin}/notice`))
      ) {
        return;
      }

      const $card = $link.closest(
        'article, li, tr, div[class*="rounded"], div[class*="card"], div[class*="border"], div[class*="shadow"]'
      );

      const headingInLink = $link.find('h1, h2, h3, h4').first().text().replace(/\s+/g, ' ').trim();
      let title = (headingInLink || $link.text()).replace(/\s+/g, ' ').trim();

      if (!title || genericActionRegex.test(title)) {
        const cardTitle = $card
          .find('h1, h2, h3, h4, .title, [class*="title"]')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        if (cardTitle && !genericActionRegex.test(cardTitle)) {
          title = cardTitle;
        }
      }

      const isStrongNoticeHref = noticeHrefRegex.test(absoluteLink);
      const inNoticeContainer =
        $link.closest('[class*="notice"], [id*="notice"]').length > 0 ||
        Boolean(headingInLink && $card.length > 0 && /নোটিশ|notice/i.test($card.text()));
      if (!isStrongNoticeHref && !inNoticeContainer) return;
      if (!title || title.length < 6 || genericActionRegex.test(title)) return;

      if (seenLinks.has(absoluteLink)) return;
      seenLinks.add(absoluteLink);

      let dateText = '';
      if ($card.length > 0) {
        const explicitDate = $card
          .find('time, .date, [class*="date"]')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        if (explicitDate && explicitDate !== title && explicitDate.length <= 45) {
          dateText = explicitDate;
        } else {
          $card.find('span, div, p').each((__, spanEl) => {
            if (dateText) return;
            const candidate = $(spanEl).text().replace(/\s+/g, ' ').trim();
            if (
              candidate &&
              candidate !== title &&
              candidate.length >= 6 &&
              candidate.length <= 36 &&
              dateValueRegex.test(candidate)
            ) {
              dateText = candidate;
            }
          });
        }
      }

      notices.push({
        title,
        link: absoluteLink,
        date: dateText || undefined,
      });
    });
  }

  return {
    notices: notices.slice(0, 20),
    totalMatched: notices.length,
  };
}

function looksLikeSpaHtml(html: string): boolean {
  const lower = html.toLowerCase();
  const hasSpaMount =
    lower.includes('id="root"') ||
    lower.includes("id='root'") ||
    lower.includes('id="app"') ||
    lower.includes('id="__next"') ||
    lower.includes('id="__nuxt"');
  const hasModuleScript = lower.includes('type="module"') || lower.includes("type='module'");

  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const visibleTextLength = $('body').text().replace(/\s+/g, ' ').trim().length;

  return hasSpaMount || (hasModuleScript && visibleTextLength < 300);
}

async function fetchHtmlWithDetails(
  targetUrl: string
): Promise<{ ok: true; status: number; html: string; finalUrl: string } | { ok: false; status: number; statusText: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(targetUrl, {
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
      const bodyPreview = (await response.text().catch(() => ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
      console.error(
        `[Fetch HTTP Error] url=${targetUrl} finalUrl=${response.url} status=${response.status} statusText="${response.statusText}" server="${response.headers.get('server') || 'unknown'}" cfRay="${response.headers.get('cf-ray') || 'none'}" bodyPreview="${bodyPreview}"`
      );
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
      };
    }

    const html = await response.text();
    return {
      ok: true,
      status: response.status,
      html,
      finalUrl: response.url || targetUrl,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function renderSpaWithPlaywright(
  targetUrl: string,
  options?: { spaOriginUrl?: string }
): Promise<{ html: string; finalUrl: string }> {
  const { chromium } = await import('playwright');
  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  const candidateExecutables = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

  let browser;
  if (candidateExecutables.length > 0) {
    try {
      browser = await chromium.launch({
        executablePath: candidateExecutables[0],
        headless: true,
        args: launchArgs,
      });
    } catch {
      browser = await chromium.launch({
        headless: true,
        args: launchArgs,
      });
    }
  } else {
    browser = await chromium.launch({
      headless: true,
      args: launchArgs,
    });
  }

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'bn-BD',
    });
    const page = await context.newPage();

    const entryUrl = options?.spaOriginUrl || targetUrl;
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    await page
      .waitForFunction(
        () => (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length > 80,
        { timeout: 8000 }
      )
      .catch(() => {});

    if (options?.spaOriginUrl) {
      const parsedTarget = new URL(targetUrl);
      const targetPathname = parsedTarget.pathname;
      const targetPathAndSearch = `${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`;

      // প্রথমে পেজের কোনো SPA <a href="/notices"> লিংকে ক্লিক করার চেষ্টা করা হচ্ছে
      const clickedRoute = await page.evaluate((pathname) => {
        const normalizedTarget = pathname.replace(/\/+$/, '') || '/';
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        for (const anchor of anchors) {
          const href = anchor.getAttribute('href') || '';
          try {
            const resolved = new URL(href, window.location.origin);
            const normalizedHref = resolved.pathname.replace(/\/+$/, '') || '/';
            if (resolved.origin === window.location.origin && normalizedHref === normalizedTarget) {
              (anchor as HTMLAnchorElement).click();
              return true;
            }
          } catch {
            // ignore malformed href
          }
        }
        return false;
      }, targetPathname);

      if (!clickedRoute) {
        await page.evaluate((nextPath) => {
          window.history.pushState({}, '', nextPath);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, targetPathAndSearch);
      }

      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      await page.waitForTimeout(1000);
    }

    const html = await page.content();
    return {
      html,
      finalUrl: page.url() || targetUrl,
    };
  } finally {
    await browser.close();
  }
}

async function scrapeCollegeNotices(
  noticeUrl: string,
  selectorConfig: SelectorConfig = {}
): Promise<{ notices: ScrapedNotice[]; totalMatched: number }> {
  try {
    const fetchResult = await fetchHtmlWithDetails(noticeUrl);

    if (!fetchResult.ok) {
      // যদি নির্দিষ্ট কোনো পাথ (যেমন /notices) 404 দেয়, কিন্তু মূল ডোমেইন (/) একটি সক্রিয় SPA হয়,
      // তবে হেডলেস ব্রাউজারে মূল সাইট খুলে ক্লায়েন্ট-সাইড রাউটিং দিয়ে নোটিশ পড়া হবে
      if (fetchResult.status === 404) {
        const parsed = new URL(noticeUrl);
        if (parsed.pathname && parsed.pathname !== '/') {
          const originUrl = `${parsed.origin}/`;
          const originRes = await fetchHtmlWithDetails(originUrl).catch(() => null);
          if (originRes && originRes.ok && looksLikeSpaHtml(originRes.html)) {
            console.log(
              `[SPA Fallback] "${noticeUrl}" returned 404, but "${originUrl}" is an active SPA. Rendering via Playwright...`
            );
            const rendered = await renderSpaWithPlaywright(noticeUrl, { spaOriginUrl: originUrl });
            return extractNoticesFromHtml(rendered.html, rendered.finalUrl, selectorConfig);
          }
        }
      }

      throw new HttpStatusError(
        fetchResult.status,
        `HTTP ${fetchResult.status} ${fetchResult.statusText}`
      );
    }

    const staticParsed = extractNoticesFromHtml(
      fetchResult.html,
      fetchResult.finalUrl,
      selectorConfig
    );

    if (staticParsed.notices.length > 0) {
      return staticParsed;
    }

    // স্ট্যাটিক HTML-এ কোনো নোটিশ না পেলে এবং পেজটি JS/React SPA হলে Playwright দিয়ে রেন্ডার করা হবে
    if (looksLikeSpaHtml(fetchResult.html)) {
      console.log(
        `[SPA Render] Static HTML had 0 notices and looks like a JS SPA (${noticeUrl}). Rendering via Playwright...`
      );
      const rendered = await renderSpaWithPlaywright(noticeUrl);
      return extractNoticesFromHtml(rendered.html, rendered.finalUrl, selectorConfig);
    }

    return staticParsed;
  } catch (err: unknown) {
    if (err instanceof Error) {
      const errWithCause = err as Error & { cause?: unknown };
      const causeDetails = errWithCause.cause
        ? errWithCause.cause instanceof Error
          ? {
              name: errWithCause.cause.name,
              message: errWithCause.cause.message,
              code: (errWithCause.cause as Error & { code?: string }).code,
              errno: (errWithCause.cause as Error & { errno?: unknown }).errno,
              syscall: (errWithCause.cause as Error & { syscall?: string }).syscall,
              hostname: (errWithCause.cause as Error & { hostname?: string }).hostname,
            }
          : errWithCause.cause
        : undefined;

      console.error('[Fetch Failed Details]', {
        url: noticeUrl,
        name: err.name,
        message: err.message,
        timedOut: err.name === 'AbortError',
        cause: causeDetails ?? null,
      });
    } else {
      console.error('[Fetch Failed Details]', { url: noticeUrl, error: String(err) });
    }
    throw err;
  }
}

function formatTelegramMessage(collegeName: string, notice: ScrapedNotice): string {
  const dateLine = notice.date ? `\n📅 তারিখ: ${notice.date}` : '';
  return `🔔 নতুন নোটিশ — ${collegeName}${dateLine}\n\n📌 ${notice.title}\n🔗 ${notice.link}`;
}

function resolveCollegeTelegramTarget(
  college: CollegeRow,
  globalConfig: TelegramRuntimeConfig
): TelegramTarget {
  const customChat = (college.telegram_chat_id || '').trim();
  const threadId =
    typeof college.telegram_thread_id === 'number' && college.telegram_thread_id > 0
      ? college.telegram_thread_id
      : undefined;

  return {
    botToken: globalConfig.botToken,
    chatId: customChat || globalConfig.chatId,
    threadId,
  };
}

async function sendTelegramTextMessage(
  text: string,
  target: TelegramTarget
): Promise<{ ok: boolean; error?: string }> {
  if (!target.botToken || !target.chatId) {
    return {
      ok: false,
      error: 'Telegram bot token or chat ID is not configured (checked college/settings/env)',
    };
  }

  const cleanChatId = target.chatId.replace(/^\./, '');
  const endpoint = `https://api.telegram.org/bot${target.botToken}/sendMessage`;

  const payload: Record<string, unknown> = {
    chat_id: cleanChatId,
    text,
    disable_web_page_preview: false,
  };

  if (target.threadId) {
    payload.message_thread_id = target.threadId;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

interface DownloadedAttachment {
  kind: 'pdf' | 'image';
  buffer: ArrayBuffer;
  filename: string;
  contentType: string;
}

function normalizeAttachmentUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const driveFileMatch = trimmed.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
  }
  const driveOpenMatch = trimmed.match(/https?:\/\/drive\.google\.com\/open\?id=([^&]+)/i);
  if (driveOpenMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;
  }
  return trimmed;
}

function looksLikePdfUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith('.pdf') || (parsed.hostname.includes('drive.google.com') && parsed.search.includes('export=download'));
  } catch {
    return rawUrl.toLowerCase().includes('.pdf');
  }
}

function looksLikeImageUrl(rawUrl: string): boolean {
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    return /\.(jpg|jpeg|png|webp|gif)$/.test(pathname);
  } catch {
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(rawUrl);
  }
}

function buildSafeAttachmentFilename(
  title: string,
  sourceUrl: string,
  kind: 'pdf' | 'image',
  contentType: string
): string {
  const defaultExt =
    kind === 'pdf'
      ? 'pdf'
      : contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('gif')
            ? 'gif'
            : 'jpg';

  try {
    const urlPath = new URL(sourceUrl).pathname;
    const baseName = urlPath.split('/').pop() || '';
    const allowedPattern = kind === 'pdf' ? /\.pdf$/i : /\.(jpg|jpeg|png|webp|gif)$/i;
    if (allowedPattern.test(baseName) && baseName.length <= 80) {
      return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
  } catch {
    // fallback below
  }

  const asciiSlug = title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
  return `${asciiSlug || 'notice'}.${defaultExt}`;
}

function extractAttachmentsFromDetailHtml(html: string, detailUrl: string): string[] {
  const $ = cheerio.load(html);
  const pdfCandidates: string[] = [];
  const imageCandidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (list: string[], rawHref: string | undefined) => {
    if (!rawHref) return;
    const trimmed = rawHref.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed === '#') {
      return;
    }
    try {
      const abs = normalizeAttachmentUrl(new URL(trimmed, detailUrl).href);
      if (!seen.has(abs)) {
        seen.add(abs);
        list.push(abs);
      }
    } catch {
      // ignore invalid URL
    }
  };

  // ১. PDF ও ডাউনলোডযোগ্য ডকুমেন্ট লিংক খোঁজা (main / article / content অগ্রাধিকার)
  const $scope = $('main, article, [class*="notice"], [class*="detail"], #root').first();
  const $root = $scope.length > 0 ? $scope : $('body');

  $root.find('a[href], iframe[src], embed[src], object[data]').each((_, el) => {
    const $el = $(el);
    if ($el.closest('nav, header, footer').length > 0) return;
    const urlAttr = $el.attr('href') || $el.attr('src') || $el.attr('data');
    if (!urlAttr) return;

    const lower = urlAttr.toLowerCase();
    const isDownload = $el.is('[download]') || /ডাউনলোড|download|pdf|পিডিএফ/i.test($el.text());
    if (
      lower.includes('.pdf') ||
      lower.includes('drive.google.com') ||
      (lower.includes('res.cloudinary.com') && (lower.includes('/raw/') || lower.includes('.pdf'))) ||
      (isDownload && (looksLikePdfUrl(urlAttr) || looksLikeImageUrl(urlAttr)))
    ) {
      if (looksLikeImageUrl(urlAttr)) {
        pushCandidate(imageCandidates, urlAttr);
      } else {
        pushCandidate(pdfCandidates, urlAttr);
      }
    }
  });

  // ২. ডিটেইল পেইজের ভেতরের নোটিশ স্ক্যান ছবি (JPG/PNG/WebP) খোঁজা
  $root.find('img[src]').each((_, el) => {
    const $img = $(el);
    if ($img.closest('nav, header, footer').length > 0) return;
    const src = ($img.attr('src') || '').trim();
    if (!src || src.startsWith('data:image/svg')) return;

    const lowerSrc = src.toLowerCase();
    const lowerAlt = ($img.attr('alt') || '').toLowerCase();
    const widthAttr = Number($img.attr('width') || 0);
    const heightAttr = Number($img.attr('height') || 0);
    if ((widthAttr > 0 && widthAttr < 80) || (heightAttr > 0 && heightAttr < 80)) return;
    if (
      lowerSrc.includes('logo') ||
      lowerSrc.includes('icon') ||
      lowerSrc.includes('favicon') ||
      lowerSrc.includes('avatar') ||
      lowerSrc.endsWith('.svg') ||
      lowerAlt.includes('logo')
    ) {
      return;
    }

    pushCandidate(imageCandidates, src);
  });

  return [...pdfCandidates, ...imageCandidates];
}

async function tryDownloadDirectAttachment(
  targetUrl: string,
  title: string
): Promise<DownloadedAttachment | null> {
  const normalizedUrl = normalizeAttachmentUrl(targetUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const finalUrl = res.url || normalizedUrl;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isPdf = contentType.includes('application/pdf') || (!contentType.includes('text/html') && looksLikePdfUrl(finalUrl));
    const isImage =
      (contentType.startsWith('image/') && !contentType.includes('svg')) ||
      (!contentType.includes('text/html') && looksLikeImageUrl(finalUrl));

    if (!isPdf && !isImage) return null;

    const kind: 'pdf' | 'image' = isPdf ? 'pdf' : 'image';
    const maxBytes = kind === 'pdf' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
      console.warn(`[Attachment] Skipping oversized ${kind} (${contentLengthHeader} bytes): ${finalUrl}`);
      return null;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
      return null;
    }

    return {
      kind,
      buffer,
      contentType: isPdf ? 'application/pdf' : contentType || 'image/jpeg',
      filename: buildSafeAttachmentFilename(title, finalUrl, kind, contentType),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Attachment] Download error (${msg}): ${targetUrl}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveNoticeAttachment(
  noticeLink: string,
  title: string
): Promise<DownloadedAttachment | null> {
  const normalizedUrl = normalizeAttachmentUrl(noticeLink);

  // ১. সরাসরি PDF বা Image লিংক হলে প্রথমে সেটি ডাউনলোডের চেষ্টা
  if (looksLikePdfUrl(normalizedUrl) || looksLikeImageUrl(normalizedUrl)) {
    const directMedia = await tryDownloadDirectAttachment(normalizedUrl, title);
    if (directMedia) return directMedia;
  }

  // ২. ডিটেইল পেইজ HTML থেকে সংযুক্ত PDF বা ছবি খুঁজে বের করা
  try {
    const pageFetch = await fetchHtmlWithDetails(normalizedUrl).catch(() => null);
    let detailHtml = '';
    let detailFinalUrl = normalizedUrl;

    if (pageFetch && pageFetch.ok) {
      if (looksLikeSpaHtml(pageFetch.html)) {
        const rendered = await renderSpaWithPlaywright(normalizedUrl).catch(() => null);
        if (rendered) {
          detailHtml = rendered.html;
          detailFinalUrl = rendered.finalUrl;
        }
      } else {
        detailHtml = pageFetch.html;
        detailFinalUrl = pageFetch.finalUrl;
      }
    } else if (pageFetch && !pageFetch.ok && pageFetch.status === 404) {
      const parsed = new URL(normalizedUrl);
      if (parsed.pathname && parsed.pathname !== '/') {
        const originUrl = `${parsed.origin}/`;
        const originRes = await fetchHtmlWithDetails(originUrl).catch(() => null);
        if (originRes && originRes.ok && looksLikeSpaHtml(originRes.html)) {
          const rendered = await renderSpaWithPlaywright(normalizedUrl, {
            spaOriginUrl: originUrl,
          }).catch(() => null);
          if (rendered) {
            detailHtml = rendered.html;
            detailFinalUrl = rendered.finalUrl;
          }
        }
      }
    }

    if (!detailHtml) return null;

    const candidates = extractAttachmentsFromDetailHtml(detailHtml, detailFinalUrl);
    for (const candidateUrl of candidates.slice(0, 4)) {
      const media = await tryDownloadDirectAttachment(candidateUrl, title);
      if (media) return media;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Attachment] Detail inspection skipped (${msg}): ${noticeLink}`);
  }

  return null;
}

async function sendTelegramMultipartMedia(
  method: 'sendDocument' | 'sendPhoto',
  fieldName: 'document' | 'photo',
  attachment: DownloadedAttachment,
  caption: string,
  target: TelegramTarget
): Promise<{ ok: boolean; error?: string }> {
  const cleanChatId = target.chatId.replace(/^\./, '');
  const formData = new FormData();
  formData.append('chat_id', cleanChatId);
  if (target.threadId) {
    formData.append('message_thread_id', String(target.threadId));
  }
  formData.append('caption', caption);
  formData.append(
    fieldName,
    new Blob([attachment.buffer], { type: attachment.contentType }),
    attachment.filename
  );

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${target.botToken}/${method}`, {
      method: 'POST',
      body: formData,
    });
    const tgJson = (await tgRes.json()) as { ok?: boolean; description?: string };
    if (tgRes.ok && tgJson.ok) {
      return { ok: true };
    }
    return { ok: false, error: tgJson.description || `HTTP ${tgRes.status}` };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendNoticeWithAttachmentSupport(
  collegeName: string,
  notice: ScrapedNotice,
  target: TelegramTarget
): Promise<{ ok: boolean; deliveryType: 'pdf' | 'photo' | 'text'; error?: string }> {
  const fullText = formatTelegramMessage(collegeName, notice);

  if (!target.botToken || !target.chatId) {
    return {
      ok: false,
      deliveryType: 'text',
      error: 'Telegram bot token or chat ID is not configured',
    };
  }

  const attachment = await resolveNoticeAttachment(notice.link, notice.title);
  if (attachment) {
    const caption = fullText.length > 1000 ? `${fullText.slice(0, 997)}...` : fullText;

    if (attachment.kind === 'image') {
      const photoRes = await sendTelegramMultipartMedia(
        'sendPhoto',
        'photo',
        attachment,
        caption,
        target
      );
      if (photoRes.ok) {
        return { ok: true, deliveryType: 'photo' };
      }
      console.warn(
        `[Telegram] sendPhoto failed (${photoRes.error}); retrying image as sendDocument.`
      );
      const docFallback = await sendTelegramMultipartMedia(
        'sendDocument',
        'document',
        attachment,
        caption,
        target
      );
      if (docFallback.ok) {
        return { ok: true, deliveryType: 'pdf' };
      }
    } else {
      const docRes = await sendTelegramMultipartMedia(
        'sendDocument',
        'document',
        attachment,
        caption,
        target
      );
      if (docRes.ok) {
        return { ok: true, deliveryType: 'pdf' };
      }
      console.warn(`[Telegram] sendDocument failed (${docRes.error}); falling back to sendMessage.`);
    }
  }

  const fallbackResult = await sendTelegramTextMessage(fullText, target);
  return {
    ok: fallbackResult.ok,
    deliveryType: 'text',
    error: fallbackResult.error,
  };
}

async function updateCollegeHealth(
  college: CollegeRow,
  outcome: { ok: true } | { ok: false; errorMessage: string },
  globalConfig: TelegramRuntimeConfig
): Promise<void> {
  const nowIso = new Date().toISOString();

  if (outcome.ok) {
    await supabase
      .from('colleges')
      .update({
        last_checked_at: nowIso,
        last_status: 'ok',
        last_error: null,
        consecutive_failures: 0,
      })
      .eq('id', college.id);
    return;
  }

  const nextFailures = (college.consecutive_failures ?? 0) + 1;
  await supabase
    .from('colleges')
    .update({
      last_checked_at: nowIso,
      last_status: 'error',
      last_error: outcome.errorMessage.slice(0, 500),
      consecutive_failures: nextFailures,
    })
    .eq('id', college.id);

  // টানা ৩ বার (এবং এরপর প্রতি ৬ বার পর পর) ব্যর্থ হলে এডমিনের টেলিগ্রামে সতর্কবার্তা পাঠানো হবে
  if (nextFailures === 3 || (nextFailures > 3 && nextFailures % 6 === 0)) {
    const alertText =
      `⚠️ হেলথ অ্যালার্ট — ${college.name}\n\n` +
      `এই কলেজের নোটিশ বোর্ড টানা ${nextFailures} বার স্ক্যান করতে ব্যর্থ হয়েছে।\n` +
      `কারণ: ${outcome.errorMessage}\n` +
      `লিংক: ${college.notice_url}`;

    const alertRes = await sendTelegramTextMessage(alertText, {
      botToken: globalConfig.botToken,
      chatId: globalConfig.chatId,
    });
    if (alertRes.ok) {
      console.log(`[Health Alert] Sent failure alert for ${college.name} (failures=${nextFailures})`);
    } else {
      console.error(`[Health Alert] Failed to send alert for ${college.name}: ${alertRes.error}`);
    }
  }
}

async function upsertNoticeRowsSafe(
  rows: NoticeInsertRow[],
  ignoreDuplicates: boolean
): Promise<{ insertedIds: string[]; errorMessage?: string }> {
  const tryUpsert = async (payload: NoticeInsertRow[]) =>
    supabase
      .from('notices')
      .upsert(payload, { onConflict: 'link', ignoreDuplicates })
      .select('id');

  const firstAttempt = await tryUpsert(rows);
  if (!firstAttempt.error) {
    return { insertedIds: (firstAttempt.data || []).map((r) => String(r.id)) };
  }

  // যদি notices টেবিলে এখনো published_at কলাম যোগ না হয়ে থাকে, তবে কলামটি বাদ দিয়ে রিট্রাই করা হবে
  if (firstAttempt.error.message.toLowerCase().includes('published_at')) {
    console.warn('[DB] published_at column missing in schema; retrying without published_at.');
    const strippedRows = rows.map(({ published_at: _omit, ...rest }) => rest);
    const retryAttempt = await tryUpsert(strippedRows);
    if (!retryAttempt.error) {
      return { insertedIds: (retryAttempt.data || []).map((r) => String(r.id)) };
    }
    return { insertedIds: [], errorMessage: retryAttempt.error.message };
  }

  return { insertedIds: [], errorMessage: firstAttempt.error.message };
}

async function processCollege(
  college: CollegeRow,
  globalConfig: TelegramRuntimeConfig
): Promise<{ newCount: number; sentCount: number }> {
  console.log(`\n[College] Scraping ${college.name} (${college.notice_url})...`);

  const { notices: scrapedNotices } = await scrapeCollegeNotices(
    college.notice_url,
    college.selector_config
  );
  console.log(`[College] Scraped ${scrapedNotices.length} recent notices (max 20) for ${college.name}`);

  if (scrapedNotices.length === 0) {
    const noMatchMsg = 'নোটিশ বোর্ডে কোনো নোটিশ খুঁজে পাওয়া যায়নি (স্ট্রাকচার পরিবর্তিত হতে পারে)।';
    console.warn(`[College] No notices matched selector for ${college.name}`);
    await updateCollegeHealth(college, { ok: false, errorMessage: noMatchMsg }, globalConfig);
    return { newCount: 0, sentCount: 0 };
  }

  // স্ক্র্যাপিং সফল হয়েছে -> হেলথ স্ট্যাটাস স্বাভাবিক করা হচ্ছে
  await updateCollegeHealth(college, { ok: true }, globalConfig);

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
    const baselineRows: NoticeInsertRow[] = scrapedNotices.map((item, idx) => ({
      college_id: college.id,
      title: item.title,
      link: item.link,
      date: item.date || null,
      published_at: parseNoticePublishedAt(item.date, idx),
      content_hash: generateNoticeHash(item.title, item.link),
      notified: true,
      notified_at: nowIso,
    }));

    const baselineRes = await upsertNoticeRowsSafe(baselineRows, true);
    if (baselineRes.errorMessage) {
      throw new Error(`Baseline insert failed for ${college.name}: ${baselineRes.errorMessage}`);
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

  let genuinelyNewCount = 0;
  if (candidateNotices.length > 0) {
    const newRows: NoticeInsertRow[] = candidateNotices.map((item, idx) => ({
      college_id: college.id,
      title: item.title,
      link: item.link,
      date: item.date || null,
      published_at: parseNoticePublishedAt(item.date, idx),
      content_hash: generateNoticeHash(item.title, item.link),
      notified: false,
      notified_at: null,
    }));

    const insertRes = await upsertNoticeRowsSafe(newRows, true);
    if (insertRes.errorMessage) {
      throw new Error(`Upsert failed for ${college.name}: ${insertRes.errorMessage}`);
    }

    genuinelyNewCount = insertRes.insertedIds.length;
    console.log(`[DB] Inserted ${genuinelyNewCount} genuinely new notices for ${college.name}`);
  }

  // RETRY + DISPATCH: notified = false থাকা সব নোটিশ (নতুন + আগের ব্যর্থ) পুরনো-থেকে-নতুন ক্রমে পাঠানো হবে
  const { data: pendingNotices, error: pendingError } = await supabase
    .from('notices')
    .select('id, title, link, date')
    .eq('college_id', college.id)
    .eq('notified', false)
    .order('created_at', { ascending: true })
    .limit(15);

  if (pendingError) {
    throw new Error(`Failed to fetch pending notifications for ${college.name}: ${pendingError.message}`);
  }

  const dispatchQueue = pendingNotices || [];
  if (dispatchQueue.length === 0) {
    return { newCount: genuinelyNewCount, sentCount: 0 };
  }

  console.log(`[Dispatch] ${dispatchQueue.length} pending notices in Telegram queue for ${college.name}`);
  const target = resolveCollegeTelegramTarget(college, globalConfig);

  let sentCount = 0;
  for (const row of dispatchQueue) {
    const sendRes = await sendNoticeWithAttachmentSupport(
      college.name,
      {
        title: row.title,
        link: row.link,
        date: row.date || undefined,
      },
      target
    );

    if (sendRes.ok) {
      await supabase
        .from('notices')
        .update({ notified: true, notified_at: new Date().toISOString() })
        .eq('id', row.id);
      sentCount += 1;
      console.log(`[Telegram] Sent (${sendRes.deliveryType.toUpperCase()}): ${row.title}`);
    } else {
      console.error(`[Telegram] Failed to send "${row.title}" (will retry next run): ${sendRes.error}`);
    }
  }

  console.log(`[Telegram] Sent ${sentCount} telegram messages for ${college.name}`);
  return { newCount: genuinelyNewCount, sentCount };
}

function getDhakaDateAndHour(date = new Date()): { dhakaDate: string; dhakaHour: number } {
  const dhakaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(date);
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    hour12: false,
  }).format(date);
  return { dhakaDate, dhakaHour: Number(hourStr) || 0 };
}

async function maybeSendDailyDigest(globalConfig: TelegramRuntimeConfig): Promise<void> {
  const { dhakaDate, dhakaHour } = getDhakaDateAndHour();

  // রাত ৯টা (21:00 BST) বা তার পরে দিনে একবারই ডাইজেস্ট পাঠানো হবে
  if (dhakaHour < 21 || globalConfig.lastDailyDigestDate === dhakaDate) {
    return;
  }

  if (!globalConfig.botToken || !globalConfig.chatId) {
    return;
  }

  console.log(`[Daily Digest] Preparing digest for ${dhakaDate}...`);
  const startOfDhakaDayUtc = new Date(`${dhakaDate}T00:00:00+06:00`).toISOString();

  const [{ data: colleges }, { data: todayNotices }] = await Promise.all([
    supabase
      .from('colleges')
      .select('id, name, is_active, last_status, consecutive_failures'),
    supabase
      .from('notices')
      .select('id, college_id, title, colleges(name)')
      .gte('created_at', startOfDhakaDayUtc),
  ]);

  const activeColleges = (colleges || []).filter((c) => c.is_active);
  const errorColleges = activeColleges.filter((c) => c.last_status === 'error');
  const noticesList = (todayNotices || []) as Array<{
    id: string;
    college_id: string;
    title: string;
    colleges?: { name?: string } | Array<{ name?: string }> | null;
  }>;

  const countsByCollege = new Map<string, { name: string; count: number }>();
  for (const item of noticesList) {
    const colRel = Array.isArray(item.colleges) ? item.colleges[0] : item.colleges;
    const name = colRel?.name || 'অজানা কলেজ';
    const curr = countsByCollege.get(item.college_id) || { name, count: 0 };
    curr.count += 1;
    countsByCollege.set(item.college_id, curr);
  }

  const lines: string[] = [
    `📊 দৈনিক নোটিশ ডাইজেস্ট (${dhakaDate})`,
    '',
    `🏫 সক্রিয় কলেজ: ${activeColleges.length} টি`,
    `📰 আজকের মোট নতুন নোটিশ: ${noticesList.length} টি`,
  ];

  if (countsByCollege.size > 0) {
    lines.push('', '📌 কলেজভিত্তিক সারসংক্ষেপ:');
    for (const entry of countsByCollege.values()) {
      lines.push(`• ${entry.name}: ${entry.count} টি`);
    }
  } else {
    lines.push('', 'ℹ️ আজ এখনো কোনো নতুন নোটিশ পাওয়া যায়নি।');
  }

  if (errorColleges.length > 0) {
    lines.push('', `⚠️ স্ক্যান সমস্যাযুক্ত কলেজ (${errorColleges.length} টি):`);
    for (const errCol of errorColleges) {
      lines.push(`• ${errCol.name} (টানা ${errCol.consecutive_failures || 1} বার ব্যর্থ)`);
    }
  }

  const sendRes = await sendTelegramTextMessage(lines.join('\n'), {
    botToken: globalConfig.botToken,
    chatId: globalConfig.chatId,
  });

  if (sendRes.ok) {
    await supabase.from('settings').upsert(
      {
        key: 'last_daily_digest_date',
        value: dhakaDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    console.log(`[Daily Digest] Sent successfully for ${dhakaDate}`);
  } else {
    console.error(`[Daily Digest] Failed to send: ${sendRes.error}`);
  }
}

async function runTestMode(): Promise<void> {
  if (!TEST_COLLEGE_ID || !TEST_RUN_ID) {
    console.error('[Test Mode] Missing TEST_COLLEGE_ID or TEST_RUN_ID');
    process.exit(1);
  }

  console.log(`[Test Mode] Running test scrape for college_id=${TEST_COLLEGE_ID}, test_run_id=${TEST_RUN_ID}`);

  await supabase
    .from('test_runs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', TEST_RUN_ID);

  try {
    const { data: college, error: collegeError } = await supabase
      .from('colleges')
      .select('id, name, notice_url, selector_config, is_active')
      .eq('id', TEST_COLLEGE_ID)
      .single();

    if (collegeError || !college) {
      throw new Error(collegeError?.message || `College not found: ${TEST_COLLEGE_ID}`);
    }

    const targetCollege = college as CollegeRow;
    const { notices: scrapedNotices, totalMatched } = await scrapeCollegeNotices(
      targetCollege.notice_url,
      targetCollege.selector_config
    );

    const sample = scrapedNotices.slice(0, 5).map((item) => ({
      title: item.title,
      date: item.date || null,
      link: item.link,
    }));

    const { error: updateError } = await supabase
      .from('test_runs')
      .update({
        status: 'success',
        updated_at: new Date().toISOString(),
        result: {
          mode: 'test',
          college_name: targetCollege.name,
          notice_url: targetCollege.notice_url,
          parsed_count: totalMatched,
          sample,
        },
      })
      .eq('id', TEST_RUN_ID);

    if (updateError) {
      throw new Error(`Failed to save test_runs result: ${updateError.message}`);
    }

    console.log(
      `[Test Mode] Success for ${targetCollege.name}: matched=${totalMatched}, sample=${sample.length} (no DB notices written, no Telegram sent)`
    );
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : 'UnknownError';
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStatus = err instanceof HttpStatusError ? err.status : undefined;

    console.error('[Test Mode Error]', { name: errName, message: errMsg, status: errStatus });

    await supabase
      .from('test_runs')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
        result: {
          mode: 'test',
          error: {
            name: errName,
            message: errMsg,
            ...(errStatus !== undefined ? { status: errStatus } : {}),
          },
        },
      })
      .eq('id', TEST_RUN_ID);

    process.exit(1);
  }
}

async function runBaselineMode(): Promise<void> {
  if (!TEST_COLLEGE_ID || !TEST_RUN_ID) {
    console.error('[Baseline Mode] Missing TEST_COLLEGE_ID or TEST_RUN_ID');
    process.exit(1);
  }

  console.log(`[Baseline Mode] Running initial 20-notice baseline for college_id=${TEST_COLLEGE_ID}`);

  await supabase
    .from('test_runs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', TEST_RUN_ID);

  const globalConfig = await loadTelegramConfig();

  try {
    const { data: college, error: collegeError } = await supabase
      .from('colleges')
      .select('id, name, notice_url, selector_config, is_active, consecutive_failures')
      .eq('id', TEST_COLLEGE_ID)
      .single();

    if (collegeError || !college) {
      throw new Error(collegeError?.message || `College not found: ${TEST_COLLEGE_ID}`);
    }

    const targetCollege = college as CollegeRow;
    const { notices: scrapedNotices, totalMatched } = await scrapeCollegeNotices(
      targetCollege.notice_url,
      targetCollege.selector_config
    );

    if (scrapedNotices.length === 0) {
      const noMatchMsg = 'নোটিশ বোর্ডে কোনো নোটিশ খুঁজে পাওয়া যায়নি (স্ট্রাকচার যাচাই করুন)।';
      await updateCollegeHealth(targetCollege, { ok: false, errorMessage: noMatchMsg }, globalConfig);
      throw new Error(noMatchMsg);
    }

    await updateCollegeHealth(targetCollege, { ok: true }, globalConfig);

    const nowIso = new Date().toISOString();
    const baselineRows: NoticeInsertRow[] = scrapedNotices.map((item, idx) => ({
      college_id: targetCollege.id,
      title: item.title,
      link: item.link,
      date: item.date || null,
      published_at: parseNoticePublishedAt(item.date, idx),
      content_hash: generateNoticeHash(item.title, item.link),
      notified: true,
      notified_at: nowIso,
    }));

    // নতুনের পাশাপাশি পুরোনো বেসলাইন নোটিশের তারিখ ও published_at আপডেট রাখা হচ্ছে
    const upsertRes = await upsertNoticeRowsSafe(baselineRows, false);
    if (upsertRes.errorMessage) {
      throw new Error(`Baseline upsert failed: ${upsertRes.errorMessage}`);
    }

    const sample = scrapedNotices.slice(0, 5).map((item) => ({
      title: item.title,
      date: item.date || null,
      link: item.link,
    }));

    await supabase
      .from('test_runs')
      .update({
        status: 'success',
        updated_at: new Date().toISOString(),
        result: {
          mode: 'baseline',
          college_name: targetCollege.name,
          notice_url: targetCollege.notice_url,
          parsed_count: totalMatched,
          saved_count: baselineRows.length,
          sample,
        },
      })
      .eq('id', TEST_RUN_ID);

    console.log(
      `[Baseline Mode] Completed for ${targetCollege.name}: saved=${baselineRows.length} notices (Telegram skipped)`
    );
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : 'BaselineError';
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStatus = err instanceof HttpStatusError ? err.status : undefined;

    await supabase
      .from('test_runs')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
        result: {
          mode: 'baseline',
          error: {
            name: errName,
            message: errMsg,
            ...(errStatus !== undefined ? { status: errStatus } : {}),
          },
        },
      })
      .eq('id', TEST_RUN_ID);

    process.exit(1);
  }
}

async function saveAutoScanSettingsStatus(
  status: string,
  message: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabase.from('settings').upsert(
    [
      { key: 'last_auto_scan_at', value: nowIso, updated_at: nowIso },
      { key: 'last_auto_scan_status', value: status, updated_at: nowIso },
      { key: 'last_auto_scan_message', value: message, updated_at: nowIso },
    ],
    { onConflict: 'key' }
  );
}

async function main() {
  console.log(`[Scraper] Notice check started at ${new Date().toISOString()} (mode=${SCRAPE_MODE})`);

  if (SCRAPE_MODE === 'test') {
    await runTestMode();
    return;
  }

  if (SCRAPE_MODE === 'baseline') {
    await runBaselineMode();
    return;
  }

  const globalConfig = await loadTelegramConfig();
  console.log(
    `[Settings] Telegram config loaded (botToken=${globalConfig.botToken ? 'configured' : 'missing'}, chatId=${globalConfig.chatId ? 'configured' : 'missing'}, autoScanEnabled=${globalConfig.autoScanEnabled})`
  );

  // অ্যাডমিন ড্যাশবোর্ড থেকে অটো-স্ক্যান বন্ধ করা থাকলে শিডিউলড রান স্কিপ হবে
  if (!TEST_RUN_ID && !globalConfig.autoScanEnabled) {
    console.log('[AutoScan] Auto-scan is disabled in Admin Settings. Skipping scheduled run.');
    return;
  }

  if (TEST_RUN_ID) {
    await supabase
      .from('test_runs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', TEST_RUN_ID);
  }

  const { data: colleges, error: collegesError } = await supabase
    .from('colleges')
    .select('id, name, notice_url, selector_config, is_active, telegram_chat_id, telegram_thread_id, consecutive_failures')
    .eq('is_active', true);

  if (collegesError) {
    console.error('[Scraper] Failed to load active colleges:', collegesError.message);
    await saveAutoScanSettingsStatus('error', collegesError.message);
    if (TEST_RUN_ID) {
      await supabase
        .from('test_runs')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
          result: {
            mode: 'normal',
            error: { name: 'DatabaseError', message: collegesError.message },
          },
        })
        .eq('id', TEST_RUN_ID);
    }
    process.exit(1);
  }

  const activeColleges = (colleges || []) as CollegeRow[];
  console.log(`[Scraper] Found ${activeColleges.length} active colleges`);

  let totalNew = 0;
  let totalSent = 0;
  let failedColleges = 0;

  for (const college of activeColleges) {
    try {
      const { newCount, sentCount } = await processCollege(college, globalConfig);
      totalNew += newCount;
      totalSent += sentCount;
    } catch (err: unknown) {
      failedColleges += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Error] ${college.name}: ${message}`);
      await updateCollegeHealth(college, { ok: false, errorMessage: message }, globalConfig);
    }
  }

  await maybeSendDailyDigest(globalConfig);

  const summaryMsg = `${activeColleges.length} টি কলেজ চেক হয়েছে · নতুন নোটিশ ${totalNew} টি · টেলিগ্রাম প্রেরিত ${totalSent} টি`;
  await saveAutoScanSettingsStatus(failedColleges > 0 ? 'partial_error' : 'success', summaryMsg);

  if (TEST_RUN_ID) {
    await supabase
      .from('test_runs')
      .update({
        status: 'success',
        updated_at: new Date().toISOString(),
        result: {
          mode: 'normal',
          total_colleges: activeColleges.length,
          new_notices: totalNew,
          sent_count: totalSent,
          failed_colleges: failedColleges,
        },
      })
      .eq('id', TEST_RUN_ID);
  }

  console.log(
    `\n[Scraper] Finished. New notices: ${totalNew}, Telegram sent: ${totalSent}, Failed colleges: ${failedColleges}`
  );
}

main().catch(async (err) => {
  console.error('[Scraper Fatal Error]:', err);
  if (TEST_RUN_ID) {
    await supabase
      .from('test_runs')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
        result: {
          mode: SCRAPE_MODE === 'test' ? 'test' : SCRAPE_MODE === 'baseline' ? 'baseline' : 'normal',
          error: {
            name: err instanceof Error ? err.name : 'FatalError',
            message: err instanceof Error ? err.message : String(err),
          },
        },
      })
      .eq('id', TEST_RUN_ID);
  }
  process.exit(1);
});
