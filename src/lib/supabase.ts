import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { College, Notice } from '../types';
import { sortNoticesByDateDesc } from './dateSort';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

export function getSupabaseUrl(): string {
  return supabaseUrl || 'Not configured';
}

export async function testSupabaseConnection(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('colleges').select('id').limit(1);
    if (error) {
      console.warn('[Supabase] Connection check failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Connection check exception:', err);
    return false;
  }
}

export async function fetchColleges(onlyActive = false): Promise<College[]> {
  if (!supabase) {
    throw new Error('Supabase সেটিংস পাওয়া যায়নি, Cloudflare এর Build variables চেক করুন');
  }

  let query = supabase
    .from('colleges')
    .select('*')
    .order('created_at', { ascending: false });

  if (onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as College[];
}

export async function fetchRecentNotices(limit = 200): Promise<Notice[]> {
  if (!supabase) {
    throw new Error('Supabase সেটিংস পাওয়া যায়নি, Cloudflare এর Build variables চেক করুন');
  }

  let { data, error } = await supabase
    .from('notices')
    .select('*, colleges(name)')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // যদি notices টেবিলে এখনো published_at কলাম যোগ না হয়ে থাকে, তবে created_at দিয়ে ফলব্যাক
  if (error && error.message.toLowerCase().includes('published_at')) {
    const fallback = await supabase
      .from('notices')
      .select('*, colleges(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const mapped = (data || []).map((item: Notice & { colleges?: { name?: string } | null }) => ({
    ...item,
    college_name: item.colleges?.name || 'Govt. College',
  })) as Notice[];

  return sortNoticesByDateDesc(mapped);
}

export async function getAdminSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[Auth] Failed to read session:', error.message);
    return null;
  }
  return data.session;
}

export async function signInAdmin(email: string, password: string): Promise<Session> {
  if (!supabase) {
    throw new Error('Supabase সেটিংস পাওয়া যায়নি।');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.session) {
    throw new Error(error?.message || 'ভুল ইমেইল অথবা পাসওয়ার্ড! সঠিক তথ্য দিয়ে চেষ্টা করুন।');
  }

  return data.session;
}

export async function signOutAdmin(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
