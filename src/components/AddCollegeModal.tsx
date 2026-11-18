import React, { useState, useEffect } from 'react';
import { X, Building2, Save, AlertCircle } from 'lucide-react';
import { College, CollegePayload } from '../types';

interface AddCollegeModalProps {
  isOpen: boolean;
  editingCollege: College | null;
  onClose: () => void;
  onSaveCollege: (payload: CollegePayload, collegeId?: string) => Promise<void>;
}

const DEFAULT_SELECTOR_CONFIG = {
  row_selector: 'table tbody tr',
  date_selector: 'td:nth-child(2)',
  title_selector: 'td:nth-child(3)',
  link_selector: 'td:nth-child(4) a, a',
};

export const AddCollegeModal: React.FC<AddCollegeModalProps> = ({
  isOpen,
  editingCollege,
  onClose,
  onSaveCollege,
}) => {
  const [name, setName] = useState('');
  const [noticeUrl, setNoticeUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    if (editingCollege) {
      setName(editingCollege.name);
      setNoticeUrl(editingCollege.notice_url);
      setIsActive(Boolean(editingCollege.is_active));
    } else {
      setName('');
      setNoticeUrl('');
      setIsActive(true);
    }
  }, [isOpen, editingCollege]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim() || !noticeUrl.trim()) {
      setSubmitError('কলেজের নাম এবং নোটিশ বোর্ড URL অবশ্যই দিতে হবে।');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveCollege(
        {
          name: name.trim(),
          notice_url: noticeUrl.trim(),
          selector_config: editingCollege?.selector_config || DEFAULT_SELECTOR_CONFIG,
          is_active: isActive,
        },
        editingCollege?.id
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'কলেজ সেভ করতে সমস্যা হয়েছে।';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = Boolean(editingCollege);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="বন্ধ করুন"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? 'কলেজের তথ্য এডিট করুন' : 'নতুন কলেজ যোগ করুন'}
            </h3>
            <p className="text-xs text-slate-500">
              কলেজের নাম এবং অফিশিয়াল নোটিশ বোর্ডের URL দিন
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
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
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <label className="flex items-center space-x-2.5 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-semibold text-slate-700">
              সক্রিয় রাখুন (সক্রিয় থাকলে স্ক্র্যাপার প্রতি ২০ মিনিটে নোটিশ চেক করবে)
            </span>
          </label>

          {submitError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

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
              disabled={isSubmitting || !name.trim() || !noticeUrl.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? 'সেভ হচ্ছে...'
                  : isEditing
                  ? 'পরিবর্তন সেভ করুন'
                  : 'কলেজ সেভ করুন'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
