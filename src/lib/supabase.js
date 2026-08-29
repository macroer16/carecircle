import { createClient } from '@supabase/supabase-js';

// These come from YOUR OWN Supabase project (Project Settings -> API).
// Safe to expose publicly — Row Level Security in supabase-schema.sql is
// what actually protects data, not secrecy of these values.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
