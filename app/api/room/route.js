import { NextResponse, after } from 'next/server';
import { handle, live } from '@/lib/room';
import { readRequest, errorResponse } from '@/lib/http';
import { getStore } from '@/lib/store';
import { sendPushes } from '@/lib/push';

// Alles im Spielzimmer: { t: 'state' | 'choose' | 'restart' | 'lobby' | 'action' | 'live' | 'group-…', room, ... }
export async function POST(request) {
  const { msg, user, error } = await readRequest(request);
  if (error) return error;
  if (!user) return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 });
  try {
    if (msg?.t === 'live') return NextResponse.json(await live(msg, user)); // Ersatzweg für game.live
    const { snapshot, changed, notes } = await handle(msg, user);
    if (changed) {
      const origin = new URL(request.url).origin;
      after(async () => {
        const store = getStore();
        // Raum neu laden lassen, und die Startseiten der Mitspieler (Punkte, wer dran ist).
        // Wer die Gruppe eben verlassen hat, steht nicht mehr in players, braucht aber auch eine neue Startseite.
        const users = new Set([...snapshot.players.map((p) => p.id), ...(snapshot.left ? [user.id] : [])]);
        await Promise.all([store.notify(snapshot.room, snapshot.version), ...[...users].map((id) => store.notifyUser(id))]);
        await sendPushes(store, notes, origin).catch((err) => console.error('Benachrichtigungen:', err));
      });
    }
    return NextResponse.json(snapshot);
  } catch (err) {
    return errorResponse(err, msg?.t);
  }
}
