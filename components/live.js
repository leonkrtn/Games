'use client';

import { roomApi } from './api';

/**
 * Live-Nachrichten zwischen den Browsern eines Spielzimmers (game.live in den Spielen).
 * Für alles, was schneller ankommen soll als ein Zug, z.B. Striche beim Zeichnen: Die Nachrichten
 * werden nicht gespeichert, können verloren gehen und erreichen nur die anderen im Raum.
 * Mit Supabase gehen sie direkt über den Realtime-Kanal des Raums (siehe Room.js),
 * im lokalen Testmodus über den Server (relay).
 */
export function createLive() {
  const listeners = new Set();
  let transport = null;
  return {
    send: (payload) => transport?.(payload),
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    receive(payload) {
      for (const fn of [...listeners]) {
        try {
          fn(payload);
        } catch (err) {
          console.error('Fehler bei einer Live-Nachricht:', err);
        }
      }
    },
    listening: () => listeners.size > 0,
    // Weg zum Verschicken setzen; Rückgabe entfernt ihn wieder.
    use(fn) {
      transport = fn;
      return () => {
        if (transport === fn) transport = null;
      };
    },
  };
}

/**
 * Testmodus ohne Supabase: Nachrichten an den Server schicken und alle 150 ms abholen,
 * solange ein Spiel zuhört. Rückgabe: beendet das Abholen.
 */
export function relay(live, room) {
  let since = -1; // -1: beim ersten Abholen nur den Stand merken, nichts Altes ausliefern
  let stopped = false;
  let busy = false;

  const take = (r) => {
    if (stopped || !r) return;
    // Mehrere Anfragen können sich überschneiden: jede Nachricht nur einmal ausliefern.
    for (const m of r.messages ?? []) {
      if (m.seq <= since) continue;
      since = m.seq;
      live.receive(m.payload);
    }
    since = Math.max(since, r.seq ?? 0);
  };
  const pull = (data) => roomApi({ t: 'live', room, since, data }).then(take, () => {});

  const timer = setInterval(async () => {
    if (busy || !live.listening()) return;
    busy = true;
    await pull();
    busy = false;
  }, 150);
  const stop = live.use((payload) => pull(payload));
  pull();

  return () => {
    stopped = true;
    clearInterval(timer);
    stop();
  };
}
