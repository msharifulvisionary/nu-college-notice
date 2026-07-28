import React from 'react';
import { Building2, Send, Layers, Clock } from 'lucide-react';
import { College, Notice } from '../types';

interface StatsCardsProps {
  colleges: College[];
  notices: Notice[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ colleges, notices }) => {
  const activeCollegesCount = colleges.filter((c) => c.is_active).length;
  const totalNoticesCount = notices.length;
  const notifiedCount = notices.filter((n) => n.notified).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      
      {/* Total Active Colleges */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-500">মোট কলেজ</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{activeCollegesCount} <span className="text-[10px] sm:text-xs text-slate-400 font-normal">/ {colleges.length}</span></p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Total Notices */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-500">ডিটেক্টকৃত নোটিশ</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{totalNoticesCount} <span className="text-[10px] sm:text-xs text-slate-400 font-normal">টি</span></p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Dispatched Alerts */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-500">টেলিগ্রাম প্রেরিত</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">{notifiedCount} <span className="text-[10px] sm:text-xs text-slate-400 font-normal">টি</span></p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-500">চেকিং ইন্টারভাল</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">২০ মি. <span className="text-[10px] sm:text-xs text-slate-400 font-normal">পর পর</span></p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

    </div>
  );
};
