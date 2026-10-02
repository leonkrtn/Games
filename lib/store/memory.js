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
