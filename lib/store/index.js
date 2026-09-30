import { supabaseStore } from './supabase.js';
import { memoryStore } from './memory.js';

let store;

export function getStore() {
  if (store) return store;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  // Neue Supabase-Schlüssel heißen "secret key", ältere "service_role key" – beides geht.
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && secret) {
    store = supabaseStore(url, secret);
  } else if (process.env.VERCEL) {
    throw new Error(
      'Supabase ist nicht eingerichtet: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY fehlen in den Vercel-Umgebungsvariablen.',
    );
  } else {
    console.warn('Kein Supabase eingerichtet – Räume werden nur im Arbeitsspeicher gehalten (lokaler Testmodus).');
    store = memoryStore();
  }
  return store;
}
