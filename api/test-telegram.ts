import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendTelegramMessage } from '../src/lib/telegram.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { botToken, chatId, customMessage } = req.body || {};
    const message =
      customMessage ||
      '🧪 **Multi-College Notice Tracker**\n\nটেলিগ্রাম বট কানেকশন সফলভাবে সম্পন্ন হয়েছে! নোটিশ এলার্ট সার্ভিস চালু আছে।';

    const result = await sendTelegramMessage(message, { botToken, chatId });
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Telegram test message sent successfully!',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to send Telegram message',
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
