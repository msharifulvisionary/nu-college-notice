import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HomePage } from './components/HomePage';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { CollegeList, CollegeTestUiState } from './components/CollegeList';
import { AddCollegeModal } from './components/AddCollegeModal';
import { NoticeHistory } from './components/NoticeHistory';
import { TelegramTester } from './components/TelegramTester';
import { College, CollegePayload, Notice, SystemStatus } from './types';
import {
  isSupabaseConfigured,
  supabase,
  getSupabaseUrl,
  testSupabaseConnection,
  fetchColleges,
  fetchRecentNotices,
  getAdminSession,
  signOutAdmin,
} from './lib/supabase';
import {
  fetchAdminColleges,
  createAdminCollege,
  updateAdminCollege,
  deleteAdminCollege,
  fetchAdminSettings,
  saveAdminSettings,
  sendAdminTelegramTest,
  triggerAdminTestRun,
  fetchAdminTestRunStatus,
} from './lib/adminApi';
import { Building2, Layers, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';

function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/admin');
}

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'admin'>(() =>
    isAdminPath() ? 'admin' : 'home'
  );
  const [activeTab, setActiveTab] = useState<'colleges' | 'notices' | 'telegram'>('colleges');

  // Auth state (Supabase Auth)
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Public & Admin Data state
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingAdminColleges, setIsLoadingAdminColleges] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Add/Edit College Modal & per-row loading
  const [isCollegeModalOpen, setIsCollegeModalOpen] = useState(false);
  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<Record<string, CollegeTestUiState>>({});

  const activePollTimersRef = useRef<Record<string, number>>({});

  const navigateView = useCallback((view: 'home' | 'admin') => {
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      const targetPath = view === 'admin' ? '/admin' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  }, []);

  // Sync browser back/forward button
  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(isAdminPath() ? 'admin' : 'home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Cleanup active test polling timers on unmount
  useEffect(() => {
    return () => {
      Object.keys(activePollTimersRef.current).forEach((collegeId) => {
        window.clearTimeout(activePollTimersRef.current[collegeId]);
      });
    };
  }, []);

  // Initialize Supabase Auth session & listener
  useEffect(() => {
    let mounted = true;
    const initSession = async () => {
      const session = await getAdminSession();
      if (!mounted) return;
      setIsAdminLoggedIn(Boolean(session?.access_token));
      setAdminEmail(session?.user?.email || '');
      setIsAuthReady(true);
    };
    initSession();

    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsAdminLoggedIn(Boolean(session?.access_token));
      setAdminEmail(session?.user?.email || '');
      setIsAuthReady(true);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleUnauthorized = useCallback(
    (reason?: string) => {
      setIsAdminLoggedIn(false);
      setAdminEmail('');
      setAuthNotice(
        reason || 'আপনার সেশন মেয়াদোত্তীর্ণ হয়েছে। অনুগ্রহ করে আবার এডমিন লগইন করুন।'
      );
      navigateView('admin');
    },
    [navigateView]
  );

  // Fetch public data directly from Supabase
  const fetchPublicData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);

    try {
      if (!isSupabaseConfigured) {
        setStatus({
          supabase_connected: false,
          telegram_configured: false,
          telegram_chat_id: 'Database Configured',
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
        telegram_chat_id: 'Database Configured',
        supabase_url: getSupabaseUrl(),
        node_env: import.meta.env.MODE || 'production',
      });

      setColleges(fetchedColleges);
      setNotices(fetchedNotices);
    } catch (err: unknown) {
      console.error('Error loading application data from Supabase:', err);
      const errMsg = err instanceof Error && err.message ? ` (${err.message})` : '';
      setDataError(`Supabase থেকে ডাটা আনতে সমস্যা হয়েছে${errMsg}`);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // Load admin colleges via authenticated Worker endpoint
  const loadAdminColleges = useCallback(async () => {
    if (!isAdminLoggedIn) return;
    setIsLoadingAdminColleges(true);
    try {
      const list = await fetchAdminColleges(handleUnauthorized);
      setColleges(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'কলেজ তালিকা লোড করতে সমস্যা হয়েছে।';
      setActionBanner({ type: 'error', text: msg });
    } finally {
      setIsLoadingAdminColleges(false);
    }
  }, [isAdminLoggedIn, handleUnauthorized]);

  useEffect(() => {
    fetchPublicData();
  }, [fetchPublicData]);

  useEffect(() => {
    if (currentView === 'admin' && isAdminLoggedIn) {
      loadAdminColleges();
    }
  }, [currentView, isAdminLoggedIn, loadAdminColleges]);

  const handleRefreshAll = useCallback(async () => {
    await fetchPublicData();
    if (currentView === 'admin' && isAdminLoggedIn) {
      await loadAdminColleges();
    }
  }, [fetchPublicData, currentView, isAdminLoggedIn, loadAdminColleges]);

  const handleLoginSuccess = () => {
    setAuthNotice(null);
    setIsAdminLoggedIn(true);
    navigateView('admin');
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setAuthNotice(null);
    navigateView('home');
  };

  const handleGoToAdminPanel = () => {
    if (isAdminLoggedIn) {
      navigateView('admin');
    } else {
      setIsLoginModalOpen(true);
    }
  };

  // Admin College CRUD handlers (via Worker API)
  const handleToggleActive = async (college: College) => {
    setTogglingId(college.id);
    setActionBanner(null);
    try {
      const res = await updateAdminCollege(
        college.id,
        { is_active: !college.is_active },
        handleUnauthorized
      );
      setColleges((prev) => prev.map((c) => (c.id === college.id ? res.college : c)));
      setActionBanner({
        type: 'success',
        text: `${college.name} ${res.college.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'স্ট্যাটাস পরিবর্তন করা যায়নি।';
      setActionBanner({ type: 'error', text: msg });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteCollege = async (college: College) => {
    setDeletingId(college.id);
    setActionBanner(null);
    try {
      const res = await deleteAdminCollege(college.id, handleUnauthorized);
      setColleges((prev) => prev.filter((c) => c.id !== college.id));
      setNotices((prev) => prev.filter((n) => n.college_id !== college.id));
      setActionBanner({ type: 'success', text: res.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'কলেজ মুছে ফেলতে সমস্যা হয়েছে।';
      setActionBanner({ type: 'error', text: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveCollege = async (payload: CollegePayload, collegeId?: string) => {
    setActionBanner(null);
    if (collegeId) {
      const res = await updateAdminCollege(collegeId, payload, handleUnauthorized);
      setColleges((prev) => prev.map((c) => (c.id === collegeId ? res.college : c)));
      setActionBanner({ type: 'success', text: res.message });
    } else {
      const res = await createAdminCollege(payload, handleUnauthorized);
      setColleges((prev) => [res.college, ...prev]);
      setActionBanner({ type: 'success', text: res.message });
    }
  };

  // Test Run Trigger + 3s Polling (max 2 minutes = 40 attempts)
  const handleTestScrapeCollege = async (college: College) => {
    if (activePollTimersRef.current[college.id]) {
      window.clearTimeout(activePollTimersRef.current[college.id]);
      delete activePollTimersRef.current[college.id];
    }

    setTestStates((prev) => ({
      ...prev,
      [college.id]: { isRunning: true, run: null, error: null },
    }));

    try {
      const triggerRes = await triggerAdminTestRun(college.id, handleUnauthorized);
      const testRunId = triggerRes.test_run_id;
      const startedAt = Date.now();
      const maxDurationMs = 120000;

      const pollStatus = async () => {
        try {
          const run = await fetchAdminTestRunStatus(testRunId, handleUnauthorized);

          if (run.status === 'success' || run.status === 'error') {
            setTestStates((prev) => ({
              ...prev,
              [college.id]: { isRunning: false, run, error: null },
            }));
            delete activePollTimersRef.current[college.id];
            return;
          }

          if (Date.now() - startedAt >= maxDurationMs) {
            setTestStates((prev) => ({
              ...prev,
              [college.id]: {
                isRunning: false,
                run,
                error:
                  '২ মিনিট পার হয়ে গেছে কিন্তু টেস্ট রান শেষ হয়নি। GitHub Actions লগ চেক করুন।',
              },
            }));
            delete activePollTimersRef.current[college.id];
            return;
          }

          activePollTimersRef.current[college.id] = window.setTimeout(pollStatus, 3000);
        } catch (pollErr: unknown) {
          const msg =
            pollErr instanceof Error ? pollErr.message : 'টেস্ট রানের ফলাফল জানতে সমস্যা হয়েছে।';
          setTestStates((prev) => ({
            ...prev,
            [college.id]: { isRunning: false, run: null, error: msg },
          }));
          delete activePollTimersRef.current[college.id];
        }
      };

      activePollTimersRef.current[college.id] = window.setTimeout(pollStatus, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'টেস্ট রান শুরু করতে সমস্যা হয়েছে।';
      setTestStates((prev) => ({
        ...prev,
        [college.id]: { isRunning: false, run: null, error: msg },
      }));
    }
  };

  // Telegram Settings & Test handlers (via Worker API)
  const handleLoadTelegramSettings = useCallback(
    () => fetchAdminSettings(handleUnauthorized),
    [handleUnauthorized]
  );

  const handleSaveTelegramSettings = useCallback(
    (payload: { telegram_bot_token?: string; telegram_chat_id: string }) =>
      saveAdminSettings(payload, handleUnauthorized),
    [handleUnauthorized]
  );

  const handleSendTelegramTest = useCallback(
    (message?: string) => sendAdminTelegramTest(message, handleUnauthorized),
    [handleUnauthorized]
  );

  // Render Public Home View
  if (currentView === 'home') {
    return (
      <>
        <HomePage
          colleges={colleges}
          notices={notices}
          onOpenAdminLogin={() => setIsLoginModalOpen(true)}
          onRefreshNotices={fetchPublicData}
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

  // Render full-page Admin Login screen when visiting /admin without an active Supabase session
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-xs font-semibold text-slate-600">
        এডমিন সেশন যাচাই করা হচ্ছে...
      </div>
    );
  }

  if (!isAdminLoggedIn) {
    return (
      <AdminLoginModal
        variant="page"
        isOpen={true}
        onClose={() => navigateView('home')}
        onLoginSuccess={handleLoginSuccess}
        initialMessage={authNotice}
        onBackToHome={() => navigateView('home')}
      />
    );
  }

  // Render Authenticated Admin Panel View
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <Header
        status={status}
        onRefreshStatus={handleRefreshAll}
        isRefreshing={isLoadingData || isLoadingAdminColleges}
        onGoToHome={() => navigateView('home')}
        onLogout={handleLogout}
        adminUser={{ username: adminEmail || 'Admin', role: 'administrator', name: 'এডমিন' }}
      />

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

        {actionBanner && (
          <div
            role="status"
            className={`mb-4 rounded-xl p-3 sm:p-3.5 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 border shadow-xs ${
              actionBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              {actionBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionBanner.text}</span>
            </div>
            <button
              onClick={() => setActionBanner(null)}
              className="text-xs font-bold opacity-70 hover:opacity-100 px-2 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <StatsCards colleges={colleges} notices={notices} />

        {/* Navigation Tabs */}
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
            <span>টেলিগ্রাম সেটিংস ও টেস্ট</span>
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'colleges' && (
          <CollegeList
            colleges={colleges}
            isLoadingColleges={isLoadingAdminColleges}
            togglingId={togglingId}
            deletingId={deletingId}
            testStates={testStates}
            onToggleActive={handleToggleActive}
            onEditCollege={(college) => {
              setEditingCollege(college);
              setIsCollegeModalOpen(true);
            }}
            onDeleteCollege={handleDeleteCollege}
            onOpenAddModal={() => {
              setEditingCollege(null);
              setIsCollegeModalOpen(true);
            }}
            onTestScrapeCollege={handleTestScrapeCollege}
          />
        )}

        {activeTab === 'notices' && <NoticeHistory notices={notices} colleges={colleges} />}

        {activeTab === 'telegram' && (
          <TelegramTester
            onLoadSettings={handleLoadTelegramSettings}
            onSaveSettings={handleSaveTelegramSettings}
            onTestTelegram={handleSendTelegramTest}
          />
        )}
      </main>

      <AddCollegeModal
        isOpen={isCollegeModalOpen}
        editingCollege={editingCollege}
        onClose={() => {
          setIsCollegeModalOpen(false);
          setEditingCollege(null);
        }}
        onSaveCollege={handleSaveCollege}
      />
    </div>
  );
}
