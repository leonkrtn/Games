import { NextResponse, after } from 'next/server';
import { handle } from '@/lib/room';
import { readRequest, errorResponse } from '@/lib/http';
import { getStore } from '@/lib/store';
import { sendPushes } from '@/lib/push';

// Alles im Spielzimmer: { t: 'state' | 'choose' | 'restart' | 'lobby' | 'action', room, ... }
export async function POST(request) {
  const { msg, user, error } = await readRequest(request);
  if (error) return error;
  if (!user) return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 });
  try {
    const { snapshot, changed, notes } = await handle(msg, user);
    if (changed) {
      const origin = new URL(request.url).origin;
      after(async () => {
        const store = getStore();
        // Raum neu laden lassen, und die Freundeslisten der Mitspieler (Punkte, wer dran ist).
        await Promise.all([
          store.notify(snapshot.room, snapshot.version),
          ...snapshot.players.map((p) => store.notifyUser(p.id)),
        ]);
        await sendPushes(store, notes, origin).catch((err) => console.error('Benachrichtigungen:', err));
      });
    }
    return NextResponse.json(snapshot);
  } catch (err) {
    return errorResponse(err, msg?.t);
  }
}
