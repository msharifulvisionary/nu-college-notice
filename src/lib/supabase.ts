import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { College, Notice } from '../types';

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
    throw new Error('Supabase পরিবেশ ভ্যারিয়েবল (VITE_SUPABASE_URL ও VITE_SUPABASE_PUBLISHABLE_KEY) সেট করা নেই।');
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

export async function fetchRecentNotices(limit = 100): Promise<Notice[]> {
  if (!supabase) {
    throw new Error('Supabase পরিবেশ ভ্যারিয়েবল (VITE_SUPABASE_URL ও VITE_SUPABASE_PUBLISHABLE_KEY) সেট করা নেই।');
  }

  const { data, error } = await supabase
    .from('notices')
    .select('*, colleges(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((item: any) => ({
    ...item,
    college_name: item.colleges?.name || 'Govt. College',
  })) as Notice[];
}

export async function addCollege(
  college: Omit<College, 'id' | 'created_at'>
): Promise<College> {
  if (!supabase) {
    throw new Error('Supabase কনফিগার করা নেই।');
  }

  const { data, error } = await supabase
    .from('colleges')
    .insert([college])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as College;
}

export async function updateCollege(
  id: string,
  updates: Partial<College>
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase কনফিগার করা নেই।');
  }

  const { error } = await supabase
    .from('colleges')
    .update(updates)
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCollege(id: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase কনফিগার করা নেই।');
  }

  const { error } = await supabase
    .from('colleges')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
