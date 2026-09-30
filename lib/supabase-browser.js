import { createClient } from '@supabase/supabase-js';

// Öffentlicher Supabase-Zugang für den Browser – nur für die Live-Benachrichtigungen.
// Ohne diese Variablen läuft die Seite im lokalen Testmodus (regelmäßiges Nachfragen).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client;

export function getSupabase() {
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
