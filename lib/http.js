// Gemeinsames für die API-Routen: Anmeldung aus dem Cookie lesen, Fehler einheitlich beantworten.
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionUser } from './auth.js';
import { getStore } from './store/index.js';

export async function readRequest(request) {
  // Nur JSON annehmen: normale Formulare anderer Seiten können so keine Anfragen mit deinem Cookie auslösen.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return { error: NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 415 }) };
  }
  let msg;
  try {
    msg = await request.json();
  } catch {
    return { error: NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 }) };
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await sessionUser(getStore(), token);
  return { msg, user, token };
}

export function errorResponse(err, what) {
  if (typeof err?.status === 'number' && err.status < 500) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Ein Spiel wirft `new Error('…')` für ungültige Züge – das ist ein Hinweis für den Spieler.
  if (err?.constructor === Error && !err.cause) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(`Fehler bei "${what}":`, err);
  return NextResponse.json({ error: `Fehler: ${err?.message ?? err}` }, { status: 500 });
}
