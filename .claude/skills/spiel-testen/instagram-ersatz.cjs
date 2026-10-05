// Ersatz für eingebettete Instagram-Beiträge im Test (Skill „spiel-testen“, Racker-Jagd).
// Leitet alle Anfragen an instagram.com auf eine kleine eigene Seite um, die wie eine Einbettung aufgebaut ist
// (Kopfzeile, Medienfeld mit farbigem Bild bzw. Reel und der Kennung, Fußzeile mit Likes).
// So lässt sich das Spiel ohne Netz und ohne echte Beiträge testen; wie echte Beiträge aussehen, muss
// trotzdem jemand auf dem Handy ansehen.
//
//   const { routeInstagram, loads } = require('/home/user/Games/.claude/skills/spiel-testen/instagram-ersatz.cjs');
//   await routeInstagram(A, 'A');        // vor dem ersten Beitrag, pro Seite
//   console.log(loads);                  // { 'A:C0nGnwKMbmY': 1, … }: wie oft jede Einbettung geladen wurde

const loads = {};

function page(url) {
  const m = url.match(/\/(p|reel)\/([\w-]+)\/embed/);
  const code = m ? m[2] : '?';
  let hue = 0;
  for (const c of code) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  const reel = m?.[1] === 'reel';
  // Aufbau wie die echte Einbettung (laut Messungen anderer): Kopfzeile 54 px, Medienfeld Breite × 1,25,
  // ein Reel (9:16) darin eingepasst mit schwarzen Rändern. Schneidet das Spiel daneben, sieht man Weiß oder Schwarz.
  const media = reel
    ? `<div class=m style="background:#000"><div class=v><svg viewBox="0 0 10 10"><path d="M3 2 L8 5 L3 8 Z" fill="#fff"/></svg>${code}</div></div>`
    : `<div class=m style="background:hsl(${hue} 55% 62%)"><div class=v>${code}</div></div>`;
  return `<!doctype html><meta name=viewport content="width=device-width"><style>
    body{margin:0;font:14px/1.3 Arial,sans-serif;background:#fff;color:#262626}
    .h{display:flex;gap:8px;align-items:center;height:54px;box-sizing:border-box;padding:0 12px;border-bottom:1px solid #efefef}
    .av{width:32px;height:32px;border-radius:50%;background:hsl(${hue} 40% 70%)}
    .vp{margin-left:auto;background:#0095f6;color:#fff;padding:5px 10px;border-radius:6px;font-weight:bold}
    .m{width:100%;aspect-ratio:4/5;display:flex;justify-content:center}
    .v{height:100%;${reel ? 'aspect-ratio:9/16;' : 'width:100%;'}background:hsl(${hue} 55% 62%);display:grid;place-items:center;align-content:center;gap:8px;color:#fff;font:bold 22px Arial}
    .v svg{width:56px;height:56px}
    .f{padding:12px} .f p{margin:0 0 10px}
  </style><div class=h><div class=av></div><b>racker.${code.slice(0, 5).toLowerCase()}</b><span class=vp>View profile</span></div>
  ${media}<div class=f><p style="color:#0095f6;font-weight:bold">View more on Instagram</p><p>1.234 likes</p><p style="color:#8e8e8e">Add a comment...</p></div>`;
}

// who: Kürzel für die Zählung in loads (z.B. 'A')
async function routeInstagram(p, who = '') {
  await p.context().route(/instagram\.com|instagr\.am|cdninstagram|fbcdn/, (route) => {
    const url = route.request().url();
    if (!/\/embed\/?/.test(url)) return route.abort();
    const code = url.match(/\/(?:p|reel)\/([\w-]+)\//)?.[1];
    loads[`${who}:${code}`] = (loads[`${who}:${code}`] ?? 0) + 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: page(url) });
  });
}

module.exports = { routeInstagram, loads };
