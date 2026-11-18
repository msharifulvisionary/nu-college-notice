import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, X, ArrowLeft } from 'lucide-react';
import { signInAdmin } from '../lib/supabase';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
  variant?: 'modal' | 'page';
  initialMessage?: string | null;
  onBackToHome?: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  variant = 'modal',
  initialMessage = null,
  onBackToHome,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialMessage);

  if (variant === 'modal' && !isOpen) return null;

  const displayError = errorMsg ?? initialMessage;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await signInAdmin(email, password);
      onLoginSuccess();
      if (variant === 'modal') {
        onClose();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'ভুল ইমেইল অথবা পাসওয়ার্ড! সঠিক তথ্য দিয়ে চেষ্টা করুন।';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const card = (
    <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 sm:p-7 shadow-2xl relative">
      {variant === 'modal' && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="বন্ধ করুন"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/20 mb-3">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          এডমিন প্যানেলে লগইন
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          অনুমোদিত এডমিন ইমেইল ও পাসওয়ার্ড দিয়ে প্রবেশ করুন
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            এডমিন ইমেইল *
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            পাসওয়ার্ড *
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="পাসওয়ার্ড লিখুন"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              aria-label="পাসওয়ার্ড দেখান বা লুকান"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {displayError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{displayError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !email.trim() || !password}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-2"
        >
          <span>{isLoading ? 'যাচাই করা হচ্ছে...' : 'লগইন করুন'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {variant === 'page' && onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>পাবলিক নোটিশ বোর্ডে ফিরে যান</span>
          </button>
        )}
      </form>
    </div>
  );

  if (variant === 'page') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased">
        {card}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="my-auto w-full max-w-md">{card}</div>
    </div>
  );
};
