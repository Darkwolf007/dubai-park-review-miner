import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY -- set both in your local .env file (see .env.example).'
  );
}

/**
 * Single shared client for the whole frontend. Uses the anon key only -- this key is safe to
 * ship in the browser bundle because every request it makes is still checked against the Row
 * Level Security policies configured in Supabase. Never import the service_role key here.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
