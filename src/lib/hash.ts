import crypto from 'crypto';

/**
 * SHA-256 Hash তৈরির ফাংশন
 * title এবং link যোগ করে unique content_hash তৈরি করে ডুপ্লিকেট শনাক্ত করতে ব্যবহার করা হয়।
 */
export function generateNoticeHash(title: string, link: string): string {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedLink = link.trim().toLowerCase();
  const rawString = `${normalizedTitle}|${normalizedLink}`;
  return crypto.createHash('sha256').update(rawString).digest('hex');
}
