import { NextResponse } from 'next/server';
import { tagesbildCron } from '@/lib/tagesbild-server';
import { getStore } from '@/lib/store';
import { sendPushes } from '@/lib/push';

// Täglicher Aufruf von Vercel (vercel.json, „crons“): verschickt fällige Benachrichtigungen des Tagesbilds.
// Mehrere Zeitpläne, weil Vercel in UTC rechnet (Sommer- und Winterzeit) und im Hobby-Tarif nur einmal am Tag
// pro Eintrag aufruft, irgendwann in der angegebenen Stunde. Was schon verschickt ist, geht nicht nochmal raus,
// deshalb schadet ein zusätzlicher Aufruf nicht. Ist CRON_SECRET gesetzt, schickt Vercel es mit und nur
// dann wird angenommen.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Nicht erlaubt.' }, { status: 401 });
  }
  try {
    const store = getStore();
    const { notes, pings } = await tagesbildCron();
    await Promise.all(pings.map((id) => store.notifyUser(id)));
    await sendPushes(store, notes, new URL(request.url).origin);
    return NextResponse.json({ ok: true, sent: notes.length });
  } catch (err) {
    console.error('Täglicher Aufruf:', err);
    return NextResponse.json({ error: 'Fehler beim täglichen Aufruf.' }, { status: 500 });
  }
}
