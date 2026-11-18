import React, { useState } from 'react';
import {
  Building2,
  ExternalLink,
  Power,
  Trash2,
  Plus,
  PlayCircle,
  Pencil,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { College, TestRunRecord } from '../types';

export interface CollegeTestUiState {
  isRunning: boolean;
  run?: TestRunRecord | null;
  error?: string | null;
}

interface CollegeListProps {
  colleges: College[];
  isLoadingColleges: boolean;
  togglingId: string | null;
  deletingId: string | null;
  testStates: Record<string, CollegeTestUiState>;
  onToggleActive: (college: College) => void;
  onEditCollege: (college: College) => void;
  onDeleteCollege: (college: College) => void;
  onOpenAddModal: () => void;
  onTestScrapeCollege: (college: College) => void;
}

export const CollegeList: React.FC<CollegeListProps> = ({
  colleges,
  isLoadingColleges,
  togglingId,
  deletingId,
  testStates,
  onToggleActive,
  onEditCollege,
  onDeleteCollege,
  onOpenAddModal,
  onTestScrapeCollege,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">কলেজ নোটিশ বোর্ডসমূহ</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            সক্রিয় রাখা কলেজগুলোর নোটিশ বোর্ড প্রতি ২০ মিনিটে স্বয়ংক্রিয়ভাবে চেক করা হবে
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
      {isLoadingColleges && colleges.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Loader2 className="w-8 h-8 mx-auto text-emerald-600 animate-spin mb-2" />
          <p className="text-xs font-semibold text-slate-600">কলেজ তালিকা লোড হচ্ছে...</p>
        </div>
      ) : colleges.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">কোনো কলেজ যুক্ত করা নেই</p>
          <p className="text-xs text-slate-400 mt-1">নতুন কলেজ যোগ করতে উপরের বাটনে ক্লিক করুন</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 mt-4">
          {colleges.map((college) => {
            const testState = testStates[college.id];
            const isTestRunning = Boolean(testState?.isRunning);
            const testRun = testState?.run;
            const testError = testState?.error;
            const isDeleting = deletingId === college.id;
            const isToggling = togglingId === college.id;
            const isConfirmingDelete = confirmDeleteId === college.id;

            return (
              <div
                key={college.id}
                className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  college.is_active
                    ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/40 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            college.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {college.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${
                            college.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {college.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                        </span>
                      </div>

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

                    {/* Active Status Toggle */}
                    <button
                      onClick={() => onToggleActive(college)}
                      disabled={isToggling}
                      title={college.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                      className={`p-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50 ${
                        college.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Power className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Selector badge */}
                  <div className="mt-2.5">
                    <span className="font-mono text-[10px] sm:text-[11px] text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded inline-block truncate max-w-full">
                      row: {college.selector_config?.row_selector || college.selector_config?.item || 'table tbody tr'}
                    </span>
                  </div>
                </div>

                {/* Action Toolbar */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => onTestScrapeCollege(college)}
                    disabled={isTestRunning}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isTestRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5" />
                    )}
                    <span>{isTestRunning ? 'চলছে...' : 'টেস্ট রান'}</span>
                  </button>

                  {isConfirmingDelete ? (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] font-semibold text-rose-700">মুছে ফেলবেন?</span>
                      <button
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onDeleteCollege(college);
                        }}
                        disabled={isDeleting}
                        className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        {isDeleting ? 'মুছছে...' : 'হ্যাঁ'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        className="px-2 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer"
                      >
                        না
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => onEditCollege(college)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>এডিট</span>
                      </button>

                      <button
                        onClick={() => setConfirmDeleteId(college.id)}
                        disabled={isDeleting}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>মুছুন</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Test Run Output Panel */}
                {(isTestRunning || testRun || testError) && (
                  <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-2">
                    {isTestRunning && (
                      <div className="flex items-center space-x-2 text-sky-700 font-semibold">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>
                          চলছে... GitHub Actions-এ স্ক্র্যাপার রান হচ্ছে (সর্বোচ্চ ২ মিনিট লাগতে পারে)
                        </span>
                      </div>
                    )}

                    {!isTestRunning && testError && (
                      <div className="flex items-start space-x-2 text-rose-700 font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <span>{testError}</span>
                      </div>
                    )}

                    {!isTestRunning && testRun?.status === 'error' && (
                      <div className="flex items-start space-x-2 text-rose-700">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div className="space-y-0.5">
                          <p className="font-bold">টেস্ট রান ব্যর্থ হয়েছে</p>
                          <p className="text-[11px] text-rose-800 break-all">
                            {testRun.result?.error?.message || 'অজানা ত্রুটি ঘটেছে।'}
                            {testRun.result?.error?.status
                              ? ` (HTTP ${testRun.result.error.status})`
                              : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    {!isTestRunning && testRun?.status === 'success' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-emerald-700 font-bold">
                          <span className="flex items-center space-x-1.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>
                              সফল! মোট {testRun.result?.parsed_count ?? 0} টি নোটিশ পাওয়া গেছে
                            </span>
                          </span>
                        </div>

                        {testRun.result?.sample && testRun.result.sample.length > 0 ? (
                          <div className="space-y-1.5 pt-1 border-t border-slate-100">
                            <p className="text-[11px] font-semibold text-slate-500">
                              শীর্ষ {testRun.result.sample.length} টি নোটিশ (নমুনা):
                            </p>
                            <ul className="space-y-1.5">
                              {testRun.result.sample.map((item, idx) => (
                                <li
                                  key={`${item.link}-${idx}`}
                                  className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px]"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <a
                                      href={item.link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-semibold text-slate-800 hover:text-emerald-700 hover:underline line-clamp-2"
                                    >
                                      {item.title}
                                    </a>
                                    {item.date && (
                                      <span className="inline-flex items-center space-x-1 text-[10px] text-slate-500 shrink-0">
                                        <Calendar className="w-3 h-3" />
                                        <span>{item.date}</span>
                                      </span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                            কোনো নোটিশ সিলেক্টরের সাথে ম্যাচ করেনি। selector_config যাচাই করুন।
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
