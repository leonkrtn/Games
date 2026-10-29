'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { post, storage } from './api';
import { getSupabase } from '@/lib/supabase-browser';
import { PLAYER_COLORS } from '@/lib/colors';
import { COMMENT_MAX, SUGGESTIONS, TASK_MAX, dayOf } from '@/lib/tagesbild';
import { finalOps, paintRaster, rasterOf, thumbnail } from '@/lib/malen';
import { createBoard } from './tagesbild-board';
import { backSvg, calendarSvg, heartSvg } from './tagesbild-art';
import './tagesbild.css';

/*
  Tagesbild (?seite=tagesbild): Jeden Tag malen zwei Freunde ein Bild zu einer Aufgabe, die sich reihum einer
  ausdenkt. Regeln und Zeiten in lib/tagesbild.js, Server in lib/tagesbild-server.js, Malbrett in
  tagesbild-board.js, Zeichnungen in tagesbild-art.js.
*/

const api = (msg) => post('/api/tagesbild', msg);
const reducedMotion = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const Svg = ({ html, className = '' }) => <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
const seenKey = (room) => `tagesbild.gesehen.${room}`;
const colorOf = (data, id) => PLAYER_COLORS[data.members.findIndex((m) => m.id === id)] ?? 'var(--muted)';
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const dayNum = (day) => Number(day.slice(8, 10));
const longDate = (day) => `${WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}, ${dayNum(day)}. ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** Tagesbild vom Server, live aktuell gehalten (Realtime über den Kanal des Kontos, im Testmodus Nachfragen). */
function useBild(user, showToast, onUnauthorized) {
  const [data, setData] = useState(null);
  const skew = useRef(0);
  const first = useRef(true);

  const take = useCallback((r) => {
    if (!r) return;
    if (r.now) skew.current = r.now - Date.now();
    setData((old) => (r.room || Array.isArray(r.friends) ? r : old));
  }, []);

  const load = useCallback(async () => {
    try {
      const zeichnung = first.current;
      first.current = false;
      take(await api({ t: 'get', zeichnung }));
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else if (!err.offline) showToast(err.message);
    }
  }, [take, onUnauthorized, showToast]);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const supabase = getSupabase();
    let cleanup;
    if (supabase) {
      const channel = supabase.channel(`user:${user.id}`).on('broadcast', { event: 'update' }, load).subscribe();
      cleanup = () => supabase.removeChannel(channel);
    } else {
      const timer = setInterval(load, 2500); // lokaler Testmodus
      cleanup = () => clearInterval(timer);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      cleanup();
    };
  }, [load, user.id]);

  const now = useCallback(() => Date.now() + skew.current, []);
  return { data, take, load, now };
}

export default function Tagesbild({ user, goHome, showToast, onUnauthorized }) {
  const { data, take, load, now } = useBild(user, showToast, onUnauthorized);
  const [, setTick] = useState(0);
  const tags = useRef(new Map()); // Tag → Bilder (Antwort von t: 'tag'), solange die Seite offen ist

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Um 10 Uhr kommt die neue Aufgabe, nach 23 Uhr ist aufgedeckt: dann neu laden
  useEffect(() => {
    if (!data?.room) return;
    const at = Math.min(data.round?.state === 'malen' ? data.round.close + 6500 : Infinity, data.next.open + 1500);
    const wait = at - now();
    if (!(wait > 0) || wait > 2 ** 31 - 1) return;
    const timer = setTimeout(load, wait);
    return () => clearTimeout(timer);
  }, [data, load, now]);

  const head = (
    <header className="tb-head">
      <button className="link back" onClick={goHome}>
        Startseite
      </button>
      <h1 className="page-title">Tagesbild</h1>
      {data?.room && <p className="muted tb-with">Mit {data.partner.name}</p>}
    </header>
  );

  if (!data)
    return (
      <div className="page tb-page" id="tagesbild-page">
        {head}
        <p className="muted">Lädt …</p>
      </div>
    );

  if (!data.room)
    return (
      <div className="page tb-page" id="tagesbild-page">
        {head}
        <Start data={data} take={take} load={load} showToast={showToast} />
      </div>
    );

  const ctx = { data, me: user.id, now, take, load, showToast, tags: tags.current };
  return (
    <div className="page tb-page" id="tagesbild-page">
      {head}
      <Today {...ctx} />
      <NextTask key={data.next.day} {...ctx} />
      {data.round && <Gallery {...ctx} />}
      <End {...ctx} />
    </div>
  );
}

// ---------- Ohne Tagesbild: starten ----------

function Start({ data, take, load, showToast }) {
  const [friend, setFriend] = useState(null);
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const free = data.friends.filter((f) => !f.taken);
  const today = data.start === dayOf(data.now);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      take(await api({ t: 'start', friend, task }));
      load();
    } catch (err) {
      showToast(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tb-intro">
        <Svg className="tb-intro-pic" html={calendarSvg} />
        <p className="page-intro">
          Jeden Tag ein Bild, für dich und eine Person. Die Aufgabe denkt ihr euch abwechselnd aus. Gemalt wird von zehn
          bis dreiundzwanzig Uhr, so lange ihr wollt. Wer fertig ist, schickt ab; haben beide abgeschickt, seht ihr die
          Bilder sofort, sonst um dreiundzwanzig Uhr. Die nächste Aufgabe kommt um zehn Uhr.
        </p>
      </div>
      {data.friends.length === 0 ? (
        <p className="empty">Dafür brauchst du zuerst einen Freund im Spielzimmer.</p>
      ) : (
        <form className="group-form" onSubmit={submit}>
          <fieldset>
            <legend className="section-title">Mit wem?</legend>
            <div className="checks">
              {data.friends.map((f) => (
                <label key={f.id} className={`check ${f.taken ? 'disabled' : ''}`} htmlFor={`tb-friend-${f.id}`}>
                  <input
                    type="radio"
                    name="tb-friend"
                    id={`tb-friend-${f.id}`}
                    checked={friend === f.id}
                    disabled={f.taken}
                    onChange={() => setFriend(f.id)}
                  />
                  <span>
                    <span className="check-title">{f.name}</span>
                    {f.taken && <span className="check-hint">Malt schon mit jemand anderem.</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="tb-first">Die erste Aufgabe</label>
            <input id="tb-first" value={task} onChange={(e) => setTask(e.target.value)} maxLength={TASK_MAX} autoComplete="off" />
            <p className="tb-hint">
              <button type="button" className="link" onClick={() => setTask(suggest(task))}>
                Vorschlag
              </button>
              <span className="muted"> Leer lassen: Die Aufgabe kommt aus einer Liste.</span>
            </p>
          </div>
          <div className="tb-start-row">
            <button className="btn primary" id="tb-start" disabled={busy || !friend || !free.length}>
              Starten
            </button>
            <span className="muted">
              {today ? (data.opensNow ? 'Ihr malt heute schon.' : 'Das erste Bild malt ihr heute ab zehn Uhr.') : 'Das erste Bild malt ihr morgen ab zehn Uhr.'}
            </span>
          </div>
        </form>
      )}
    </>
  );
}

const suggest = (current) => {
  let s = current;
  while (s === current) s = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
  return s;
};

// ---------- Heute ----------

function Countdown({ to, now }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, to - now());
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return (
    <span className="tb-count">
      <span className="num">{h ? `${h}:${String(m).padStart(2, '0')}` : Math.max(1, m)}</span> {h ? 'Stunden' : m > 1 ? 'Minuten' : 'Minute'}
    </span>
  );
}

function Today(ctx) {
  const { data, me, now } = ctx;
  const r = data.round;
  if (!r) {
    const today = data.start === dayOf(now());
    return (
      <section className="tb-today tb-wait">
        <Svg className="tb-intro-pic" html={calendarSvg} />
        <p className="big">Das erste Bild malt ihr {today ? 'heute' : 'morgen'} ab zehn Uhr.</p>
      </section>
    );
  }
  if (r.state === 'aufgedeckt') return <Reveal {...ctx} />;
  const by = r.by === me ? 'Deine Aufgabe' : r.by ? `Aufgabe von ${data.partner.name}` : 'Aufgabe aus der Liste';
  const t = r.theirs;
  const status = t.sent ? 'hat abgeschickt' : t.began ? 'malt' : 'hat noch nicht angefangen';
  return (
    <section className="tb-today" aria-labelledby="tb-task">
      <div className="tb-taskhead">
        <p className="tb-by">{by}</p>
        <h2 className="tb-task" id="tb-task">
          {r.task}
        </h2>
        <p className="tb-meta">
          <span>
            <Countdown to={r.close} now={now} /> bis zum Aufdecken
          </span>
          <span className="tb-chip" data-state={t.sent ? 'fertig' : t.began ? 'malt' : 'leer'}>
            <span className="marker" style={{ color: colorOf(data, data.partner.id) }} />
            <span className="tb-chip-name">{data.partner.name}</span>
            <span>{status}</span>
          </span>
        </p>
      </div>
      {r.mine.sent ? <Sent {...ctx} /> : <Drawing {...ctx} />}
    </section>
  );
}

// Fläche vor dem Abschicken: das Malbrett (tagesbild-board.js) und „Abschicken“ in zwei Schritten
const flipFrom = { rect: null };

function Drawing({ data, now, take, showToast }) {
  const r = data.round;
  const host = useRef(null);
  const boardRef = useRef(null);
  const initial = useRef(data.drawing?.day === r.day ? data.drawing.d : null);
  const [ready, setReady] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    let board = null;
    const mount = (d) => {
      if (!alive || !host.current) return;
      board = createBoard(host.current, { room: data.room, day: r.day, drawing: d, send: api, onSaved: take, reducedMotion: reducedMotion() });
      boardRef.current = board;
      setReady(true);
    };
    if (initial.current) mount(initial.current);
    else
      api({ t: 'zeichnung', room: data.room })
        .then((z) => z.day === r.day && mount(z.d))
        .catch((err) => showToast(err.message));
    return () => {
      alive = false;
      board?.destroy();
      boardRef.current = null;
    };
    // Das Brett lebt, solange Raum und Tag gleich bleiben
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.room, r.day]);

  // 23 Uhr: nichts mehr malen, Offenes noch speichern
  useEffect(() => {
    if (!ready) return;
    const wait = r.close - now();
    if (wait <= 0) return boardRef.current?.lock();
    const timer = setTimeout(() => boardRef.current?.lock(), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [ready, r.close, now]);

  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(timer);
  }, [confirm]);

  const submit = async () => {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    try {
      flipFrom.rect = boardRef.current.paperRect();
      take(await boardRef.current.finish());
    } catch (err) {
      flipFrom.rect = null;
      showToast(err.message);
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="tb-drawing">
      <div ref={host} className="tb-boardhost" />
      <div className="tb-send" hidden={!ready}>
        <button className="btn primary" id="tb-send" onClick={submit} disabled={busy}>
          {confirm ? 'Sicher? Nochmal tippen.' : 'Abschicken'}
        </button>
        <span className="muted">Danach kannst du nichts mehr ändern.</span>
      </div>
    </div>
  );
}

// Abgeschickt, die andere Person malt noch: das eigene Blatt hängt schon
function Sent({ data, me }) {
  const canvas = useRef(null);
  const frame = useRef(null);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let alive = true;
    const from = flipFrom.rect;
    flipFrom.rect = null;
    api({ t: 'zeichnung', room: data.room })
      .then((z) => {
        if (!alive || !canvas.current) return;
        const ops = finalOps(z.d);
        setEmpty(!ops.length);
        paintRaster(canvas.current, rasterOf(ops));
      })
      .catch(() => {});
    // FLIP: Das Malbrett wird zum Blatt
    const to = frame.current?.getBoundingClientRect();
    if (from && to?.width && !reducedMotion()) {
      const k = from.width / to.width;
      frame.current.animate(
        [{ transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${k})` }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.6,0,.2,1)' },
      );
    }
    return () => {
      alive = false;
    };
  }, [data.room]);
  return (
    <div className="tb-sent">
      <figure className="tb-fig tb-fig-sent" style={{ '--pc': colorOf(data, me) }}>
        <div className="tb-sheet" ref={frame}>
          <canvas ref={canvas} width="600" height="600" role="img" aria-label="Dein Bild" />
          {empty && <p className="tb-noimg">Leeres Blatt</p>}
          <i className="tb-tape" aria-hidden="true" />
        </div>
      </figure>
      <div>
        <p className="big">Abgeschickt.</p>
        <p className="muted">
          Aufgedeckt wird, sobald {data.partner.name} abschickt, spätestens um dreiundzwanzig Uhr.
        </p>
      </div>
    </div>
  );
}

// Aufgedeckt: beide Blätter, beim ersten Ansehen drehen sie sich um
function Reveal(ctx) {
  const { data, tags, showToast } = ctx;
  const r = data.round;
  const [entry, setEntry] = useState(() => tags.get(r.day) ?? null);
  const animate = useRef(storage.get(seenKey(data.room)) !== r.day && !reducedMotion());

  useEffect(() => {
    let alive = true;
    api({ t: 'tag', room: data.room, day: r.day })
      .then((t) => {
        if (!alive) return;
        tags.set(r.day, t);
        setEntry(t);
      })
      .catch((err) => showToast(err.message));
    return () => {
      alive = false;
    };
  }, [data.room, r.day, tags, showToast]);

  useEffect(() => {
    if (entry) storage.set(seenKey(data.room), r.day);
  }, [entry, data.room, r.day]);

  const by = r.by === ctx.me ? 'Deine Aufgabe' : r.by ? `Aufgabe von ${data.partner.name}` : 'Aufgabe aus der Liste';
  return (
    <section className="tb-today" aria-labelledby="tb-task">
      <div className="tb-taskhead">
        <p className="tb-by">{by}</p>
        <h2 className="tb-task" id="tb-task">
          {r.task}
        </h2>
        <p className="tb-meta">
          <span>Aufgedeckt.</span>
        </p>
      </div>
      {entry ? (
        // Herzen und Kommentare kommen frisch mit jedem Stand (die andere Person kann sie gerade ändern)
        <Pair {...ctx} entry={{ ...entry, hearts: r.hearts, comments: r.comments }} setEntry={setEntry} animate={animate.current} />
      ) : (
        <div className="tb-pair tb-pair-wait" />
      )}
    </section>
  );
}

// ---------- Zwei Blätter mit Herz und Kommentar ----------

function Pair({ data, me, entry, setEntry, animate, take, showToast, tags }) {
  const ref = useRef(null);
  const order = [data.partner.id, me];

  // Auftritt: Blätter gleiten hoch, drehen sich nacheinander um, dann Herz und Kommentar (vor dem ersten Bild,
  // sonst blitzt die Vorderseite auf)
  useLayoutEffect(() => {
    if (!animate || !ref.current) return;
    const figs = [...ref.current.querySelectorAll('.tb-fig')];
    figs.forEach((fig, i) => {
      fig.animate([{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        delay: i * 90,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      });
      fig.querySelector('.tb-flip-inner')?.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], {
        duration: 600,
        delay: 260 + i * 300,
        easing: 'cubic-bezier(.6,0,.2,1)',
        fill: 'backwards',
      });
      fig.querySelector('.tb-social')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 980, fill: 'backwards' });
    });
  }, [animate]);

  const update = (body) => {
    take(body);
    if (body.dayInfo?.day === entry.day) {
      const next = { ...entry, hearts: body.dayInfo.hearts, comments: body.dayInfo.comments };
      tags.set(entry.day, next);
      setEntry(next);
    }
  };

  return (
    <div className="tb-pair" ref={ref}>
      {order.map((id, i) => (
        <Sheet
          key={id}
          data={data}
          id={id}
          me={me}
          i={i}
          entry={entry}
          pic={entry.pics[id]}
          update={update}
          showToast={showToast}
        />
      ))}
    </div>
  );
}

function Sheet({ data, id, me, i, entry, pic, update, showToast }) {
  const canvas = useRef(null);
  const mine = id === me;
  const name = mine ? 'Du' : data.partner.name;
  const ops = pic?.ops ?? [];

  useEffect(() => {
    if (!canvas.current || !ops.length) return;
    const r = rasterOf(ops);
    paintRaster(canvas.current, r);
    // Vorschaubild fehlt oder ist alt (um 23 Uhr abgeschickt): nachreichen
    if (pic.mini !== pic.seq) {
      api({ t: 'thumb', room: data.room, day: entry.day, user: id, seq: pic.seq, src: thumbnail(r) }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pic?.seq, entry.day, id, data.room]);

  return (
    <figure className="tb-fig" style={{ '--pc': colorOf(data, id), '--tilt': i ? '1.2deg' : '-1.4deg' }}>
      <div className="tb-flip">
        <div className="tb-flip-inner">
          <div className="tb-sheet tb-face">
            {ops.length ? (
              <canvas ref={canvas} width="1000" height="1000" role="img" aria-label={mine ? 'Dein Bild' : `Bild von ${data.partner.name}`} />
            ) : (
              <p className="tb-noimg">{mine ? 'Du hast an diesem Tag nicht gemalt.' : `${data.partner.name} hat an diesem Tag nicht gemalt.`}</p>
            )}
          </div>
          <div className="tb-sheet tb-face tb-back" dangerouslySetInnerHTML={{ __html: backSvg(dayNum(entry.day)) }} />
        </div>
        <i className="tb-tape" aria-hidden="true" />
      </div>
      <figcaption className="tb-name">
        <span className="marker" style={{ color: colorOf(data, id) }} />
        {name}
      </figcaption>
      <Social data={data} me={me} owner={id} entry={entry} hasPic={ops.length > 0} update={update} showToast={showToast} />
    </figure>
  );
}

// Unter dem Bild der anderen Person: Herz geben und kommentieren. Unter dem eigenen: was sie dazu sagt.
function Social({ data, me, owner, entry, hasPic, update, showToast }) {
  const partner = data.partner;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(0);

  // Platz für Herz und Kommentar ist immer da: Kommt etwas von der anderen Person, rutscht nichts.
  if (owner === me) {
    const heart = Boolean(entry.hearts?.[partner.id]);
    const comment = entry.comments?.[partner.id]?.text;
    return (
      <div className="tb-social">
        <p className="tb-got">
          {heart && <Svg className="tb-heart-small" html={heartSvg(true)} />}
          {heart && <span className="tb-got-name">{partner.name}</span>}
          <span>{heart ? 'gefällt dein Bild.' : ' '}</span>
        </p>
        <p className="tb-comment">{comment ? `„${comment}“` : ' '}</p>
      </div>
    );
  }
  if (!hasPic) return <div className="tb-social" />;

  const given = Boolean(entry.hearts?.[me]);
  const mineComment = entry.comments?.[me]?.text ?? '';
  const send = async (msg) => {
    setBusy(true);
    try {
      update(await api({ ...msg, room: data.room, day: entry.day }));
      return true;
    } catch (err) {
      showToast(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (!given) setPop((p) => p + 1);
    await send({ t: 'herz', on: !given });
  };
  const save = async (e) => {
    e.preventDefault();
    if (await send({ t: 'kommentar', text })) setEditing(false);
  };

  return (
    <div className="tb-social">
      <button
        type="button"
        className="tb-heart"
        aria-pressed={given}
        aria-label={`Herz für das Bild von ${partner.name}`}
        disabled={busy}
        onClick={toggle}
      >
        <Svg key={pop} className={`tb-heart-icon ${pop && given ? 'pop' : ''}`} html={heartSvg(given)} />
        <span>{given ? 'Herz gegeben' : 'Herz geben'}</span>
      </button>
      {editing ? (
        <form className="tb-comment-form" onSubmit={save}>
          <label htmlFor={`tb-c-${entry.day}`}>Dein Kommentar zum Bild von {partner.name}</label>
          <div className="tb-comment-row">
            <input
              id={`tb-c-${entry.day}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={COMMENT_MAX}
              autoComplete="off"
              autoFocus
            />
            <button className="btn" disabled={busy}>
              Senden
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="tb-comment">{mineComment ? `„${mineComment}“` : ' '}</p>
          <p>
            <button
              type="button"
              className="link"
              onClick={() => {
                setText(mineComment);
                setEditing(true);
              }}
            >
              {mineComment ? 'Kommentar ändern' : 'Kommentieren'}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

// ---------- Aufgabe für den nächsten Tag ----------

function NextTask({ data, me, now, take, showToast }) {
  const n = data.next;
  const when = n.day === dayOf(now()) ? 'heute' : 'morgen';
  const [editing, setEditing] = useState(!n.task);
  const [text, setText] = useState(n.task ?? '');
  const [busy, setBusy] = useState(false);
  const revealed = !data.round || data.round.state === 'aufgedeckt';

  if (n.setter !== me)
    return (
      <section className="tb-next">
        <h2 className="section-title">Aufgabe für {when}</h2>
        <p>
          {data.partner.name} denkt sie sich aus.{n.ready ? ' Sie steht schon fest.' : ''} Sie kommt um zehn Uhr
          {revealed ? (
            <>
              , in <Countdown to={n.open} now={now} />
            </>
          ) : null}
          .
        </p>
      </section>
    );

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = await api({ t: 'aufgabe', room: data.room, day: n.day, text });
      take(body);
      setText(body.next.task ?? '');
      setEditing(!body.next.task);
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tb-next">
      <h2 className="section-title">Aufgabe für {when}</h2>
      <p className="muted tb-next-intro">
        Du denkst sie dir aus. {data.partner.name} sieht sie um zehn Uhr
        {revealed ? (
          <>
            , in <Countdown to={n.open} now={now} />
          </>
        ) : null}
        .
      </p>
      {editing ? (
        <form className="tb-task-form" onSubmit={save}>
          <label htmlFor="tb-next-task">Deine Aufgabe</label>
          <input id="tb-next-task" value={text} onChange={(e) => setText(e.target.value)} maxLength={TASK_MAX} autoComplete="off" />
          <p className="tb-hint">
            <button className="btn" disabled={busy}>
              Speichern
            </button>
            <button type="button" className="link" onClick={() => setText(suggest(text))}>
              Vorschlag
            </button>
          </p>
          {!n.task && <p className="muted tb-small">Schreibst du keine, kommt eine aus der Liste.</p>}
        </form>
      ) : (
        <div className="tb-task-set">
          <p className="tb-task-text">{n.task}</p>
          <button type="button" className="link" onClick={() => setEditing(true)}>
            Ändern
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- Alle Tage: Kalender ----------

const monthOf = (day) => day.slice(0, 7);
const shiftMonth = (month, k) => {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

function Gallery(ctx) {
  const { data, me, now, showToast } = ctx;
  const last = monthOf(data.round?.day ?? dayOf(now()));
  const first = monthOf(data.start);
  const [month, setMonth] = useState(last);
  const [months, setMonths] = useState({});
  const [open, setOpen] = useState(null);
  const r = data.round;
  const version = `${r?.day}:${r?.state}:${JSON.stringify(data.hearts)}`;

  useEffect(() => {
    let alive = true;
    api({ t: 'monat', room: data.room, month })
      .then((m) => alive && setMonths((all) => ({ ...all, [month]: m.days })))
      .catch((err) => !err.offline && showToast(err.message));
    return () => {
      alive = false;
    };
  }, [data.room, month, version, showToast]);

  const days = months[month] ?? null;
  const byDay = new Map((days ?? []).map((d) => [d.day, d]));
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Montag zuerst
  const today = dayOf(now());
  const order = [data.partner.id, me];
  const all = (days ?? []).map((d) => d.day);

  return (
    <section className="tb-gallery" aria-labelledby="tb-gallery-title">
      <div className="tb-gallery-head">
        <h2 className="section-title" id="tb-gallery-title">
          Alle Tage
        </h2>
        <p className="tb-hearts">
          <Svg className="tb-heart-small" html={heartSvg(true)} />
          <span>Herzen bekommen:</span>
          {[me, data.partner.id].map((id) => (
            <span key={id}>
              {id === me ? 'du' : data.partner.name} <span className="num">{data.hearts[id] ?? 0}</span>
            </span>
          ))}
        </p>
      </div>
      <div className="tb-month">
        <button type="button" className="tb-month-btn" aria-label="Monat davor" disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))}>
          ←
        </button>
        <p className="tb-month-name">
          {MONTHS[m - 1]} <span className="num">{y}</span>
        </p>
        <button type="button" className="tb-month-btn" aria-label="Monat danach" disabled={month >= last} onClick={() => setMonth(shiftMonth(month, 1))}>
          →
        </button>
      </div>
      <div className="tb-cal" role="group" aria-label={`${MONTHS[m - 1]} ${y}`}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
          <span key={w} className="tb-cal-wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} className="tb-cal-cell is-blank" />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`;
          const e = byDay.get(day);
          const thumbs = e ? order.map((id) => e.thumbs[id]).filter((t) => t && !t.empty) : [];
          const cls = `tb-cal-cell ${day === today ? 'is-today' : ''} ${e ? 'has-day' : ''}`;
          const inner = (
            <>
              <span className="tb-cal-n num">{i + 1}</span>
              <span className="tb-cal-pics" data-n={thumbs.length}>
                {thumbs.map((t, k) => (
                  <img key={k} src={t.src} alt="" />
                ))}
              </span>
            </>
          );
          return e ? (
            <button key={day} type="button" className={cls} aria-label={`${longDate(day)}: ${e.task}`} onClick={() => setOpen(day)}>
              {inner}
            </button>
          ) : (
            <span key={day} className={cls}>
              {inner}
            </span>
          );
        })}
      </div>
      {days && !days.length && <p className="muted">In diesem Monat gibt es noch keine aufgedeckten Bilder.</p>}
      {open && (
        <DayView
          {...ctx}
          day={open}
          list={all}
          onPick={setOpen}
          onClose={() => setOpen(null)}
          onChange={(info) =>
            setMonths((ms) => ({
              ...ms,
              [month]: (ms[month] ?? []).map((d) => (d.day === info.day ? { ...d, hearts: info.hearts, comments: info.comments } : d)),
            }))
          }
        />
      )}
    </section>
  );
}

// Ein Tag groß: Aufgabe, beide Bilder, Herz und Kommentar; blättern zum Tag davor und danach
function DayView(ctx) {
  const { data, day, list, onPick, onClose, onChange, tags, showToast } = ctx;
  const [entry, setEntry] = useState(() => tags.get(day) ?? null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const i = list.indexOf(day);

  useEffect(() => {
    setEntry(tags.get(day) ?? null);
    let alive = true;
    api({ t: 'tag', room: data.room, day })
      .then((t) => {
        if (!alive) return;
        tags.set(day, t);
        setEntry(t);
      })
      .catch((err) => showToast(err.message));
    return () => {
      alive = false;
    };
  }, [data.room, day, tags, showToast]);

  // Fokus auf „Schließen“, Escape schließt, die Seite dahinter scrollt nicht. Nur beim Öffnen: Die Seite
  // zeichnet bei jeder Aktualisierung neu, der Fokus darf dabei nicht aus einem Eingabefeld springen.
  useEffect(() => {
    const before = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const set = (next) => {
    setEntry(next);
    onChange(next);
  };
  const by = entry && (entry.by === ctx.me ? 'Deine Aufgabe' : entry.by ? `Aufgabe von ${data.partner.name}` : 'Aufgabe aus der Liste');

  return (
    <div className="tb-layer" role="dialog" aria-modal="true" aria-label={longDate(day)} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tb-dayview">
        <div className="tb-dayview-head">
          <p className="tb-date">{longDate(day)}</p>
          <button type="button" className="btn" ref={closeRef} onClick={onClose}>
            Schließen
          </button>
        </div>
        {entry ? (
          <>
            <p className="tb-by">{by}</p>
            <h3 className="tb-task">{entry.task}</h3>
            <Pair {...ctx} entry={entry} setEntry={set} animate={false} />
          </>
        ) : (
          <p className="muted">Lädt …</p>
        )}
        <div className="tb-dayview-nav">
          <button type="button" className="link" disabled={i <= 0} onClick={() => onPick(list[i - 1])}>
            ← Tag davor
          </button>
          <button type="button" className="link" disabled={i < 0 || i >= list.length - 1} onClick={() => onPick(list[i + 1])}>
            Tag danach →
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Beenden ----------

function End({ data, load, showToast }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);
  const end = async () => {
    if (!armed) return setArmed(true);
    try {
      await api({ t: 'beenden', room: data.room });
      load();
    } catch (err) {
      showToast(err.message);
    }
  };
  return (
    <footer className="tb-end">
      <button type="button" className="link" onClick={end}>
        {armed ? 'Sicher? Alle Bilder gehen verloren. Nochmal tippen.' : 'Tagesbild beenden'}
      </button>
    </footer>
  );
}

// ---------- Startseite ----------

export function TagesbildCard({ info, onOpen }) {
  return (
    <button className="tb-card" id="tb-card" onClick={onOpen}>
      <Svg className="tb-card-pic" html={calendarSvg} />
      <span className="tb-card-text">
        <span className="tb-card-name">Tagesbild</span>
        <span className="tb-card-with">Mit {info.partner.name}</span>
        <span className={`tb-card-status ${info.urgent ? 'urgent' : ''}`}>{info.text}</span>
      </span>
    </button>
  );
}
