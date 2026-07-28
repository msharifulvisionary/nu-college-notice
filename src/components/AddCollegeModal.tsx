import React, { useState } from 'react';
import { X, Building2, PlayCircle, Plus, Check, AlertCircle } from 'lucide-react';
import { College } from '../types';

interface AddCollegeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCollege: (college: Omit<College, 'id' | 'created_at'>) => Promise<void>;
  onTestScrapeUrl: (url: string, selectorConfig: any) => Promise<any>;
}

export const AddCollegeModal: React.FC<AddCollegeModalProps> = ({
  isOpen,
  onClose,
  onAddCollege,
  onTestScrapeUrl,
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [noticeUrl, setNoticeUrl] = useState('');
  const [rowSelector, setRowSelector] = useState('table tbody tr');
  const [dateSelector, setDateSelector] = useState('td:nth-child(2)');
  const [titleSelector, setTitleSelector] = useState('td:nth-child(3)');
  const [linkSelector, setLinkSelector] = useState('td:nth-child(4) a');
  const [isActive, setIsActive] = useState(true);

  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyPreset = (preset: 'aalo' | 'generic') => {
    if (preset === 'aalo') {
      setRowSelector('table tbody tr');
      setDateSelector('td:nth-child(2)');
      setTitleSelector('td:nth-child(3)');
      setLinkSelector('td:nth-child(4) a');
    } else if (preset === 'generic') {
      setRowSelector('table tbody tr, .notice-item');
      setDateSelector('td:nth-child(2), .date');
      setTitleSelector('td:nth-child(3), .title');
      setLinkSelector('td:nth-child(4) a, a');
    }
  };

  const handleTestScrape = async () => {
    if (!noticeUrl) return;
    setIsTesting(true);
    setTestError(null);
    setTestResults(null);

    const config = {
      row_selector: rowSelector,
      date_selector: dateSelector,
      title_selector: titleSelector,
      link_selector: linkSelector,
    };

    try {
      const res = await onTestScrapeUrl(noticeUrl, config);
      if (res.success) {
        setTestResults(res.notices);
      } else {
        setTestError(res.error || 'স্ক্র্যাপ পরীক্ষায় সমস্যা দেখা দিয়েছে');
      }
    } catch (err: any) {
      setTestError(err.message || 'নেটওয়ার্ক ত্রুটি');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !noticeUrl) return;

    setIsSubmitting(true);
    try {
      await onAddCollege({
        name,
        notice_url: noticeUrl,
        selector_config: {
          row_selector: rowSelector,
          date_selector: dateSelector,
          title_selector: titleSelector,
          link_selector: linkSelector,
        },
        is_active: isActive,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-xl relative my-8">
        
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
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">নতুন কলেজ যোগ করুন</h3>
            <p className="text-xs text-slate-500">
              কলেজের নাম, নোটিশ বোর্ড URL এবং সিলেক্টর কনফিগারেশন দিন
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-700">দ্রুত প্রিপ্রেসেট (Quick Preset)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('aalo')}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium transition-all cursor-pointer"
            >
              "Aalo" Platform (Govt. Azizul Haque etc)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('generic')}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium transition-all cursor-pointer"
            >
              Generic HTML Table
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              কলেজের নাম *
            </label>
            <input
              type="text"
              required
              placeholder="যেমন: Govt. Titumir College, Dhaka"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              নোটিশ বোর্ড URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://www.ahcollege.gov.bd/notice"
              value={noticeUrl}
              onChange={(e) => setNoticeUrl(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Row Selector
              </label>
              <input
                type="text"
                required
                value={rowSelector}
                onChange={(e) => setRowSelector(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Title Selector
              </label>
              <input
                type="text"
                required
                value={titleSelector}
                onChange={(e) => setTitleSelector(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Link Selector
              </label>
              <input
                type="text"
                required
                value={linkSelector}
                onChange={(e) => setLinkSelector(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Date Selector
              </label>
              <input
                type="text"
                value={dateSelector}
                onChange={(e) => setDateSelector(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800"
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestScrape}
              disabled={!noticeUrl || isTesting}
              className="w-full py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              <span>{isTesting ? 'চেক করা হচ্ছে...' : 'লাইভ টেস্ট স্ক্র্যাপ (Dry Run)'}</span>
            </button>
          </div>

          {testError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{testError}</span>
            </div>
          )}

          {testResults && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-36 overflow-y-auto text-xs space-y-1.5">
              <p className="font-semibold text-emerald-700 flex items-center space-x-1">
                <Check className="w-4 h-4" />
                <span>সফলভাবে {testResults.length} টি নোটিশ পাওয়া গেছে</span>
              </p>
              {testResults.slice(0, 4).map((item: any, idx: number) => (
                <div key={idx} className="text-slate-700 truncate border-b border-slate-200/60 pb-1">
                  {idx + 1}. {item.title}
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              বাতিল
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !name || !noticeUrl}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? 'সেভ হচ্ছে...' : 'কলেজ সেভ করুন'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
