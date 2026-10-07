'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { post } from './api';
import { getSupabase } from '@/lib/supabase-browser';
import {
  FOOD,
  FULL,
  GAME_MILES,
  PLACE,
  PLACES,
  current,
  isNight,
  mood,
  pantry,
  placeAt,
  placeTo,
  stainCount,
  stainOrder,
  statusText,
  trips,
} from '@/lib/hai';
import { SPOTS, foodSvg, heart, mapIconSvg, shark, sharkSvg, spongeSvg } from './hai-art';
import { MAP_H, MAP_W, project, scene, worldMap } from './hai-orte';
import { createStage } from './hai-stage';
import './hai.css';

/*
  Der gemeinsame Hai (?seite=hai): ein Kuscheltier, das sich zwei Freunde teilen. Pflege (essen, trinken,
  putzen) auf der Bühne, Reisen auf der Weltkarte. Regeln in lib/hai.js, Server in lib/hai-server.js,
  Zeichnungen in hai-art.js und hai-orte.js, Bewegungen der Bühne in hai-stage.js.
*/

const haiApi = (msg) => post('/api/hai', msg);
const WORDS = ['null', 'eine', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
// Zahl im Text: bis zwölf als Wort, darüber in der Zahlenschrift (die Textschrift hat eine durchgestrichene Null)
const Num = ({ n }) => (n <= 12 ? WORDS[n] : <span className="num">{n}</span>);
const reducedMotion = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const Svg = ({ html, className = '' }) => <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;

/** Hai-Daten vom Server, live aktuell gehalten. Während einer eigenen Animation wird nichts ersetzt. */
function useHai(user, showToast, onUnauthorized) {
  const [data, setData] = useState(null);
  const skew = useRef(0);
  const busy = useRef(0);
  const pending = useRef(false);

  const take = useCallback((r) => {
    skew.current = r.now ? r.now - Date.now() : skew.current;
    setData(r);
  }, []);

  const load = useCallback(async () => {
    if (busy.current) {
      pending.current = true;
      return;
    }
    try {
      take(await haiApi({ t: 'get' }));
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

  // Anfrage mit Animation: busy hält Neuladen zurück, bis apply() die Antwort zeigt.
  const begin = useCallback(() => {
    busy.current++;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      busy.current--;
      if (!busy.current && pending.current) {
        pending.current = false;
        load();
      }
    };
  }, [load]);

  const now = useCallback(() => Date.now() + skew.current, []);
  return { data, take, load, begin, now };
}

export default function Hai({ user, goHome, showToast, onUnauthorized }) {
  const { data, take, load, begin, now } = useHai(user, showToast, onUnauthorized);
  const [tab, setTab] = useState('hai');
  const [, setTick] = useState(0);

  // Die Werte sinken langsam: alle halbe Minute neu zeichnen
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const head = (title) => (
    <header>
      <button className="link back" onClick={goHome}>
        Startseite
      </button>
      <h1 className="page-title">{title}</h1>
    </header>
  );

  if (!data)
    return (
      <div className="page hai-page" id="hai-page">
        {head('Hai')}
        <p className="muted">Lädt …</p>
      </div>
    );

  if (!data.hai)
    return (
      <div className="page hai-page" id="hai-page">
        {head('Hai adoptieren')}
        <Adopt friends={data.friends ?? []} take={take} showToast={showToast} />
      </div>
    );

  const send = (msg) => haiApi({ ...msg, room: data.room });
  const props = { data, user, now, send, take, load, begin, showToast };
  return (
    <div className="page hai-page" id="hai-page">
      {head(data.hai.name)}
      <div className="tabs hai-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'hai'} className={tab === 'hai' ? 'active' : ''} onClick={() => setTab('hai')} id="hai-tab-care">
          Pflege
        </button>
        <button role="tab" aria-selected={tab === 'welt'} className={tab === 'welt' ? 'active' : ''} onClick={() => setTab('welt')} id="hai-tab-world">
          Weltkarte
          {trips(data.hai).free > 0 && <span className="hai-dot" role="img" aria-label="Eine Reise ist frei" />}
        </button>
      </div>
      {tab === 'hai' ? <Care {...props} /> : <World {...props} onHai={() => setTab('hai')} />}
      {tab === 'hai' && <Manage {...props} onReleased={() => load()} />}
    </div>
  );
}

// --- Adoptieren ---

function Adopt({ friends, take, showToast }) {
  const [name, setName] = useState('');
  const [friend, setFriend] = useState(null);
  const [busy, setBusy] = useState(false);
  const free = friends.filter((f) => !f.taken);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      take(await haiApi({ t: 'adopt', friend, name }));
    } catch (err) {
      showToast(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hai-adopt-intro">
        <Svg className="hai-adopt-pic" html={sharkSvg('froh')} />
        <p className="page-intro">
          Ein Kuscheltier-Hai für dich und eine Person. Ihr kümmert euch zusammen um ihn: Essen, Trinken, Putzen, am
          besten morgens und abends. Mit jeder Partie, die ihr zusammen spielt, kommt er weiter in der Welt herum.
        </p>
      </div>
      {friends.length === 0 ? (
        <p className="empty">Dafür brauchst du zuerst einen Freund im Spielzimmer.</p>
      ) : (
        <form className="group-form" onSubmit={submit}>
          <div>
            <label htmlFor="hai-name">Name des Hais</label>
            <input id="hai-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} required autoComplete="off" />
          </div>
          <fieldset>
            <legend className="section-title">Mit wem?</legend>
            <div className="checks">
              {friends.map((f) => (
                <label key={f.id} className={`check ${f.taken ? 'disabled' : ''}`} htmlFor={`hai-friend-${f.id}`}>
                  <input
                    type="radio"
                    name="hai-friend"
                    id={`hai-friend-${f.id}`}
                    checked={friend === f.id}
                    disabled={f.taken}
                    onChange={() => setFriend(f.id)}
                  />
                  <span>
                    <span className="check-title">{f.name}</span>
                    {f.taken && <span className="check-hint">Hat schon einen Hai.</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button className="btn primary" id="hai-adopt" disabled={busy || !friend || !name.trim() || !free.length}>
              Adoptieren
            </button>
          </div>
        </form>
      )}
    </>
  );
}

// --- Pflege ---

function Meter({ label, value, id }) {
  const n = Math.min(10, Math.ceil(value / 10));
  const prev = useRef(0);
  const before = prev.current;
  useEffect(() => {
    prev.current = n;
  });
  return (
    <div className={`hai-meter ${n <= 3 ? 'low' : ''}`} id={id} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <span className="hai-meter-label">{label}</span>
      <span className="hai-meter-bar">
        {Array.from({ length: 10 }, (_, i) => {
          const on = i < n;
          const cls = on ? (i >= before ? 'on gain' : 'on') : i < before ? 'lose' : '';
          return <span key={i} className={cls} style={on && i >= before ? { '--d': `${(i - before) * 55}ms` } : undefined} />;
        })}
      </span>
    </div>
  );
}

const who = (id, user, data) => (id === user.id ? 'Du' : id === data.partner?.id ? data.partner.name : 'Jemand');
const has = (subject) => (subject === 'Du' ? 'hast' : 'hat');
const is = (subject) => (subject === 'Du' ? 'bist' : 'ist');

function logText(e, user, data) {
  const s = who(e.by, user, data);
  const name = data.hai.name;
  switch (e.t) {
    case 'adopt':
      return `${s} ${has(s)} ${name} adoptiert.`;
    case 'essen':
      return `${s} ${has(s)} ihn gefüttert: ${FOOD[e.item]?.name}.${e.r === 'mag' ? ' Sein Lieblingsessen.' : e.r === 'nicht' ? ' Mag er nicht.' : ''}`;
    case 'trinken':
      return `${s} ${has(s)} ihm zu trinken gegeben: ${FOOD[e.item]?.name}.${e.r === 'mag' ? ' Sein Lieblingsgetränk.' : e.r === 'nicht' ? ' Mag er nicht.' : ''}`;
    case 'putzen':
      return `${s} ${has(s)} ihn geputzt.`;
    case 'reise':
      return `${s} ${is(s)} mit ihm ${placeTo(PLACE[e.place])} gereist.${e.neu ? ' Neu entdeckt.' : ''}`;
    case 'spiel':
      return `Ihr habt ${e.game} gespielt. ${WORDS[GAME_MILES].replace(/^./, (c) => c.toUpperCase())} Meilen.`;
    case 'weg':
      return `${name} ist weggeschwommen.`;
    case 'zurueck':
      return `${name} ist zurückgekommen.`;
    default:
      return '';
  }
}

function when(at, now) {
  const d = new Date(at);
  const today = new Date(now);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const day = (x) => x.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
  const yesterday = new Date(now - 864e5);
  const label =
    day(d) === day(today)
      ? 'Heute'
      : day(d) === day(yesterday)
        ? 'Gestern'
        : d.toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' });
  return (
    <>
      {now - at > 6 * 864e5 ? <span className="num">{d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Berlin' })}</span> : label}{' '}
      <span className="num">{time}</span>
    </>
  );
}

function Care({ data, user, now, send, take, load, begin, showToast }) {
  const t = now();
  const h = current(data.hai, t);
  const m = mood(h, t);
  const night = isNight(t);
  const stains = h.away ? [] : stainOrder(h, SPOTS).slice(0, stainCount(h));
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const firstRef = useRef(true);
  const [mode, setMode] = useState(null); // essen | trinken | putzen
  const [say, setSay] = useState(null);
  const sayTimer = useRef(null);
  const scrubbed = useRef(null);
  const seen = useRef(Math.max(0, ...data.hai.log.map((e) => e.at)));

  const tell = useCallback((text, ms = 4000) => {
    setSay(text);
    clearTimeout(sayTimer.current);
    if (text) sayTimer.current = setTimeout(() => setSay(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(sayTimer.current), []);

  useEffect(() => {
    const stage = createStage(hostRef.current, { onScrubbed: () => scrubbed.current?.() });
    stageRef.current = stage;
    return () => stage.destroy();
  }, []);

  const stainKey = stains.join();
  useEffect(() => {
    stageRef.current.update({ place: h.place, mood: m.mood, stains, away: Boolean(h.away), night }, { first: firstRef.current });
    firstRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.place, m.mood, stainKey, h.away, night]);

  // Was die andere Person gerade gemacht hat, kurz auf der Bühne zeigen
  useEffect(() => {
    const fresh = data.hai.log.filter((e) => e.at > seen.current);
    seen.current = Math.max(seen.current, ...data.hai.log.map((e) => e.at));
    const e = fresh.filter((x) => x.by && x.by !== user.id && ['essen', 'trinken', 'putzen'].includes(x.t)).pop();
    if (!e) return;
    if (mode === 'putzen' && e.t === 'putzen') {
      stageRef.current.stopCleaning();
      setMode(null);
    }
    stageRef.current.remote(e.t, e.item);
    tell(logText(e, user, data));
  }, [data, user, mode, tell]);

  const name = h.name;
  const away = Boolean(h.away);

  const open = (kind) => {
    if (away) return;
    if (mode === kind) return setMode(null);
    if (mode === 'putzen') stageRef.current.stopCleaning();
    if (kind === 'putzen') {
      if (h.need.sauber >= FULL) {
        setMode(null);
        stageRef.current.refuse();
        return tell(`${name} ist schon sauber.`);
      }
      setMode('putzen');
      tell(null);
      stageRef.current.startCleaning();
      return;
    }
    if (h.need[kind] >= FULL) {
      setMode(null);
      stageRef.current.refuse();
      return tell(kind === 'essen' ? `${name} ist satt.` : `${name} hat keinen Durst.`);
    }
    setMode(kind);
  };

  const give = async (food, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setMode(null);
    tell(null);
    const end = begin();
    const req = send({ t: food.kind, item: food.id });
    try {
      const res = await stageRef.current[food.kind === 'essen' ? 'feed' : 'drink'](food.id, from, req);
      take(res);
      const rr = res.event?.r;
      tell(
        rr === 'mag'
          ? food.kind === 'essen'
            ? `${food.name} ist sein Lieblingsessen.`
            : `${food.name} ist sein Lieblingsgetränk.`
          : rr === 'nicht'
            ? `${food.name} mag ${name} nicht.`
            : food.kind === 'essen'
              ? 'Lecker.'
              : 'Das tat gut.',
      );
    } catch (err) {
      showToast(err.message);
    } finally {
      end();
    }
  };

  scrubbed.current = async () => {
    const end = begin();
    try {
      const res = await send({ t: 'putzen' });
      stageRef.current.stopCleaning();
      setMode(null);
      take(res);
      tell('Blitzsauber.');
      stageRef.current.cheer();
    } catch (err) {
      stageRef.current.stopCleaning();
      setMode(null);
      showToast(err.message);
    } finally {
      end();
    }
  };

  const foods = mode === 'essen' || mode === 'trinken' ? pantry(h).filter((f) => f.kind === mode) : [];
  const allFoods = Object.values(FOOD).filter((f) => f.kind === mode).length;
  const recent = [...data.hai.log].reverse().slice(0, 6);

  return (
    <>
      <div className="hai-where">
        <span>
          Mit {data.partner?.name ?? 'niemandem'}, gerade {placeAt(PLACE[h.place])}.
        </span>
      </div>
      <div className={`hai-stage-wrap ${mode === 'putzen' ? 'putzen' : ''}`} ref={hostRef} />
      <p className="hai-status" id="hai-status" aria-live="polite">
        {say ?? statusText(h, t)}
      </p>

      <div className="hai-meters">
        <Meter label="Essen" value={h.need.essen} id="hai-meter-essen" />
        <Meter label="Trinken" value={h.need.trinken} id="hai-meter-trinken" />
        <Meter label="Sauber" value={h.need.sauber} id="hai-meter-sauber" />
      </div>

      {mode === 'putzen' ? (
        <div className="hai-clean-bar" id="hai-clean">
          <p>Schrubb die Flecken mit dem Finger weg.</p>
          <div className="row">
            <button className="btn" id="hai-auto-scrub" onClick={() => stageRef.current.autoScrub()}>
              Für mich schrubben
            </button>
            <button
              className="link"
              onClick={() => {
                stageRef.current.stopCleaning();
                setMode(null);
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="hai-tools">
          {[
            ['essen', 'Essen', foodSvg('apfel')],
            ['trinken', 'Trinken', foodSvg('wasser')],
            ['putzen', 'Putzen', spongeSvg()],
          ].map(([kind, label, pic]) => (
            <button
              key={kind}
              className={`hai-tool ${mode === kind ? 'active' : ''} ${!away && h.need[kind === 'putzen' ? 'sauber' : kind] < 30 ? 'needed' : ''}`}
              data-tool={kind}
              aria-expanded={kind === 'putzen' ? undefined : mode === kind}
              disabled={away}
              onClick={() => open(kind)}
            >
              <Svg className="hai-tool-pic" html={pic} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {foods.length > 0 && (
        <div className="hai-drawer" id="hai-drawer" key={mode}>
          <p className="hai-drawer-title">{mode === 'essen' ? `Was soll ${name} essen?` : `Was soll ${name} trinken?`}</p>
          <div className="hai-tiles">
            {foods.map((f, i) => (
              <button key={f.id} className="hai-tile" data-item={f.id} style={{ animationDelay: `${i * 35}ms` }} onClick={(e) => give(f, e)}>
                <Svg className="hai-tile-pic" html={foodSvg(f.id)} />
                <span className="hai-tile-name">{f.name}</span>
                {h.taste?.[mode] === f.id && (
                  <span className="hai-tile-tag">
                    <Svg className="hai-heart" html={`<svg viewBox="-7 -7 14 14">${heart(0, 0, 1)}</svg>`} />
                    Liebling
                  </span>
                )}
                {h.taste?.nicht === f.id && <span className="hai-tile-tag muted">Mag er nicht</span>}
              </button>
            ))}
          </div>
          {foods.length < allFoods && <p className="muted hai-drawer-hint">Neues bringt {name} von Reisen mit.</p>}
        </div>
      )}

      <section className="hai-log">
        <h2 className="section-title">Tagebuch</h2>
        <ul className="rows" id="hai-log">
          {recent.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="hai-log-text">{logText(e, user, data)}</span>
              <span className="hai-log-time">{when(e.at, t)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// Umbenennen und Freilassen, ganz unten
function Manage({ data, send, take, showToast, onReleased }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(data.hai.name);
  const rename = async (e) => {
    e.preventDefault();
    try {
      take(await send({ t: 'name', name }));
      setRenaming(false);
    } catch (err) {
      showToast(err.message);
    }
  };
  const release = async () => {
    if (!confirm(`${data.hai.name} wirklich freilassen? Er ist dann für euch beide weg, mit allen Reisen.`)) return;
    try {
      await send({ t: 'freilassen' });
      onReleased();
    } catch (err) {
      showToast(err.message);
    }
  };
  return (
    <footer className="hai-manage">
      {renaming ? (
        <form className="add-form" onSubmit={rename}>
          <label htmlFor="hai-rename">Neuer Name</label>
          <div className="row">
            <input id="hai-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} required autoComplete="off" />
            <button className="btn">Speichern</button>
          </div>
        </form>
      ) : (
        <p className="row">
          <button className="link" onClick={() => setRenaming(true)}>
            Umbenennen
          </button>
          <button className="link" id="hai-release" onClick={release}>
            Freilassen
          </button>
        </p>
      )}
    </footer>
  );
}

// --- Weltkarte ---

const arcPath = (a, b) => {
  const lift = Math.min(90, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.3);
  const c = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - lift];
  return { d: `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`, c };
};

function World({ data, user, now, send, take, begin, showToast, onHai }) {
  const h = current(data.hai, now());
  const tr = trips(h);
  const [sel, setSel] = useState(h.place);
  const [card, setCard] = useState(null);
  const [moving, setMoving] = useState(false);
  const scrollRef = useRef(null);
  const stateOf = (id) => (id === h.place ? 'hier' : h.visited.includes(id) ? 'besucht' : tr.free ? 'frei' : 'zu');
  const freeKey = tr.free > 0;

  const mapHtml = useMemo(() => {
    const route = h.visited
      .slice(1)
      .map((id, i) => {
        const a = PLACE[h.visited[i]];
        const b = PLACE[id];
        return arcPath(project(a.lon, a.lat), project(b.lon, b.lat)).d;
      })
      .join(' ');
    const pins = PLACES.map((p) => {
      const [x, y] = project(p.lon, p.lat);
      const s = p.id === h.place ? 'hier' : h.visited.includes(p.id) ? 'besucht' : freeKey ? 'frei' : 'zu';
      const mark =
        s === 'zu'
          ? '<circle r="3.4" fill="#fff" stroke="#141414" stroke-width="1.1"/>'
          : s === 'frei'
            ? '<circle class="hai-pin-ring" r="9" fill="none" stroke="#d33a2c" stroke-width="1.6"/><circle r="4.2" fill="#fff" stroke="#d33a2c" stroke-width="2"/>'
            : '<rect x="-4.5" y="-4.5" width="9" height="9" fill="#d33a2c" stroke="#141414" stroke-width="1.3"/>';
      return `<g class="hai-pin${p.id === sel ? ' sel' : ''}" data-place="${p.id}" data-state="${s}" transform="translate(${x} ${y})">${p.id === sel ? '<circle r="13" fill="none" stroke="#141414" stroke-width="1.4" stroke-dasharray="3 3"/>' : ''}${mark}</g>`;
    }).join('');
    const [sx, sy] = project(PLACE[h.place].lon, PLACE[h.place].lat);
    return `<svg class="hai-map" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="Weltkarte mit den Orten, die ${data.hai.name} kennt">${worldMap()}
<path class="hai-route" d="${route}" fill="none" stroke="#d33a2c" stroke-width="1.6" stroke-dasharray="4 4" stroke-linecap="round"/>
<g class="hai-trail-layer"></g>${pins}
<g class="hai-map-shark" transform="translate(${sx} ${sy})"><g class="hai-map-move"><g transform="translate(-22 -30) scale(.3)">${shark({ eye: 'auf', mouth: 'froh' })}</g></g></g></svg>`;
  }, [h.visited.join(), h.place, freeKey, sel, data.hai.name]);

  // Karte so scrollen, dass der Hai zu sehen ist
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const p = PLACE[h.place];
    const x = (project(p.lon, p.lat)[0] / MAP_W) * box.scrollWidth;
    box.scrollLeft = x - box.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (e) => {
    const svg = scrollRef.current.querySelector('svg');
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = null;
    let dist = 30;
    for (const place of PLACES) {
      const [x, y] = project(place.lon, place.lat);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < dist) {
        dist = d;
        best = place.id;
      }
    }
    if (best) setSel(best);
  };

  const travel = async (id) => {
    if (moving) return;
    setMoving(true);
    const end = begin();
    const req = send({ t: 'reise', place: id });
    try {
      // Die Karte muss zu sehen sein, bevor er losschwimmt
      // (selbst gerechnet: ein weiches window.scrollTo bricht Chromium hier manchmal sofort ab)
      const from0 = scrollY;
      const target = Math.max(0, scrollY + scrollRef.current.getBoundingClientRect().top - 16);
      if (Math.abs(from0 - target) > 4) {
        if (reducedMotion()) window.scrollTo(0, target);
        else
          await new Promise((resolve) => {
            const t0 = performance.now();
            const step = () => {
              const k = Math.min(1, (performance.now() - t0) / 450);
              const e = 1 - (1 - k) ** 3;
              window.scrollTo(0, from0 + (target - from0) * e);
              if (k < 1) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          });
      }
      const svg = scrollRef.current.querySelector('svg');
      const from = PLACE[h.place];
      const to = PLACE[id];
      const a = project(from.lon, from.lat);
      const b = project(to.lon, to.lat);
      if (!reducedMotion()) {
        const { d, c } = arcPath(a, b);
        const layer = svg.querySelector('.hai-trail-layer');
        layer.innerHTML = `<path d="${d}" pathLength="1" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>`;
        const path = layer.firstChild;
        const mover = svg.querySelector('.hai-map-move');
        const n = 24;
        const frames = Array.from({ length: n + 1 }, (_, i) => {
          const t = i / n;
          const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0] - a[0];
          const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1] - a[1];
          const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]);
          const s = 1 + Math.sin(t * Math.PI) * 0.35;
          return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${dx < 0 ? 1 : -1}, 1) scale(${s.toFixed(2)})` };
        });
        const duration = 1300;
        path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
        const box = scrollRef.current;
        const follow = box.scrollWidth > box.clientWidth;
        const startScroll = box.scrollLeft;
        const target = ((a[0] + b[0]) / 2 / MAP_W) * box.scrollWidth - box.clientWidth / 2;
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 600);
          if (follow) box.scrollLeft = startScroll + (target - startScroll) * k;
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        await mover.animate(frames, { duration, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
      }
      const res = await req;
      take(res);
      setSel(id);
      setCard({ place: id, neu: Boolean(res.event?.neu) });
    } catch (err) {
      showToast(err.message);
      const layer = scrollRef.current?.querySelector('.hai-trail-layer');
      if (layer) layer.innerHTML = '';
      scrollRef.current?.querySelector('.hai-map-move')?.getAnimations().forEach((x) => x.cancel());
    } finally {
      end();
      setMoving(false);
    }
  };

  // Aus der Liste gewählt: den Ort oben zeigen, damit „Hinreisen“ zu sehen ist
  const choose = (id) => {
    setSel(id);
    requestAnimationFrame(() =>
      document.getElementById('hai-place')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }),
    );
  };

  const place = PLACE[sel];
  const s = stateOf(sel);
  const fraction = tr.left ? Math.min(1, (h.miles - tr.from) / (tr.to - tr.from)) : 1;

  return (
    <>
      <div className="hai-map-scroll" ref={scrollRef} onClick={pick} dangerouslySetInnerHTML={{ __html: mapHtml }} />

      <section className="hai-place" id="hai-place" key={sel}>
        <div className="hai-place-pic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 360 260">${scene(sel)}</svg>` }} />
        <div className="hai-place-text">
          <h2 className="section-title">{place.name}</h2>
          <p className="muted">
            {place.sight}.{' '}
            {s === 'hier'
              ? `${h.name} ist gerade hier.`
              : s === 'besucht'
                ? 'Hier war er schon.'
                : place.souvenir
                  ? `Von hier bringt er ${FOOD[place.souvenir].name} mit.`
                  : ''}
          </p>
          <div className="row">
            {(s === 'besucht' || s === 'frei') && (
              <button className="btn primary" id="hai-travel" disabled={moving || Boolean(h.away)} onClick={() => travel(sel)}>
                {s === 'frei' ? 'Hinreisen' : 'Wieder hinreisen'}
              </button>
            )}
            {(s === 'hier' || s === 'besucht') && (
              <button className="link" onClick={() => setCard({ place: sel, neu: false })}>
                Postkarte ansehen
              </button>
            )}
            {s === 'zu' && <span className="muted">Noch nicht entdeckt.</span>}
          </div>
          {h.away && s !== 'hier' && <p className="muted">Gerade ist er weggeschwommen.</p>}
        </div>
      </section>

      <div className="hai-miles" id="hai-miles">
        <p className="hai-miles-head">
          <span className="hai-miles-num num">{h.miles}</span>
          <span>Reisemeilen</span>
        </p>
        <span className="hai-miles-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${fraction})` }} />
        </span>
        <p>
          {!tr.left ? (
            'Ihr habt alle Orte entdeckt.'
          ) : tr.free ? (
            tr.free === 1 ? (
              'Eine Reise ist frei. Wähle ein neues Ziel auf der Karte.'
            ) : (
              <>
                <Num n={tr.free} /> Reisen sind frei. Wähle ein neues Ziel auf der Karte.
              </>
            )
          ) : (
            <>
              Noch <Num n={tr.missing} /> {tr.missing === 1 ? 'Meile' : 'Meilen'} bis zur nächsten Reise.
            </>
          )}
        </p>
        <p className="muted hai-miles-hint">
          Jede Partie mit {data.partner?.name ?? 'deinem Freund'} bringt {WORDS[GAME_MILES]} Meilen, Kümmern, wenn er es braucht, eine.
        </p>
      </div>

      <ul className="hai-places" id="hai-places">
        {PLACES.map((p) => {
          const ps = stateOf(p.id);
          return (
            <li key={p.id}>
              <button className={`hai-place-row ${sel === p.id ? 'sel' : ''}`} data-place={p.id} data-state={ps} onClick={() => choose(p.id)}>
                <span className="hai-place-mark" aria-hidden="true" />
                <span className="hai-place-name">{p.name}</span>
                <span className="hai-place-sub">
                  {ps === 'hier' ? 'Hier ist er gerade' : ps === 'besucht' ? 'Besucht' : ps === 'frei' ? 'Reise frei' : 'Noch nicht entdeckt'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {card && (
        <Postcard
          place={card.place}
          neu={card.neu}
          name={h.name}
          onClose={() => setCard(null)}
          onHai={() => {
            setCard(null);
            onHai();
            window.scrollTo(0, 0);
          }}
        />
      )}
    </>
  );
}

function Postcard({ place: id, neu, name, onClose, onHai }) {
  const place = PLACE[id];
  const ref = useRef(null);
  const closeRef = useRef(null);
  // Die Seite zeichnet laufend neu (Werte, Neuladen): Auftakt und Fokus nur beim Öffnen
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!reducedMotion()) {
      ref.current?.animate(
        [
          { transform: 'translateY(40px) rotate(-7deg) scale(.7)', opacity: 0 },
          { transform: 'translateY(0) rotate(-1.5deg) scale(1)', opacity: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
      );
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);
  const souvenir = neu && place.souvenir ? FOOD[place.souvenir] : null;
  const title = id === 'zuhause' ? 'Wieder zu Hause' : `Grüße aus ${place.name}`;
  return (
    <div className="hai-card-layer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hai-postcard" ref={ref} id="hai-postcard">
        <div
          className="hai-postcard-pic"
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 360 260">${scene(id)}<g transform="translate(10 136) scale(.78)">${shark({ eye: 'froh', mouth: 'froh' })}</g></svg>`,
          }}
        />
        <Svg
          className="hai-stamp"
          html={`<svg viewBox="0 0 60 70"><rect x="2" y="2" width="56" height="66" fill="#fff" stroke="#141414" stroke-width="1.6" stroke-dasharray="3 2.4"/><rect x="8" y="8" width="44" height="54" fill="#f3ede1" stroke="#141414" stroke-width="1.2"/><g transform="translate(9 24) scale(.27)">${shark({ eye: 'auf', mouth: 'froh' })}</g>${mapIconSvg().replace('<svg', '<svg x="30" y="40" width="18" height="18"')}</svg>`}
        />
        <div className="hai-postcard-text">
          <p className="hai-postcard-title">{title}</p>
          <p className="muted">
            {id === 'zuhause' ? `${name} kuschelt sich wieder ins Bett.` : `${name} war ${place.seen}.`}
          </p>
          {souvenir && (
            <p className="hai-souvenir">
              <Svg className="hai-souvenir-pic" html={foodSvg(souvenir.id)} />
              <span>
                Mitgebracht: <strong>{souvenir.name}</strong>
              </span>
            </p>
          )}
        </div>
        <div className="row hai-postcard-actions">
          <button className="btn primary" onClick={onHai}>
            Zu {name}
          </button>
          <button className="link" ref={closeRef} onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Startseite ---

/** Der eigene Hai auf der Startseite, oder der Weg zum Adoptieren. */
export function HaiCard({ hai, onOpen }) {
  return (
    <button className="hai-card" id="hai-card" onClick={onOpen}>
      <Svg className="hai-card-pic" html={sharkSvg(hai.mood === 'weg' ? 'traurig' : hai.mood)} />
      <span className="hai-card-text">
        <span className="hai-card-name">{hai.name}</span>
        <span className="hai-card-with">Mit {hai.partner.name}</span>
        <span className={`hai-card-status ${hai.mood === 'traurig' || hai.mood === 'weg' ? 'urgent' : ''}`}>{hai.status}</span>
      </span>
      <span className="hai-card-bars" aria-hidden="true">
        {['essen', 'trinken', 'sauber'].map((k) => (
          <span key={k} className={hai.need[k] < 30 ? 'low' : ''}>
            <span style={{ transform: `scaleY(${Math.max(0.04, hai.need[k] / 100)})` }} />
          </span>
        ))}
      </span>
    </button>
  );
}
