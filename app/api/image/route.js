import { NextResponse } from 'next/server';
import { saveUpload, loadUpload } from '@/lib/uploads';
import { readRequest, errorResponse } from '@/lib/http';
import { SESSION_COOKIE, sessionUser } from '@/lib/auth';
import { getStore } from '@/lib/store';

// Bild aus einem Spiel hochladen: { room, type, data (Base64) } → { id }
export async function POST(request) {
  const { msg, user, error } = await readRequest(request);
  if (error) return error;
  if (!user) return NextResponse.json({ error: 'Bitte melde dich an.' }, { status: 401 });
  try {
    return NextResponse.json(await saveUpload(msg, user));
  } catch (err) {
    return errorResponse(err, 'image');
  }
}

// Bild anzeigen: /api/image?id=… (für <img src>, das Sitzungs-Cookie kommt automatisch mit)
export async function GET(request) {
  const user = await sessionUser(getStore(), request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return new Response(null, { status: 401 });
  try {
    const { type, bytes } = await loadUpload(new URL(request.url).searchParams.get('id') ?? '', user);
    return new Response(bytes, {
      headers: {
        'Content-Type': type,
        // Bilder ändern sich nie; nur im eigenen Browser zwischenspeichern
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (typeof err?.status === 'number') return new Response(null, { status: err.status });
    console.error('Fehler beim Laden eines Bildes:', err);
    return new Response(null, { status: 500 });
  }
}
