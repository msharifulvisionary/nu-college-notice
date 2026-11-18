import React, { useState, useEffect } from 'react';
import { X, Building2, Save, AlertCircle, MessageSquare } from 'lucide-react';
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
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramThreadId, setTelegramThreadId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    if (editingCollege) {
      setName(editingCollege.name);
      setNoticeUrl(editingCollege.notice_url);
      setTelegramChatId(editingCollege.telegram_chat_id || '');
      setTelegramThreadId(
        editingCollege.telegram_thread_id ? String(editingCollege.telegram_thread_id) : ''
      );
      setIsActive(Boolean(editingCollege.is_active));
    } else {
      setName('');
      setNoticeUrl('');
      setTelegramChatId('');
      setTelegramThreadId('');
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

    let parsedThread: number | null = null;
    if (telegramThreadId.trim()) {
      const num = Number(telegramThreadId.trim());
      if (!Number.isInteger(num) || num <= 0) {
        setSubmitError('Topic / Thread ID অবশ্যই একটি ধনাত্মক সংখ্যা হতে হবে।');
        return;
      }
      parsedThread = num;
    }

    setIsSubmitting(true);
    try {
      await onSaveCollege(
        {
          name: name.trim(),
          notice_url: noticeUrl.trim(),
          selector_config: editingCollege?.selector_config || DEFAULT_SELECTOR_CONFIG,
          is_active: isActive,
          telegram_chat_id: telegramChatId.trim() || null,
          telegram_thread_id: parsedThread,
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
              কলেজের নাম, নোটিশ বোর্ডের URL এবং চাইলে আলাদা টেলিগ্রাম চ্যানেল দিন
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

          {/* Per-college Telegram Routing (Optional) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
              <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
              <span>আলাদা টেলিগ্রাম চ্যানেল / টপিক (ঐচ্ছিক)</span>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              ফাঁকা রাখলে মূল/ডিফল্ট টেলিগ্রাম চ্যাটেই এই কলেজের নোটিশ যাবে।
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  কাস্টম Chat ID / @username
                </label>
                <input
                  type="text"
                  placeholder="যেমন: -1001234567890"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Topic / Thread ID (সুপারগ্রুপ)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="যেমন: 42"
                  value={telegramThreadId}
                  onChange={(e) => setTelegramThreadId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
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
