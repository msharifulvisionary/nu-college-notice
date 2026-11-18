import React, { useState, useEffect, useCallback } from 'react';
import { HomePage } from './components/HomePage';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { CollegeList } from './components/CollegeList';
import { AddCollegeModal } from './components/AddCollegeModal';
import { NoticeHistory } from './components/NoticeHistory';
import { TelegramTester } from './components/TelegramTester';
import { SqlCodeViewer } from './components/SqlCodeViewer';
import { College, Notice, SystemStatus } from './types';
import {
  isSupabaseConfigured,
  getSupabaseUrl,
  testSupabaseConnection,
  fetchColleges,
  fetchRecentNotices,
  addCollege,
  updateCollege,
  deleteCollege,
} from './lib/supabase';
import { Building2, Layers, Send, FileCode, AlertTriangle } from 'lucide-react';

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
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Check saved session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('adminToken');
    const savedUser = localStorage.getItem('adminUser');
    if (savedToken && savedUser) {
      setIsAdminLoggedIn(true);
      try {
        setAdminUser(JSON.parse(savedUser));
      } catch {
        setAdminUser({ username: 'admin', role: 'administrator', name: 'এডমিন' });
      }
    }
  }, []);

  // Fetch initial data directly from Supabase (no /api routes)
  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);

    try {
      if (!isSupabaseConfigured) {
        setStatus({
          supabase_connected: false,
          telegram_configured: false,
          telegram_chat_id: 'GitHub Actions Managed',
          supabase_url: getSupabaseUrl(),
          node_env: import.meta.env.MODE || 'production',
        });
        setDataError('Supabase সেটিংস পাওয়া যায়নি, Cloudflare এর Build variables চেক করুন');
        return;
      }

      const [supabaseConnected, fetchedColleges, fetchedNotices] = await Promise.all([
        testSupabaseConnection(),
        fetchColleges(),
        fetchRecentNotices(100),
      ]);

      setStatus({
        supabase_connected: supabaseConnected,
        telegram_configured: true,
        telegram_chat_id: 'GitHub Actions Managed',
        supabase_url: getSupabaseUrl(),
        node_env: import.meta.env.MODE || 'production',
      });

      setColleges(fetchedColleges);
      setNotices(fetchedNotices);
    } catch (err: any) {
      console.error('Error loading application data from Supabase:', err);
      const errMsg = err?.message ? ` (${err.message})` : '';
      setDataError(`Supabase থেকে ডাটা আনতে সমস্যা হয়েছে${errMsg}`);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Direct Supabase college actions
  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await updateCollege(id, { is_active: !currentStatus });
      setColleges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: !currentStatus } : c))
      );
    } catch (err) {
      console.error('Toggle status failed:', err);
    }
  };

  const handleDeleteCollege = async (id: string) => {
    if (!window.confirm('আপনি কি এই কলেজটি মুছে ফেলতে চান?')) return;
    try {
      await deleteCollege(id);
      setColleges((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Delete college failed:', err);
    }
  };

  const handleAddCollege = async (collegeData: Omit<College, 'id' | 'created_at'>) => {
    const newCollege = await addCollege(collegeData);
    setColleges((prev) => [newCollege, ...prev]);
  };

  const handleTestTelegram = async (botToken?: string, chatId?: string, message?: string) => {
    if (!botToken || !chatId) {
      return { success: false, error: 'Telegram Bot Token এবং Chat ID দিন।' };
    }

    const cleanChatId = chatId.trim().replace(/^\./, '');
    const text =
      message ||
      '🧪 Multi-College Notice Tracker\n\nটেলিগ্রাম বট কানেকশন সফলভাবে সম্পন্ন হয়েছে!';

    const response = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      return { success: true };
    }
    return {
      success: false,
      error: data.description || 'Telegram message send failed',
    };
  };

  // Render Public Home View
  if (currentView === 'home') {
    return (
      <>
        <HomePage
          colleges={colleges}
          notices={notices}
          onOpenAdminLogin={() => setIsLoginModalOpen(true)}
          onRefreshNotices={fetchData}
          isRefreshing={isLoadingData}
          dataError={dataError}
          isAdminLoggedIn={isAdminLoggedIn}
          onGoToAdminPanel={handleGoToAdminPanel}
        />

        <AdminLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
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
        isRefreshing={isLoadingData}
        onGoToHome={() => setCurrentView('home')}
        onLogout={handleLogout}
        adminUser={adminUser}
      />

      {/* Main Container - Edge to Edge on Mobile */}
      <main className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-3 sm:py-6">
        {dataError && (
          <div
            role="alert"
            className="mb-4 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm font-semibold flex items-start space-x-2.5 shadow-xs"
          >
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 shrink-0 mt-0.5" />
            <span>{dataError}</span>
          </div>
        )}

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
            <span>টেলিগ্রাম টেস্ট</span>
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
          <TelegramTester onTestTelegram={handleTestTelegram} />
        )}

        {activeTab === 'sql' && <SqlCodeViewer />}
      </main>

      {/* Add College Modal */}
      <AddCollegeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddCollege={handleAddCollege}
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
