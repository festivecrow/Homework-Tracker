import { createClient } from '@supabase/supabase-js';

// This is your project's public URL and "publishable" key. Both are safe to
// commit and ship in client-side code — they're designed to be public.
// What actually protects your data is the Row Level Security policies we
// set up in Supabase (each user can only read/write their own rows).
const SUPABASE_URL = 'https://mspmobcppyiyplkufmtz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_A7fjCgRgXFwdMrxPu6nPfg_e4esoT8l';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
