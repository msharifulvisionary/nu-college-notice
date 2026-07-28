import React from 'react';
import { Building2, ExternalLink, Power, Trash2, Plus, PlayCircle } from 'lucide-react';
import { College } from '../types';

interface CollegeListProps {
  colleges: College[];
  onToggleActive: (id: string, currentStatus: boolean) => void;
  onDeleteCollege: (id: string) => void;
  onOpenAddModal: () => void;
  onTestScrapeCollege: (college: College) => void;
}

export const CollegeList: React.FC<CollegeListProps> = ({
  colleges,
  onToggleActive,
  onDeleteCollege,
  onOpenAddModal,
  onTestScrapeCollege,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">কলেজ নোটিশ বোর্ডসমূহ</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            সক্রিয় রাখা কলেজগুলোর নোটিশ বোর্ড স্বয়ংক্রিয়ভাবে নির্দিষ্ট সময় পর পর চেক করা হবে
          </p>
        </div>

        <button
          id="btn-add-new-college"
          onClick={onOpenAddModal}
          className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>নতুন কলেজ যোগ করুন</span>
        </button>
      </div>

      {/* College List Grid */}
      {colleges.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">কোনো কলেজ যুক্ত করা নেই</p>
          <p className="text-xs text-slate-400 mt-1">নতুন কলেজ যোগ করতে উপরের বাটনে ক্লিক করুন</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mt-4">
          {colleges.map((college) => (
            <div
              key={college.id}
              className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                college.is_active
                  ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                  : 'bg-slate-50/30 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        college.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{college.name}</h3>
                  </div>

                  {/* URL */}
                  <a
                    href={college.notice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 text-xs text-emerald-600 hover:text-emerald-700 hover:underline mt-1.5 truncate max-w-full font-medium"
                  >
                    <span className="truncate">{college.notice_url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>

                {/* Status Toggle Button */}
                <button
                  onClick={() => onToggleActive(college.id, college.is_active)}
                  title={college.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                  className={`p-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                    college.is_active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-xs text-slate-500 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] sm:text-[11px] text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded truncate max-w-[150px] sm:max-w-none">
                  {college.selector_config?.row_selector || 'table tbody tr'}
                </span>

                <div className="flex items-center space-x-2.5 shrink-0">
                  <button
                    onClick={() => onTestScrapeCollege(college)}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors cursor-pointer"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>টেস্ট রান</span>
                  </button>

                  <button
                    onClick={() => onDeleteCollege(college.id)}
                    className="text-rose-600 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                    title="মুছে ফেলুন"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
