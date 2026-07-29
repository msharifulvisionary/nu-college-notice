import * as cheerio from 'cheerio';

export interface SelectorConfig {
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

export interface ScrapedNoticeItem {
  title: string;
  link: string;
  date?: string;
  raw_link?: string;
}

/**
 * Cheerio + Native Fetch (with 8-second AbortController timeout)
 * Vercel Serverless এ দ্রুত এবং রিলায়েবলি কাজ করার জন্য অহেতুক ব্রাউজার ছাড়াই সরাসরি HTML পার্স করে।
 */
export async function scrapeCollegeNotices(
  noticeUrl: string,
  selectorConfig: SelectorConfig
): Promise<{ success: boolean; notices: ScrapedNoticeItem[]; error?: string }> {
  const controller = new AbortController();
  const timeoutMs = 8000; // 8 seconds timeout per college
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const rowSelector = selectorConfig.row_selector || selectorConfig.item || 'table tbody tr';
    const titleSelector = selectorConfig.title_selector || selectorConfig.title || 'td:nth-child(3)';
    const linkSelector = selectorConfig.link_selector || selectorConfig.link || 'a';
    const dateSelector = selectorConfig.date_selector || selectorConfig.date || 'td:nth-child(2)';

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

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        notices: [],
        error: `HTTP Error ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const notices: ScrapedNoticeItem[] = [];

    const rows = $(rowSelector);

    rows.each((_, el) => {
      const $row = $(el);

      // Title extraction
      let title = '';
      if (titleSelector) {
        title = $row.find(titleSelector).text().trim();
      }
      if (!title) {
        title = $row.find('a').first().text().trim() || $row.text().trim();
      }

      // Link extraction
      let href = '';
      if (linkSelector) {
        const $link = $row.find(linkSelector);
        href = $link.attr('href') || '';
      }

      if (!href) {
        $row.find('a').each((_, aEl) => {
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

      // Date extraction
      let dateText = '';
      if (dateSelector) {
        dateText = $row.find(dateSelector).text().trim();
      }

      // Clean up title
      title = title.replace(/\s+/g, ' ').trim();

      if (title && href) {
        let absoluteLink = href;
        try {
          absoluteLink = new URL(href, noticeUrl).href;
        } catch {
          absoluteLink = href;
        }

        notices.push({
          title,
          link: absoluteLink,
          raw_link: href,
          date: dateText || undefined,
        });
      }
    });

    return {
      success: true,
      notices,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err.name === 'AbortError';
    const errorMsg = isAbort
      ? 'Request timed out after 8 seconds'
      : err.message || 'HTML fetch or Cheerio parsing error';

    console.error(`[Scraper Error] ${noticeUrl}: ${errorMsg}`);
    return {
      success: false,
      notices: [],
      error: errorMsg,
    };
  }
}
