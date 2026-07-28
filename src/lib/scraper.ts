import * as cheerio from 'cheerio';
import axios from 'axios';

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
 * Cheerio ব্যবহার করে কলেজ নোটিশ বোর্ড পেজ থেকে নোটিশ তথ্য এক্সট্র্যাক্ট করে
 */
export async function scrapeCollegeNotices(
  noticeUrl: string,
  selectorConfig: SelectorConfig
): Promise<{ success: boolean; notices: ScrapedNoticeItem[]; error?: string }> {
  try {
    const rowSelector = selectorConfig.row_selector || selectorConfig.item || 'table tbody tr';
    const titleSelector = selectorConfig.title_selector || selectorConfig.title || 'td:nth-child(3)';
    const linkSelector = selectorConfig.link_selector || selectorConfig.link || 'a';
    const dateSelector = selectorConfig.date_selector || selectorConfig.date || 'td:nth-child(2)';

    // Fetch static HTML with standard browser User-Agent
    const response = await axios.get(noticeUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = response.data;
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
        // Fallback: look for <a> text inside row or row text
        title = $row.find('a').first().text().trim() || $row.text().trim();
      }

      // Link extraction
      let href = '';
      if (linkSelector) {
        // Try specific selector
        const $link = $row.find(linkSelector);
        href = $link.attr('href') || '';
      }

      if (!href) {
        // Fallback: find any <a> inside row
        $row.find('a').each((_, aEl) => {
          const aHref = $(aEl).attr('href');
          const aText = $(aEl).text().toLowerCase();
          // Prefer 'view' or non-download links
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

      // Clean up title (remove excess newlines/tabs)
      title = title.replace(/\s+/g, ' ').trim();

      if (title && href) {
        // Make absolute URL
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
    console.error(`[Scraper Error] ${noticeUrl}:`, err.message);
    return {
      success: false,
      notices: [],
      error: err.message || 'HTML fetch or Cheerio parsing error',
    };
  }
}
