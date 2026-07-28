import React from 'react';
import { X, CheckCircle2, AlertCircle, RefreshCw, Building2 } from 'lucide-react';
import { ScrapeAndNotifyResult } from '../types';

interface RunScrapeModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ScrapeAndNotifyResult | null;
  isLoading: boolean;
  error: string | null;
}

export const RunScrapeModal: React.FC<RunScrapeModalProps> = ({
  isOpen,
  onClose,
  result,
  isLoading,
  error,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl relative my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">ম্যানুয়াল টেস্ট চেকিং ఫలితం</h3>
            <p className="text-xs text-slate-500">
              কলেজের নোটিশ পেজ স্ক্যান করা এবং টেলিগ্রামে নতুন মেসেজ অ্যালার্ট পাঠানো
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-10 text-center space-y-3">
            <div className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-800">কলেজের নোটিশ পেজগুলো চেক করা হচ্ছে...</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="py-6">
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">স্ক্র্যাপিং ব্যর্থ হয়েছে</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Result State */}
        {result && !isLoading && (
          <div className="mt-4 space-y-4">
            
            {/* Top Summary Chips */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <p className="text-[10px] text-slate-500 font-semibold">চেককৃত কলেজ</p>
                <p className="text-base font-bold text-slate-900 mt-0.5">{result.total_active_colleges}</p>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <p className="text-[10px] text-emerald-700 font-semibold">নতুন নোটিশ</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">{result.new_notices_found}</p>
              </div>

              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-center">
                <p className="text-[10px] text-sky-700 font-semibold">টেলিগ্রাম সেন্ট</p>
                <p className="text-base font-bold text-sky-700 mt-0.5">{result.notifications_sent}</p>
              </div>
            </div>

            {/* Per College Logs */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center space-x-1">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>ফলাফল বিবরণী:</span>
              </h4>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {result.scraped_logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{log.college_name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        মোট নোটিশ: {log.scraped_count} | নতুন: <span className="font-bold text-emerald-600">{log.new_count}</span>
                      </p>
                    </div>

                    <div>
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>সফল</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          <span>ত্রুটি</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>

      </div>
    </div>
  );
};
