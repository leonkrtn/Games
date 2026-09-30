// Nur für die lokale Entwicklung ohne Supabase: alles im Arbeitsspeicher.
// Verhält sich wie die Datenbank (Kopien statt Referenzen, gleiche Versionsprüfung).

export function memoryStore() {
  const rooms = (globalThis.__spielzimmerRooms ??= new Map());
  const results = (globalThis.__spielzimmerResults ??= []);
  const copy = (x) => structuredClone(x);

  return {
    async get(code) {
      return rooms.has(code) ? copy(rooms.get(code)) : null;
    },
    async create(code, data) {
      if (rooms.has(code)) return false;
      rooms.set(code, { code, version: 0, data: copy(data) });
      return true;
    },
    async update(code, version, data) {
      const room = rooms.get(code);
      if (!room || room.version !== version) return false;
      rooms.set(code, { code, version: version + 1, data: copy(data) });
      return true;
    },
    async remove(code) {
      rooms.delete(code);
    },
    async addResult(code, result) {
      results.push({ room_code: code, ...copy(result), finished_at: new Date().toISOString() });
    },
    async listResults(code, limit) {
      return copy(results.filter((r) => r.room_code === code).reverse().slice(0, limit));
    },
    async notify() {
      // Ohne Supabase fragen die Browser regelmäßig selbst nach.
    },
  };
}
