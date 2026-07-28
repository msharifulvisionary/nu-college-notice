import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Bot, HelpCircle } from 'lucide-react';

interface TelegramTesterProps {
  defaultBotToken?: string;
  defaultChatId?: string;
  onTestTelegram: (token?: string, chatId?: string, message?: string) => Promise<{ success: boolean; error?: string }>;
}

export const TelegramTester: React.FC<TelegramTesterProps> = ({
  defaultBotToken,
  defaultChatId,
  onTestTelegram,
}) => {
  const [botToken, setBotToken] = useState(defaultBotToken || '8688629221:AAEGxORabyf5KaKe6ixq0-N8LxAL_ycb4Ng');
  const [chatId, setChatId] = useState(defaultChatId || '1961224877');
  const [customMsg, setCustomMsg] = useState('🔔 টেস্ট নোটিফিকেশন: Multi-College Notice Tracker সার্ভিস সচল আছে!');

  const [isLoading, setIsLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResultMsg(null);

    try {
      const res = await onTestTelegram(botToken, chatId, customMsg);
      if (res.success) {
        setResultMsg({
          success: true,
          text: 'টেলিগ্রাম মেসেজ সফলভাবে আপনার চ্যাটে পাঠানো হয়েছে!',
        });
      } else {
        setResultMsg({
          success: false,
          text: res.error || 'মেসেজ পাঠাতে ব্যর্থ হয়েছে। টোকেন ও চ্যাট আইডি চেক করুন।',
        });
      }
    } catch (err: any) {
      setResultMsg({ success: false, text: err.message || 'নেটওয়ার্ক ত্রুটি' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      
      {/* Header */}
      <div className="flex items-center space-x-3 pb-3.5 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">টেলিগ্রাম বট কনফিগারেশন (Telegram Bot API)</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            বট টোকেন এবং চ্যাট আইডি দিয়ে টেস্ট মেসেজ পাঠিয়ে কানেকশন নিশ্চিত করুন
          </p>
        </div>
      </div>

      <form onSubmit={handleSendTest} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Bot Token Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              TELEGRAM_BOT_TOKEN *
            </label>
            <input
              type="text"
              required
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="e.g. 8688629221:AAEGxORa..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>

          {/* Chat ID Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              TELEGRAM_CHAT_ID *
            </label>
            <input
              type="text"
              required
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. 1961224877"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>

        </div>

        {/* Message Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            টেস্ট মেসেজ
          </label>
          <textarea
            rows={2}
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white resize-none"
          />
        </div>

        {/* Output Banner */}
        {resultMsg && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              resultMsg.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {resultMsg.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{resultMsg.text}</span>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 flex items-center space-x-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>টেলিগ্রামে @BotFather থেকে বট টোকেন পাওয়া যায়।</span>
          </div>

          <button
            type="submit"
            disabled={isLoading || !botToken || !chatId}
            className="inline-flex items-center justify-center space-x-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50 shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isLoading ? 'মেসেজ পাঠানো হচ্ছে...' : 'টেলিগ্রাম টেস্ট মেসেজ পাঠান'}</span>
          </button>
        </div>

      </form>

    </div>
  );
};
