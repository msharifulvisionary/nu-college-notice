import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { CollegeList } from './components/CollegeList';
import { AddCollegeModal } from './components/AddCollegeModal';
import { NoticeHistory } from './components/NoticeHistory';
import { TelegramTester } from './components/TelegramTester';
import { SqlCodeViewer } from './components/SqlCodeViewer';
import { RunScrapeModal } from './components/RunScrapeModal';
import { College, Notice, SystemStatus, ScrapeAndNotifyResult } from './types';
import { Building2, Layers, Send, FileCode, ShieldCheck } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'admin'>('home');
  const [activeTab, setActiveTab] = useState<'colleges' | 'notices' | 'telegram' | 'sql'>('colleges');
  
  // Auth state
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminUser, setAdminUser] = useState<{ username: string; role: string; name: string } | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // System state
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeAndNotifyResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Check saved session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('adminToken');
    const savedUser = localStorage.getItem('adminUser');
    if (savedToken && savedUser) {
      setIsAdminLoggedIn(true);
      try {
        setAdminUser(JSON.parse(savedUser));
      } catch (e) {
        setAdminUser({ username: 'admin', role: 'administrator', name: 'এডমিন' });
      }
    }
  }, []);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }

      const colRes = await fetch('/api/colleges');
      if (colRes.ok) {
        const colData = await colRes.json();
        if (colData.success) {
          setColleges(colData.colleges);
        }
      }

      const notRes = await fetch('/api/notices');
      if (notRes.ok) {
        const notData = await notRes.json();
        if (notData.success) {
          setNotices(notData.notices);
        }
      }
    } catch (err) {
      console.error('Error loading application data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Login handler
  const handleLoginSuccess = (user: { username: string; role: string; name: string }) => {
    setIsAdminLoggedIn(true);
    setAdminUser(user);
    setCurrentView('admin');
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setIsAdminLoggedIn(false);
    setAdminUser(null);
    setCurrentView('home');
  };

  const handleGoToAdminPanel = () => {
    if (isAdminLoggedIn) {
      setCurrentView('admin');
    } else {
      setIsLoginModalOpen(true);
    }
  };

  // College API actions
  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/colleges/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      if (res.ok) {
        setColleges((prev) =>
          prev.map((c) => (c.id === id ? { ...c, is_active: !currentStatus } : c))
        );
      }
    } catch (err) {
      console.error('Toggle status failed:', err);
    }
  };

  const handleDeleteCollege = async (id: string) => {
    if (!window.confirm('আপনি কি এই কলেজটি মুছে ফেলতে চান?')) return;
    try {
      const res = await fetch(`/api/colleges/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setColleges((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error('Delete college failed:', err);
    }
  };

  const handleAddCollege = async (collegeData: Omit<College, 'id' | 'created_at'>) => {
    try {
      const res = await fetch('/api/colleges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collegeData),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setColleges((prev) => [data.college, ...prev]);
        }
      }
    } catch (err) {
      console.error('Add college failed:', err);
    }
  };

  const handleTestScrapeUrl = async (url: string, selectorConfig: any) => {
    const res = await fetch('/api/scrape-college', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notice_url: url, selector_config: selectorConfig }),
    });
    return await res.json();
  };

  const handleTestTelegram = async (botToken?: string, chatId?: string, message?: string) => {
    const res = await fetch('/api/test-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId, customMessage: message }),
    });
    return await res.json();
  };

  const handleRunScrapeNow = async () => {
    setIsScraping(true);
    setIsRunModalOpen(true);
    setScrapeResult(null);
    setScrapeError(null);

    try {
      const defaultToken = 'a8f3k29dLp9Xq7Rm4Zt1Wv6Yn0Bc5Hj';
      const res = await fetch(`/api/scrape-and-notify?token=${defaultToken}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScrapeResult(data.data);
        fetchData();
      } else {
        setScrapeError(data.error || 'স্ক্র্যাপিং করতে ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      setScrapeError(err.message || 'নেটওয়ার্ক কানেকশন ফেইল্ড');
    } finally {
      setIsScraping(false);
    }
  };

  // Render Public Home View
  if (currentView === 'home') {
    return (
      <>
        <HomePage
          colleges={colleges}
          notices={notices}
          onOpenAdminLogin={() => setIsLoginModalOpen(true)}
          onRunScrapeNow={handleRunScrapeNow}
          isScraping={isScraping}
          isAdminLoggedIn={isAdminLoggedIn}
          onGoToAdminPanel={handleGoToAdminPanel}
        />

        <AdminLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
        />

        <RunScrapeModal
          isOpen={isRunModalOpen}
          onClose={() => setIsRunModalOpen(false)}
          result={scrapeResult}
          isLoading={isScraping}
          error={scrapeError}
        />
      </>
    );
  }

  // Render Admin Panel View (Edge to Edge mobile responsive)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Top Admin Header */}
      <Header
        status={status}
        onRefreshStatus={fetchData}
        onRunScrapeNow={handleRunScrapeNow}
        isScraping={isScraping}
        onGoToHome={() => setCurrentView('home')}
        onLogout={handleLogout}
        adminUser={adminUser}
      />

      {/* Main Container - Edge to Edge on Mobile */}
      <main className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-3 sm:py-6">
        
        {/* Global Stats Overview */}
        <StatsCards colleges={colleges} notices={notices} />

        {/* Navigation Tabs (Horizontal Scrollable edge-to-edge) */}
        <div className="flex border-b border-slate-200 mb-4 sm:mb-6 overflow-x-auto scrollbar-none bg-white rounded-xl p-1 shadow-xs border">
          <button
            onClick={() => setActiveTab('colleges')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-1 justify-center ${
              activeTab === 'colleges'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>কলেজ তালিকা ({colleges.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('notices')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-1 justify-center ${
              activeTab === 'notices'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>নোটিশ তালিকা ({notices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-1 justify-center ${
              activeTab === 'telegram'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>টেলিগ্রাম সেটিংস</span>
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            className={`flex items-center space-x-1.5 sm:space-x-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-1 justify-center ${
              activeTab === 'sql'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileCode className="w-4 h-4 shrink-0" />
            <span>SQL কোড</span>
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'colleges' && (
          <CollegeList
            colleges={colleges}
            onToggleActive={handleToggleActive}
            onDeleteCollege={handleDeleteCollege}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onTestScrapeCollege={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === 'notices' && (
          <NoticeHistory notices={notices} colleges={colleges} />
        )}

        {activeTab === 'telegram' && (
          <TelegramTester
            defaultBotToken={process.env.TELEGRAM_BOT_TOKEN}
            defaultChatId={process.env.TELEGRAM_CHAT_ID}
            onTestTelegram={handleTestTelegram}
          />
        )}

        {activeTab === 'sql' && (
          <SqlCodeViewer />
        )}

      </main>

      {/* Add College Modal */}
      <AddCollegeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddCollege={handleAddCollege}
        onTestScrapeUrl={handleTestScrapeUrl}
      />

      {/* Run Scrape Manual Execution Modal */}
      <RunScrapeModal
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        result={scrapeResult}
        isLoading={isScraping}
        error={scrapeError}
      />

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

    </div>
  );
}
