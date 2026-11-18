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
  BarChart3,
  Webhook,
  RefreshCw,
} from 'lucide-react';
import { TelegramSettingsResponse, TelegramWebhookStatus } from '../types';

interface TelegramTesterProps {
  onLoadSettings: () => Promise<TelegramSettingsResponse>;
  onSaveSettings: (payload: {
    telegram_bot_token?: string;
    telegram_chat_id: string;
  }) => Promise<TelegramSettingsResponse>;
  onTestTelegram: (message?: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  onSendDailyDigest: () => Promise<{ ok: boolean; message?: string; error?: string }>;
  onLoadWebhookStatus: () => Promise<TelegramWebhookStatus>;
  onRegisterWebhook: () => Promise<TelegramWebhookStatus>;
}

export const TelegramTester: React.FC<TelegramTesterProps> = ({
  onLoadSettings,
  onSaveSettings,
  onTestTelegram,
  onSendDailyDigest,
  onLoadWebhookStatus,
  onRegisterWebhook,
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
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  const [webhookStatus, setWebhookStatus] = useState<TelegramWebhookStatus | null>(null);
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoadingSettings(true);
      setIsLoadingWebhook(true);
      try {
        const [data, hookData] = await Promise.all([
          onLoadSettings(),
          onLoadWebhookStatus().catch(() => null),
        ]);
        if (!isMounted) return;
        setMaskedToken(data.telegram_bot_token_masked || '');
        setHasSavedToken(Boolean(data.has_telegram_bot_token));
        setChatId(data.telegram_chat_id || '');
        if (hookData) {
          setWebhookStatus(hookData);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'সেটিংস লোড করতে সমস্যা হয়েছে।';
        setResultMsg({ success: false, text: msg });
      } finally {
        if (isMounted) {
          setIsLoadingSettings(false);
          setIsLoadingWebhook(false);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [onLoadSettings, onLoadWebhookStatus]);

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

  const handleDigestClick = async () => {
    setIsSendingDigest(true);
    setResultMsg(null);

    try {
      const res = await onSendDailyDigest();
      if (res.ok) {
        setResultMsg({
          success: true,
          text: res.message || 'আজকের ডেইলি ডাইজেস্ট সফলভাবে পাঠানো হয়েছে!',
        });
      } else {
        setResultMsg({
          success: false,
          text: res.error || 'ডাইজেস্ট পাঠাতে ব্যর্থ হয়েছে।',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'নেটওয়ার্ক ত্রুটি হয়েছে।';
      setResultMsg({ success: false, text: msg });
    } finally {
      setIsSendingDigest(false);
    }
  };

  const handleRefreshWebhook = async () => {
    setIsLoadingWebhook(true);
    setWebhookMsg(null);
    try {
      const data = await onLoadWebhookStatus();
      setWebhookStatus(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Webhook তথ্য আনা যায়নি।';
      setWebhookMsg({ success: false, text: msg });
    } finally {
      setIsLoadingWebhook(false);
    }
  };

  const handleActivateBotCommands = async () => {
    setIsRegisteringWebhook(true);
    setWebhookMsg(null);
    try {
      const data = await onRegisterWebhook();
      setWebhookStatus(data);
      setWebhookMsg({
        success: true,
        text: data.message || 'টেলিগ্রাম বট কমান্ড ও Webhook সফলভাবে চালু হয়েছে!',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Webhook চালু করা যায়নি।';
      setWebhookMsg({ success: false, text: msg });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const anyBusy = isSaving || isTesting || isSendingDigest;

  return (
    <div className="space-y-6 mb-8">
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
      {/* Header */}
      <div className="flex items-center space-x-3 pb-3.5 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            টেলিগ্রাম বট কনফিগারেশন, টেস্ট ও ডেইলি ডাইজেস্ট
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            মূল টেলিগ্রাম চ্যানেল সেটিংস সেভ, টেস্ট মেসেজ এবং তাৎক্ষণিক ডেইলি ডাইজেস্ট পাঠাতে পারবেন (রাত ৯টায় অটো ডাইজেস্টও চালু আছে)
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
                ডিফল্ট Telegram Chat ID *
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
              <span>PDF নোটিশ থাকলে বট সরাসরি PDF ফাইলসহ মেসেজ পাঠাবে।</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={anyBusy}
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
                disabled={anyBusy || !hasSavedToken || !chatId.trim()}
                className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{isTesting ? 'পাঠানো হচ্ছে...' : 'টেস্ট মেসেজ পাঠান'}</span>
              </button>

              <button
                type="button"
                onClick={handleDigestClick}
                disabled={anyBusy || !hasSavedToken || !chatId.trim()}
                className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSendingDigest ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BarChart3 className="w-3.5 h-3.5" />
                )}
                <span>{isSendingDigest ? 'পাঠানো হচ্ছে...' : 'আজকের ডাইজেস্ট পাঠান'}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>

    {/* Interactive Bot Commands & Group Setup Panel */}
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              ইন্টারেক্টিভ বট কমান্ড ও গ্রুপ সাপোর্ট (/latest, /notice)
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              এক ক্লিকে Webhook চালু করলে গ্রুপ বা ইনবক্সে /latest ও /notice লিখলেই সর্বশেষ ৫–১০টি নোটিশ দেখাবে
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefreshWebhook}
            disabled={isLoadingWebhook || isRegisteringWebhook}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingWebhook ? 'animate-spin' : ''}`} />
            <span>যাচাই</span>
          </button>

          <button
            type="button"
            onClick={handleActivateBotCommands}
            disabled={isRegisteringWebhook || !hasSavedToken}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isRegisteringWebhook ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Webhook className="w-3.5 h-3.5" />
            )}
            <span>
              {webhookStatus?.matches_expected ? 'বট কমান্ড রি-সিঙ্ক করুন' : 'বট কমান্ড চালু করুন'}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
          <span>
            স্ট্যাটাস:{' '}
            <strong
              className={
                webhookStatus?.matches_expected
                  ? 'text-emerald-700'
                  : webhookStatus?.configured
                  ? 'text-amber-700'
                  : 'text-slate-700'
              }
            >
              {isLoadingWebhook
                ? 'যাচাই হচ্ছে...'
                : webhookStatus?.matches_expected
                ? 'সক্রিয় (Webhook যুক্ত)'
                : webhookStatus?.configured
                ? 'ভিন্ন URL-এ যুক্ত'
                : 'চালু করা নেই'}
            </strong>
          </span>
          {webhookStatus?.bot_username && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-800">@{webhookStatus.bot_username}</span>
            </>
          )}
          {typeof webhookStatus?.pending_update_count === 'number' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Pending: {webhookStatus.pending_update_count}</span>
            </>
          )}
        </div>

        {webhookStatus?.last_error_message && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
            সর্বশেষ Webhook ত্রুটি: {webhookStatus.last_error_message}
          </div>
        )}

        {webhookMsg && (
          <div
            className={`p-3 rounded-lg border flex items-start space-x-2 ${
              webhookMsg.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {webhookMsg.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{webhookMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-bold text-slate-800">শিক্ষার্থীরা যেসব কমান্ড ব্যবহার করতে পারবে</p>
            <ul className="space-y-1 text-slate-600">
              <li>
                <code className="font-mono text-slate-900 font-semibold">/latest</code> — সর্বশেষ ৮টি নোটিশ
              </li>
              <li>
                <code className="font-mono text-slate-900 font-semibold">/latest 10</code> — সর্বশেষ ৫–১০টি নোটিশ
              </li>
              <li>
                <code className="font-mono text-slate-900 font-semibold">/notice আজিজুল</code> — কলেজ বা বিষয় দিয়ে খোঁজা
              </li>
              <li>
                <code className="font-mono text-slate-900 font-semibold">/colleges</code> — সক্রিয় কলেজের তালিকা
              </li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-bold text-slate-800">টেলিগ্রাম গ্রুপে ব্যবহারের নিয়ম</p>
            <p className="text-slate-600 leading-relaxed">
              বটটিকে যেকোনো টেলিগ্রাম গ্রুপ বা সুপারগ্রুপে যোগ করে <strong>Admin</strong> বানিয়ে দিন। এরপর গ্রুপের Chat ID (যেমন <code className="font-mono">-100...</code>) উপরে বা নির্দিষ্ট কলেজের এডিটে বসিয়ে দিলে নোটিশও যাবে এবং গ্রুপের সদস্যরা <code className="font-mono">/latest</code> বা <code className="font-mono">/notice</code> লিখে সাথে সাথে উত্তর পাবে।
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};
