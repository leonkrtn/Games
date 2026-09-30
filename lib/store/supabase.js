import { createClient } from '@supabase/supabase-js';

export function supabaseStore(url, secretKey) {
  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fail = (what, error) => {
    throw new Error(`Datenbank-Fehler (${what}): ${error.message}`, { cause: error });
  };

  return {
    async get(code) {
      const { data, error } = await db.from('rooms').select('code, version, data').eq('code', code).maybeSingle();
      if (error) fail('Raum laden', error);
      return data;
    },

    // false, wenn es den Code schon gibt
    async create(code, data) {
      const { error } = await db.from('rooms').insert({ code, data });
      if (error?.code === '23505') return false;
      if (error) fail('Raum anlegen', error);
      return true;
    },

    // Speichert nur, wenn niemand anderes seit dem Laden gespeichert hat.
    async update(code, version, data) {
      const { data: rows, error } = await db
        .from('rooms')
        .update({ data, version: version + 1, updated_at: new Date().toISOString() })
        .eq('code', code)
        .eq('version', version)
        .select('code');
      if (error) fail('Raum speichern', error);
      return rows.length === 1;
    },

    async remove(code) {
      const { error } = await db.from('rooms').delete().eq('code', code);
      if (error) fail('Raum löschen', error);
    },

    async addResult(code, result) {
      const { error } = await db.from('results').insert({ room_code: code, ...result });
      if (error) console.error('Ergebnis konnte nicht gespeichert werden:', error);
    },

    async listResults(code, limit) {
      const { data, error } = await db
        .from('results')
        .select('game_id, game_name, winners, text, finished_at')
        .eq('room_code', code)
        .order('finished_at', { ascending: false })
        .limit(limit);
      if (error) fail('Verlauf laden', error);
      return data;
    },

    // --- Benachrichtigungen ---

    async savePush(row) {
      const { error } = await db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
      if (error) fail('Benachrichtigung speichern', error);
    },

    async removePush(endpoint) {
      const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) console.error('Benachrichtigung löschen fehlgeschlagen:', error);
    },

    async removePushForPlayer(code, playerId) {
      const { error } = await db.from('push_subscriptions').delete().eq('room_code', code).eq('player_id', playerId);
      if (error) console.error('Benachrichtigungen löschen fehlgeschlagen:', error);
    },

    async touchPush(endpoint, code, playerId, activeUntil) {
      const { error } = await db
        .from('push_subscriptions')
        .update({ active_until: activeUntil })
        .eq('endpoint', endpoint)
        .eq('room_code', code)
        .eq('player_id', playerId);
      if (error) console.error('Aktivität speichern fehlgeschlagen:', error);
    },

    async listPush(code) {
      const { data, error } = await db
        .from('push_subscriptions')
        .select('endpoint, player_id, subscription, active_until')
        .eq('room_code', code);
      if (error) fail('Benachrichtigungen laden', error);
      return data;
    },

    // Sagt allen im Raum per Supabase Realtime: "Es gibt einen neuen Stand.""
    async notify(code, version) {
      const channel = db.channel(`room:${code}`);
      try {
        await channel.httpSend('update', { version });
      } catch (err) {
        console.error('Realtime-Benachrichtigung fehlgeschlagen:', err);
      } finally {
        db.removeChannel(channel);
      }
    },
  };
}
