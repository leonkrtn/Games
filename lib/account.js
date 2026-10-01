// Konten und Freunde. Läuft auf dem Server (API-Route /api/account).
import crypto from 'node:crypto';
import { getStore } from './store/index.js';
import {
  AuthError,
  checkPassword,
  checkUsername,
  createSession,
  endSession,
  hashPassword,
  login,
  normalizeUsername,
  publicUser,
} from './auth.js';
import { createRoom, summarize } from './room.js';
import { validSubscription, ACTIVE_FOR_MS, NOTIFY_KINDS, notifySettings, pushConfigured } from './push.js';

const inviteCode = () => crypto.randomBytes(9).toString('base64url');

/**
 * Bearbeitet eine Konto-Anfrage.
 * @returns {{ body, session?, clearSession?, notes?, pings? }}
 *   session = neue Anmeldung (Cookie setzen), notes = Benachrichtigungen, pings = Konten, deren Ansicht neu laden soll
 */
export async function handleAccount(msg, user, token) {
  const store = getStore();

  switch (msg.t) {
    case 'me':
      return { body: { user: publicUser(user) } };

    case 'signup': {
      const display = checkUsername(msg.username);
      const password = checkPassword(msg.password);
      const created = await store.createUser({
        username: normalizeUsername(display),
        display_name: display,
        password_hash: await hashPassword(password),
        invite_code: inviteCode(),
      });
      if (!created) throw new AuthError('Diesen Benutzernamen gibt es schon.', 409);
      return { body: { user: publicUser(created) }, session: await createSession(store, created.id) };
    }

    case 'login': {
      const found = await login(store, msg.username, msg.password);
      return { body: { user: publicUser(found) }, session: await createSession(store, found.id) };
    }

    case 'logout':
      // Dieses Gerät soll keine Benachrichtigungen mehr für das Konto bekommen.
      if (user && msg.endpoint) await store.removeDevice(String(msg.endpoint).slice(0, 1000), user.id);
      await endSession(store, token);
      return { body: { user: null }, clearSession: true };

    // Wer lädt ein? (für die Startseite, bevor man angemeldet ist)
    case 'invite-info': {
      const inviter = await store.getUserByInvite(String(msg.code ?? '').slice(0, 40));
      return { body: { name: inviter?.display_name ?? null } };
    }
  }

  if (!user) throw new AuthError('Bitte melde dich an.', 401);

  switch (msg.t) {
    case 'home':
      return { body: await home(store, user) };

    // Anfrage per Benutzername: die andere Person muss annehmen.
    case 'friend-add': {
      const target = await store.getUserByName(normalizeUsername(msg.username));
      if (!target) throw new AuthError('Niemand hat diesen Benutzernamen.', 404);
      if (target.id === user.id) throw new AuthError('Das bist du selbst.');
      const existing = await store.getFriendshipBetween(user.id, target.id);
      if (existing?.status === 'accepted') throw new AuthError(`Du bist schon mit ${target.display_name} befreundet.`);
      if (existing && existing.requester === user.id)
        throw new AuthError(`Deine Anfrage an ${target.display_name} läuft schon.`);
      if (existing) {
        // Die andere Person hatte schon gefragt: gilt als angenommen.
        await accept(store, existing, target, user);
        return friendsNow(target, user);
      }
      const created = await store.createFriendship({ requester: user.id, addressee: target.id });
      if (!created) throw new AuthError('Das hat nicht geklappt. Bitte nochmal versuchen.', 409);
      return {
        body: { ok: true, message: `Anfrage an ${target.display_name} gesendet.` },
        notes: [homeNote(target.id, `${user.display_name} möchte mit dir spielen.`, user.id)],
        pings: [target.id],
      };
    }

    // Einladungslink: wer ihn öffnet, ist sofort befreundet (der Link wurde ja bewusst geteilt).
    case 'friend-invite': {
      const inviter = await store.getUserByInvite(String(msg.code ?? '').slice(0, 40));
      if (!inviter) throw new AuthError('Dieser Einladungslink gilt nicht mehr.', 404);
      if (inviter.id === user.id) return { body: { ok: true, self: true } };
      const existing = await store.getFriendshipBetween(user.id, inviter.id);
      if (existing?.status === 'accepted') return { body: { ok: true, room: existing.room_code } };
      const f = existing ?? (await store.createFriendship({ requester: inviter.id, addressee: user.id }));
      if (!f) throw new AuthError('Das hat nicht geklappt. Bitte nochmal versuchen.', 409);
      await accept(store, f, inviter, user);
      return friendsNow(inviter, user);
    }

    case 'friend-accept': {
      const f = await store.getFriendship(String(msg.id ?? ''));
      if (!f || f.status !== 'pending' || f.addressee !== user.id)
        throw new AuthError('Diese Anfrage gibt es nicht mehr.', 404);
      const requester = await store.getUser(f.requester);
      await accept(store, f, requester, user);
      return {
        body: { ok: true, message: `Du bist jetzt mit ${requester.display_name} befreundet.` },
        notes: [homeNote(requester.id, `${user.display_name} hat deine Anfrage angenommen.`, user.id)],
        pings: [requester.id],
      };
    }

    // Neuer Einladungslink: der alte gilt danach nicht mehr (z.B. wenn er an die Falschen geraten ist).
    case 'invite-reset': {
      const code = inviteCode();
      await store.updateUser(user.id, { invite_code: code });
      return { body: { ok: true, inviteCode: code, message: 'Neuer Einladungslink erstellt. Der alte gilt nicht mehr.' } };
    }

    // Anfrage ablehnen, zurückziehen oder Freundschaft beenden (löscht auch das gemeinsame Spielzimmer).
    case 'friend-remove': {
      const f = msg.room
        ? (await store.listFriendships(user.id)).find((x) => x.room_code === String(msg.room))
        : await store.getFriendship(String(msg.id ?? ''));
      if (!f || (f.requester !== user.id && f.addressee !== user.id))
        throw new AuthError('Das gibt es nicht mehr.', 404);
      if (f.room_code) await store.remove(f.room_code);
      await store.deleteFriendship(f.id);
      return { body: { ok: true }, pings: [f.requester === user.id ? f.addressee : f.requester] };
    }

    // --- Benachrichtigungen (pro Gerät) ---

    // explicit: jemand hat auf diesem Gerät eingeschaltet. Sonst verknüpft die App nur ein vorhandenes Abo
    // mit dem Konto; ein Gerät, das aus der Geräteliste entfernt wurde, bleibt dann aus.
    case 'push-subscribe': {
      if (!validSubscription(msg.subscription)) throw new AuthError('Ungültiges Benachrichtigungs-Abo.');
      const { endpoint, keys } = msg.subscription;
      const existing = await store.getDevice(endpoint);
      const enabled = Boolean(msg.explicit) || existing?.user_id !== user.id || existing.enabled !== false;
      await store.saveDevice({
        endpoint,
        user_id: user.id,
        subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        label: String(msg.label ?? '').slice(0, 40) || existing?.label || null,
        enabled,
        active_view: viewOf(msg.view),
        active_until: new Date(Date.now() + ACTIVE_FOR_MS).toISOString(),
      });
      return { body: { ok: true, enabled } };
    }

    case 'push-unsubscribe':
      await store.removeDevice(String(msg.endpoint ?? '').slice(0, 1000), user.id);
      return { body: { ok: true } };

    // Einstellungen: worüber und von wem, dazu die Geräte des Kontos. endpoint = dieses Gerät (falls an).
    case 'notify-get': {
      const devices = await store.listDevices([user.id]);
      return {
        body: {
          configured: pushConfigured(),
          settings: notifySettings(user.notify_settings),
          friends: await friendList(store, user),
          devices: devices
            .filter((d) => d.enabled !== false)
            .map((d) => ({
              id: deviceId(d.endpoint),
              label: d.label || 'Unbekanntes Gerät',
              since: d.created_at ?? null,
              current: d.endpoint === msg.endpoint,
            })),
        },
      };
    }

    // { key: 'turn' | 'start' | 'end' | 'friends', on } oder { friend: Konto-ID, on } (on = false: stumm)
    case 'notify-set': {
      const settings = notifySettings(user.notify_settings);
      if (NOTIFY_KINDS.includes(msg.key)) {
        settings[msg.key] = Boolean(msg.on);
      } else if (typeof msg.friend === 'string') {
        if (!(await friendList(store, user)).some((f) => f.id === msg.friend))
          throw new AuthError('Ihr seid nicht befreundet.', 404);
        settings.muted = settings.muted.filter((id) => id !== msg.friend);
        if (!msg.on) settings.muted.push(msg.friend);
      } else {
        throw new AuthError('Unbekannte Einstellung.');
      }
      await store.updateUser(user.id, { notify_settings: settings });
      return { body: { ok: true, settings } };
    }

    // Probe-Benachrichtigung an dieses Gerät, auch wenn die App gerade offen ist.
    case 'push-test': {
      const endpoint = String(msg.endpoint ?? '').slice(0, 1000);
      const device = endpoint && (await store.getDevice(endpoint));
      if (!device || device.user_id !== user.id || device.enabled === false)
        throw new AuthError('Auf diesem Gerät sind Benachrichtigungen aus.');
      return {
        body: { ok: true, message: 'Testnachricht ist unterwegs.' },
        notes: [
          {
            to: user.id,
            title: 'Spielzimmer',
            body: 'So sieht eine Benachrichtigung aus.',
            view: 'home',
            kind: 'test',
            device: endpoint,
            tag: 'test',
          },
        ],
      };
    }

    // Ein anderes Gerät aus der Liste entfernen: bekommt nichts mehr, bis man dort selbst wieder einschaltet.
    case 'push-remove': {
      const device = (await store.listDevices([user.id])).find((d) => deviceId(d.endpoint) === msg.id);
      if (!device) throw new AuthError('Dieses Gerät gibt es nicht mehr.', 404);
      await store.setDeviceEnabled(device.endpoint, user.id, false);
      return { body: { ok: true } };
    }

    // "Ich schaue gerade auf diese Ansicht" – dafür keine Benachrichtigung schicken.
    case 'seen': {
      const visible = Boolean(msg.visible);
      await store.touchDevice(
        String(msg.endpoint ?? '').slice(0, 1000),
        user.id,
        visible ? viewOf(msg.view) : null,
        visible ? new Date(Date.now() + ACTIVE_FOR_MS).toISOString() : null,
      );
      return { body: { ok: true } };
    }

    default:
      throw new AuthError('Unbekannte Anfrage.');
  }
}

const viewOf = (view) => String(view ?? 'home').slice(0, 8);
const homeNote = (to, body, from) => ({ to, title: 'Spielzimmer', body, view: 'home', kind: 'friends', from });
// Geräte tauchen in der Liste nur mit einem Kürzel auf; der Endpoint selbst bleibt auf dem Server.
const deviceId = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 16);

// Befreundete Konten (angenommen), für die Einstellungen
async function friendList(store, user) {
  const accepted = (await store.listFriendships(user.id)).filter((f) => f.status === 'accepted');
  const ids = accepted.map((f) => (f.requester === user.id ? f.addressee : f.requester));
  return (await store.getUsers(ids)).map((u) => ({ id: u.id, name: u.display_name, username: u.username }));
}

async function accept(store, friendship, requester, addressee) {
  // Wer gefragt hat, spielt Rot (erste Farbe), die andere Person Schwarz.
  const room = await createRoom(store, [
    { id: requester.id, name: requester.display_name },
    { id: addressee.id, name: addressee.display_name },
  ]);
  await store.updateFriendship(friendship.id, { status: 'accepted', room_code: room });
  return room;
}

function friendsNow(other, user) {
  return {
    body: { ok: true, message: `Du bist jetzt mit ${other.display_name} befreundet.` },
    notes: [homeNote(other.id, `${user.display_name} ist jetzt mit dir befreundet.`, user.id)],
    pings: [other.id],
  };
}

// Alles für die Startseite: Freunde mit Punkten und Spielstand, offene Anfragen, Einladungscode.
async function home(store, user) {
  const all = await store.listFriendships(user.id);
  const otherId = (f) => (f.requester === user.id ? f.addressee : f.requester);
  const people = new Map((await store.getUsers(all.map(otherId))).map((u) => [u.id, u]));
  const rooms = new Map((await store.getRooms(all.map((f) => f.room_code).filter(Boolean))).map((r) => [r.code, r]));
  const person = (f) => {
    const u = people.get(otherId(f));
    return u ? { id: u.id, name: u.display_name, username: u.username } : null;
  };

  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const f of all) {
    const other = person(f);
    if (!other) continue;
    if (f.status === 'accepted') {
      const room = rooms.get(f.room_code);
      friends.push({
        id: f.id,
        user: other,
        since: f.created_at ?? null,
        room: room?.code ?? null,
        ...(room ? summarize(room, user.id) : {}),
      });
    } else if (f.addressee === user.id) {
      incoming.push({ id: f.id, user: other });
    } else {
      outgoing.push({ id: f.id, user: other });
    }
  }
  // Wer auf mich wartet, steht oben.
  friends.sort((a, b) => Number(b.game?.myTurn ?? false) - Number(a.game?.myTurn ?? false));
  return { user: publicUser(user), inviteCode: user.invite_code, friends, incoming, outgoing };
}
