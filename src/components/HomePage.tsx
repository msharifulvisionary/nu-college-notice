import React, { useState } from 'react';
import {
  Bell,
  Building2,
  Search,
  ExternalLink,
  ShieldCheck,
  Send,
  Clock,
  CheckCircle2,
  ArrowRight,
  Layers,
  Sparkles,
  Zap,
  BookOpen,
  Calendar,
  Globe,
  Radio,
  FileText
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

  const activeColleges = colleges.filter((c) => c.is_active);

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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      
      {/* Top Announcement Bar */}
      <div className="bg-emerald-900 text-emerald-100 text-[12px] py-1.5 px-4 text-center font-medium flex items-center justify-center space-x-2 border-b border-emerald-800">
        <span className="inline-flex items-center space-x-1 bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
          <Radio className="w-3 h-3 animate-pulse text-amber-300" />
          <span>লাইভ সিস্টেম</span>
        </span>
        <span className="truncate">জাতীয় বিশ্ববিদ্যালয়ের সকল কলেজের অফিসিয়াল নোটিশ স্বয়ংক্রিয়ভাবে টেলিগ্রাম চ্যানেলে পাঠানো হয়</span>
      </div>

      {/* Main Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex items-center justify-between gap-3">
            
            {/* Logo & Title */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-sans">
                  Multi-College Notice Tracker
                </h1>
                <p className="text-[11px] text-slate-500 hidden sm:block">
                  জাতীয় বিশ্ববিদ্যালয় ও সরকারি কলেজ নোটিশ মনিটরিং পোর্টাল
                </p>
              </div>
            </div>

            {/* Admin CTA Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onRunScrapeNow}
                disabled={isScraping}
                className="hidden md:inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-all cursor-pointer border border-slate-200"
              >
                <Zap className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin text-amber-600' : 'text-emerald-600'}`} />
                <span>{isScraping ? 'নোটিশ চেক হচ্ছে...' : 'নোটিশ স্ক্যান'}</span>
              </button>

              {isAdminLoggedIn ? (
                <button
                  onClick={onGoToAdminPanel}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>এডমিন ড্যাশবোর্ড</span>
                </button>
              ) : (
                <button
                  onClick={onOpenAdminLogin}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>এডমিন লগইন</span>
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Hero Banner Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-900 via-slate-900 to-slate-950 text-white py-12 sm:py-16 px-4">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        
        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-5">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>স্বয়ংক্রিয় নোটিশ নোটিফায়ার ও টেলিগ্রাম বট সার্ভিস</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            বাংলাদেশের যেকোনো সরকারি ও বে সরকারি কলেজের নোটিশ <span className="text-emerald-400 underline decoration-emerald-500/40 decoration-4">মিড-সেকেন্ডে</span> টেলিগ্রামে
          </h1>

          <p className="text-xs sm:text-sm md:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed">
            জাতীয় বিশ্ববিদ্যালয়, সরকারি আজিজুল হক কলেজ, তিতুমীর কলেজ, ঢাকা কলেজ সহ দেশের প্রধান প্রধান কলেজগুলোর অফিসিয়াল ওয়েবসাইট থেকে নোটিশ অটোমেটিক স্ক্যান এবং সরাসরি টেলিগ্রাম চ্যানেল অ্যালার্ট।
          </p>

          {/* Quick Stats Counter */}
          <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center backdrop-blur-xs">
              <p className="text-xl sm:text-2xl font-black text-emerald-400">{activeColleges.length} টি</p>
              <p className="text-[11px] text-slate-400 font-medium">সক্রিয় কলেজ</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center backdrop-blur-xs">
              <p className="text-xl sm:text-2xl font-black text-teal-400">{notices.length} টি</p>
              <p className="text-[11px] text-slate-400 font-medium">ট্র্যাককৃত নোটিশ</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center backdrop-blur-xs">
              <p className="text-xl sm:text-2xl font-black text-sky-400">&lt; ১ সে.</p>
              <p className="text-[11px] text-slate-400 font-medium">টেলিগ্রাম অ্যালার্ট</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center backdrop-blur-xs">
              <p className="text-xl sm:text-2xl font-black text-amber-400">২০ মি.</p>
              <p className="text-[11px] text-slate-400 font-medium">অটো চেকিং ফ্রিকোয়েন্সি</p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#recent-notices"
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all inline-flex items-center space-x-2"
            >
              <BookOpen className="w-4 h-4" />
              <span>সাম্প্রতিক নোটিশসমূহ দেখুন</span>
            </a>

            <button
              onClick={onOpenAdminLogin}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl border border-white/20 backdrop-blur-xs transition-all inline-flex items-center space-x-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>এডমিন কন্ট্রোল প্যানেল</span>
            </button>
          </div>

        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        
        {/* Live Notices Section */}
        <section id="recent-notices" className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h2 className="text-lg font-bold text-slate-900">সাম্প্রতিক সংগৃহীত নোটিশ বোর্ড</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                বিভিন্ন সরকারি কলেজের প্রকাশিত নোটিশের রিয়েল-টাইম তালিকা
              </p>
            </div>

            <div className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              মোট প্রদর্শিত: <span className="font-bold text-slate-900">{filteredNotices.length}</span> টি
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 bg-white p-3.5 border border-slate-200 rounded-xl shadow-xs">
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="নোটিশের শিরোনাম বা কলেজের নাম দিয়ে খুঁজুন..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <select
                value={selectedCollegeId}
                onChange={(e) => setSelectedCollegeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
              >
                <option value="all">সকল কলেজ</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notice Cards List */}
          {filteredNotices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">কোনো নোটিশ পাওয়া যায়নি</p>
              <p className="text-xs text-slate-400 mt-1">অনুগ্রহ করে সার্চ কীওয়ার্ড পরিবর্তন করে আবার চেষ্টা করুন</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotices.map((notice) => (
                <div
                  key={notice.id}
                  className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md">
                        {notice.college_name || 'Govt. College'}
                      </span>

                      {notice.date && (
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{notice.date}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-3 mb-3">
                      {notice.title}
                    </h3>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                    <span className="inline-flex items-center space-x-1 text-[11px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded">
                      <Send className="w-3 h-3 text-sky-600" />
                      <span>টেলিগ্রাম অ্যালার্ট সেন্ট</span>
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

        {/* Monitored Colleges Directory */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">মনিটরকৃত কলেজ নোটিশ বোর্ডসমূহ</h2>
              <p className="text-xs text-slate-500">
                এই কলেজগুলোর অফিসিয়াল ওয়েবসাইট নির্দিষ্ট সময় পরপর চেক করে নতুন নোটিশ সংগ্রহ করা হয়
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-5">
            {colleges.map((college) => (
              <div
                key={college.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      college.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                  <h3 className="text-xs font-bold text-slate-900 truncate">{college.name}</h3>
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

                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>স্ট্যাটাস:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                      college.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {college.is_active ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয়'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How System Works Step-by-Step */}
        <section className="bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="max-w-3xl mb-8">
            <span className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider block mb-1">
              SYSTEM WORKFLOW
            </span>
            <h2 className="text-xl sm:text-2xl font-bold">নোটিশ ট্র্যাকিং নোটিফায়ার যেভাবে কাজ করে</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Cheerio HTML Parser এবং Serverless Cron-এর মাধ্যমে শতভাগ নির্ভুল অটোমেশন
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl relative">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center mb-3">
                01
              </div>
              <h3 className="text-sm font-bold text-white mb-1">স্বয়ংক্রিয় ওয়েব স্ক্যানિંગ</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                নির্দিষ্ট সময় পর পর ক্রোন জব সার্ভার সক্রিয় কলেজগুলোর নোটিশ বোর্ড পেজ থেকে এইচটিএমএল ডাটা সংগ্রহ করে।
              </p>
            </div>

            <div className="p-4 bg-white/5 border border-white/10 rounded-xl relative">
              <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 font-black text-sm flex items-center justify-center mb-3">
                02
              </div>
              <h3 className="text-sm font-bold text-white mb-1">নতুন নোটিশ ডিটেকশন</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                ডাটাবেজে সংরক্ষিত পুরানো নোটিশের সাথে তুলনা করে শুধুমাত্র নতুন অপ্রকাশিত নোটিশগুলো ফিল্টার করা হয়।
              </p>
            </div>

            <div className="p-4 bg-white/5 border border-white/10 rounded-xl relative">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 font-black text-sm flex items-center justify-center mb-3">
                03
              </div>
              <h3 className="text-sm font-bold text-white mb-1">ইনস্ট্যান্ট টেলিগ্রাম অ্যালার্ট</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                টেলিগ্রাম বটের API ব্যবহার করে সরাসরি চ্যানেল বা চ্যাটে শিরোনাম ও মূল লিংকসহ মেসেজ পুশ করা হয়।
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 space-y-2">
          <p className="font-semibold text-slate-700">
            Multi-College Notice Tracker & Telegram Dispatcher System
          </p>
          <p>
            জাতীয় বিশ্ববিদ্যালয় ও বাংলাদেশের বিভিন্ন কলেজ নোটিশ অটোমেশন সিস্টেম
          </p>
          <div className="pt-2">
            <button
              onClick={onOpenAdminLogin}
              className="text-emerald-600 hover:underline font-semibold cursor-pointer"
            >
              এডমিন ড্যাশবোর্ড লগইন
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
};
