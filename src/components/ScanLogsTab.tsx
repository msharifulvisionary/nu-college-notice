import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { College, ScanLogEntry } from '../types';

interface ScanLogsTabProps {
  logs: ScanLogEntry[];
  collegesHealth: College[];
  isLoading: boolean;
  error: string | null;
  onRefreshLogs: () => void;
}

type LogFilterType = 'all' | 'auto' | 'errors' | 'manual_test';

function formatDhakaDateTime(iso: string | null | undefined): string {
  if (!iso) return 'এখনো চেক হয়নি';
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function getTriggerLabel(log: ScanLogEntry): string {
  const mode = log.result?.mode || 'normal';
  const trigger = log.result?.trigger;

  if (mode === 'test') return 'টেস্ট রান';
  if (mode === 'baseline') return 'বেসলাইন সিঙ্ক (২০টি)';
  if (trigger === 'cloudflare_cron') return 'Cloudflare Cron (২০ মি.)';
  if (trigger === 'external_cron') return 'External Cron (২০ মি.)';
  if (trigger === 'github_schedule') return 'GitHub Schedule';
  if (trigger === 'manual') return 'সব কলেজ ম্যানুয়াল স্ক্যান';
  return 'স্বয়ংক্রিয় স্ক্যান';
}

function formatDurationSeconds(ms?: number): string | null {
  if (typeof ms !== 'number' || ms <= 0) return null;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs} সেকেন্ড`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins} মি. ${rem} সে.` : `${mins} মিনিট`;
}

export const ScanLogsTab: React.FC<ScanLogsTabProps> = ({
  logs,
  collegesHealth,
  isLoading,
  error,
  onRefreshLogs,
}) => {
  const [filterType, setFilterType] = useState<LogFilterType>('all');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const downCollegesCount = useMemo(
    () => collegesHealth.filter((c) => c.last_status === 'error').length,
    [collegesHealth]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const mode = log.result?.mode || 'normal';
      const failedCount = log.result?.failed_colleges ?? 0;

      if (filterType === 'auto') {
        return mode === 'normal';
      }
      if (filterType === 'errors') {
        return log.status === 'error' || failedCount > 0;
      }
      if (filterType === 'manual_test') {
        return mode === 'test' || mode === 'baseline';
      }
      return true;
    });
  }, [logs, filterType]);

  return (
    <div className="space-y-6 mb-8">
      {/* Live College Website Health Table */}
      <section className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              কলেজ ওয়েবসাইট হেলথ মনিটরিং
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              মোট {collegesHealth.length}টি কলেজ · ডাউন বা ত্রুটিপূর্ণ: {downCollegesCount}টি
            </p>
          </div>

          <button
            type="button"
            onClick={onRefreshLogs}
            disabled={isLoading}
            className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'রিফ্রেশ হচ্ছে...' : 'লগ রিফ্রেশ করুন'}</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isLoading && collegesHealth.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
            <p className="text-xs font-medium">হেলথ তথ্য লোড হচ্ছে...</p>
          </div>
        ) : collegesHealth.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            এখনো কোনো কলেজ যুক্ত করা হয়নি।
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 pr-3">কলেজ</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">অবস্থা</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">সর্বশেষ চেক</th>
                  <th className="py-2.5 pl-3">ত্রুটি / বিবরণ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collegesHealth.map((college) => {
                  const status = college.last_status || 'unknown';
                  const failures = college.consecutive_failures || 0;
                  return (
                    <tr key={college.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{college.name}</div>
                        <a
                          href={college.notice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 text-[11px] text-emerald-700 hover:underline max-w-[260px] truncate"
                        >
                          <span className="truncate">{college.notice_url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {!college.is_active ? (
                          <span className="inline-flex items-center space-x-1 text-slate-500 font-medium">
                            <span>নিষ্ক্রিয়</span>
                          </span>
                        ) : status === 'ok' ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>স্বাভাবিক</span>
                          </span>
                        ) : status === 'error' ? (
                          <span className="inline-flex items-center space-x-1 text-rose-700 font-semibold tabular-nums">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>ডাউন / ত্রুটি ({failures} বার)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-slate-500 font-medium">
                            <Activity className="w-3.5 h-3.5 shrink-0" />
                            <span>অপেক্ষমাণ</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 tabular-nums">
                        {formatDhakaDateTime(college.last_checked_at)}
                      </td>
                      <td className="py-2.5 pl-3 text-slate-600 max-w-xs">
                        {status === 'error' && college.last_error ? (
                          <span className="text-rose-700 break-words">{college.last_error}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Scan History Logs Section */}
      <section className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              প্রতি ২০ মিনিটের স্ক্যান ও অ্যাক্টিভিটি হিস্ট্রি
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              সর্বশেষ {filteredLogs.length}টি রান দেখানো হচ্ছে (ক্লিক করলে কলেজভিত্তিক বিস্তারিত খুলবে)
            </p>
          </div>

          {/* Interactive Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
            {(
              [
                { id: 'all', label: 'সব রান' },
                { id: 'auto', label: 'অটো ও সব-স্ক্যান' },
                { id: 'errors', label: 'সমস্যাযুক্ত' },
                { id: 'manual_test', label: 'টেস্ট ও বেসলাইন' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  filterType === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && logs.length === 0 ? (
          <div className="py-10 text-center text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin mx-auto text-emerald-600 mb-2" />
            <p className="text-xs font-medium">স্ক্যান হিস্ট্রি লোড হচ্ছে...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-10 text-center text-slate-500">
            <Clock className="w-9 h-9 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">কোনো স্ক্যান লগ পাওয়া যায়নি</p>
            <p className="text-xs text-slate-400 mt-1">
              ফিল্টার পরিবর্তন করুন অথবা ২০ মিনিট পর পরবর্তী অটো স্ক্যানের জন্য অপেক্ষা করুন
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {filteredLogs.map((log) => {
              const mode = log.result?.mode || 'normal';
              const collegeResults = log.result?.college_results || [];
              const hasExpandableDetails =
                collegeResults.length > 0 ||
                Boolean(log.result?.error?.message) ||
                (log.result?.sample && log.result.sample.length > 0);
              const isExpanded = expandedRunId === log.id;
              const failedCount = log.result?.failed_colleges ?? 0;
              const durationText = formatDurationSeconds(log.result?.duration_ms);
              const hasPartialError = log.status === 'success' && failedCount > 0;

              return (
                <div key={log.id} className="bg-white">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRunId((prev) => (prev === log.id ? null : log.id))
                    }
                    className="w-full text-left px-4 py-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {log.status === 'error' ? (
                          <span className="inline-flex items-center space-x-1 font-bold text-rose-700">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>ব্যর্থ</span>
                          </span>
                        ) : hasPartialError ? (
                          <span className="inline-flex items-center space-x-1 font-bold text-amber-700">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>আংশিক ত্রুটি</span>
                          </span>
                        ) : log.status === 'success' ? (
                          <span className="inline-flex items-center space-x-1 font-bold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>সফল</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 font-bold text-sky-700">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>চলছে</span>
                          </span>
                        )}

                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-bold text-slate-900">{getTriggerLabel(log)}</span>

                        {log.college_name && (
                          <>
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-medium text-slate-700 truncate">
                              {log.college_name}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 tabular-nums">
                        <span>{formatDhakaDateTime(log.created_at)}</span>
                        {durationText && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>সময়: {durationText}</span>
                          </>
                        )}
                        {mode === 'normal' && log.status === 'success' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>মোট কলেজ: {log.result?.total_colleges ?? 0}টি</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-slate-700">
                              নতুন নোটিশ: {log.result?.new_notices ?? 0}টি
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>টেলিগ্রাম প্রেরিত: {log.result?.sent_count ?? 0}টি</span>
                            {failedCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-rose-700">
                                  সাইট ত্রুটি: {failedCount}টি
                                </span>
                              </>
                            )}
                          </>
                        )}
                        {mode === 'baseline' && log.status === 'success' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>সংরক্ষিত: {log.result?.saved_count ?? 0}টি নোটিশ</span>
                          </>
                        )}
                        {mode === 'test' && log.status === 'success' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>প্রাপ্ত নোটিশ: {log.result?.parsed_count ?? 0}টি</span>
                          </>
                        )}
                      </div>
                    </div>

                    {hasExpandableDetails && (
                      <span className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-600 shrink-0 self-start sm:self-center">
                        <span>{isExpanded ? 'সংক্ষিপ্ত করুন' : 'বিস্তারিত'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </button>

                  {/* Expanded Breakdown Panel */}
                  {isExpanded && hasExpandableDetails && (
                    <div className="px-4 pb-4 pt-2 bg-slate-50/70 border-t border-slate-100 space-y-3 text-xs">
                      {log.result?.error?.message && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                          <span className="font-bold">ত্রুটি: </span>
                          <span>{log.result.error.message}</span>
                          {log.result.error.status ? ` (HTTP ${log.result.error.status})` : ''}
                        </div>
                      )}

                      {collegeResults.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                                <th className="py-1.5 pr-3">কলেজের নাম</th>
                                <th className="py-1.5 px-2 whitespace-nowrap">অবস্থা</th>
                                <th className="py-1.5 px-2 whitespace-nowrap text-right">
                                  নতুন নোটিশ
                                </th>
                                <th className="py-1.5 px-2 whitespace-nowrap text-right">
                                  টেলিগ্রাম
                                </th>
                                <th className="py-1.5 pl-3">ত্রুটির বিবরণ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 tabular-nums">
                              {collegeResults.map((entry) => (
                                <tr key={entry.college_id}>
                                  <td className="py-2 pr-3 font-medium text-slate-800">
                                    {entry.college_name}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap">
                                    {entry.status === 'ok' ? (
                                      <span className="text-emerald-700 font-semibold">
                                        স্বাভাবিক
                                      </span>
                                    ) : (
                                      <span className="text-rose-700 font-semibold">
                                        ডাউন / ব্যর্থ
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-right font-semibold text-slate-800">
                                    {entry.new_notices}
                                  </td>
                                  <td className="py-2 px-2 text-right text-slate-700">
                                    {entry.sent_count}
                                  </td>
                                  <td className="py-2 pl-3 text-rose-700 break-words">
                                    {entry.error_message || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {log.result?.sample && log.result.sample.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-slate-500">
                            সংগৃহীত নমুনা নোটিশ:
                          </p>
                          <ul className="space-y-1 text-[11px] text-slate-700">
                            {log.result.sample.map((s, idx) => (
                              <li key={`${s.link}-${idx}`} className="flex items-center justify-between gap-2">
                                <a
                                  href={s.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-emerald-700 hover:underline truncate"
                                >
                                  {idx + 1}. {s.title}
                                </a>
                                {s.date && (
                                  <span className="text-slate-400 shrink-0 tabular-nums">
                                    {s.date}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
