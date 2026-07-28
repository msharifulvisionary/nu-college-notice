import React, { useState } from 'react';
import { Database, Copy, Check, FileCode, Clock, Server } from 'lucide-react';

export const SupabaseGuide: React.FC = () => {
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedVercel, setCopiedVercel] = useState(false);

  const sqlCode = `-- =======================================================
-- Multi-College Notice Tracker - Supabase Database Schema
-- =======================================================

create table if not exists colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notice_url text not null,
  selector_config jsonb not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references colleges(id) on delete cascade,
  title text not null,
  link text not null,
  date text,
  content_hash text not null,
  notified boolean default false,
  notified_at timestamptz,
  created_at timestamptz default now(),
  unique(college_id, content_hash)
);

-- Index for duplicate detection
create index if not exists idx_notices_college_hash on notices(college_id, content_hash);

-- Seed Govt. Azizul Haque College, Bogura
insert into colleges (id, name, notice_url, selector_config, is_active)
values (
  'a1010000-0000-0000-0000-000000000001',
  'Govt. Azizul Haque College, Bogura',
  'https://www.ahcollege.gov.bd/notice',
  '{
    "note": "Aalo (SoftBD Ltd) platform notice board table",
    "row_selector": "table tbody tr",
    "date_selector": "td:nth-child(2)",
    "title_selector": "td:nth-child(3)",
    "link_selector": "td:nth-child(4) a"
  }'::jsonb,
  true
)
on conflict (id) do nothing;`;

  const vercelJsonCode = `{
  "crons": [
    {
      "path": "/api/scrape-and-notify",
      "schedule": "*/20 * * * *"
    }
  ]
}`;

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl mb-8">
      
      {/* Header */}
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-700/60">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Supabase Schema & Vercel Cron Setup</h2>
          <p className="text-xs text-slate-400">
            ডাটাবেস মাইগ্রেশন SQL এবং Vercel Cron Job সেটআপ গাইড
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5">
        
        {/* Supabase SQL Editor Code Box */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>1. Supabase SQL Schema (`supabase-schema.sql`)</span>
            </span>

            <button
              onClick={() => copyToClipboard(sqlCode, setCopiedSql)}
              className="inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 bg-slate-900 border border-slate-700 rounded-md transition-colors"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'কপি হয়েছে' : 'কপি করুন'}</span>
            </button>
          </div>

          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-64 leading-relaxed">
            {sqlCode}
          </pre>
        </div>

        {/* Vercel Cron Config Code Box */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>2. Vercel Cron Configuration (`vercel.json`)</span>
            </span>

            <button
              onClick={() => copyToClipboard(vercelJsonCode, setCopiedVercel)}
              className="inline-flex items-center space-x-1 text-xs text-sky-400 hover:text-sky-300 px-2 py-1 bg-slate-900 border border-slate-700 rounded-md transition-colors"
            >
              {copiedVercel ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedVercel ? 'কপি হয়েছে' : 'কপি করুন'}</span>
            </button>
          </div>

          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-[11px] font-mono text-sky-300 overflow-x-auto max-h-32 leading-relaxed">
            {vercelJsonCode}
          </pre>

          {/* Environment Variables Reference */}
          <div className="mt-4 p-3.5 bg-slate-900/90 border border-slate-700/60 rounded-xl text-xs space-y-1.5 text-slate-300">
            <div className="flex items-center space-x-1.5 text-amber-400 font-semibold mb-1">
              <Server className="w-4 h-4" />
              <span>Environment Variables Reference</span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">SUPABASE_URL=https://oltmzijtzfpflvzvrszh.supabase.co</p>
            <p className="text-[11px] font-mono text-slate-400">SUPABASE_SERVICE_ROLE_KEY=sb_secret_eWnb6If...</p>
            <p className="text-[11px] font-mono text-slate-400">TELEGRAM_BOT_TOKEN=8688629221:AAEGxORa...</p>
            <p className="text-[11px] font-mono text-slate-400">TELEGRAM_CHAT_ID=1961224877</p>
          </div>
        </div>

      </div>

    </div>
  );
};
