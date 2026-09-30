// Konten: Passwörter prüfen, Sitzungen per Cookie. Läuft nur auf dem Server.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const SESSION_COOKIE = 'sz_session';
const SESSION_DAYS = 365;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 10;

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// --- Eingaben ---

export function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('de');
}

export function checkUsername(display) {
  const name = String(display ?? '').trim();
  if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(name)) {
    throw new AuthError(
      'Der Benutzername braucht 3 bis 20 Zeichen: Buchstaben, Zahlen, Punkt, Strich oder Unterstrich.',
    );
  }
  return name;
}

export function checkPassword(password) {
  const pw = String(password ?? '');
  if (pw.length < 8) throw new AuthError('Das Passwort braucht mindestens 8 Zeichen.');
  if (pw.length > 200) throw new AuthError('Das Passwort ist zu lang.');
  return pw;
}

// --- Passwörter (scrypt mit zufälligem Salz) ---

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

// Anmelden mit Schutz gegen Durchprobieren: nach mehreren Fehlversuchen kurz gesperrt.
export async function login(store, username, password) {
  const user = await store.getUserByName(normalizeUsername(username));
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AuthError(`Zu viele Fehlversuche. Versuch es in ${LOCK_MINUTES} Minuten nochmal.`, 429);
  }
  const ok = user ? await verifyPassword(String(password ?? ''), user.password_hash) : await fakeWork();
  if (!user || !ok) {
    if (user) {
      const failed = (user.failed_logins ?? 0) + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await store.updateUser(user.id, {
        failed_logins: lock ? 0 : failed,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      });
    }
    throw new AuthError('Benutzername oder Passwort stimmt nicht.', 401);
  }
  if (user.failed_logins) await store.updateUser(user.id, { failed_logins: 0, locked_until: null });
  return user;
}

// Gleich lange rechnen, auch wenn es den Namen nicht gibt (verrät sonst, welche Namen existieren).
async function fakeWork() {
  await scrypt('x', 'spielzimmer-salz', 64);
  return false;
}

// --- Sitzungen ---

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('base64url');

export async function createSession(store, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await store.createSession({ token_hash: hashToken(token), user_id: userId, expires_at: expires.toISOString() });
  return { token, expires };
}

export async function sessionUser(store, token) {
  if (!token || token.length > 100) return null;
  const session = await store.getSession(hashToken(token));
  if (!session || new Date(session.expires_at) < new Date()) return null;
  return store.getUser(session.user_id);
}

export async function endSession(store, token) {
  if (token) await store.deleteSession(hashToken(token));
}

export function sessionCookie(token, expires) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  };
}

export const publicUser = (u) => (u ? { id: u.id, name: u.display_name, username: u.username } : null);
