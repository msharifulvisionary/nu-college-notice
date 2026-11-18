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

export function parseNoticeDateMs(rawDate?: string | null): number | null {
  if (!rawDate) return null;
  const cleaned = toAsciiDigits(rawDate)
    .replace(/(\d+)(st|nd|rd|th|ই|শে|লা|রা|ঠা)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // 1. YYYY-MM-DD বা YYYY/MM/DD (বা ISO timestamp)
  const isoMatch = cleaned.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const ms = buildValidDateMs(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (ms !== null) return ms;
  }

  // 2. DD-MM-YYYY বা DD/MM/YYYY বা DD.MM.YYYY
  const dmyMatch = cleaned.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
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
