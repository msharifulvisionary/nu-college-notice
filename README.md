# Multi-College Notice Tracker (`nu-college-notice`)

জাতীয় বিশ্ববিদ্যালয় ও সরকারি কলেজসমূহের অফিসিয়াল নোটিশ বোর্ড স্বয়ংক্রিয়ভাবে পর্যবেক্ষণ, ওয়েবসাইটে প্রদর্শন এবং টেলিগ্রামে ইনস্ট্যান্ট অ্যালার্ট পাঠানোর পূর্ণাঙ্গ সিস্টেম।

---

## সিস্টেম আর্কিটেকচার

- **Frontend (Vite + React + TypeScript + Tailwind CSS):** Cloudflare Workers Static Assets (`./dist`) থেকে পরিবেশিত হয়। পাবলিক পেজে সরাসরি `VITE_SUPABASE_PUBLISHABLE_KEY` দিয়ে নোটিশ ও কলেজ তালিকা পড়ে এবং `/admin`-এ Supabase Auth দিয়ে লগইন করে।
- **Backend API (Cloudflare Worker — `src/worker.ts`):** `/api/admin/*` রুটগুলো পরিচালনা করে। প্রতিটি রিকোয়েস্টে Supabase Auth টোকেন এবং `ADMIN_EMAIL` যাচাই করে Supabase PostgREST, Telegram Bot API ও GitHub Actions `workflow_dispatch` কল করে।
- **Scraper (GitHub Actions — `scraper/src/scrape.ts`):** প্রতি ২০ মিনিটে স্বয়ংক্রিয়ভাবে এবং এডমিন প্যানেল থেকে `টেস্ট রান` বাটনে ক্লিক করলে অন-ডিমান্ড চলে।

---

## ১. Supabase সেটআপ

1. Supabase Dashboard > **SQL Editor**-এ গিয়ে `supabase-schema.sql` ফাইলের সম্পূর্ণ SQL কোড রান করুন। এতে `colleges`, `notices`, `settings` ও `test_runs` টেবিল ও RLS পলিসি তৈরি হবে।
2. **Authentication > Users** থেকে আপনার এডমিন ইমেইল ও পাসওয়ার্ড দিয়ে একটি ইউজার তৈরি করুন (এটি আপনার `ADMIN_EMAIL` সিক্রেটের সাথে হুবহু মিলতে হবে)।

---

## ২. লোকাল ডেভেলপমেন্ট (`wrangler dev`)

প্রথমে রিপোজিটরির রুটে ওয়েবসাইট বিল্ড করুন এবং Worker-এর লোকাল সিক্রেট রাখার জন্য `.dev.vars` ফাইল তৈরি করুন (`.dev.vars` কখনো Git-এ কমিট করবেন না):

```bash
npm install
npm run build
```

`.dev.vars` ফাইলের উদাহরণ:

```ini
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
ADMIN_EMAIL="your-admin@example.com"
GITHUB_TOKEN="ghp_your_github_pat_with_workflow_scope"
GITHUB_REPO="username/nu-college-notice"
```

এরপর Cloudflare Worker ও Static Assets একসাথে লোকালি চালু করতে:

```bash
npx wrangler dev
```

*শুধু ফ্রন্টএন্ড UI দ্রুত ডেভেলপ করতে `npm run dev` ব্যবহার করতে পারেন (পোর্ট `3000`), তবে `/api/admin/*` রুটগুলো টেস্ট করতে `npm run build && npx wrangler dev` ব্যবহার করুন।*

---

## ৩. প্রোডাকশন ডিপ্লয় ও Cloudflare Secrets সেটআপ

### ক) Build Environment Variables (Cloudflare Workers Builds / CI)
ওয়েবসাইট বিল্ডের (`npm run build`) সময় এই দুটি পাবলিক ভ্যারিয়েবল থাকতে হবে:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

*(সতর্কতা: `SUPABASE_SERVICE_ROLE_KEY` বা `GITHUB_TOKEN` কখনো `VITE_*` হিসেবে সেট করবেন না।)*

### খ) Cloudflare Worker Runtime Secrets
CLI দিয়ে প্রতিটি সিক্রেট সেট করুন:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_REPO
```

অথবা **Cloudflare Dashboard > Workers & Pages > `nu-college-notice` > Settings > Variables and Secrets > Add Secret** থেকে একই ৫টি নাম যোগ করুন:
- `SUPABASE_URL` — Supabase প্রজেক্ট URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Service Role Key
- `ADMIN_EMAIL` — যে ইমেইল দিয়ে এডমিন লগইন করবেন
- `GITHUB_TOKEN` — GitHub Personal Access Token (`repo` / `actions:write` পারমিশনসহ, workflow dispatch-এর জন্য)
- `GITHUB_REPO` — `owner/repo` ফরম্যাটে (যেমন: `shariful/nu-college-notice`)

এরপর ডিপ্লয় করতে:

```bash
npm run build
npx wrangler deploy
```

---

## ৪. GitHub Actions Secrets সেটআপ

Repository > **Settings > Secrets and variables > Actions**-এ নিচের সিক্রেটগুলো যোগ করুন:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` *(ফলব্যাক হিসেবে; এডমিন প্যানেল থেকে `settings` টেবিলে সেভ করা থাকলে সেটাই অগ্রাধিকার পাবে)*
- `TELEGRAM_CHAT_ID` *(ফলব্যাক হিসেবে)*
