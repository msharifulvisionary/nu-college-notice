import { Notice } from '../types';

const BENGALI_DIGITS: Record<string, string> = {
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

const MONTH_MAP: Record<string, number> = {
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

function toAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BENGALI_DIGITS[d] || d);
}

function buildValidDateMs(year: number, month: number, day: number): number | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+06:00`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

const MONTH_PATTERN_SOURCE =
  '(?:জানুয়ারি|জানুয়ারি|জানু|ফেব্রুয়ারি|ফেব্রুয়ারি|ফেব্রু|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|অগাস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)';

export function formatCleanNoticeDate(rawDate?: string | null): string {
  if (!rawDate) return '';
  const trimmed = rawDate.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  // ১. YYYY-MM-DD বা YYYY/MM/DD
  const isoMatch = trimmed.match(/(?:^|[^0-9০-৯])([0-9০-৯]{4}[-/][0-9০-৯]{1,2}[-/][0-9০-৯]{1,2})(?=$|[^0-9০-৯])/);
  if (isoMatch?.[1]) return isoMatch[1].trim();

  // ২. DD-MM-YYYY বা DD/MM/YYYY বা DD.MM.YYYY
  const dmyMatch = trimmed.match(/(?:^|[^0-9০-৯])([0-9০-৯]{1,2}[-/.][0-9০-৯]{1,2}[-/.][0-9০-৯]{4})(?=$|[^0-9০-৯])/);
  if (dmyMatch?.[1]) return dmyMatch[1].trim();

  // ৩. DD Month[,] YYYY (বাংলা বা ইংরেজি মাস — যেমন: ১৮ নভেম্বর, ২০২৬)
  const dmyWordRegex = new RegExp(
    `(?:^|[^0-9০-৯])([0-9০-৯]{1,2}(?:\\s*(?:st|nd|rd|th|ই|শে|লা|রা|ঠা))?\\s+${MONTH_PATTERN_SOURCE}[,\\s]+[0-9০-৯]{4})(?=$|[^0-9০-৯])`,
    'i'
  );
  const dmyWordMatch = trimmed.match(dmyWordRegex);
  if (dmyWordMatch?.[1]) return dmyWordMatch[1].replace(/\s+/g, ' ').trim();

  // ৪. Month DD[,] YYYY (যেমন: November 18, 2026)
  const mdyWordRegex = new RegExp(
    `(${MONTH_PATTERN_SOURCE}\\s+[0-9০-৯]{1,2}(?:st|nd|rd|th)?[,\\s]+[0-9০-৯]{4})(?=$|[^0-9০-৯])`,
    'i'
  );
  const mdyWordMatch = trimmed.match(mdyWordRegex);
  if (mdyWordMatch?.[1]) return mdyWordMatch[1].replace(/\s+/g, ' ').trim();

  return trimmed;
}

export function parseNoticeDateMs(rawDate?: string | null): number | null {
  if (!rawDate) return null;
  const extracted = formatCleanNoticeDate(rawDate) || rawDate;
  const cleaned = toAsciiDigits(extracted)
    .replace(/(\d+)(st|nd|rd|th|ই|শে|লা|রা|ঠা)(?=$|[^a-z0-9])/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // 1. YYYY-MM-DD বা YYYY/MM/DD (বা ISO timestamp)
  const isoMatch = cleaned.match(/(?:^|\D)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=\D|$)/);
  if (isoMatch) {
    const ms = buildValidDateMs(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (ms !== null) return ms;
  }

  // 2. DD-MM-YYYY বা DD/MM/YYYY বা DD.MM.YYYY
  const dmyMatch = cleaned.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?=\D|$)/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    // সাধারণত বাংলাদেশের ওয়েবসাইটে DD/MM/YYYY হয়; দ্বিতীয় সংখ্যা > ১২ হলে MM/DD ধরে নেওয়া হবে
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    const ms = buildValidDateMs(year, month, day);
    if (ms !== null) return ms;
  }

  // 3. DD Month YYYY (ইংরেজি বা বাংলা মাস)
  const tokens = cleaned.toLowerCase().split(/[\s-]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const month = MONTH_MAP[tokens[i]];
    if (!month) continue;

    const prevNum = i > 0 ? Number(tokens[i - 1]) : NaN;
    const nextNum = i + 1 < tokens.length ? Number(tokens[i + 1]) : NaN;
    const next2Num = i + 2 < tokens.length ? Number(tokens[i + 2]) : NaN;

    if (Number.isInteger(prevNum) && prevNum >= 1 && prevNum <= 31 && Number.isInteger(nextNum) && nextNum >= 1990) {
      const ms = buildValidDateMs(nextNum, month, prevNum);
      if (ms !== null) return ms;
    }

    if (Number.isInteger(nextNum) && nextNum >= 1 && nextNum <= 31 && Number.isInteger(next2Num) && next2Num >= 1990) {
      const ms = buildValidDateMs(next2Num, month, nextNum);
      if (ms !== null) return ms;
    }
  }

  const nativeMs = Date.parse(cleaned);
  return Number.isNaN(nativeMs) ? null : nativeMs;
}

export function getNoticeSortTimestamp(notice: Notice): number {
  if (notice.published_at) {
    const pubMs = Date.parse(notice.published_at);
    if (!Number.isNaN(pubMs)) return pubMs;
  }
  const parsedDateMs = parseNoticeDateMs(notice.date);
  if (parsedDateMs !== null) return parsedDateMs;
  if (notice.created_at) {
    const createdMs = Date.parse(notice.created_at);
    if (!Number.isNaN(createdMs)) return createdMs;
  }
  return 0;
}

export function sortNoticesByDateDesc(notices: Notice[]): Notice[] {
  return [...notices].sort((a, b) => {
    const diff = getNoticeSortTimestamp(b) - getNoticeSortTimestamp(a);
    if (diff !== 0) return diff;
    const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
    const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
    return bCreated - aCreated;
  });
}

export function buildTelegramNoticePreview(notice: Notice): string {
  const cleanDate = formatCleanNoticeDate(notice.date);
  const lower = notice.title.toLowerCase();
  const tags: string[] = [];

  if (lower.includes('ফরম') || lower.includes('ফর্ম') || lower.includes('form')) {
    tags.push('[ফরম পূরণ]');
  }
  if (
    lower.includes('রুটিন') ||
    lower.includes('সময়সূচী') ||
    lower.includes('সময়সূচী') ||
    lower.includes('routine') ||
    lower.includes('schedule')
  ) {
    tags.push('[পরীক্ষার রুটিন]');
  }
  if (lower.includes('ফলাফল') || lower.includes('ফল') || lower.includes('result')) {
    tags.push('[ফলাফল]');
  }
  if (lower.includes('ভর্তি') || lower.includes('admission')) {
    tags.push('[ভর্তি]');
  }
  if (lower.includes('স্থগিত') || lower.includes('বাতিল') || lower.includes('postponed')) {
    tags.push('[স্থগিত]');
  }
  if ((lower.includes('পরীক্ষা') || lower.includes('exam')) && !tags.includes('[পরীক্ষার রুটিন]')) {
    tags.push('[পরীক্ষা]');
  }

  const isUrgent =
    lower.includes('জরুরি') ||
    lower.includes('অতি জরুরি') ||
    lower.includes('urgent') ||
    lower.includes('স্থগিত') ||
    lower.includes('বাতিল') ||
    lower.includes('সংশোধিত') ||
    lower.includes('সময় বৃদ্ধি') ||
    lower.includes('সময় বৃদ্ধি') ||
    lower.includes('বর্ধিত') ||
    tags.includes('[ফরম পূরণ]') ||
    tags.includes('[পরীক্ষার রুটিন]') ||
    tags.includes('[ফলাফল]');

  const tagText = tags.slice(0, 3).join(' ');
  let tagLine = '';
  if (isUrgent && tagText) {
    tagLine = `🚨 জরুরি · ${tagText}\n`;
  } else if (isUrgent) {
    tagLine = '🚨 জরুরি\n';
  } else if (tagText) {
    tagLine = `🏷️ ${tagText}\n`;
  }

  const dateLine = cleanDate ? `\n📅 তারিখ: ${cleanDate}` : '';
  return `${tagLine}🔔 নতুন নোটিশ — ${notice.college_name || 'জাতীয় বিশ্ববিদ্যালয় কলেজ'}${dateLine}\n\n📌 ${notice.title}\n🔗 ${notice.link}`;
}
