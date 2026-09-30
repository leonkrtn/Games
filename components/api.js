// Gemeinsames für die Browser-Seite: Server-Aufrufe und lokaler Speicher.

async function post(path, msg) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
  } catch {
    throw Object.assign(new Error('Keine Verbindung. Versuch es gleich nochmal.'), { offline: true });
  }
  const data = await res.json().catch(() => ({ error: 'Der Server hat nicht geantwortet.' }));
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  return data;
}

export const account = (msg) => post('/api/account', msg);
export const roomApi = (msg) => post('/api/room', msg);

// Kommt auch beim Schließen oder Wegwechseln der App noch an.
export const beacon = (msg) =>
  navigator.sendBeacon?.('/api/account', new Blob([JSON.stringify(msg)], { type: 'application/json' }));

export const storage = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
