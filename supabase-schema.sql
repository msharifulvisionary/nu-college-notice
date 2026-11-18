-- =======================================================
-- Multi-College Notice Tracker - Supabase Schema Migration
-- =======================================================

-- 1. Create Colleges Table
create table if not exists colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notice_url text not null,
  selector_config jsonb not null, -- { "row_selector": "...", "title_selector": "...", "link_selector": "...", "date_selector": "..." }
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

-- Create indexes for performance
create index if not exists idx_notices_college_hash on notices(college_id, content_hash);
create index if not exists idx_notices_notified on notices(notified);
create index if not exists idx_colleges_active on colleges(is_active);

-- Enable Row Level Security (RLS)
alter table colleges enable row level security;
alter table notices enable row level security;

-- Allow public (anon / publishable key) read access for Cloudflare Pages frontend
drop policy if exists "Allow public read access on colleges" on colleges;
create policy "Allow public read access on colleges"
  on colleges for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public read access on notices" on notices;
create policy "Allow public read access on notices"
  on notices for select
  to anon, authenticated
  using (true);

-- 3. Create Settings Table (Admin Telegram Bot Token & Chat ID)
-- শুধুমাত্র service_role key ব্যবহার করে Worker ও Scraper এই টেবিল পড়তে/লিখতে পারবে
create table if not exists settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- 4. Create Test Runs Table (On-demand college scraper test tracking)
-- শুধুমাত্র service_role key ব্যবহার করে Worker ও Scraper এই টেবিল পড়তে/লিখতে পারবে
create table if not exists test_runs (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references colleges(id) on delete cascade,
  status text not null default 'pending', -- pending | running | success | error
  result jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_test_runs_college_id on test_runs(college_id);
create index if not exists idx_test_runs_created_at on test_runs(created_at desc);

-- Enable RLS on settings & test_runs with NO public policies (Service Role Only)
alter table settings enable row level security;
alter table test_runs enable row level security;

-- =======================================================
-- Seed Data: Govt. Azizul Haque College, Bogura & Others
-- =======================================================

insert into colleges (id, name, notice_url, selector_config, is_active)
values 
(
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
),
(
  'a1010000-0000-0000-0000-000000000002',
  'Dhaka College, Dhaka',
  'https://dhakacollege.edu.bd/notice',
  '{
    "note": "Generic table based notice board",
    "row_selector": "table tbody tr",
    "date_selector": "td:nth-child(2)",
    "title_selector": "td:nth-child(3) a, td:nth-child(3)",
    "link_selector": "td:nth-child(3) a, td:nth-child(4) a"
  }'::jsonb,
  true
),
(
  'a1010000-0000-0000-0000-000000000003',
  'Carmichael College, Rangpur',
  'https://ccr.gov.bd/notice',
  '{
    "note": "List or table layout",
    "row_selector": ".notice-list .notice-item, table tbody tr",
    "date_selector": ".date, td:nth-child(2)",
    "title_selector": ".title a, td:nth-child(3)",
    "link_selector": "a"
  }'::jsonb,
  false
)
on conflict (id) do update set
  name = excluded.name,
  notice_url = excluded.notice_url,
  selector_config = excluded.selector_config;
