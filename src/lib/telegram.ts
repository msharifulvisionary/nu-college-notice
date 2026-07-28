import axios from 'axios';

export interface TelegramSendOptions {
  botToken?: string;
  chatId?: string;
}

/**
 * Telegram Bot API দিয়ে Instant নোটিফিকেশন পাঠায়
 */
export async function sendTelegramMessage(
  text: string,
  options?: TelegramSendOptions
): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = options?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return {
      success: false,
      error: 'TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID সেট করা নেই।',
    };
  }

  // clean chatId in case of trailing spaces or dots
  const cleanChatId = chatId.trim().replace(/^\./, '');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await axios.post(
      url,
      {
        chat_id: cleanChatId,
        text: text,
        disable_web_page_preview: false,
      },
      { timeout: 10000 }
    );

    return { success: true, data: response.data };
  } catch (err: any) {
    const errorMsg =
      err.response?.data?.description || err.message || 'Telegram message send failed';
    console.error('[Telegram Error]:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * নির্দিষ্ট নোটিশের জন্য টেলিগ্রাম ফরম্যাট করা মেসেজ তৈরি করে
 */
export function formatNoticeTelegramMessage(
  collegeName: string,
  noticeTitle: string,
  noticeLink: string,
  date?: string
): string {
  let dateText = date ? `\n📅 তারিখ: ${date}` : '';
  return `🔔 নতুন নোটিশ — ${collegeName}${dateText}

📌 ${noticeTitle}
🔗 ${noticeLink}`;
}
