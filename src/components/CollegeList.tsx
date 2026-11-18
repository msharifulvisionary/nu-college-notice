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
  Zap,
  Activity,
  MessageSquare,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { AutomationStatusResponse, College, TestRunRecord } from '../types';

export interface CollegeTestUiState {
  isRunning: boolean;
  mode?: 'test' | 'baseline';
  run?: TestRunRecord | null;
  error?: string | null;
}

export interface ScanAllUiState {
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
  scanAllState: ScanAllUiState;
  automationStatus: AutomationStatusResponse | null;
  isLoadingAutomation: boolean;
  isTogglingAutomation: boolean;
  onToggleAutoScan: () => void;
  onScanAllColleges: () => void;
  onToggleActive: (college: College) => void;
  onEditCollege: (college: College) => void;
  onDeleteCollege: (college: College) => void;
  onOpenAddModal: () => void;
  onTestScrapeCollege: (college: College) => void;
  onSyncCollegeBaseline: (college: College) => void;
}

function formatCheckedTime(iso: string | null | undefined): string {
  if (!iso) return 'এখনো চেক হয়নি';
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export const CollegeList: React.FC<CollegeListProps> = ({
  colleges,
  isLoadingColleges,
  togglingId,
  deletingId,
  testStates,
  scanAllState,
  automationStatus,
  isLoadingAutomation,
  isTogglingAutomation,
  onToggleAutoScan,
  onScanAllColleges,
  onToggleActive,
  onEditCollege,
  onDeleteCollege,
  onOpenAddModal,
  onTestScrapeCollege,
  onSyncCollegeBaseline,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const autoScanEnabled = automationStatus?.auto_scan_enabled ?? true;

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">কলেজ নোটিশ বোর্ডসমূহ</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            সক্রিয় কলেজগুলোর ওয়েবসাইট প্রতি ২০ মিনিটে স্বয়ংক্রিয়ভাবে এবং নিচের বাটন থেকে তাৎক্ষণিক স্ক্যান করা যায়
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            type="button"
            onClick={onScanAllColleges}
            disabled={scanAllState.isRunning || colleges.filter((c) => c.is_active).length === 0}
            className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {scanAllState.isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            <span>{scanAllState.isRunning ? 'সব কলেজ স্ক্যান হচ্ছে...' : 'সব কলেজ এখনই স্ক্যান করুন'}</span>
          </button>

          <button
            id="btn-add-new-college"
            onClick={onOpenAddModal}
            className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন কলেজ যোগ করুন</span>
          </button>
        </div>
      </div>

      {/* 20-Minute Cloudflare Cron & Auto-Scan Control Strip */}
      <div className="mt-3.5 p-3 sm:px-4 sm:py-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
              autoScanEnabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-bold text-slate-900">
                অটো স্ক্যানিং: {autoScanEnabled ? 'চালু' : 'বন্ধ'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-[11px] font-medium text-slate-600 tabular-nums">
                প্রতি {automationStatus?.interval_minutes ?? 20} মিনিটে (Cloudflare Cron)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums truncate">
              {isLoadingAutomation && !automationStatus
                ? 'অটো স্ক্যানের অবস্থা যাচাই করা হচ্ছে...'
                : `সর্বশেষ অটো স্ক্যান: ${formatCheckedTime(automationStatus?.last_auto_scan_at)}${
                    automationStatus?.last_auto_scan_message
                      ? ` · ${automationStatus.last_auto_scan_message}`
                      : ''
                  }`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleAutoScan}
          disabled={isTogglingAutomation || !automationStatus}
          className={`inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-50 ${
            autoScanEnabled
              ? 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200 hover:border-rose-200'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
          }`}
        >
          {isTogglingAutomation ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Power className="w-3.5 h-3.5" />
          )}
          <span>{autoScanEnabled ? 'অটো স্ক্যান বন্ধ করুন' : 'অটো স্ক্যান চালু করুন'}</span>
        </button>
      </div>

      {/* Scan All Output Banner */}
      {(scanAllState.isRunning || scanAllState.run || scanAllState.error) && (
        <div className="mt-4 p-3.5 rounded-xl border bg-slate-50 border-slate-200 text-xs">
          {scanAllState.isRunning && (
            <div className="flex items-center space-x-2 text-sky-700 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>
                সব সক্রিয় কলেজের নোটিশ স্ক্যান চলছে... সম্পন্ন হলে নতুন নোটিশ টেলিগ্রামে পাঠানো হবে (সর্বোচ্চ ২-৩ মিনিট লাগতে পারে)।
              </span>
            </div>
          )}

          {!scanAllState.isRunning && scanAllState.error && (
            <div className="flex items-start space-x-2 text-rose-700 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{scanAllState.error}</span>
            </div>
          )}

          {!scanAllState.isRunning && scanAllState.run?.status === 'error' && (
            <div className="flex items-start space-x-2 text-rose-700 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>
                স্ক্যান করতে সমস্যা হয়েছে: {scanAllState.run.result?.error?.message || 'অজানা ত্রুটি'}
              </span>
            </div>
          )}

          {!scanAllState.isRunning && scanAllState.run?.status === 'success' && (
            <div className="flex flex-wrap items-center gap-3 text-emerald-800 font-semibold">
              <span className="inline-flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>সব কলেজ স্ক্যান সম্পন্ন হয়েছে!</span>
              </span>
              <span className="bg-white border border-emerald-200 px-2.5 py-0.5 rounded-md text-[11px]">
                মোট কলেজ: {scanAllState.run.result?.total_colleges ?? 0} টি
              </span>
              <span className="bg-white border border-emerald-200 px-2.5 py-0.5 rounded-md text-[11px]">
                নতুন নোটিশ: {scanAllState.run.result?.new_notices ?? 0} টি
              </span>
              <span className="bg-white border border-sky-200 text-sky-800 px-2.5 py-0.5 rounded-md text-[11px]">
                টেলিগ্রাম পাঠানো হয়েছে: {scanAllState.run.result?.sent_count ?? 0} টি
              </span>
              {(scanAllState.run.result?.failed_colleges ?? 0) > 0 && (
                <span className="bg-rose-50 border border-rose-200 text-rose-800 px-2.5 py-0.5 rounded-md text-[11px]">
                  ব্যর্থ কলেজ: {scanAllState.run.result?.failed_colleges} টি
                </span>
              )}
            </div>
          )}
        </div>
      )}

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
            const runMode = testState?.mode || testState?.run?.result?.mode || 'test';
            const isBaselineMode = runMode === 'baseline';
            const testRun = testState?.run;
            const testError = testState?.error;
            const isDeleting = deletingId === college.id;
            const isToggling = togglingId === college.id;
            const isConfirmingDelete = confirmDeleteId === college.id;

            const healthStatus = college.last_status || 'unknown';
            const failureCount = college.consecutive_failures || 0;

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

                  {/* Health Status & Custom Telegram Routing Info */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {healthStatus === 'ok' ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                        <Activity className="w-3 h-3" />
                        <span>স্বাভাবিক</span>
                      </span>
                    ) : healthStatus === 'error' ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                        <AlertCircle className="w-3 h-3" />
                        <span>সমস্যা ({failureCount} বার ব্যর্থ)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                        <Activity className="w-3 h-3" />
                        <span>এখনো স্ক্যান হয়নি</span>
                      </span>
                    )}

                    <span className="text-[10px] text-slate-500 tabular-nums">
                      সর্বশেষ চেক: {formatCheckedTime(college.last_checked_at)}
                    </span>

                    {(college.telegram_chat_id || college.telegram_thread_id) && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                        <MessageSquare className="w-3 h-3" />
                        <span>
                          কাস্টম চ্যাট
                          {college.telegram_thread_id ? ` (টপিক #${college.telegram_thread_id})` : ''}
                        </span>
                      </span>
                    )}
                  </div>

                  {healthStatus === 'error' && college.last_error && (
                    <p className="mt-1.5 text-[11px] text-rose-700 bg-rose-50/80 border border-rose-200 rounded-lg px-2.5 py-1.5 line-clamp-2">
                      এরর: {college.last_error}
                    </p>
                  )}
                </div>

                {/* Action Toolbar */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => onTestScrapeCollege(college)}
                      disabled={isTestRunning}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isTestRunning && !isBaselineMode ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <PlayCircle className="w-3.5 h-3.5" />
                      )}
                      <span>{isTestRunning && !isBaselineMode ? 'চলছে...' : 'টেস্ট রান'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSyncCollegeBaseline(college)}
                      disabled={isTestRunning}
                      title="সর্বশেষ ২০টি নোটিশ সাথে সাথে ডাটাবেজে সেভ করুন"
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isTestRunning && isBaselineMode ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{isTestRunning && isBaselineMode ? 'সিঙ্ক হচ্ছে...' : 'সিঙ্ক (২০টি)'}</span>
                    </button>
                  </div>

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

                {/* Test / Baseline Run Output Panel */}
                {(isTestRunning || testRun || testError) && (
                  <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-2">
                    {isTestRunning && (
                      <div className="flex items-center space-x-2 text-sky-700 font-semibold">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>
                          {isBaselineMode
                            ? 'সর্বশেষ ২০টি নোটিশ ডাটাবেজে সংরক্ষণ করা হচ্ছে... (সর্বোচ্চ ৩ মিনিট লাগতে পারে)'
                            : 'চলছে... GitHub Actions-এ স্ক্র্যাপার রান হচ্ছে (সর্বোচ্চ ৩ মিনিট লাগতে পারে)'}
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
                          <p className="font-bold">
                            {isBaselineMode ? 'বেসলাইন সিঙ্ক ব্যর্থ হয়েছে' : 'টেস্ট রান ব্যর্থ হয়েছে'}
                          </p>
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
                        <div className="flex items-center justify-between gap-2 text-emerald-700 font-bold tabular-nums">
                          <span className="flex items-center space-x-1.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>
                              {isBaselineMode
                                ? `বেসলাইন সিঙ্ক সম্পন্ন! ${testRun.result?.saved_count ?? 0} টি নোটিশ ডাটাবেজে সংরক্ষিত হয়েছে (মোট প্রাপ্ত: ${testRun.result?.parsed_count ?? 0} টি)`
                                : `সফল! মোট ${testRun.result?.parsed_count ?? 0} টি নোটিশ পাওয়া গেছে`}
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
                            কোনো নোটিশ পাওয়া যায়নি। ওয়েবসাইটের কাঠামো যাচাই করুন।
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
