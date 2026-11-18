import React from 'react';
import { Bell, RefreshCw, Home, LogOut, ShieldCheck, Zap } from 'lucide-react';
import { SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  onRefreshStatus: () => void;
  isRefreshing: boolean;
  onGoToHome?: () => void;
  onLogout?: () => void;
  adminUser?: { username: string; role: string; name: string } | null;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onRefreshStatus,
  isRefreshing,
  onGoToHome,
  onLogout,
  adminUser,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-2">
          
          {/* Brand */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight font-sans">
                  এডমিন ড্যাশবোর্ড
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-100 text-emerald-800 rounded-full uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Multi-College Notice Tracker & Telegram Dispatcher
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-1.5 sm:space-x-3">
            
            {/* Go to Public Home */}
            {onGoToHome && (
              <button
                onClick={onGoToHome}
                className="inline-flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-all border border-slate-200 cursor-pointer"
                title="পাবলিক হোম পেজে যান"
              >
                <Home className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden xs:inline">হোম পেজ</span>
              </button>
            )}

            {/* Refresh Data from Supabase */}
            <button
              id="btn-refresh-supabase"
              onClick={onRefreshStatus}
              disabled={isRefreshing}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRefreshing ? 'লোড হচ্ছে...' : 'রিফ্রেশ করুন'}</span>
              <span className="sm:hidden">{isRefreshing ? '...' : 'রিফ্রেশ'}</span>
            </button>

            {/* Logout */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                title="লগআউট করুন"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};

