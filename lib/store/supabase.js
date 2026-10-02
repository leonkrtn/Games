import { createClient } from '@supabase/supabase-js';

export function supabaseStore(url, secretKey) {
  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fail = (what, error) => {
    throw new Error(`Datenbank-Fehler (${what}): ${error.message}`, { cause: error });
  };

  // Realtime-Nachricht ohne Inhalt: "Es gibt etwas Neues, bitte neu laden."
  const ping = async (topic, payload, event = 'update') => {
    const channel = db.channel(topic);
    try {
      await channel.httpSend(event, payload);
    } catch (err) {
      console.error('Realtime-Benachrichtigung fehlgeschlagen:', err);
    } finally {
      db.removeChannel(channel);
    }
  };

  return {
    // --- Räume ---

    async get(code) {
      const { data, error } = await db.from('rooms').select('code, version, data').eq('code', code).maybeSingle();
      if (error) fail('Raum laden', error);
      return data;
    },

    async getRooms(codes) {
      if (!codes.length) return [];
      const { data, error } = await db.from('rooms').select('code, version, data').in('code', codes);
      if (error) fail('Räume laden', error);
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

    // --- Konten ---

    // null, wenn Benutzername oder Einladungscode schon vergeben sind
    async createUser(row) {
      const { data, error } = await db.from('users').insert(row).select('*').single();
      if (error?.code === '23505') return null;
      if (error) fail('Konto anlegen', error);
      return data;
    },

    async getUser(id) {
      const { data, error } = await db.from('users').select('*').eq('id', id).maybeSingle();
      if (error) fail('Konto laden', error);
      return data;
    },

    async getUsers(ids) {
      if (!ids.length) return [];
      const { data, error } = await db.from('users').select('id, username, display_name').in('id', ids);
      if (error) fail('Konten laden', error);
      return data;
    },

    async getUserByName(username) {
      const { data, error } = await db.from('users').select('*').eq('username', username).maybeSingle();
      if (error) fail('Konto suchen', error);
      return data;
    },

    async getUserByInvite(code) {
      const { data, error } = await db.from('users').select('*').eq('invite_code', code).maybeSingle();
      if (error) fail('Einladung prüfen', error);
      return data;
    },

    async updateUser(id, patch) {
      const { error } = await db.from('users').update(patch).eq('id', id);
      if (error) fail('Konto speichern', error);
    },

    async createSession(row) {
      const { error } = await db.from('sessions').insert(row);
      if (error) fail('Anmeldung speichern', error);
    },

    async getSession(tokenHash) {
      const { data, error } = await db
        .from('sessions')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) fail('Anmeldung prüfen', error);
      return data;
    },

    async deleteSession(tokenHash) {
      const { error } = await db.from('sessions').delete().eq('token_hash', tokenHash);
      if (error) console.error('Abmelden fehlgeschlagen:', error);
    },

    // --- Freundschaften ---

    async listFriendships(userId) {
      const { data, error } = await db
        .from('friendships')
        .select('*')
        .or(`requester.eq.${userId},addressee.eq.${userId}`)
        .order('created_at');
      if (error) fail('Freunde laden', error);
      return data;
    },

    async getFriendship(id) {
      const { data, error } = await db.from('friendships').select('*').eq('id', id).maybeSingle();
      if (error) fail('Freundschaft laden', error);
      return data;
    },

    async getFriendshipBetween(a, b) {
      const { data, error } = await db
        .from('friendships')
        .select('*')
        .or(`and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`)
        .maybeSingle();
      if (error) fail('Freundschaft laden', error);
      return data;
    },

    // null, wenn es das Paar schon gibt
    async createFriendship(row) {
      const { data, error } = await db.from('friendships').insert(row).select('*').single();
      if (error?.code === '23505') return null;
      if (error) fail('Freundschaft anlegen', error);
      return data;
    },

    async updateFriendship(id, patch) {
      const { error } = await db.from('friendships').update(patch).eq('id', id);
      if (error) fail('Freundschaft speichern', error);
    },

    async deleteFriendship(id) {
      const { error } = await db.from('friendships').delete().eq('id', id);
      if (error) fail('Freundschaft löschen', error);
    },

    // --- Gruppen (Verzeichnis: in welchen Gruppen-Räumen ist ein Konto) ---

    async addGroupMembers(code, userIds, addedBy) {
      if (!userIds.length) return;
      const rows = userIds.map((user_id) => ({ room_code: code, user_id, added_by: addedBy ?? null }));
      const { error } = await db
        .from('group_members')
        .upsert(rows, { onConflict: 'room_code,user_id', ignoreDuplicates: true });
      if (error) fail('Gruppe speichern', error);
    },

    async removeGroupMember(code, userId) {
      const { error } = await db.from('group_members').delete().eq('room_code', code).eq('user_id', userId);
      if (error) fail('Gruppe verlassen', error);
    },

    // Raum-Codes der Gruppen eines Kontos, älteste zuerst
    async listGroupRooms(userId) {
      const { data, error } = await db
        .from('group_members')
        .select('room_code')
        .eq('user_id', userId)
        .order('created_at');
      if (error) fail('Gruppen laden', error);
      return data.map((r) => r.room_code);
    },

    // --- Geräte für Benachrichtigungen ---

    async saveDevice(row) {
      const { error } = await db.from('devices').upsert(row, { onConflict: 'endpoint' });
      if (error) fail('Benachrichtigung speichern', error);
    },

    async removeDevice(endpoint, userId) {
      let query = db.from('devices').delete().eq('endpoint', endpoint);
      if (userId) query = query.eq('user_id', userId);
      const { error } = await query;
      if (error) console.error('Benachrichtigung löschen fehlgeschlagen:', error);
    },

    async touchDevice(endpoint, userId, view, activeUntil) {
      const { error } = await db
        .from('devices')
        .update({ active_view: view, active_until: activeUntil })
        .eq('endpoint', endpoint)
        .eq('user_id', userId);
      if (error) console.error('Aktivität speichern fehlgeschlagen:', error);
    },

    async listDevices(userIds) {
      if (!userIds.length) return [];
      const { data, error } = await db
        .from('devices')
        .select('endpoint, user_id, subscription, active_view, active_until, label, enabled, created_at')
        .in('user_id', userIds)
        .order('created_at');
      if (error) fail('Benachrichtigungen laden', error);
      return data;
    },

    async getDevice(endpoint) {
      const { data, error } = await db
        .from('devices')
        .select('endpoint, user_id, label, enabled')
        .eq('endpoint', endpoint)
        .maybeSingle();
      if (error) fail('Gerät laden', error);
      return data;
    },

    async setDeviceEnabled(endpoint, userId, enabled) {
      const { error } = await db.from('devices').update({ enabled }).eq('endpoint', endpoint).eq('user_id', userId);
      if (error) fail('Gerät speichern', error);
    },

    // [{ id, notify_settings }] der Empfänger, für den Filter beim Verschicken
    async getNotifySettings(userIds) {
      if (!userIds.length) return [];
      const { data, error } = await db.from('users').select('id, notify_settings').in('id', userIds);
      if (error) fail('Einstellungen laden', error);
      return data;
    },

    // --- Bilder aus Spielen ---

    async addUpload(row) {
      const { data, error } = await db.from('uploads').insert(row).select('id').single();
      if (error) fail('Bild speichern', error);
      return data.id;
    },

    async getUpload(id) {
      const { data, error } = await db
        .from('uploads')
        .select('id, room_code, owner, type, data')
        .eq('id', id)
        .maybeSingle();
      if (error) fail('Bild laden', error);
      return data;
    },

    async countUploads(code, owner) {
      const { count, error } = await db
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .eq('room_code', code)
        .eq('owner', owner);
      if (error) fail('Bilder zählen', error);
      return count ?? 0;
    },

    async removeUploads(code) {
      const { error } = await db.from('uploads').delete().eq('room_code', code);
      if (error) console.error('Bilder löschen fehlgeschlagen:', error);
    },

    // before: ISO-Zeitpunkt, ältere Bilder werden gelöscht
    async removeOldUploads(before) {
      const { error } = await db.from('uploads').delete().lt('created_at', before);
      if (error) console.error('Alte Bilder löschen fehlgeschlagen:', error);
    },

    // --- Realtime ---

    notify: (code, version) => ping(`room:${code}`, { version }),
    notifyUser: (userId) => ping(`user:${userId}`, { at: Date.now() }),

    // Live-Nachrichten der Spiele (game.live) schicken sich die Browser mit Supabase direkt.
    // Über den Server gehen sie nur ersatzweise: weiterreichen, nichts aufheben.
    pushLive: (code, payload) => ping(`room:${code}`, payload, 'live'),
    async liveSince() {
      return { seq: 0, messages: [] };
    },
  };
}
