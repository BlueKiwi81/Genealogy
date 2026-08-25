import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';

// Every feature module on the main page must share this client. Creating one
// client per module causes each auth broadcast to fan out into duplicate API
// loads, which became particularly costly as the family archive grew.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
