import { supabase } from './supabase-client-v1.js';

const SESSION_STORAGE_KEY = 'genealogyArchiveAccessSession:v1';
const HEARTBEAT_MS = 2 * 60 * 1000;
let heartbeatTimer = null;
let approvedUserId = '';
let recordInFlight = false;

function makeSessionKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === 'x' ? value : ((value & 0x3) | 0x8);
    return nibble.toString(16);
  });
}

function readStoredSession(userId) {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.userId === userId && parsed?.sessionKey) return parsed;
  } catch {
    // Session tracking must never block the archive.
  }
  const created = { userId, sessionKey: makeSessionKey() };
  try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(created)); } catch { /* best effort */ }
  return created;
}

async function approvedSessionUser() {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || '';
  if (!userId) return '';
  if (approvedUserId === userId) return userId;

  const { data, error } = await supabase
    .from('app_users')
    .select('user_id,status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || data?.status !== 'approved') return '';
  approvedUserId = userId;
  return userId;
}

async function recordArchiveAccess() {
  if (recordInFlight || document.visibilityState === 'hidden') return;
  recordInFlight = true;
  try {
    const userId = await approvedSessionUser();
    if (!userId) return;
    const stored = readStoredSession(userId);
    await supabase.rpc('record_app_access_session', {
      p_session_key: stored.sessionKey,
      p_page_path: `${location.pathname}${location.search}`,
      p_end: false,
    });
  } catch {
    // Access logging is diagnostic only and must not affect normal family use.
  } finally {
    recordInFlight = false;
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  void recordArchiveAccess();
  heartbeatTimer = window.setInterval(() => void recordArchiveAccess(), HEARTBEAT_MS);
}

document.addEventListener('genealogy:archive-ready', startHeartbeat);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void recordArchiveAccess();
});
window.addEventListener('pageshow', () => void recordArchiveAccess());
window.addEventListener('focus', () => void recordArchiveAccess());

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    approvedUserId = '';
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* best effort */ }
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    window.setTimeout(() => void recordArchiveAccess(), 0);
  }
});

void recordArchiveAccess();
