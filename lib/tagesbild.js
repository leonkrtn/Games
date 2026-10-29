// Tagesbild: Zwei Freunde malen jeden Tag ein Bild zu einer Aufgabe, die sich reihum einer von beiden
// ausdenkt (Seite ?seite=tagesbild). Gemalt wird von 10 bis 23 Uhr (Berlin); wer fertig ist, schickt ab.
// Haben beide abgeschickt, werden die Bilder sofort aufgedeckt, sonst um 23 Uhr (was dann auf der
// Malfläche steht, gilt als abgeschickt). Die nächste Aufgabe kommt trotzdem erst um 10 Uhr.
// Diese Datei läuft auf dem Server (lib/tagesbild-server.js, lib/account.js) und im Browser
// (components/Tagesbild.js): keine Imports, nur reine Funktionen auf dem gespeicherten Zustand.
//
// Zustand eines Paars (Zeile „paar“ in der Tabelle tagesbild, lib/tagesbild-server.js):
// { since, members: [{ id, name }], first: Index des Startenden, start: erster Tag 'JJJJ-MM-TT',
//   tasks: { Tag: { text, by } }, state: { Tag: { Konto: { began, done } } }, hearts: { Konto: erhaltene Herzen },
//   sent: { open, remind, reveal } (Tag der zuletzt verschickten Benachrichtigung) }

export const OPEN = 10; // Uhr: neue Aufgabe, Malen beginnt
export const REMIND = 21; // Erinnerung, wer noch nicht abgeschickt hat
export const CLOSE = 23; // Aufdecken spätestens jetzt
export const START_UNTIL = 20; // wer bis dahin startet, malt schon heute
export const TASK_MAX = 60;
export const COMMENT_MAX = 100;
export const H = 3600_000;
const DAY = 24 * H;

// --- Zeit in Berlin (Sommerzeit inklusive; der Server läuft in UTC) ---

let fmt;
const offsets = new Map();
/** Abstand der Berliner Uhr zu UTC in ms zum Zeitpunkt t. */
function berlinOffset(t) {
  const key = Math.floor(t / H);
  let off = offsets.get(key);
  if (off !== undefined) return off;
  fmt ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(key * H)).map((x) => [x.type, Number(x.value)]));
  off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - key * H;
  if (offsets.size > 500) offsets.clear();
  offsets.set(key, off);
  return off;
}

/** Kalendertag in Berlin ('JJJJ-MM-TT') zum Zeitpunkt t. */
export const dayOf = (t) => new Date(t + berlinOffset(t)).toISOString().slice(0, 10);

/** Zeitpunkt (ms) an einem Berliner Kalendertag um `hour` Uhr. */
export function timeOn(day, hour) {
  const local = Date.parse(`${day}T00:00:00Z`) + hour * H;
  let t = local - berlinOffset(local);
  t = local - berlinOffset(t);
  return t;
}

export const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
export const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v;

/** Die Runde, die gerade läuft oder zuletzt lief: ab 10 Uhr die von heute, davor die von gestern. */
export const roundDay = (now) => {
  const d = dayOf(now);
  return now >= timeOn(d, OPEN) ? d : addDays(d, -1);
};

/** Der nächste Tag, an dem eine Aufgabe kommt (heute vor 10 Uhr, sonst morgen). */
export const nextDay = (now) => addDays(roundDay(now), 1);

/** Erster Tag beim Start: bis 20 Uhr heute (vor 10 Uhr ab 10), danach morgen. */
export function startDay(now) {
  const d = dayOf(now);
  return now < timeOn(d, START_UNTIL) ? d : addDays(d, 1);
}

// --- Aufgaben ---

/** Wer sich die Aufgabe für `day` ausdenkt: reihum, am ersten Tag wer gestartet hat. */
export function setterOf(pair, day) {
  const i = daysBetween(pair.start, day);
  if (i < 0) return null;
  return pair.members[(pair.first + i) % pair.members.length].id;
}

// Aufgaben, wenn niemand eine geschrieben hat (Stelle aus Raum und Tag). Nur hinten anhängen.
export const SUGGESTIONS = `Dein Frühstück heute, Was du gerade aus dem Fenster siehst, Dein Lieblingsplatz, Ein Tier, das es nicht gibt
  Dein Zimmer von oben, Ein Haus auf einem Wal, Der beste Moment von gestern, Dein Lieblingsessen als Monster
  Ein Leuchtturm im Sturm, Eine Stadt unter Wasser, Dein Schuh, Das Wetter heute, Ein Roboter, der Blumen gießt
  Dein Traumurlaub, Eine Katze als Königin, Was in deiner Tasche ist, Ein Baum in allen Jahreszeiten
  Dein Gesicht als Gemüse, Ein Picknick auf dem Mond, Die Aussicht von einem Berg, Ein Drache beim Frühstück
  Dein Lieblingslied als Bild, Eine Tasse Kaffee, Ein Vogel mit Hut, Dein Weg zur Arbeit, Ein Zug durch die Wolken
  Ein Garten voller Pilze, Eine Brücke zwischen zwei Inseln, Ein Hund, der Zeitung liest, Dein Lieblingsgetränk
  Etwas, das dich heute gefreut hat, Ein Schloss aus Süßigkeiten, Ein Fahrrad mit Flügeln, Der Mond mit Gesicht
  Eine Pflanze auf dem Fensterbrett, Ein Fisch im Weltall, Ein Zelt im Wald, Dein Lieblingsbuch, Ein Regentag
  Ein Sonnenuntergang am Meer, Eine Eule bei Nacht, Ein Schneemann im Sommer, Ein Marktstand mit Obst
  Dein Haustier oder ein erfundenes, Eine Rakete beim Start, Ein Bus voller Tiere, Dein Lieblingskleidungsstück
  Ein Kaktus mit Freunden, Ein Wasserfall, Ein Eis an einem heißen Tag, Ein Igel im Herbstlaub, Eine Tür ins Nichts
  Ein Hamster als Ritter, Dein Schreibtisch, Ein Café an der Ecke, Ein Gewitter über Feldern, Eine Schnecke mit Haus
  Ein Ballon über der Stadt, Ein Pinguin im Urlaub, Deine Hand, Eine Uhr ohne Zeiger, Ein Kuchen mit Kerzen
  Ein Schiff in der Flasche, Ein Fuchs im Schnee, Was du heute Abend isst, Ein Musikinstrument, Eine Wolke als Schaf
  Ein Turm aus Büchern, Ein Krake beim Aufräumen, Dein Lieblingsspiel, Eine Insel mit einer Palme, Ein Hai mit Brille
  Ein Bahnhof bei Nacht, Eine Giraffe im Aufzug, Dein Morgen in drei Strichen, Eine Erdbeere als Haus
  Ein Feuer am Strand, Ein Monster unter dem Bett, Ein Dorf in den Bergen, Ein Spiegelei mit Sonnenbrille
  Eine Wiese voller Blumen, Ein Astronaut beim Angeln, Dein Lieblingsfilm in einem Bild, Ein Tintenfisch am Klavier
  Ein Herbstspaziergang, Eine Kerze im Dunkeln, Ein Elefant auf einem Ball, Der Blick in deinen Kühlschrank
  Ein Weihnachtsmarkt, Ein Frosch mit Krone, Ein Hochhaus aus Kisten, Dein Lieblingsbaum, Ein Wal am Himmel
  Ein Gespenst, das friert, Ein Fenster mit Regentropfen, Ein Bär im Pyjama, Ein Hut mit einem Geheimnis
  Dein schönster Traum, Ein Leuchtturm aus Käse, Ein Zug durch die Wüste, Zwei Tassen Tee, Eine Ameise ganz groß
  Ein Kürbis mit Gesicht, Ein Stern, der herunterfällt, Ein Laden für Zaubertränke, Ein Teller Nudeln`
  .split(/\s*,\s*|\n\s*/)
  .filter(Boolean);

// Kleine, feste Streuung (FNV-1a), damit beide Browser und der Server dieselbe Aufgabe wählen
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const listTask = (code, day) => SUGGESTIONS[hash(`${code}:${day}`) % SUGGESTIONS.length];

/** Aufgabe eines Tages: { text, by } (by = null: aus der Liste). */
export const taskOf = (pair, code, day) => pair.tasks?.[day] ?? { text: listTask(code, day), by: null };

/** Text einer Aufgabe oder eines Kommentars aus einer Anfrage (null: leer). */
export function cleanText(value, max) {
  const t = String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if ([...t].length > max) throw Object.assign(new Error(`Das ist zu lang. Höchstens ${max === TASK_MAX ? 'sechzig' : 'hundert'} Zeichen.`), { status: 400 });
  return t;
}

// --- Stand einer Runde ---

const doneOf = (pair, day, id) => Boolean(pair.state?.[day]?.[id]?.done);
export const beganOf = (pair, day, id) => Boolean(pair.state?.[day]?.[id]?.began);

/** 'vorher' (noch nicht offen) | 'malen' | 'aufgedeckt' (beide abgeschickt oder 23 Uhr vorbei). */
export function roundState(pair, day, now) {
  if (day < pair.start || now < timeOn(day, OPEN)) return 'vorher';
  if (now >= timeOn(day, CLOSE) || pair.members.every((m) => doneOf(pair, day, m.id))) return 'aufgedeckt';
  return 'malen';
}

/** Ist mein Bild für `day` fertig (abgeschickt oder 23 Uhr vorbei)? */
export const isDone = (pair, day, id, now) => doneOf(pair, day, id) || now >= timeOn(day, CLOSE);

const partnerOf = (pair, me) => pair.members.find((m) => m.id !== me);

/** Eine Zeile für die Startseite: wie es heute steht und ob man etwas tun sollte. */
export function summary(pair, code, me, now) {
  const partner = partnerOf(pair, me);
  const day = roundDay(now);
  const next = nextDay(now);
  const mineNext = setterOf(pair, next) === me && !pair.tasks?.[next];
  if (day < pair.start) {
    const when = pair.start === dayOf(now) ? 'um zehn Uhr' : 'morgen um zehn Uhr';
    return { text: mineNext ? `Los geht es ${when}. Denk dir die erste Aufgabe aus.` : `Los geht es ${when}.`, urgent: false };
  }
  const st = roundState(pair, day, now);
  const task = taskOf(pair, code, day).text;
  if (st === 'malen') {
    if (doneOf(pair, day, me)) return { text: `Abgeschickt. Warte auf ${partner.name}.`, urgent: false };
    if (beganOf(pair, day, me)) return { text: `Heute: ${task}. Abschicken bis dreiundzwanzig Uhr.`, urgent: false };
    return { text: `Heute: ${task}. Du hast noch nicht angefangen.`, urgent: true };
  }
  if (mineNext) return { text: `Du denkst dir die Aufgabe für ${next === dayOf(now) ? 'heute' : 'morgen'} aus.`, urgent: true };
  if (st === 'aufgedeckt' && day === dayOf(now)) return { text: `Aufgedeckt: ${task}.`, urgent: false };
  return { text: 'Neue Aufgabe um zehn Uhr.', urgent: false };
}
