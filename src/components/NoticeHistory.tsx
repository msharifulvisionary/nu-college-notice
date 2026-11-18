import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  Eye,
} from 'lucide-react';
import { Notice, College } from '../types';
import { sortNoticesByDateDesc } from '../lib/dateSort';
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

  // Preview Modal State
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null);

  // Available categories list
  const categories = [
    'পরীক্ষা ও ফলাফল',
    'ফরম পূরণ',
    'ভর্তি সংক্রান্ত',
    'ক্লাস ও রুটিন',
    'সাধারণ নোটিশ',
  ];

  // প্রকৃত তারিখ অনুযায়ী নতুন থেকে পুরোনো ক্রমে সাজানো
  const sortedNotices = useMemo(() => sortNoticesByDateDesc(notices), [notices]);

  // Filter notices
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
                onClick={() => setActiveNotice(notice)}
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
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium tabular-nums">
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
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveNotice(notice);
                      }}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>প্রিভিউ</span>
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Screen Edge-to-Edge Notice Preview Modal */}
      <NoticePreviewModal
        notice={activeNotice}
        onClose={() => setActiveNotice(null)}
        mode="admin"
      />
    </div>
  );
};
