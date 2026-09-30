import { NextResponse, after } from 'next/server';
import { handle, UserError } from '@/lib/room';
import { getStore } from '@/lib/store';

// Eine Route für alles: { t: 'join' | 'state' | 'choose' | 'restart' | 'lobby' | 'action' | 'leave', ... }
export async function POST(request) {
  let msg;
  try {
    msg = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  try {
    const { snapshot, changed } = await handle(msg);
    if (changed) after(() => getStore().notify(snapshot.room, snapshot.version));
    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: err.status });
    // Ein Spiel wirft `new Error('…')` für ungültige Züge – das ist ein Hinweis für den Spieler.
    if (err?.constructor === Error && !err.cause) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(`Fehler bei "${msg?.t}":`, err);
    return NextResponse.json({ error: `Fehler: ${err?.message ?? err}` }, { status: 500 });
  }
}
