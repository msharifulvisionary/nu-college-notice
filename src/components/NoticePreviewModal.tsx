import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  Globe,
  Loader2,
  AlertCircle,
  Info,
  Send,
  Check,
} from 'lucide-react';
import {
  Notice,
  NoticePreviewAttachment,
  NoticePreviewResponse,
} from '../types';
import { formatCleanNoticeDate } from '../lib/dateSort';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface NoticePreviewModalProps {
  notice: Notice | null;
  onClose: () => void;
  mode?: 'public' | 'admin';
}

const PDF_FALLBACK_LABELS = {
  loading: 'পিডিএফ লোড হচ্ছে...',
  failed: 'ইনলাইন পিডিএফ লোড করা যায়নি। নিচের বাটন থেকে সরাসরি খুলুন বা ডাউনলোড করুন।',
};

interface PdfCanvasViewerProps {
  src: string;
  originalUrl: string;
  downloadUrl: string;
  filename: string;
  zoom: number;
}

const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  src,
  originalUrl,
  downloadUrl,
  filename,
  zoom,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderFailed, setRenderFailed] = useState<boolean>(false);
  const [useIframeFallback, setUseIframeFallback] = useState<boolean>(false);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 390
  );

  // স্ক্রিন রিসাইজ বা ফোন রোটেশন অনুযায়ী প্রস্থ আপডেট
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const nextWidth = el.clientWidth || window.innerWidth;
      if (nextWidth > 0) {
        setContainerWidth((prev) => (Math.abs(prev - nextWidth) > 8 ? nextWidth : prev));
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    const renderTasks: Array<{ cancel: () => void }> = [];

    const loadAndRenderPdf = async () => {
      const hostEl = containerRef.current;
      if (!hostEl) return;

      setIsLoading(true);
      setRenderFailed(false);
      setUseIframeFallback(false);
      setNumPages(0);
      hostEl.innerHTML = '';

      try {
        loadingTask = pdfjsLib.getDocument({
          url: src,
          withCredentials: false,
        });
        const pdfDocument = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy().catch(() => {});
          return;
        }

        const totalPages = pdfDocument.numPages;
        setNumPages(totalPages);

        const targetCssWidth = Math.max(280, containerWidth) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        // প্রথম পেজ থেকে ক্রমানুসারে রেন্ডার করা হচ্ছে যাতে সাথে সাথে দেখা যায়
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
          if (cancelled) break;

          const page = await pdfDocument.getPage(pageNumber);
          if (cancelled) break;

          const baseViewport = page.getViewport({ scale: 1 });
          const cssScale = targetCssWidth / baseViewport.width;
          const renderViewport = page.getViewport({ scale: cssScale * dpr });

          const pageWrapper = document.createElement('div');
          pageWrapper.className =
            'min-w-full w-fit bg-white border-b border-slate-300 last:border-b-0 flex justify-center';

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(renderViewport.width));
          canvas.height = Math.max(1, Math.floor(renderViewport.height));
          canvas.style.width = `${targetCssWidth}px`;
          canvas.style.height = `${Math.floor(renderViewport.height / dpr)}px`;
          canvas.style.display = 'block';
          canvas.style.maxWidth = zoom <= 1 ? '100%' : 'none';

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          pageWrapper.appendChild(canvas);
          hostEl.appendChild(pageWrapper);

          const task = page.render({
            canvasContext: ctx,
            canvas,
            viewport: renderViewport,
          });
          renderTasks.push(task);

          await task.promise;
          if (pageNumber === 1 && !cancelled) {
            setIsLoading(false);
          }
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'RenderingCancelledException') return;

        setIsLoading(false);
        setUseIframeFallback(true);
        setRenderFailed(true);
      }
    };

    loadAndRenderPdf();

    return () => {
      cancelled = true;
      for (const task of renderTasks) {
        try {
          task.cancel();
        } catch {
          // ignore
        }
      }
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [src, zoom, containerWidth]);

  if (useIframeFallback) {
    return (
      <div className="w-full h-full flex flex-col bg-slate-950">
        <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <span>
            {renderFailed
              ? 'ব্রাউজার বিল্ট-ইন ভিউয়ারে পিডিএফ দেখানো হচ্ছে'
              : PDF_FALLBACK_LABELS.failed}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              download={filename}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ডাউনলোড</span>
            </a>
            <a
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold whitespace-nowrap"
            >
              <span>সরাসরি খুলুন</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
        <iframe
          src={src}
          title={filename}
          className="flex-1 w-full h-full border-0 bg-white block"
        />
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-full bg-slate-950">
      {isLoading && (
        <div className="sticky top-0 z-10 flex items-center justify-center gap-2 bg-slate-900/90 border-b border-slate-800 py-2.5 px-3 text-xs text-emerald-300 font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{PDF_FALLBACK_LABELS.loading}</span>
        </div>
      )}

      {/* Edge-to-edge zero-padding PDF pages container */}
      <div ref={containerRef} className="w-full p-0 m-0 flex flex-col items-start sm:items-center" />

      {numPages > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-slate-900/85 backdrop-blur-md border border-slate-700/80 text-[11px] font-bold text-slate-100 shadow-lg tabular-nums">
            মোট {numPages} পৃষ্ঠা · {Math.round(zoom * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};

function buildDirectClientFallback(notice: Notice): NoticePreviewResponse {
  const lower = notice.link.toLowerCase();
  const isPdf = /\.pdf(\?|#|$)/i.test(lower) || lower.includes('drive.google.com');
  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)(\?|#|$)/i.test(lower);

  if (isPdf) {
    return {
      kind: 'pdf',
      originalUrl: notice.link,
      finalUrl: notice.link,
      pageTitle: notice.title,
      textExcerpt: null,
      attachments: [
        {
          kind: 'pdf',
          url: notice.link,
          filename: 'notice.pdf',
          previewUrl: notice.link,
          downloadUrl: notice.link,
        },
      ],
    };
  }

  if (isImage) {
    return {
      kind: 'image',
      originalUrl: notice.link,
      finalUrl: notice.link,
      pageTitle: notice.title,
      textExcerpt: null,
      attachments: [
        {
          kind: 'image',
          url: notice.link,
          filename: 'notice.jpg',
          previewUrl: notice.link,
          downloadUrl: notice.link,
        },
      ],
    };
  }

  return {
    kind: 'webpage',
    originalUrl: notice.link,
    finalUrl: notice.link,
    pageTitle: notice.title,
    textExcerpt: null,
    attachments: [],
  };
}

export const NoticePreviewModal: React.FC<NoticePreviewModalProps> = ({
  notice,
  onClose,
  mode = 'public',
}) => {
  const [previewData, setPreviewData] = useState<NoticePreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [imgSrcOverride, setImgSrcOverride] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [showAdminDrawer, setShowAdminDrawer] = useState<boolean>(false);
  const [copiedTelegram, setCopiedTelegram] = useState<boolean>(false);
  const [showWebpageIframe, setShowWebpageIframe] = useState<boolean>(false);

  // Escape কী এবং স্ক্রল লক হ্যান্ডলিং
  useEffect(() => {
    if (!notice) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [notice, onClose]);

  // নোটিশের PDF/ছবি ডিটেক্ট করা
  useEffect(() => {
    if (!notice) {
      setPreviewData(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setActiveIndex(0);
    setZoom(1);
    setImgSrcOverride(null);
    setImgFailed(false);
    setShowAdminDrawer(false);
    setCopiedTelegram(false);
    setShowWebpageIframe(false);

    const fetchPreview = async () => {
      try {
        const endpoint = `/api/notice-preview?url=${encodeURIComponent(
          notice.link
        )}&title=${encodeURIComponent(notice.title)}`;
        const res = await fetch(endpoint);
        const contentType = (res.headers.get('content-type') || '').toLowerCase();

        if (!res.ok || !contentType.includes('application/json')) {
          if (!cancelled) {
            setPreviewData(buildDirectClientFallback(notice));
            setIsLoading(false);
          }
          return;
        }

        const data = (await res.json()) as NoticePreviewResponse;
        if (cancelled) return;

        setPreviewData(data);
        if (data.error && (!data.attachments || data.attachments.length === 0)) {
          setLoadError(data.error);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setPreviewData(buildDirectClientFallback(notice));
        setLoadError(msg);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      cancelled = true;
    };
  }, [notice]);

  if (!notice) return null;

  const attachments: NoticePreviewAttachment[] = previewData?.attachments || [];
  const activeAttachment = attachments[activeIndex] || null;

  const handleSelectAttachment = (idx: number) => {
    setActiveIndex(idx);
    setZoom(1);
    setImgSrcOverride(null);
    setImgFailed(false);
  };

  const handleZoomOut = () => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))));
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))));
  const handleZoomReset = () => setZoom(1);

  const cleanDate = formatCleanNoticeDate(notice.date);
  const formattedTelegramPreview = `🔔 নতুন নোটিশ — ${notice.college_name || 'জাতীয় বিশ্ববিদ্যালয় কলেজ'}${cleanDate ? `\n📅 তারিখ: ${cleanDate}` : ''}\n\n📌 ${notice.title}\n🔗 ${notice.link}`;

  const handleCopyTelegramMessage = async () => {
    try {
      await navigator.clipboard.writeText(formattedTelegramPreview);
      setCopiedTelegram(true);
      window.setTimeout(() => setCopiedTelegram(false), 2000);
    } catch {
      setCopiedTelegram(false);
    }
  };

  const currentImageSrc =
    imgSrcOverride || activeAttachment?.previewUrl || '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={notice.title}
      className="fixed inset-0 z-50 flex flex-col w-screen h-[100dvh] bg-slate-950 text-white m-0 p-0 overflow-hidden font-['Anek_Bangla']"
    >
      {/* Top Edge-to-Edge Control Bar */}
      <header className="shrink-0 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 z-20">
        <div className="min-w-0 flex-1 pr-1">
          <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-bold leading-tight">
            <span className="truncate">{notice.college_name || 'সরকারি কলেজ'}</span>
            {cleanDate && (
              <span className="text-slate-400 font-medium shrink-0 tabular-nums">
                · {cleanDate}
              </span>
            )}
          </div>
          <h3 className="text-xs sm:text-sm font-bold text-white truncate leading-snug">
            {notice.title}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Zoom Controls (PDF বা ছবি থাকলে) */}
          {activeAttachment && (
            <div className="hidden sm:flex items-center bg-slate-800 rounded-xl border border-slate-700/80 p-0.5">
              <button
                type="button"
                onClick={handleZoomOut}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="ছোট করুন"
                aria-label="ছোট করুন"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="px-2 h-9 text-[11px] font-bold text-slate-200 hover:bg-slate-700 rounded-lg tabular-nums cursor-pointer"
                title="আসল মাপে ফিরুন"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="বড় করুন"
                aria-label="বড় করুন"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Mobile Quick Zoom Toggle */}
          {activeAttachment && (
            <button
              type="button"
              onClick={() => setZoom((z) => (z > 1 ? 1 : 1.5))}
              className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 cursor-pointer"
              title={zoom > 1 ? 'স্বাভাবিক মাপ' : 'জুম করুন'}
              aria-label="জুম পরিবর্তন করুন"
            >
              {zoom > 1 ? <RotateCcw className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </button>
          )}

          {/* Download Button (ফোনে সরাসরি ডাউনলোড) */}
          {activeAttachment && (
            <a
              href={activeAttachment.downloadUrl}
              download={activeAttachment.filename}
              className="min-h-[44px] px-3 sm:px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-sm transition-all whitespace-nowrap shrink-0"
              title="ফোনে ডাউনলোড করুন"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>ডাউনলোড</span>
            </a>
          )}

          {/* Admin Info Drawer Toggle */}
          {mode === 'admin' && (
            <button
              type="button"
              onClick={() => setShowAdminDrawer((v) => !v)}
              className={`min-h-[44px] px-2.5 rounded-xl text-xs font-bold inline-flex items-center space-x-1 border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showAdminDrawer
                  ? 'bg-sky-600 text-white border-sky-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/80'
              }`}
              title="এডমিন তথ্য ও টেলিগ্রাম মেসেজ"
            >
              <Info className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">তথ্য</span>
            </button>
          )}

          {/* Original Notice Link */}
          <a
            href={notice.link}
            target="_blank"
            rel="noreferrer"
            className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 inline-flex items-center justify-center space-x-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            title="মূল নোটিশ লিংক খুলুন"
            aria-label="মূল নোটিশ লিংক খুলুন"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">মূল লিংক</span>
          </a>

          {/* Close Cross Button */}
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-rose-600 text-white border border-slate-700/80 hover:border-rose-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="বন্ধ করুন"
            aria-label="প্রিভিউ বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Admin Metadata & Telegram Copy Bar (Only when toggled in Admin mode) */}
      {mode === 'admin' && showAdminDrawer && (
        <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-3 text-xs space-y-2.5 z-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-400">
                টেলিগ্রাম স্ট্যাটাস:{' '}
                <strong className={notice.notified ? 'text-sky-400' : 'text-amber-400'}>
                  {notice.notified ? 'টেলিগ্রামে প্রেরিত' : 'প্রেরণ বাকি'}
                </strong>
              </span>
              {notice.content_hash && (
                <span className="text-slate-400 font-mono text-[11px]">
                  Hash: {notice.content_hash.slice(0, 12)}...
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleCopyTelegramMessage}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
            >
              {copiedTelegram ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span>{copiedTelegram ? 'মেসেজ কপি হয়েছে' : 'টেলিগ্রাম মেসেজ কপি করুন'}</span>
            </button>
          </div>

          <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-sans text-slate-200 whitespace-pre-wrap leading-relaxed">
            {formattedTelegramPreview}
          </pre>
        </div>
      )}

      {/* Multi-Attachment Switcher Strip */}
      {attachments.length > 1 && (
        <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-2.5 sm:px-4 py-1.5 flex items-center gap-2 overflow-x-auto z-10">
          <span className="text-[11px] font-bold text-slate-400 shrink-0">সংযুক্তি ({attachments.length}):</span>
          {attachments.map((att, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={`${att.url}-${idx}`}
                type="button"
                onClick={() => handleSelectAttachment(idx)}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {att.kind === 'pdf' ? (
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {att.kind === 'pdf' ? 'PDF' : 'ছবি'} #{idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Edge-to-Edge Main Viewport */}
      <main className="flex-1 w-full h-full overflow-auto bg-slate-950 p-0 m-0 relative">
        {isLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="w-9 h-9 text-emerald-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">নোটিশের PDF ও ছবি খোঁজা হচ্ছে...</p>
              <p className="text-xs text-slate-400">অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন</p>
            </div>
          </div>
        ) : activeAttachment ? (
          activeAttachment.kind === 'pdf' ? (
            <PdfCanvasViewer
              src={activeAttachment.previewUrl}
              originalUrl={activeAttachment.url}
              downloadUrl={activeAttachment.downloadUrl}
              filename={activeAttachment.filename}
              zoom={zoom}
            />
          ) : imgFailed ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-bold text-white">ছবিটি সরাসরি প্রিভিউ করা যায়নি</p>
                <p className="text-xs text-slate-400">
                  আপনি নিচের ডাউনলোড বাটনে ট্যাপ করে ফোনে সেভ করতে পারেন অথবা মূল ওয়েবসাইটে দেখতে পারেন।
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <a
                  href={activeAttachment.downloadUrl}
                  download={activeAttachment.filename}
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  <Download className="w-4 h-4" />
                  <span>ফোনে ডাউনলোড করুন</span>
                </a>
                <a
                  href={notice.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>মূল লিংক দেখুন</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="w-full min-h-full p-0 m-0 flex items-start justify-center bg-slate-950">
              <img
                src={currentImageSrc}
                alt={notice.title}
                onError={() => {
                  if (!imgSrcOverride && activeAttachment.url !== currentImageSrc) {
                    setImgSrcOverride(activeAttachment.url);
                  } else {
                    setImgFailed(true);
                  }
                }}
                style={{
                  width: `${zoom * 100}%`,
                  maxWidth: zoom <= 1 ? '100%' : 'none',
                }}
                className="block h-auto object-contain m-0 p-0"
              />
            </div>
          )
        ) : showWebpageIframe ? (
          <iframe
            src={notice.link}
            title={notice.title}
            className="w-full h-full border-0 bg-white block"
          />
        ) : (
          <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <Globe className="w-4 h-4 shrink-0" />
                <span>নোটিশ বিবরণী</span>
              </div>
              <h4 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                {notice.title}
              </h4>

              {loadError && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{loadError}</span>
                </div>
              )}

              {previewData?.textExcerpt ? (
                <div className="pt-2 border-t border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {previewData.textExcerpt}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  এই নোটিশের সাথে আলাদা কোনো ডাউনলোডযোগ্য PDF বা স্ক্যান করা ছবি সরাসরি পাওয়া যায়নি। মূল কলেজ ওয়েবসাইটে গিয়ে সম্পূর্ণ নোটিশটি দেখতে পারেন।
                </p>
              )}

              <div className="pt-3 flex flex-wrap items-center gap-2.5">
                {previewData?.isSpaSite ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowWebpageIframe(true)}
                      className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <Globe className="w-4 h-4" />
                      <span>লাইভ সাইটে দেখুন</span>
                    </button>
                    <a
                      href={notice.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>মূল নোটিশ ওয়েবসাইট খুলুন</span>
                    </a>
                  </>
                ) : (
                  <>
                    <a
                      href={notice.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>মূল নোটিশ ওয়েবসাইট খুলুন</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowWebpageIframe(true)}
                      className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold cursor-pointer"
                    >
                      <Globe className="w-4 h-4" />
                      <span>এখানে পেইজ লোড করুন</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
