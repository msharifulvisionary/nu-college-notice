import { createClient } from '@supabase/supabase-js';

export interface College {
  id: string;
  name: string;
  notice_url: string;
  selector_config: any;
  is_active: boolean;
  created_at?: string;
}

export interface Notice {
  id: string;
  college_id: string;
  title: string;
  link: string;
  date?: string;
  content_hash: string;
  notified: boolean;
  notified_at?: string | null;
  created_at?: string;
  college_name?: string; // joined or enriched
}

// Default Seed College Data
const defaultColleges: College[] = [
  {
    id: 'a1010000-0000-0000-0000-000000000001',
    name: 'Govt. Azizul Haque College, Bogura',
    notice_url: 'https://www.ahcollege.gov.bd/notice',
    selector_config: {
      note: 'Aalo (SoftBD Ltd) platform notice board table',
      row_selector: 'table tbody tr',
      date_selector: 'td:nth-child(2)',
      title_selector: 'td:nth-child(3)',
      link_selector: 'td:nth-child(4) a'
    },
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'a1010000-0000-0000-0000-000000000002',
    name: 'Dhaka College, Dhaka',
    notice_url: 'https://dhakacollege.edu.bd/notice',
    selector_config: {
      note: 'SoftBD / Standard table layout',
      row_selector: 'table tbody tr',
      date_selector: 'td:nth-child(2)',
      title_selector: 'td:nth-child(3)',
      link_selector: 'td:nth-child(4) a'
    },
    is_active: true,
    created_at: new Date().toISOString()
  }
];

// In-Memory store as robust fallback if Supabase is offline or not migrated yet
let memoryColleges: College[] = [...defaultColleges];
let memoryNotices: Notice[] = [];

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || 'https://oltmzijtzfpflvzvrszh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_eWnb6If_kd2OpapH6lXqGw_Oq-Gj2wr';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Check if Supabase connection is functional
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('colleges').select('id').limit(1);
    if (error) {
      console.warn('[Supabase Connection Notice]:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch all active or all colleges
 */
export async function dbGetColleges(onlyActive = false): Promise<College[]> {
  try {
    let query = supabase.from('colleges').select('*').order('created_at', { ascending: false });
    if (onlyActive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      console.warn('[Database] Using memory store for colleges due to Supabase fallback:', error?.message);
      return onlyActive ? memoryColleges.filter(c => c.is_active) : memoryColleges;
    }
    return data as College[];
  } catch (err) {
    return onlyActive ? memoryColleges.filter(c => c.is_active) : memoryColleges;
  }
}

/**
 * Add a new college
 */
export async function dbAddCollege(college: Omit<College, 'id' | 'created_at'>): Promise<College> {
  const id = crypto.randomUUID();
  const newCollege: College = {
    ...college,
    id,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from('colleges').insert([newCollege]).select().single();
    if (error) {
      console.warn('[Database] Supabase insert failed, storing in memory:', error.message);
      memoryColleges.unshift(newCollege);
      return newCollege;
    }
    // Also update memory
    memoryColleges.unshift(data);
    return data as College;
  } catch {
    memoryColleges.unshift(newCollege);
    return newCollege;
  }
}

/**
 * Update college status or details
 */
export async function dbUpdateCollege(id: string, updates: Partial<College>): Promise<boolean> {
  try {
    const { error } = await supabase.from('colleges').update(updates).eq('id', id);
    if (error) {
      console.warn('[Database] Supabase update failed:', error.message);
    }
  } catch (err) {
    console.warn('[Database] Supabase exception during update:', err);
  }

  // Always update memory store
  const idx = memoryColleges.findIndex(c => c.id === id);
  if (idx !== -1) {
    memoryColleges[idx] = { ...memoryColleges[idx], ...updates };
  }
  return true;
}

/**
 * Delete a college
 */
export async function dbDeleteCollege(id: string): Promise<boolean> {
  try {
    await supabase.from('colleges').delete().eq('id', id);
  } catch {}
  memoryColleges = memoryColleges.filter(c => c.id !== id);
  return true;
}

/**
 * Check if a notice with college_id and link (or content_hash) exists
 */
export async function dbCheckNoticeExists(collegeId: string, link: string, contentHash?: string): Promise<boolean> {
  try {
    // Primary check by URL link
    const { data: linkData, error: linkErr } = await supabase
      .from('notices')
      .select('id')
      .eq('college_id', collegeId)
      .eq('link', link)
      .maybeSingle();

    if (!linkErr && linkData) {
      return true;
    }

    // Secondary check by content_hash if provided
    if (contentHash) {
      const { data: hashData, error: hashErr } = await supabase
        .from('notices')
        .select('id')
        .eq('college_id', collegeId)
        .eq('content_hash', contentHash)
        .maybeSingle();

      if (!hashErr && hashData) {
        return true;
      }
    }
  } catch (err) {
    console.warn('[Database Check Notice Error]:', err);
  }

  // Check memory store fallback
  return memoryNotices.some(
    n => n.college_id === collegeId && (n.link === link || (contentHash && n.content_hash === contentHash))
  );
}

/**
 * Check count of existing notices for a specific college
 */
export async function dbGetNoticeCountForCollege(collegeId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notices')
      .select('id', { count: 'exact', head: true })
      .eq('college_id', collegeId);

    if (!error && typeof count === 'number') {
      return count;
    }
  } catch {}

  return memoryNotices.filter(n => n.college_id === collegeId).length;
}

/**
 * Insert a new notice
 */
export async function dbInsertNotice(
  notice: Omit<Notice, 'id' | 'created_at' | 'notified'> & { notified?: boolean }
): Promise<Notice> {
  const id = crypto.randomUUID();
  const isNotified = Boolean(notice.notified);
  const now = new Date().toISOString();
  const newNotice: Notice = {
    ...notice,
    id,
    notified: isNotified,
    notified_at: isNotified ? now : null,
    created_at: now,
  };

  try {
    const { data, error } = await supabase.from('notices').insert([{
      id: newNotice.id,
      college_id: newNotice.college_id,
      title: newNotice.title,
      link: newNotice.link,
      date: newNotice.date,
      content_hash: newNotice.content_hash,
      notified: newNotice.notified,
      notified_at: newNotice.notified_at,
    }]).select().single();

    if (!error && data) {
      memoryNotices.unshift(data);
      return data as Notice;
    }
  } catch {}

  memoryNotices.unshift(newNotice);
  return newNotice;
}

/**
 * Get pending unnotified notices
 */
export async function dbGetPendingNotices(): Promise<Notice[]> {
  try {
    const { data, error } = await supabase
      .from('notices')
      .select('*, colleges(name)')
      .eq('notified', false)
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((item: any) => ({
        ...item,
        college_name: item.colleges?.name || 'Unknown College',
      }));
    }
  } catch {}

  // Fallback to memory
  const pending = memoryNotices.filter(n => !n.notified);
  return pending.map(n => {
    const col = memoryColleges.find(c => c.id === n.college_id);
    return { ...n, college_name: col?.name || 'Unknown College' };
  });
}

/**
 * Mark notice as notified
 */
export async function dbMarkNoticeNotified(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await supabase.from('notices').update({ notified: true, notified_at: now }).eq('id', id);
  } catch {}

  const idx = memoryNotices.findIndex(n => n.id === id);
  if (idx !== -1) {
    memoryNotices[idx].notified = true;
    memoryNotices[idx].notified_at = now;
  }
  return true;
}

/**
 * Get recent notices list
 */
export async function dbGetRecentNotices(limit = 50): Promise<Notice[]> {
  try {
    const { data, error } = await supabase
      .from('notices')
      .select('*, colleges(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data.map((item: any) => ({
        ...item,
        college_name: item.colleges?.name || 'Unknown College',
      }));
    }
  } catch {}

  // Fallback to memory
  return memoryNotices.slice(0, limit).map(n => {
    const col = memoryColleges.find(c => c.id === n.college_id);
    return { ...n, college_name: col?.name || 'Unknown College' };
  });
}
