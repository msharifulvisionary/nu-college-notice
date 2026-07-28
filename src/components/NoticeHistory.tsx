import React, { useState } from 'react';
import { Layers, Search, ExternalLink, CheckCircle2, Clock, Calendar } from 'lucide-react';
import { Notice, College } from '../types';

interface NoticeHistoryProps {
  notices: Notice[];
  colleges: College[];
}

export const NoticeHistory: React.FC<NoticeHistoryProps> = ({ notices, colleges }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'notified' | 'pending'>('all');

  // Filter notices
  const filteredNotices = notices.filter((notice) => {
    const matchesSearch =
      notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (notice.college_name && notice.college_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCollege =
      selectedCollegeId === 'all' || notice.college_id === selectedCollegeId;

    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'notified' && notice.notified) ||
      (selectedStatus === 'pending' && !notice.notified);

    return matchesSearch && matchesCollege && matchesStatus;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">ডিটেক্টকৃত সাম্প্রতিক নোটিশসমূহ</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            কলেজ নোটিশ বোর্ড থেকে সংগৃহীত নোটিশ ও টেলিগ্রাম স্ট্যাটাস
          </p>
        </div>

        <div className="inline-flex items-center space-x-1.5 bg-slate-100 px-3 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 self-start sm:self-auto">
          <span>মোট:</span>
          <span className="text-slate-900 font-bold">{filteredNotices.length}</span>
          <span>/ {notices.length} টি</span>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="নোটিশের শিরোনাম দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
          />
        </div>

        {/* Filter by College */}
        <div>
          <select
            value={selectedCollegeId}
            onChange={(e) => setSelectedCollegeId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
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
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
          >
            <option value="all">সব স্ট্যাটাস</option>
            <option value="notified">টেলিগ্রামে প্রেরিত</option>
            <option value="pending">প্রেরণ বাকি</option>
          </select>
        </div>

      </div>

      {/* Notice List Table */}
      {filteredNotices.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">কোনো নোটিশ পাওয়া যায়নি</p>
          <p className="text-xs text-slate-400 mt-1">খোঁজার ফিল্টার পরিবর্তন করুন অথবা 'এখনই চেক করুন' বাটনে চাপ দিন</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotices.map((notice) => (
            <div
              key={notice.id}
              className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-lg hover:border-slate-300 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded">
                      {notice.college_name || 'Govt. College'}
                    </span>

                    {notice.date && (
                      <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{notice.date}</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-xs font-semibold text-slate-900 leading-snug">
                    {notice.title}
                  </h3>
                </div>

                {/* Status Tag & View Link */}
                <div className="flex items-center space-x-3 shrink-0 pt-2 sm:pt-0">
                  {notice.notified ? (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-md text-[11px] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>টেলিগ্রামে প্রেরিত</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[11px] font-semibold">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>প্রেরণ বাকি</span>
                    </span>
                  )}

                  <a
                    href={notice.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-semibold rounded-md transition-colors border border-slate-200"
                  >
                    <span>দেখুন</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
