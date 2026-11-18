import React, { useState } from 'react';
import { Copy, Check, FileCode } from 'lucide-react';

export const SqlCodeViewer: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const sqlQuery = `-- =======================================================
-- Multi-College Notice Tracker - Supabase Postgres Schema
-- =======================================================

-- 1. Create Colleges Table
create table if not exists colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notice_url text not null,
  selector_config jsonb not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. Create Notices Table
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references colleges(id) on delete cascade,
  title text not null,
  link text not null unique,
  date text,
  content_hash text not null,
  notified boolean default false,
  notified_at timestamptz,
  created_at timestamptz default now(),
  unique(college_id, content_hash)
);

create index if not exists idx_notices_college_hash on notices(college_id, content_hash);
create index if not exists idx_notices_notified on notices(notified);
create index if not exists idx_colleges_active on colleges(is_active);

-- Enable RLS & allow public read via Publishable Key
alter table colleges enable row level security;
alter table notices enable row level security;

drop policy if exists "Allow public read access on colleges" on colleges;
create policy "Allow public read access on colleges"
  on colleges for select to anon, authenticated using (true);

drop policy if exists "Allow public read access on notices" on notices;
create policy "Allow public read access on notices"
  on notices for select to anon, authenticated using (true);

-- 3. Create Settings Table (Service Role Only)
create table if not exists settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- 4. Create Test Runs Table (Service Role Only)
create table if not exists test_runs (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references colleges(id) on delete cascade,
  status text not null default 'pending',
  result jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_test_runs_college_id on test_runs(college_id);
create index if not exists idx_test_runs_created_at on test_runs(created_at desc);

alter table settings enable row level security;
alter table test_runs enable row level security;

-- Seed Initial Data: Govt. Azizul Haque College, Bogura
insert into colleges (id, name, notice_url, selector_config, is_active)
values (
  'a1010000-0000-0000-0000-000000000001',
  'Govt. Azizul Haque College, Bogura',
  'https://www.ahcollege.gov.bd/notice',
  '{
    "row_selector": "table tbody tr",
    "date_selector": "td:nth-child(2)",
    "title_selector": "td:nth-child(3)",
    "link_selector": "td:nth-child(4) a"
  }'::jsonb,
  true
)
on conflict (id) do nothing;`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">PostgreSQL Schema (SQL Code)</h2>
            <p className="text-[11px] sm:text-xs text-slate-500">
              colleges, notices, settings এবং test_runs টেবিল তৈরি করার সম্পূর্ণ SQL কোড
            </p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer w-full sm:w-auto"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'কপি হয়েছে' : 'কোড কপি করুন'}</span>
        </button>
      </div>

      <div className="mt-4">
        <pre className="bg-slate-900 text-emerald-400 p-3.5 sm:p-4 rounded-xl text-[11px] sm:text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
          {sqlQuery}
        </pre>
      </div>
    </div>
  );
};
