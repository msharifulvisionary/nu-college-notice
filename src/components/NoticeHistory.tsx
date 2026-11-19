import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  Eye,
  Send,
  X,
  ExternalLink,
  Copy,
  Check,
  Tag,
} from 'lucide-react';
import { Notice, College } from '../types';
import { formatCleanNoticeDate, sortNoticesByDateDesc, buildTelegramNoticePreview } from '../lib/dateSort';
import { NoticePreviewModal } from './NoticePreviewModal';

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

  // Classic Telegram Message Modal State + Full-Screen Edge-to-Edge File Preview State
  const [activeMessageNotice, setActiveMessageNotice] = useState<Notice | null>(null);
  const [activePreviewNotice, setActivePreviewNotice] = useState<Notice | null>(null);
  const [copiedTelegram, setCopiedTelegram] = useState(false);

  const categories = [
    'পরীক্ষা ও ফলাফল',
    'ফরম পূরণ',
    'ভর্তি সংক্রান্ত',
    'ক্লাস ও রুটিন',
    'সাধারণ নোটিশ',
  ];

  // প্রকৃত তারিখ অনুযায়ী নতুন থেকে পুরোনো ক্রমে সাজানো
  const sortedNotices = useMemo(() => sortNoticesByDateDesc(notices), [notices]);

  const filteredNotices = sortedNotices.filter((notice) => {
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

  const handleCopyTelegramMsg = async (notice: Notice) => {
    try {
      await navigator.clipboard.writeText(buildTelegramNoticePreview(notice));
      setCopiedTelegram(true);
      window.setTimeout(() => setCopiedTelegram(false), 2000);
    } catch {
      setCopiedTelegram(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">ডিটেক্টকৃত সাম্প্রতিক নোটিশসমূহ</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            কলেজ নোটিশ বোর্ড থেকে সংগৃহীত নোটিশ, টেলিগ্রাম মেসেজ ফরম্যাট প্রিভিউ ও PDF/ছবি ভিউয়ার
          </p>
        </div>

        <div className="inline-flex items-center space-x-1.5 bg-slate-100 px-3 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 self-start sm:self-auto tabular-nums">
          <span>মোট ফিল্টারড:</span>
          <span className="text-slate-900 font-bold">{filteredNotices.length}</span>
          <span>/ {notices.length} টি</span>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 my-4">
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

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'notified' | 'pending')}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer font-medium"
          >
            <option value="all">সব স্ট্যাটাস</option>
            <option value="notified">টেলিগ্রামে প্রেরিত</option>
            <option value="pending">প্রেরণ বাকি</option>
          </select>
        </div>
      </div>

      {/* Notice List */}
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
            const cleanDate = formatCleanNoticeDate(notice.date);
            return (
              <div
                key={notice.id}
                onClick={() => {
                  setCopiedTelegram(false);
                  setActiveMessageNotice(notice);
                }}
                className="p-3.5 bg-slate-50/80 hover:bg-white border border-slate-200/80 hover:border-emerald-300 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                        {notice.college_name || 'Govt. College'}
                      </span>

                      <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200/70 text-slate-700 rounded">
                        {category}
                      </span>

                      {cleanDate && (
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium tabular-nums">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{cleanDate}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                      {notice.title}
                    </h3>
                  </div>

                  {/* Status Tag & Dual Actions (Classic Telegram Preview + Full Screen File Preview) */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-2 sm:pt-0">
                    {notice.notified ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>প্রেরিত</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>বাকি</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCopiedTelegram(false);
                        setActiveMessageNotice(notice);
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      title="টেলিগ্রাম মেসেজ ডিসপ্যাচ প্রিভিউ ও তথ্য দেখুন"
                    >
                      <Send className="w-3 h-3 shrink-0" />
                      <span>মেসেজ</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreviewNotice(notice);
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
                      title="পূর্ণ স্ক্রিনে নোটিশের PDF বা ছবি প্রিভিউ দেখুন"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>ফাইল প্রিভিউ</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Classic Admin Telegram Message Format & Metadata Preview Modal */}
      {activeMessageNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
          onClick={() => setActiveMessageNotice(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl relative my-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveMessageNotice(null)}
              className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="বন্ধ করুন"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pr-8">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-700">
                <span>{activeMessageNotice.college_name || 'সরকারি কলেজ'}</span>
                {formatCleanNoticeDate(activeMessageNotice.date) && (
                  <span className="text-slate-500 font-medium tabular-nums">
                    · {formatCleanNoticeDate(activeMessageNotice.date)}
                  </span>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1 leading-snug">
                {activeMessageNotice.title}
              </h3>
            </div>

            {/* Metadata Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  <span>ক্যাটাগরি</span>
                </p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {getNoticeCategory(activeMessageNotice.title)}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] text-slate-500 font-semibold">টেলিগ্রাম ডিসপ্যাচ</p>
                <p
                  className={`font-bold mt-0.5 ${
                    activeMessageNotice.notified ? 'text-sky-700' : 'text-amber-700'
                  }`}
                >
                  {activeMessageNotice.notified ? 'প্রেরণ সম্পন্ন' : 'প্রেরণ বাকি'}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
                <p className="text-[10px] text-slate-500 font-semibold">তারিখ</p>
                <p className="font-bold text-slate-800 mt-0.5 tabular-nums">
                  {formatCleanNoticeDate(activeMessageNotice.date) || 'উল্লেখ নেই'}
                </p>
              </div>
            </div>

            {/* Classic Dark Telegram Message Preview Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  <span>টেলিগ্রাম মেসেজ ডিসপ্যাচ প্রিভিউ (Telegram Format)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyTelegramMsg(activeMessageNotice)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
                >
                  {copiedTelegram ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedTelegram ? 'কপি হয়েছে' : 'মেসেজ কপি'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 rounded-xl p-3.5 border border-slate-800 font-sans text-xs leading-relaxed whitespace-pre-wrap break-words shadow-inner">
                {buildTelegramNoticePreview(activeMessageNotice)}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = activeMessageNotice;
                  setActiveMessageNotice(null);
                  setActivePreviewNotice(target);
                }}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>PDF / ছবি প্রিভিউ (Full Screen)</span>
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={activeMessageNotice.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  <span>মূল লিংক</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setActiveMessageNotice(null)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Edge-to-Edge Notice File Preview Modal */}
      <NoticePreviewModal
        notice={activePreviewNotice}
        onClose={() => setActivePreviewNotice(null)}
        mode="admin"
      />
    </div>
  );
};

