import { NextResponse, after } from 'next/server';
import { handleAccount } from '@/lib/account';
import { sessionCookie } from '@/lib/auth';
import { readRequest, errorResponse } from '@/lib/http';
import { getStore } from '@/lib/store';
import { sendPushes } from '@/lib/push';

// Konto, Freunde und Benachrichtigungs-Einstellungen: { t: 'me' | 'signup' | 'login' | 'logout' | 'home' | 'friend-…' | 'push-…' | 'seen', ... }
export async function POST(request) {
  const { msg, user, token, error } = await readRequest(request);
  if (error) return error;
  try {
    const out = await handleAccount(msg, user, token);
    const res = NextResponse.json(out.body);
    if (out.session) res.cookies.set(sessionCookie(out.session.token, out.session.expires));
    if (out.clearSession) res.cookies.set(sessionCookie('', new Date(0)));
    if (out.notes?.length || out.pings?.length) {
      const origin = new URL(request.url).origin;
      after(async () => {
        const store = getStore();
        await Promise.all((out.pings ?? []).map((id) => store.notifyUser(id)));
        await sendPushes(store, out.notes, origin).catch((err) => console.error('Benachrichtigungen:', err));
      });
    }
    return res;
  } catch (err) {
    return errorResponse(err, msg?.t);
  }
}
