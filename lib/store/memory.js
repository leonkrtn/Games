// Nur für die lokale Entwicklung ohne Supabase: alles im Arbeitsspeicher.
// Verhält sich wie die Datenbank (Kopien statt Referenzen, gleiche Prüfungen).

import crypto from 'node:crypto';

export function memoryStore() {
  const m = (globalThis.__spielzimmer ??= {
    rooms: new Map(),
    results: [],
    users: new Map(),
    sessions: new Map(),
    friendships: new Map(),
    devices: new Map(),
  });
  m.uploads ??= new Map(); // fehlt in Speicherständen von vor den Bildern (npm run dev läuft weiter)
  m.groupMembers ??= []; // ebenso von vor den Gruppen: [{ room_code, user_id, added_by, created_at }]
  m.tagesbild ??= new Map(); // id → { id, room_code, kind, day, user_id, version, data }
  const copy = (x) => (x === undefined ? undefined : structuredClone(x));
  const now = () => new Date().toISOString();
  const pairOf = (a, b) =>
    [...m.friendships.values()].find(
      (f) => (f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a),
    );

  return {
    // --- Räume ---
    async get(code) {
      return copy(m.rooms.get(code)) ?? null;
    },
    async getRooms(codes) {
      return codes.filter((c) => m.rooms.has(c)).map((c) => copy(m.rooms.get(c)));
    },
    async create(code, data) {
      if (m.rooms.has(code)) return false;
      m.rooms.set(code, { code, version: 0, data: copy(data) });
      return true;
    },
    async update(code, version, data) {
      const room = m.rooms.get(code);
      if (!room || room.version !== version) return false;
      m.rooms.set(code, { code, version: version + 1, data: copy(data) });
      return true;
    },
    async remove(code) {
      m.rooms.delete(code);
      m.results = m.results.filter((r) => r.room_code !== code);
      for (const f of m.friendships.values()) if (f.room_code === code) f.room_code = null;
      for (const u of m.uploads.values()) if (u.room_code === code) m.uploads.delete(u.id);
      m.groupMembers = m.groupMembers.filter((g) => g.room_code !== code);
      for (const t of m.tagesbild.values()) if (t.room_code === code) m.tagesbild.delete(t.id);
    },
    async addResult(code, result) {
      m.results.push({ room_code: code, ...copy(result), finished_at: now() });
    },
    async listResults(code, limit) {
      return copy(
        m.results
          .filter((r) => r.room_code === code)
          .reverse()
          .slice(0, limit),
      );
    },

    // --- Konten ---
    async createUser(row) {
      const taken = [...m.users.values()].some((u) => u.username === row.username || u.invite_code === row.invite_code);
      if (taken) return null;
      const user = {
        id: crypto.randomUUID(),
        failed_logins: 0,
        locked_until: null,
        notify_settings: {},
        created_at: now(),
        ...copy(row),
      };
      m.users.set(user.id, user);
      return copy(user);
    },
    async getUser(id) {
      return copy(m.users.get(id)) ?? null;
    },
    async getUsers(ids) {
      return ids
        .filter((id) => m.users.has(id))
        .map((id) => ({ id, username: m.users.get(id).username, display_name: m.users.get(id).display_name }));
    },
    async getUserByName(username) {
      return copy([...m.users.values()].find((u) => u.username === username)) ?? null;
    },
    async getUserByInvite(code) {
      return copy([...m.users.values()].find((u) => u.invite_code === code)) ?? null;
    },
    async updateUser(id, patch) {
      const u = m.users.get(id);
      if (u) Object.assign(u, copy(patch));
    },
    async createSession(row) {
      m.sessions.set(row.token_hash, copy(row));
    },
    async getSession(tokenHash) {
      return copy(m.sessions.get(tokenHash)) ?? null;
    },
    async deleteSession(tokenHash) {
      m.sessions.delete(tokenHash);
    },

    // --- Freundschaften ---
    async listFriendships(userId) {
      return copy([...m.friendships.values()].filter((f) => f.requester === userId || f.addressee === userId));
    },
    async getFriendship(id) {
      return copy(m.friendships.get(id)) ?? null;
    },
    async getFriendshipBetween(a, b) {
      return copy(pairOf(a, b)) ?? null;
    },
    async createFriendship(row) {
      if (row.requester === row.addressee || pairOf(row.requester, row.addressee)) return null;
      const f = { id: crypto.randomUUID(), status: 'pending', room_code: null, created_at: now(), ...copy(row) };
      m.friendships.set(f.id, f);
      return copy(f);
    },
    async updateFriendship(id, patch) {
      const f = m.friendships.get(id);
      if (f) Object.assign(f, copy(patch));
    },
    async deleteFriendship(id) {
      m.friendships.delete(id);
    },

    // --- Gruppen ---
    async addGroupMembers(code, userIds, addedBy) {
      for (const user_id of userIds) {
        if (m.groupMembers.some((g) => g.room_code === code && g.user_id === user_id)) continue;
        m.groupMembers.push({ room_code: code, user_id, added_by: addedBy ?? null, created_at: now() });
      }
    },
    async removeGroupMember(code, userId) {
      m.groupMembers = m.groupMembers.filter((g) => !(g.room_code === code && g.user_id === userId));
    },
    async listGroupRooms(userId) {
      return m.groupMembers.filter((g) => g.user_id === userId).map((g) => g.room_code);
    },

    // --- Geräte ---
    async saveDevice(row) {
      const old = m.devices.get(row.endpoint);
      m.devices.set(row.endpoint, { enabled: true, label: null, created_at: old?.created_at ?? now(), ...copy(row) });
    },
    async getDevice(endpoint) {
      return copy(m.devices.get(endpoint)) ?? null;
    },
    async setDeviceEnabled(endpoint, userId, enabled) {
      const d = m.devices.get(endpoint);
      if (d && d.user_id === userId) d.enabled = enabled;
    },
    async getNotifySettings(userIds) {
      return userIds
        .filter((id) => m.users.has(id))
        .map((id) => ({ id, notify_settings: copy(m.users.get(id).notify_settings ?? {}) }));
    },
    async removeDevice(endpoint, userId) {
      const d = m.devices.get(endpoint);
      if (d && (!userId || d.user_id === userId)) m.devices.delete(endpoint);
    },
    async touchDevice(endpoint, userId, view, activeUntil) {
      const d = m.devices.get(endpoint);
      if (d && d.user_id === userId) Object.assign(d, { active_view: view, active_until: activeUntil });
    },
    async listDevices(userIds) {
      return copy(
        [...m.devices.values()]
          .filter((d) => userIds.includes(d.user_id))
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
      );
    },

    // --- Bilder aus Spielen ---
    async addUpload(row) {
      const upload = { id: crypto.randomUUID(), created_at: now(), ...copy(row) };
      m.uploads.set(upload.id, upload);
      return upload.id;
    },
    async getUpload(id) {
      return copy(m.uploads.get(id)) ?? null;
    },
    async countUploads(code, owner) {
      return [...m.uploads.values()].filter((u) => u.room_code === code && u.owner === owner).length;
    },
    async removeUploads(code) {
      for (const u of m.uploads.values()) if (u.room_code === code) m.uploads.delete(u.id);
    },
    async removeOldUploads(before) {
      for (const u of m.uploads.values()) if (u.created_at < before) m.uploads.delete(u.id);
    },

    // --- Tagesbild ---
    async tbGet(ids) {
      return ids.filter((id) => m.tagesbild.has(id)).map((id) => copy(m.tagesbild.get(id)));
    },
    async tbInsert(row) {
      if (m.tagesbild.has(row.id) || !m.rooms.has(row.room_code)) return false;
      m.tagesbild.set(row.id, { day: null, user_id: null, ...copy(row), version: 0 });
      return true;
    },
    async tbUpdate(id, version, data) {
      const row = m.tagesbild.get(id);
      if (!row || row.version !== version) return false;
      m.tagesbild.set(id, { ...row, version: version + 1, data: copy(data) });
      return true;
    },
    async tbPut(row) {
      if (!m.rooms.has(row.room_code)) return;
      m.tagesbild.set(row.id, { day: null, user_id: null, ...copy(row), version: 0 });
    },
    async tbList(code, kind, from, to) {
      return copy(
        [...m.tagesbild.values()]
          .filter((t) => t.room_code === code && t.kind === kind && t.day >= from && t.day <= to)
          .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
      );
    },
    async tbPairs() {
      return copy([...m.tagesbild.values()].filter((t) => t.kind === 'paar'));
    },
    async tbRemove(code) {
      for (const t of m.tagesbild.values()) if (t.room_code === code) m.tagesbild.delete(t.id);
    },

    // Ohne Supabase fragen die Browser regelmäßig selbst nach.
    async notify() {},
    async notifyUser() {},

    // Live-Nachrichten der Spiele (game.live): ohne Supabase holen die Browser sie hier ab.
    // Nur die letzten Sekunden bleiben liegen.
    async pushLive(code, payload) {
      m.live ??= new Map();
      const box = m.live.get(code) ?? { seq: 0, list: [] };
      const at = Date.now();
      box.seq++;
      box.list = [...box.list.filter((e) => e.at > at - 10_000).slice(-299), { seq: box.seq, at, payload: copy(payload) }];
      m.live.set(code, box);
    },
    // since < 0: nur den Stand liefern
    async liveSince(code, since) {
      const box = m.live?.get(code);
      if (!box) return { seq: 0, messages: [] };
      const messages = since < 0 ? [] : box.list.filter((e) => e.seq > since);
      return { seq: box.seq, messages: copy(messages.map(({ seq, payload }) => ({ seq, payload }))) };
    },
  };
}
