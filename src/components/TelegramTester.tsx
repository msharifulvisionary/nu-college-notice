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
  Megaphone,
  Copy,
  Check,
  MessageSquare,
  Hash,
  BookOpen,
} from 'lucide-react';
import {
  AdminBroadcastPayload,
  AdminBroadcastResponse,
  TelegramSettingsResponse,
  TelegramWebhookStatus,
} from '../types';

interface TelegramTesterProps {
  onLoadSettings: () => Promise<TelegramSettingsResponse>;
  onSaveSettings: (payload: {
    telegram_bot_token?: string;
    telegram_chat_id: string;
    telegram_thread_id?: number | null;
  }) => Promise<TelegramSettingsResponse>;
  onTestTelegram: (
    payload?: string | { message?: string; chat_id?: string; thread_id?: number | null }
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  onSendDailyDigest: () => Promise<{ ok: boolean; message?: string; error?: string }>;
  onSendBroadcast: (payload: AdminBroadcastPayload) => Promise<AdminBroadcastResponse>;
  onLoadWebhookStatus: () => Promise<TelegramWebhookStatus>;
  onRegisterWebhook: () => Promise<TelegramWebhookStatus>;
}

interface CommandItem {
  cmd: string;
  example?: string;
  desc: string;
}

const BOT_COMMAND_GROUPS: Array<{
  title: string;
  subtitle: string;
  accentClass: string;
  items: CommandItem[];
}> = [
  {
    title: '১. সাধারণ নোটিশ ও খোঁজ',
    subtitle: 'যেকোনো গ্রুপ, সুপারগ্রুপ টপিক বা বটের ইনবক্সে ব্যবহারযোগ্য',
    accentClass: 'border-emerald-200 bg-emerald-50/40',
    items: [
      { cmd: '/latest', desc: 'সবচেয়ে সাম্প্রতিক ৭টি নোটিশ ইনলাইন বাটনসহ দেখাবে' },
      { cmd: '/today', desc: 'আজকে প্রকাশিত নতুন নোটিশগুলোর তালিকা' },
      { cmd: '/notice', example: '/notice আজিজুল', desc: 'নির্দিষ্ট কলেজ বা বিষয়ের নাম লিখে নোটিশ খোঁজা' },
      { cmd: '/colleges', desc: 'মনিটরিংয়ে যুক্ত সকল কলেজের নাম ও ওয়েবসাইট তালিকা' },
    ],
  },
  {
    title: '২. ক্যাটাগরি ও সময়সূচি শর্টকাট',
    subtitle: 'টপিক অনুযায়ী দ্রুত ফিল্টার করার সরাসরি কমান্ড',
    accentClass: 'border-sky-200 bg-sky-50/40',
    items: [
      { cmd: '/routine', desc: 'পরীক্ষার রুটিন ও সময়সূচি সংক্রান্ত সর্বশেষ নোটিশ' },
      { cmd: '/form', desc: 'ফরম পূরণ ও ফি জমা সংক্রান্ত সাম্প্রতিক নোটিশ' },
      { cmd: '/result', desc: 'প্রকাশিত ফলাফল ও রেজাল্ট সংক্রান্ত নোটিশ' },
      { cmd: '/admission', desc: 'ভর্তি বিজ্ঞপ্তি ও মেধা তালিকা সংক্রান্ত নোটিশ' },
      { cmd: '/deadlines', desc: 'আসন্ন ফরম পূরণ বা ভর্তির শেষ তারিখ (Deadline) তালিকা' },
    ],
  },
  {
    title: '৩. পার্সোনাল অ্যালার্ট ও অনুরোধ',
    subtitle: 'শিক্ষার্থীরা নিজের ইনবক্সে অটো-অ্যালার্ট চালু করতে পারবে',
    accentClass: 'border-indigo-200 bg-indigo-50/40',
    items: [
      {
        cmd: '/subscribe',
        example: '/subscribe ফরম',
        desc: 'কলেজ বা বিষয় (বা সব) সাবস্ক্রাইব করে ইনবক্সে অ্যালার্ট পাওয়া',
      },
      { cmd: '/subscriptions', desc: 'আপনার চালু থাকা সাবস্ক্রিপশন তালিকা দেখা' },
      {
        cmd: '/unsubscribe',
        example: '/unsubscribe ফরম',
        desc: 'নির্দিষ্ট কীওয়ার্ড বা সব সাবস্ক্রিপশন বন্ধ করা',
      },
      {
        cmd: '/request',
        example: '/request ঢাকা কলেজ https://...',
        desc: 'নতুন কোনো কলেজ যুক্ত করার জন্য এডমিনকে অনুরোধ পাঠানো',
      },
      { cmd: '/help', desc: 'সব সক্রিয় বট কমান্ডের সংক্ষিপ্ত নির্দেশিকা দেখা' },
    ],
  },
  {
    title: '৪. এডমিন কন্ট্রোল কমান্ড',
    subtitle: 'শুধুমাত্র ডিফল্ট এডমিন Chat ID থেকে কাজ করবে',
    accentClass: 'border-amber-200 bg-amber-50/40',
    items: [
      { cmd: '/status', desc: 'সকল কলেজের সর্বশেষ স্ক্যান অবস্থা ও হেলথ রিপোর্ট' },
      { cmd: '/scan', desc: 'টেলিগ্রাম থেকেই তাৎক্ষণিক ম্যানুয়াল স্ক্যান শুরু করা' },
      { cmd: '/digest', desc: 'আজকের দৈনিক সারসংক্ষেপ ডাইজেস্ট এখনই পাঠানো' },
      { cmd: '/stats', desc: 'মোট কলেজ, নোটিশ ও পার্সোনাল সাবস্ক্রাইবার সংখ্যা দেখা' },
    ],
  },
];

export const TelegramTester: React.FC<TelegramTesterProps> = ({
  onLoadSettings,
  onSaveSettings,
  onTestTelegram,
  onSendDailyDigest,
  onSendBroadcast,
  onLoadWebhookStatus,
  onRegisterWebhook,
}) => {
  const [botToken, setBotToken] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [chatId, setChatId] = useState('');
  const [defaultThreadId, setDefaultThreadId] = useState('');
  const [customMsg, setCustomMsg] = useState(
    '🔔 টেস্ট নোটিফিকেশন: Multi-College Notice Tracker সার্ভিস সচল আছে!'
  );
  const [testChatIdOverride, setTestChatIdOverride] = useState('');
  const [testThreadIdOverride, setTestThreadIdOverride] = useState('');

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  const [webhookStatus, setWebhookStatus] = useState<TelegramWebhookStatus | null>(null);
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastImageUrl, setBroadcastImageUrl] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'default' | 'custom'>('all');
  const [broadcastCustomChats, setBroadcastCustomChats] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ success: boolean; text: string } | null>(
    null
  );

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
        setDefaultThreadId(
          typeof data.telegram_thread_id === 'number' && data.telegram_thread_id > 0
            ? String(data.telegram_thread_id)
            : ''
        );
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

    let parsedThreadId: number | null = null;
    if (defaultThreadId.trim()) {
      const n = Number(defaultThreadId.trim());
      if (!Number.isInteger(n) || n <= 0) {
        setResultMsg({
          success: false,
          text: 'ডিফল্ট সুপারগ্রুপ Topic ID অবশ্যই একটি ধনাত্মক সংখ্যা হতে হবে (অথবা ফাঁকা রাখুন)।',
        });
        return;
      }
      parsedThreadId = n;
    }

    setIsSaving(true);
    setResultMsg(null);
    try {
      const res = await onSaveSettings({
        telegram_chat_id: chatId.trim(),
        telegram_thread_id: parsedThreadId,
        ...(botToken.trim() ? { telegram_bot_token: botToken.trim() } : {}),
      });
      setMaskedToken(res.telegram_bot_token_masked || '');
      setHasSavedToken(Boolean(res.has_telegram_bot_token));
      setChatId(res.telegram_chat_id || chatId.trim());
      setDefaultThreadId(
        typeof res.telegram_thread_id === 'number' && res.telegram_thread_id > 0
          ? String(res.telegram_thread_id)
          : ''
      );
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
    let parsedOverrideThread: number | null | undefined;
    if (testThreadIdOverride.trim()) {
      const n = Number(testThreadIdOverride.trim());
      if (!Number.isInteger(n) || n <= 0) {
        setResultMsg({
          success: false,
          text: 'টেস্ট Topic ID অবশ্যই একটি ধনাত্মক সংখ্যা হতে হবে।',
        });
        return;
      }
      parsedOverrideThread = n;
    }

    setIsTesting(true);
    setResultMsg(null);

    try {
      const res = await onTestTelegram({
        message: customMsg.trim() || undefined,
        ...(testChatIdOverride.trim() ? { chat_id: testChatIdOverride.trim() } : {}),
        ...(parsedOverrideThread ? { thread_id: parsedOverrideThread } : {}),
      });
      if (res.ok) {
        setResultMsg({
          success: true,
          text: res.message || 'টেলিগ্রাম মেসেজ সফলভাবে আপনার চ্যাটে পাঠানো হয়েছে!',
        });
      } else {
        setResultMsg({
          success: false,
          text: res.error || 'মেসেজ পাঠাতে ব্যর্থ হয়েছে। টোকেন, চ্যাট আইডি ও টপিক আইডি যাচাই করুন।',
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

  const handleCopyCommand = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCmd(text);
      window.setTimeout(() => {
        setCopiedCmd((prev) => (prev === text ? null : prev));
      }, 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) {
      setBroadcastResult({ success: false, text: 'ব্রডকাস্ট বার্তা ফাঁকা রাখা যাবে না।' });
      return;
    }
    setIsBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await onSendBroadcast({
        message: broadcastMessage.trim(),
        image_url: broadcastImageUrl.trim() || undefined,
        target: broadcastTarget,
        custom_chat_ids: broadcastTarget === 'custom' ? broadcastCustomChats.trim() : undefined,
      });
      if (res.ok) {
        setBroadcastResult({
          success: true,
          text: res.message || 'ঘোষণা সফলভাবে সব চ্যানেলে ব্রডকাস্ট করা হয়েছে!',
        });
        setBroadcastMessage('');
        setBroadcastImageUrl('');
      } else {
        setBroadcastResult({
          success: false,
          text: res.error || 'ব্রডকাস্ট পাঠাতে ব্যর্থ হয়েছে।',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ব্রডকাস্ট পাঠাতে সমস্যা হয়েছে।';
      setBroadcastResult({ success: false, text: msg });
    } finally {
      setIsBroadcasting(false);
    }
  };

  const anyBusy = isSaving || isTesting || isSendingDigest;

  return (
    <div className="space-y-6 mb-8">
      {/* ১. মূল টেলিগ্রাম কনফিগারেশন ও টেস্ট */}
      <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
        <div className="flex items-center space-x-3 pb-3.5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              টেলিগ্রাম বট কনফিগারেশন, টেস্ট ও ডেইলি ডাইজেস্ট
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500">
              মূল গ্রুপ, চ্যানেল বা সুপারগ্রুপ টপিক (Topic) সেটিংস সেভ, টেস্ট মেসেজ এবং তাৎক্ষণিক ডেইলি ডাইজেস্ট পাঠান
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Bot Token Input */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Telegram Bot Token {hasSavedToken ? '(বদল করতে দিন)' : '*'}
                  </label>
                  {hasSavedToken && maskedToken && (
                    <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                      {maskedToken}
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
                        ? 'আগের টোকেন রাখতে ফাঁকা রাখুন'
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

              {/* Default Chat ID Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ডিফল্ট গ্রুপ / চ্যানেল Chat ID *
                </label>
                <input
                  type="text"
                  required
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="-1001234567890 বা ChatID#TopicID"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  কমা (,) দিয়ে একাধিক গ্রুপ বা সুপারগ্রুপ দিতে পারবেন।
                </p>
              </div>

              {/* Default Supergroup Topic ID Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ডিফল্ট সুপারগ্রুপ Topic ID (ঐচ্ছিক)
                </label>
                <input
                  type="number"
                  min={1}
                  value={defaultThreadId}
                  onChange={(e) => setDefaultThreadId(e.target.value)}
                  placeholder="যেমন: 42 (সাধারণ চ্যাটে ফাঁকা)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  সব নোটিশ একটি নির্দিষ্ট টপিকে পাঠাতে এটি দিন। আলাদা কলেজের জন্য কলেজ এডিটে গিয়ে টপিক দিন।
                </p>
              </div>
            </div>

            {/* Test Message & Specific Group/Topic Override */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                <Send className="w-3.5 h-3.5 text-sky-600" />
                <span>তাৎক্ষণিক টেস্ট মেসেজ ও নির্দিষ্ট টপিক পরীক্ষা</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    টেস্ট গ্রুপ / চ্যানেল Chat ID (ফাঁকা থাকলে ডিফল্ট চ্যাটে যাবে)
                  </label>
                  <input
                    type="text"
                    value={testChatIdOverride}
                    onChange={(e) => setTestChatIdOverride(e.target.value)}
                    placeholder="যেমন: -1001234567890"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    টেস্ট সুপারগ্রুপ Topic / Thread ID (ঐচ্ছিক)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={testThreadIdOverride}
                    onChange={(e) => setTestThreadIdOverride(e.target.value)}
                    placeholder="যেমন: 42 (সুপারগ্রুপ টপিক যাচাই করতে)"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  টেস্ট মেসেজের টেক্সট
                </label>
                <textarea
                  rows={2}
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>
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
                <span>PDF বা ছবি নোটিশ থাকলে বট সরাসরি ফাইলসহ নির্বাচিত গ্রুপ/টপিকে পাঠাবে।</span>
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
                  disabled={anyBusy || !hasSavedToken || (!chatId.trim() && !testChatIdOverride.trim())}
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

      {/* ২. টেলিগ্রাম গ্রুপ ও সুপারগ্রুপ টপিক (Topic) সেটআপ নির্দেশিকা */}
      <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
        <div className="flex items-center space-x-3 pb-3.5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              টেলিগ্রাম গ্রুপ ও সুপারগ্রুপ টপিক (Topic) যুক্ত করার নিয়ম ও বিবরণী
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              সাধারণ গ্রুপ চ্যাট অথবা সুপারগ্রুপের আলাদা আলাদা টপিকে কলেজভিত্তিক নোটিশ পাঠানোর সম্পূর্ণ গাইডলাইন
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center space-x-2 font-bold text-slate-900">
              <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>ধাপ ১ ও ২: বটকে Admin বানানো ও Chat ID বের করা</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 leading-relaxed">
              <li>
                আপনার টেলিগ্রাম গ্রুপ বা সুপারগ্রুপে বটটিকে যুক্ত করুন এবং{' '}
                <strong className="text-slate-800">Admin</strong> বানান (অবশ্যই{' '}
                <code className="bg-white px-1 rounded border border-slate-200 text-slate-800">
                  Post Messages
                </code>{' '}
                ও{' '}
                <code className="bg-white px-1 rounded border border-slate-200 text-slate-800">
                  Manage Topics
                </code>{' '}
                পারমিশন অন রাখুন)।
              </li>
              <li>
                গ্রুপের যেকোনো মেসেজ{' '}
                <code className="bg-white px-1 rounded border border-slate-200 font-mono text-slate-800">
                  @userinfobot
                </code>{' '}
                বা{' '}
                <code className="bg-white px-1 rounded border border-slate-200 font-mono text-slate-800">
                  @RawDataBot
                </code>{' '}
                -এ ফরওয়ার্ড করলে <strong className="text-slate-800">Chat ID</strong> পাবেন (যেমন:{' '}
                <code className="font-mono text-slate-900">-1001234567890</code>)।
              </li>
              <li>
                <strong>সাধারণ গ্রুপ চ্যাটে</strong> পাঠাতে চাইলে Topic ID ঘর ফাঁকা রেখে শুধু Chat ID সেভ করুন।
              </li>
            </ol>
          </div>

          <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-200 space-y-2">
            <div className="flex items-center space-x-2 font-bold text-slate-900">
              <Hash className="w-4 h-4 text-sky-600 shrink-0" />
              <span>ধাপ ৩ ও ৪: সুপারগ্রুপ Topic ID ও কলেজভিত্তিক রাউটিং</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 leading-relaxed">
              <li>
                সুপারগ্রুপের যে <strong>Topic</strong>-এ নোটিশ পাঠাতে চান, সেখানে গিয়ে যেকোনো মেসেজের{' '}
                <strong>Copy Link</strong> করুন। লিংকটি দেখতে এমন হবে:{' '}
                <code className="bg-white px-1.5 py-0.5 rounded border border-sky-200 font-mono text-sky-900 break-all">
                  https://t.me/c/2145678901/42/108
                </code>
              </li>
              <li>
                এখানে মাঝের সংখ্যা{' '}
                <strong className="text-sky-800 font-mono bg-white px-1 rounded border border-sky-200">
                  42
                </strong>{' '}
                হলো আপনার <strong>Topic / Thread ID</strong> (আর প্রথম সংখ্যাটি{' '}
                <code className="font-mono">-1002145678901</code> হলো Chat ID)। General টপিকের ID সাধারণত{' '}
                <code className="font-mono">1</code> হয়।
              </li>
              <li>
                <strong>একই সুপারগ্রুপে কলেজ অনুযায়ী আলাদা টপিক:</strong> উপরের ডিফল্ট Chat ID ঘরে সুপারগ্রুপের ID সেভ করে রাখুন। এরপর{' '}
                <strong className="text-slate-800">কলেজ ব্যবস্থাপনা → এডিট</strong> থেকে কাস্টম Chat ID ফাঁকা রেখে প্রতিটি কলেজের জন্য আলাদা{' '}
                <strong className="text-slate-800">Topic ID</strong> সেভ করুন!
              </li>
              <li>
                <strong>একসাথে একাধিক গ্রুপ/টপিক:</strong> কাস্টম Chat ID ঘরে কমা দিয়ে{' '}
                <code className="font-mono bg-white px-1 rounded border border-sky-200">
                  -100111222333#42, -100444555666#99
                </code>{' '}
                লিখলেও আলাদা আলাদা টপিকে যাবে।
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* ৩. সক্রিয় ইন্টারেক্টিভ বট কমান্ডসমূহ (সুন্দর করে সাজানো ও ক্লিক-টু-কপি) */}
      <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                সক্রিয় ইন্টারেক্টিভ বট কমান্ড ও Webhook সাপোর্ট
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500">
                গ্রুপ, সুপারগ্রুপ টপিক বা বটের ইনবক্সে যেকোনো কমান্ড লিখলেই সাথে সাথে ডাটাবেজ থেকে উত্তর পাবেন (কমান্ডে ক্লিক করলে কপি হবে)
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/80">
            <span>
              Webhook স্ট্যাটাস:{' '}
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
                <span className="font-mono font-bold text-slate-800">@{webhookStatus.bot_username}</span>
              </>
            )}
            {typeof webhookStatus?.pending_update_count === 'number' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Pending Updates: {webhookStatus.pending_update_count}</span>
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

          {/* ৪টি সুন্দর ক্যাটাগরিতে সক্রিয় বট কমান্ড তালিকা */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {BOT_COMMAND_GROUPS.map((group) => (
              <div
                key={group.title}
                className={`p-3.5 sm:p-4 rounded-xl border space-y-2.5 ${group.accentClass}`}
              >
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{group.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{group.subtitle}</p>
                </div>

                <ul className="space-y-2">
                  {group.items.map((item) => {
                    const copyTarget = item.example || item.cmd;
                    const isCopied = copiedCmd === copyTarget;
                    return (
                      <li
                        key={item.cmd}
                        className="bg-white/90 border border-slate-200/80 rounded-lg px-2.5 py-2 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <code className="font-mono font-bold text-slate-900 text-xs">
                              {item.cmd}
                            </code>
                            {item.example && (
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                উদাহরণ: {item.example}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 leading-snug">{item.desc}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyCommand(copyTarget)}
                          className={`shrink-0 inline-flex items-center space-x-1 px-2 py-1 rounded-md border text-[10px] font-bold transition-colors cursor-pointer ${
                            isCopied
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                          title={`${copyTarget} কপি করুন`}
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{isCopied ? 'কপি' : 'কপি'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ৪. এডমিন ম্যানুয়াল ব্রডকাস্ট প্যানেল */}
      <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
        <div className="flex items-center space-x-3 pb-3.5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              এডমিন ম্যানুয়াল ব্রডকাস্ট প্যানেল
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              নিজের লেখা যেকোনো জরুরি ঘোষণা ও ছবি এক ক্লিকে যুক্ত সব টেলিগ্রাম চ্যানেল, গ্রুপ বা নির্দিষ্ট টপিকে পাঠান
            </p>
          </div>
        </div>

        <form onSubmit={handleBroadcastSubmit} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all' as const, label: 'সব যুক্ত গ্রুপ, টপিক ও চ্যানেল' },
              { id: 'default' as const, label: 'শুধু ডিফল্ট চ্যাট / টপিক' },
              { id: 'custom' as const, label: 'কাস্টম Chat ID / Topic' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBroadcastTarget(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  broadcastTarget === opt.id
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {broadcastTarget === 'custom' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                কাস্টম Chat ID বা ChatID#TopicID (কমা দিয়ে আলাদা করুন) *
              </label>
              <input
                type="text"
                value={broadcastCustomChats}
                onChange={(e) => setBroadcastCustomChats(e.target.value)}
                placeholder="-1001234567890, -1009876543210#42"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ঘোষণার টেক্সট *
            </label>
            <textarea
              rows={3}
              required
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="যেমন: প্রিয় শিক্ষার্থীবৃন্দ, আগামীকাল থেকে ফরম পূরণের নতুন সময়সূচি কার্যকর হবে..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ছবির লিংক / URL (ঐচ্ছিক)
            </label>
            <input
              type="url"
              value={broadcastImageUrl}
              onChange={(e) => setBroadcastImageUrl(e.target.value)}
              placeholder="https://example.com/notice-banner.jpg"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          {broadcastResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                broadcastResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {broadcastResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{broadcastResult.text}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isBroadcasting || !hasSavedToken || !broadcastMessage.trim()}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isBroadcasting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Megaphone className="w-3.5 h-3.5" />
              )}
              <span>{isBroadcasting ? 'পাঠানো হচ্ছে...' : 'সব চ্যানেলে ব্রডকাস্ট করুন'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

