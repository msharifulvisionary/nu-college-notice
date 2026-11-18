import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Building2,
  Search,
  ExternalLink,
  Send,
  Calendar,
  Globe,
  Radio,
  Layers,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Code2,
} from 'lucide-react';
import { College, Notice } from '../types';
import { sortNoticesByDateDesc } from '../lib/dateSort';

interface HomePageProps {
  colleges: College[];
  notices: Notice[];
  onOpenAdminLogin: () => void;
  onRefreshNotices: () => void;
  isRefreshing: boolean;
  dataError?: string | null;
  isAdminLoggedIn: boolean;
  onGoToAdminPanel: () => void;
}

const INITIAL_NOTICE_COUNT = 6;
const NOTICE_STEP = 6;

export const HomePage: React.FC<HomePageProps> = ({
  colleges,
  notices,
  onOpenAdminLogin,
  onRefreshNotices,
  isRefreshing,
  dataError,
  isAdminLoggedIn,
  onGoToAdminPanel,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [logoClicks, setLogoClicks] = useState<number>(0);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_NOTICE_COUNT);

  const activeColleges = colleges.filter((c) => c.is_active);

  // সার্চ বা ফিল্টার বদলালে দেখানোর সংখ্যা রিসেট করা
  useEffect(() => {
    setVisibleCount(INITIAL_NOTICE_COUNT);
  }, [searchTerm, selectedCollegeId]);

  // লোগোতে ৫ বার ক্লিক করলে এডমিন প্যানেল ওপেন হবে
  const handleLogoClick = () => {
    const nextCount = logoClicks + 1;
    setLogoClicks(nextCount);

    if (nextCount >= 5) {
      setLogoClicks(0);
      if (isAdminLoggedIn) {
        onGoToAdminPanel();
      } else {
        onOpenAdminLogin();
      }
    }
  };

  // প্রকৃত তারিখ অনুযায়ী নতুন থেকে পুরোনো ক্রমে সাজানো
  const sortedNotices = useMemo(() => sortNoticesByDateDesc(notices), [notices]);

  // নোটিশ ফিল্টার
  const filteredNotices = sortedNotices.filter((notice) => {
    const matchesSearch =
      notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (notice.college_name && notice.college_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCollege =
      selectedCollegeId === 'all' || notice.college_id === selectedCollegeId;

    return matchesSearch && matchesCollege;
  });

  const visibleNotices = filteredNotices.slice(0, visibleCount);
  const remainingCount = Math.max(0, filteredNotices.length - visibleCount);
  const hasMoreNotices = remainingCount > 0;
  const canCollapse =
    filteredNotices.length > INITIAL_NOTICE_COUNT && visibleCount > INITIAL_NOTICE_COUNT;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-['Anek_Bangla'] antialiased flex flex-col">
      {/* Main Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Brand Logo - 5 Clicks Trigger for Admin Panel */}
            <div
              onClick={handleLogoClick}
              className="flex items-center space-x-3 cursor-pointer select-none group"
              title="লোগোতে ৫ বার ক্লিক করলে এডমিন প্যানেল ওপেন হবে"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0 transition-transform group-hover:scale-105 active:scale-95">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight group-hover:text-emerald-700 transition-colors">
                    জাতীয় বিশ্ববিদ্যালয় নোটিশ বোর্ড
                  </h1>
                  {logoClicks > 0 && (
                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md animate-pulse">
                      {logoClicks}/৫
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 hidden sm:block font-medium">
                  সরকারি ও জাতীয় বিশ্ববিদ্যালয় অধিভুক্ত কলেজ নোটিশ ট্র্যাকার
                </p>
              </div>
            </div>

            {/* Refresh Notices Action */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onRefreshNotices}
                disabled={isRefreshing}
                className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isRefreshing ? 'লোড হচ্ছে...' : 'রিফ্রেশ করুন'}</span>
                <span className="sm:hidden">{isRefreshing ? '...' : 'রিফ্রেশ'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Top Error Alert Box */}
      {dataError && (
        <div className="bg-rose-50 border-b border-rose-300 px-4 py-3">
          <div
            role="alert"
            className="max-w-7xl mx-auto flex items-start sm:items-center space-x-2.5 text-rose-900 text-xs sm:text-sm font-semibold"
          >
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>{dataError}</span>
          </div>
        </div>
      )}

      {/* Hero Header Section */}
      <section className="bg-white border-b border-slate-200 py-8 sm:py-12 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>টেলিগ্রাম চ্যানেল ও গ্রুপের মাধ্যমে ইনস্ট্যান্ট অটো অ্যালার্ট</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-snug">
            সরকারি ও জাতীয় বিশ্ববিদ্যালয় অধিভুক্ত কলেজের <br className="hidden sm:inline" />
            অফিসিয়াল নোটিশ বোর্ড
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed font-medium">
            সকল মনিটরকৃত কলেজের প্রকাশিত নতুন নোটিশ সাথে সাথে টেলিগ্রামে নোটিফিকেশন এবং একসাথে এক পোর্টালে দেখুন।
          </p>

          {/* Quick Stats Grid */}
          <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-lg sm:text-xl font-extrabold text-slate-900">{activeColleges.length} টি</p>
              <p className="text-[11px] text-slate-500 font-medium">সক্রিয় কলেজ</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-lg sm:text-xl font-extrabold text-slate-900">{notices.length} টি</p>
              <p className="text-[11px] text-slate-500 font-medium">সংগৃহীত নোটিশ</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-lg sm:text-xl font-extrabold text-emerald-600">টেলিগ্রাম</p>
              <p className="text-[11px] text-slate-500 font-medium">ইনস্ট্যান্ট অ্যালার্ট</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-lg sm:text-xl font-extrabold text-slate-900">২০ মি.</p>
              <p className="text-[11px] text-slate-500 font-medium">অটো চেকিং</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 flex-1">
        {/* Notice Search & Filter */}
        <section id="notices">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">সাম্প্রতিক প্রকাশিত নোটিশসমূহ</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                বিভিন্ন সরকারি ও জাতীয় বিশ্ববিদ্যালয়ের সাম্প্রতিক নোটিশ তালিকা
              </p>
            </div>

            <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs self-start sm:self-auto">
              প্রদর্শিত: <span className="text-emerald-600 font-bold">{visibleNotices.length}</span> / {filteredNotices.length} টি
            </div>
          </div>

          {/* Search Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 bg-white p-3 border border-slate-200 rounded-2xl shadow-xs">
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="নোটিশের শিরোনাম বা কলেজের নাম দিয়ে সার্চ করুন..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div className="relative">
              <select
                value={selectedCollegeId}
                onChange={(e) => setSelectedCollegeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer font-medium"
              >
                <option value="all">সকল কলেজ ({notices.length})</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notice Grid List */}
          {filteredNotices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center text-slate-500">
              <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">কোনো নোটিশ পাওয়া যায়নি</p>
              <p className="text-xs text-slate-400 mt-1">অনুগ্রহ করে সার্চ বা ফিল্টার পরিবর্তন করে চেষ্টা করুন</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleNotices.map((notice) => (
                  <div
                    key={notice.id}
                    className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg truncate max-w-[180px]">
                          {notice.college_name || 'Govt. College'}
                        </span>

                        {notice.date && (
                          <span className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium shrink-0 tabular-nums">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{notice.date}</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed line-clamp-3 mb-3">
                        {notice.title}
                      </h3>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                      <span className="inline-flex items-center space-x-1 text-[11px] text-sky-700 font-medium bg-sky-50 px-2 py-0.5 rounded-md">
                        <Send className="w-3 h-3 text-sky-600" />
                        <span>টেলিগ্রাম নোটিশ</span>
                      </span>

                      <a
                        href={notice.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                      >
                        <span>মূল নোটিশ</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {/* See More / Show Less Controls */}
              {(hasMoreNotices || canCollapse) && (
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                  {hasMoreNotices && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + NOTICE_STEP)}
                      className="inline-flex items-center space-x-2 px-6 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
                    >
                      <span>আরও দেখুন ({remainingCount} টি বাকি)</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}

                  {canCollapse && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(INITIAL_NOTICE_COUNT)}
                      className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      <span>সংক্ষিপ্ত করুন</span>
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Monitored College Directory */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">সংযুক্ত কলেজসমূহের তালিকা</h2>
              <p className="text-xs text-slate-500">
                এই কলেজগুলোর অফিসিয়াল নোটিশ বোর্ড থেকে নিয়মিত তথ্য সংগ্রহ করা হয়
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 mt-4">
            {colleges.map((college) => (
              <div
                key={college.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        college.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    <h3 className="text-xs font-bold text-slate-900 truncate">{college.name}</h3>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                      college.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {college.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                  </span>
                </div>

                <a
                  href={college.notice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-emerald-600 hover:underline mt-2 font-medium truncate max-w-full"
                >
                  <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{college.notice_url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Clean Footer with Developer Credit */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-12 py-7 px-4">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center text-center space-y-3">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Bell className="w-3.5 h-3.5" />
            </div>
            <span>জাতীয় বিশ্ববিদ্যালয় ও কলেজ নোটিশ বোর্ড</span>
          </div>

          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-slate-200 font-medium">
            <Code2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Design &amp; Dev By{' '}
              <strong className="text-emerald-400 font-extrabold tracking-wide">
                MD SHARIFUL ISLAM
              </strong>
            </span>
          </div>

          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} Multi-College Notice Tracker. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};
