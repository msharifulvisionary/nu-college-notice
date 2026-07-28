import React, { useState } from 'react';
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
  Code2,
  Heart
} from 'lucide-react';
import { College, Notice } from '../types';

interface HomePageProps {
  colleges: College[];
  notices: Notice[];
  onOpenAdminLogin: () => void;
  onRunScrapeNow: () => void;
  isScraping: boolean;
  isAdminLoggedIn: boolean;
  onGoToAdminPanel: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  colleges,
  notices,
  onOpenAdminLogin,
  onRunScrapeNow,
  isScraping,
  isAdminLoggedIn,
  onGoToAdminPanel,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('all');
  const [logoClicks, setLogoClicks] = useState<number>(0);

  const activeColleges = colleges.filter((c) => c.is_active);

  // Secret 5-click on header logo to open Admin Panel
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

  // Filter notices
  const filteredNotices = notices.filter((notice) => {
    const matchesSearch =
      notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (notice.college_name && notice.college_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCollege =
      selectedCollegeId === 'all' || notice.college_id === selectedCollegeId;

    return matchesSearch && matchesCollege;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-['Anek_Bangla'] antialiased">
      
      {/* 1. Top Live Notice Tracking Bar */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950 text-white text-xs py-2.5 px-4 shadow-sm border-b border-emerald-800/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          
          <div className="flex items-center space-x-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-emerald-400 tracking-wide">লাইভ ট্র্যাকিং:</span>
            <span className="text-slate-200 font-medium">
              জাতীয় বিশ্ববিদ্যালয় ও কলেজের অফিশিয়াল নোটিশ রিয়েল-টাইম স্ক্যানিং চলমান
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[11px] text-emerald-200/90 font-medium bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/50 shrink-0">
            <span>স্বয়ংক্রিয় চেকিং: ২০ মিনিট পর পর</span>
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="text-emerald-300 font-bold">{activeColleges.length} টি কলেজ সংযুক্ত</span>
          </div>

        </div>
      </div>

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
                  Multi-College Notice Tracker & Telegram Alert System
                </p>
              </div>
            </div>

            {/* Scrape Refresh Action */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onRunScrapeNow}
                disabled={isScraping}
                className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isScraping ? 'স্ক্যান হচ্ছে...' : 'এখনই চেক করুন'}</span>
                <span className="sm:hidden">{isScraping ? '...' : 'স্ক্যান'}</span>
              </button>
            </div>

          </div>
        </div>
      </header>

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
            সরকারি আজিজুল হক কলেজ, ঢাকা কলেজ, সরকারি তিতুমীর কলেজ সহ সকল মনিটরকৃত কলেজের প্রকাশিত নতুন নোটিশ সাথে সাথে টেলিগ্রামে নোটিফিকেশন পান।
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
              <p className="text-[11px] text-slate-500 font-medium">ইনস্ট্যান্ট বট ডিসপ্যাচ</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-lg sm:text-xl font-extrabold text-slate-900">২০ মি.</p>
              <p className="text-[11px] text-slate-500 font-medium">অটো চেকিং ইন্টারভাল</p>
            </div>
          </div>

        </div>
      </section>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
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
              প্রদর্শিত: <span className="text-emerald-600 font-bold">{filteredNotices.length}</span> / {notices.length} টি
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotices.map((notice) => (
                <div
                  key={notice.id}
                  className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header Badges */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg truncate max-w-[180px]">
                        {notice.college_name || 'Govt. College'}
                      </span>

                      {notice.date && (
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium shrink-0">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{notice.date}</span>
                        </span>
                      )}
                    </div>

                    {/* Notice Title */}
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed line-clamp-3 mb-3">
                      {notice.title}
                    </h3>
                  </div>

                  {/* Notice Footer Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                    <span className="inline-flex items-center space-x-1 text-[11px] text-sky-700 font-medium bg-sky-50 px-2 py-0.5 rounded-md">
                      <Send className="w-3 h-3 text-sky-600" />
                      <span>টেলিগ্রাম মেসেজ প্রেরিত</span>
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

      {/* 5. Custom Clean Footer */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-16 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center text-center space-y-4">
          
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <span>জাতীয় বিশ্ববিদ্যালয় নোটিশ বোর্ড ও টেলিগ্রাম ট্র্যাকার</span>
          </div>

          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
            সরকারি ও জাতীয় বিশ্ববিদ্যালয় অধিভুক্ত কলেজসমূহের নোটিশ স্বয়ংক্রিয়ভাবে পর্যবেক্ষণ ও তথ্য সরবরাহের প্ল্যাটফর্ম।
          </p>

          <div className="w-full max-w-xs h-px bg-slate-800 my-2" />

          {/* Developer Branding Banner */}
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-slate-200 font-medium">
            <Code2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Design & Dev By <strong className="text-emerald-400 font-extrabold tracking-wide">MD SHARIFUL ISLAM</strong></span>
          </div>

          <p className="text-[11px] text-slate-500 pt-1">
            © {new Date().getFullYear()} Multi-College Notice Tracker. All rights reserved.
          </p>

        </div>
      </footer>

    </div>
  );
};
