import React, { useState } from 'react';
import {
  Layers,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  Calendar,
  Eye,
  Send,
  X,
  Building2,
  Tag,
  Hash,
  Globe,
  Sparkles,
  Check,
  AlertCircle
} from 'lucide-react';
import { Notice, College } from '../types';

interface NoticeHistoryProps {
  notices: Notice[];
  colleges: College[];
}

// Auto categorize notices based on title keywords
export const getNoticeCategory = (title: string): string => {
  const lower = title.toLowerCase();
  if (
    lower.includes('পরীক্ষা') ||
    lower.includes('রুটিন') ||
    lower.includes('ফলাফল') ||
    lower.includes('exam') ||
    lower.includes('result') ||
    lower.includes('routine')
  ) {
    return 'পরীক্ষা ও ফলাফল';
  }
  if (lower.includes('ফরম') || lower.includes('ফর্ম') || lower.includes('form')) {
    return 'ফরম পূরণ';
  }
  if (lower.includes('ভর্তি') || lower.includes('admission')) {
    return 'ভর্তি সংক্রান্ত';
  }
  if (lower.includes('ক্লাস') || lower.includes('শ্রেণী') || lower.includes('class')) {
    return 'ক্লাস ও রুটিন';
  }
  return 'সাধারণ নোটিশ';
};

export const NoticeHistory: React.FC<NoticeHistoryProps> = ({ notices, colleges }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'notified' | 'pending'>('all');

  // Preview Modal State
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramSendSuccess, setTelegramSendSuccess] = useState<boolean | null>(null);

  // Available categories list
  const categories = [
    'পরীক্ষা ও ফলাফল',
    'ফরম পূরণ',
    'ভর্তি সংক্রান্ত',
    'ক্লাস ও রুটিন',
    'সাধারণ নোটিশ',
  ];

  // Filter notices
  const filteredNotices = notices.filter((notice) => {
    const category = getNoticeCategory(notice.title);

    const matchesSearch =
      notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (notice.college_name && notice.college_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCollege =
      selectedCollegeId === 'all' || notice.college_id === selectedCollegeId;

    const matchesCategory =
      selectedCategory === 'all' || category === selectedCategory;

    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'notified' && notice.notified) ||
      (selectedStatus === 'pending' && !notice.notified);

    return matchesSearch && matchesCollege && matchesCategory && matchesStatus;
  });

  // Handle manual telegram dispatch test for selected notice
  const handleDispatchTelegram = async (notice: Notice) => {
    setIsSendingTelegram(true);
    setTelegramSendSuccess(null);

    const formattedMessage = `🔔 **${notice.college_name || 'জাতীয় বিশ্ববিদ্যালয় колледж'} - নতুন নোটিশ**\n\n📌 **শিরোনাম:** ${notice.title}\n📅 **তারিখ:** ${notice.date || 'আজকের নোটিশ'}\n\n🔗 **নোটিশ দেখুন:** ${notice.link}`;

    try {
      const res = await fetch('/api/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customMessage: formattedMessage }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramSendSuccess(true);
      } else {
        setTelegramSendSuccess(false);
      }
    } catch (err) {
      setTelegramSendSuccess(false);
    } finally {
      setIsSendingTelegram(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">ডিটেক্টকৃত সাম্প্রতিক নোটিশসমূহ</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            কলেজ নোটিশ বোর্ড থেকে সংগৃহীত নোটিশ, ক্যাটাগরি ও টেলিগ্রাম স্ট্যাটাস
          </p>
        </div>

        <div className="inline-flex items-center space-x-1.5 bg-slate-100 px-3 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 self-start sm:self-auto">
          <span>মোট ফিল্টারড:</span>
          <span className="text-slate-900 font-bold">{filteredNotices.length}</span>
          <span>/ {notices.length} টি</span>
        </div>
      </div>

      {/* Toolbar Filters: Search + Category + College + Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 my-4">
        
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="শিরোনাম বা কলেজ দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
          />
        </div>

        {/* Filter by Category */}
        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer font-medium"
          >
            <option value="all">সব ক্যাটাগরি</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Filter by College */}
        <div>
          <select
            value={selectedCollegeId}
            onChange={(e) => setSelectedCollegeId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer font-medium"
          >
            <option value="all">সব কলেজ</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Filter by Status */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer font-medium"
          >
            <option value="all">সব স্ট্যাটাস</option>
            <option value="notified">টেলিগ্রামে প্রেরিত</option>
            <option value="pending">প্রেরণ বাকি</option>
          </select>
        </div>

      </div>

      {/* Notice List Table / Card Grid */}
      {filteredNotices.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">কোনো নোটিশ পাওয়া যায়নি</p>
          <p className="text-xs text-slate-400 mt-1">খোঁজার ফিল্টার পরিবর্তন করুন অথবা 'এখনই চেক করুন' বাটনে চাপ দিন</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotices.map((notice) => {
            const category = getNoticeCategory(notice.title);
            return (
              <div
                key={notice.id}
                onClick={() => {
                  setActiveNotice(notice);
                  setTelegramSendSuccess(null);
                }}
                className="p-3.5 bg-slate-50/80 hover:bg-white border border-slate-200/80 hover:border-emerald-300 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                        {notice.college_name || 'Govt. College'}
                      </span>

                      <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200/70 text-slate-700 rounded">
                        {category}
                      </span>

                      {notice.date && (
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{notice.date}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                      {notice.title}
                    </h3>
                  </div>

                  {/* Status Tag & Actions */}
                  <div className="flex items-center space-x-2 shrink-0 pt-2 sm:pt-0">
                    {notice.notified ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>প্রেরিত</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>বাকি</span>
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveNotice(notice);
                        setTelegramSendSuccess(null);
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-bold rounded-lg transition-colors border border-slate-200 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>প্রিভিউ</span>
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notice Scraped Content Preview Modal */}
      {activeNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-100">
              <div className="space-y-1 pr-6">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-lg">
                    {activeNotice.college_name || 'Govt. College'}
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-lg">
                    {getNoticeCategory(activeNotice.title)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-snug pt-1">
                  {activeNotice.title}
                </h3>
              </div>

              <button
                onClick={() => setActiveNotice(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Details */}
            <div className="py-4 space-y-4">
              
              {/* Metadata Info Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-medium">প্রকাশের তারিখ:</span>
                  <span className="font-bold text-slate-800">{activeNotice.date || 'উল্লেখ নেই'}</span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-medium">টেলিগ্রাম স্ট্যাটাস:</span>
                  <span className={`font-bold ${activeNotice.notified ? 'text-sky-600' : 'text-amber-600'}`}>
                    {activeNotice.notified ? 'টেলিগ্রামে প্রেরিত' : 'প্রেরণ বাকি'}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-400 block font-medium">কন্টেন্ট হ্যাশ (Hash):</span>
                  <span className="font-mono text-[11px] text-slate-700 truncate block">
                    {activeNotice.content_hash ? activeNotice.content_hash.substring(0, 12) + '...' : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Telegram Dispatch Message Preview Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <div className="flex items-center space-x-1.5">
                    <Send className="w-4 h-4 text-sky-500" />
                    <span>টেলিগ্রাম মেসেজ ডিসপ্যাচ প্রিভিউ (Telegram Format)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">বট মেসেজ ফরম্যাট</span>
                </div>

                <div className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono border border-slate-800 leading-relaxed space-y-2">
                  <p className="text-emerald-400 font-bold">
                    🔔 {activeNotice.college_name || 'জাতীয় বিশ্ববিদ্যালয় колледж'} - নতুন নোটিশ
                  </p>
                  <p className="text-slate-200">
                    📌 <strong>শিরোনাম:</strong> {activeNotice.title}
                  </p>
                  <p className="text-slate-300">
                    📅 <strong>তারিখ:</strong> {activeNotice.date || 'আজকের নোটিশ'}
                  </p>
                  <p className="text-sky-400 break-all">
                    🔗 <strong>লিংক:</strong> {activeNotice.link}
                  </p>
                </div>
              </div>

              {/* Feedback status on dispatch test */}
              {telegramSendSuccess !== null && (
                <div className={`p-3 rounded-xl text-xs flex items-center space-x-2 font-medium ${
                  telegramSendSuccess
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}>
                  {telegramSendSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>টেলিগ্রাম মেসেজ সফলভাবে টেস্ট চ্যাটে পাঠানো হয়েছে!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>টেলিগ্রাম মেসেজ পাঠানো ব্যর্থ হয়েছে। বটের টোকেন ও চ্যাট আইডি চেক করুন।</span>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <a
                href={activeNotice.link}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors border border-slate-200 cursor-pointer"
              >
                <Globe className="w-4 h-4 text-slate-500" />
                <span>মূল নোটিশ ওয়েবসাইট এ দেখুন</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>

              <div className="w-full sm:w-auto flex items-center space-x-2">
                <button
                  onClick={() => handleDispatchTelegram(activeNotice)}
                  disabled={isSendingTelegram}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingTelegram ? 'পাঠানো হচ্ছে...' : 'টেলিগ্রামে টেস্ট পাঠান'}</span>
                </button>

                <button
                  onClick={() => setActiveNotice(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
