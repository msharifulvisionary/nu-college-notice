import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Bot,
  HelpCircle,
  Save,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { TelegramSettingsResponse } from '../types';

interface TelegramTesterProps {
  onLoadSettings: () => Promise<TelegramSettingsResponse>;
  onSaveSettings: (payload: {
    telegram_bot_token?: string;
    telegram_chat_id: string;
  }) => Promise<TelegramSettingsResponse>;
  onTestTelegram: (message?: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
}

export const TelegramTester: React.FC<TelegramTesterProps> = ({
  onLoadSettings,
  onSaveSettings,
  onTestTelegram,
}) => {
  const [botToken, setBotToken] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [chatId, setChatId] = useState('');
  const [customMsg, setCustomMsg] = useState(
    '🔔 টেস্ট নোটিফিকেশন: Multi-College Notice Tracker সার্ভিস সচল আছে!'
  );

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoadingSettings(true);
      try {
        const data = await onLoadSettings();
        if (!isMounted) return;
        setMaskedToken(data.telegram_bot_token_masked || '');
        setHasSavedToken(Boolean(data.has_telegram_bot_token));
        setChatId(data.telegram_chat_id || '');
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'সেটিংস লোড করতে সমস্যা হয়েছে।';
        setResultMsg({ success: false, text: msg });
      } finally {
        if (isMounted) setIsLoadingSettings(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [onLoadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId.trim()) {
      setResultMsg({ success: false, text: 'অনুগ্রহ করে Telegram Chat ID দিন।' });
      return;
    }

    if (!hasSavedToken && !botToken.trim()) {
      setResultMsg({ success: false, text: 'প্রথমবার সেভ করার জন্য Telegram Bot Token দিন।' });
      return;
    }

    setIsSaving(true);
    setResultMsg(null);
    try {
      const res = await onSaveSettings({
        telegram_chat_id: chatId.trim(),
        ...(botToken.trim() ? { telegram_bot_token: botToken.trim() } : {}),
      });
      setMaskedToken(res.telegram_bot_token_masked || '');
      setHasSavedToken(Boolean(res.has_telegram_bot_token));
      setChatId(res.telegram_chat_id || chatId.trim());
      setBotToken('');
      setResultMsg({
        success: true,
        text: res.message || 'টেলিগ্রাম সেটিংস সফলভাবে সেভ করা হয়েছে!',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'সেটিংস সেভ করতে ব্যর্থ হয়েছে।';
      setResultMsg({ success: false, text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    setResultMsg(null);

    try {
      const res = await onTestTelegram(customMsg.trim() || undefined);
      if (res.ok) {
        setResultMsg({
          success: true,
          text: res.message || 'টেলিগ্রাম মেসেজ সফলভাবে আপনার চ্যাটে পাঠানো হয়েছে!',
        });
      } else {
        setResultMsg({
          success: false,
          text: res.error || 'মেসেজ পাঠাতে ব্যর্থ হয়েছে। টোকেন ও চ্যাট আইডি যাচাই করুন।',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'নেটওয়ার্ক ত্রুটি হয়েছে।';
      setResultMsg({ success: false, text: msg });
    } finally {
      setIsTesting(false);
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
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            টেলিগ্রাম বট কনফিগারেশন ও টেস্ট
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            এখান থেকে ডাটাবেজের Telegram Bot Token ও Chat ID সেভ এবং টেস্ট মেসেজ পাঠাতে পারবেন
          </p>
        </div>
      </div>

      {isLoadingSettings ? (
        <div className="py-10 text-center text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin mx-auto text-sky-600 mb-2" />
          <p className="text-xs font-semibold">বর্তমান টেলিগ্রাম সেটিংস লোড হচ্ছে...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bot Token Input (Password) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Telegram Bot Token {hasSavedToken ? '(পরিবর্তন করতে চাইলে দিন)' : '*'}
                </label>
                {hasSavedToken && maskedToken && (
                  <span className="text-[11px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                    সংরক্ষিত: {maskedToken}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  required={!hasSavedToken}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={
                    hasSavedToken
                      ? 'আগের টোকেন রাখতে চাইলে ফাঁকা রাখুন'
                      : 'e.g. 8688629221:AAEGxORa...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3.5 pr-9 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="টোকেন দেখান বা লুকান"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Chat ID Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telegram Chat ID *
              </label>
              <input
                type="text"
                required
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="e.g. 1961224877 বা -100..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Test Message Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              টেস্ট মেসেজের টেক্সট
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
              className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                resultMsg.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {resultMsg.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{resultMsg.text}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500 flex items-center space-x-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>বট টোকেন সেভ করার পর টেস্ট মেসেজ পাঠিয়ে যাচাই করুন।</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={isSaving || isTesting}
                className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}</span>
              </button>

              <button
                type="button"
                onClick={handleSendTest}
                disabled={isTesting || isSaving || !hasSavedToken || !chatId.trim()}
                className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{isTesting ? 'পাঠানো হচ্ছে...' : 'টেস্ট মেসেজ পাঠান'}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
