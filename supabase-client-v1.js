import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';

// Every feature module on the main page must share this client. Creating one
// client per module causes each auth broadcast to fan out into duplicate API
// loads, which became particularly costly as the family archive grew.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// A large number of independently loaded feature modules ask for the current
// session during startup. Most browsers tolerate those simultaneous reads, but
// Safari can turn an expired-session burst into competing refresh-token
// rotations. Share only the in-flight getSession() read; once it settles every
// later caller gets a fresh library-managed read as usual.
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
let sessionReadInFlight = null;
supabase.auth.getSession = (...args) => {
  if (sessionReadInFlight) return sessionReadInFlight;
  const pending = originalGetSession(...args);
  sessionReadInFlight = pending;
  pending.finally(() => {
    if (sessionReadInFlight === pending) sessionReadInFlight = null;
  });
  return pending;
};
