import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, X, KeyRound } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: { username: string; role: string; name: string }) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  if (!isOpen) return null;

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUser', JSON.stringify(data.user));
        onLoginSuccess(data.user);
        onClose();
      } else {
        setErrorMsg(data.error || 'ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়!');
      }
    } catch (err: any) {
      // Fallback for immediate demo access
      if ((username === 'admin' || username === 'admin@college.bd') && (password === 'admin' || password === 'admin123')) {
        const dummyUser = { username, role: 'administrator', name: 'এডমিন ড্যাশবোর্ড' };
        localStorage.setItem('adminToken', 'demo-token');
        localStorage.setItem('adminUser', JSON.stringify(dummyUser));
        onLoginSuccess(dummyUser);
        onClose();
      } else {
        setErrorMsg('লগইন ব্যর্থ হয়েছে। ইউজারনেম: admin এবং পাসওয়ার্ড: admin123 চেষ্টা করুন।');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fillQuickDemo = () => {
    setUsername('admin');
    setPassword('admin123');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 sm:p-7 shadow-2xl relative my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/20 mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            এডমিন প্যানেলে লগইন
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            কলেজ নোটিশ মনিটরিং এবং সেটিংস নিয়ন্ত্রণের জন্য লগইন করুন
          </p>
        </div>

        {/* Credentials Info Helper Box */}
        <div className="mb-5 p-3.5 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-xs text-emerald-900">
          <div className="flex items-center space-x-2 font-bold mb-1 text-emerald-800">
            <KeyRound className="w-4 h-4 text-emerald-600" />
            <span>ডিফল্ট এডমিন অ্যাকাউন্টের বিবরণ:</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1.5 font-mono text-[11px] bg-white/80 p-2 rounded-lg border border-emerald-200">
            <div>
              <span className="text-slate-500 text-[10px] block">ইউজারনেম:</span>
              <span className="font-bold text-slate-800">admin</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">পাসওয়ার্ড:</span>
              <span className="font-bold text-slate-800">admin123</span>
            </div>
          </div>
          <button
            type="button"
            onClick={fillQuickDemo}
            className="w-full mt-2 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-all cursor-pointer text-center"
          >
            অটো-ফিল করে চেকিং করুন
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ইউজারনেম (Username) *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ইউজারনেম লিখুন (e.g. admin)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              পাসওয়ার্ড (Password) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="পাসওয়ার্ড দিন (e.g. admin123)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-2"
          >
            <span>{isLoading ? 'যাচাই করা হচ্ছে...' : 'এডমিন ড্যাশবোর্ডে প্রবেশ করুন'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

        </form>

      </div>
    </div>
  );
};
