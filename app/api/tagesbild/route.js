import { NextResponse, after } from 'next/server';
import { handleTagesbild } from '@/lib/tagesbild-server';
import { readRequest, errorResponse } from '@/lib/http';
import { getStore } from '@/lib/store';
import { sendPushes } from '@/lib/push';

// Das Tagesbild: { t: 'get' | 'start' | 'aufgabe' | 'malen' | 'herz' | 'kommentar' | 'tag' | 'monat' | 'thumb' | 'beenden', ... }
export async function POST(request) {
  const { msg, user, error } = await readRequest(request);
  if (error) return error;
  if (!user) return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 });
  try {
    const out = await handleTagesbild(msg, user);
    if (out.notes?.length || out.pings?.length) {
      const origin = new URL(request.url).origin;
      after(async () => {
        const store = getStore();
        await Promise.all((out.pings ?? []).map((id) => store.notifyUser(id)));
        await sendPushes(store, out.notes, origin).catch((err) => console.error('Benachrichtigungen:', err));
      });
    }
    return NextResponse.json(out.body);
  } catch (err) {
    return errorResponse(err, `tagesbild ${msg?.t}`);
  }
}
