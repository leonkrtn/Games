'use client';

import { useEffect, useRef, useState } from 'react';
import { games } from '@/lib/games';
import { playerColor } from '@/lib/colors';

export const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Kurzschreibweise für Spiele: data-value wird als JSON gelesen, sonst als Text.
const parseValue = (v) => {
  if (v === undefined) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/**
 * Zeigt ein Spiel an, indem es die render()-Funktion aus der Spieldatei aufruft.
 * Die Spieldateien arbeiten direkt mit HTML (nicht mit React), damit sie einfach
 * zu schreiben sind und auf Server und im Browser laufen.
 */
export default function GameView({ game, players, me, onAction }) {
  const ref = useRef(null);
  const [failure, setFailure] = useState(null); // { key, message }
  const entry = games.get(game.id);

  // Eigenes CSS des Spiels einmal einfügen.
  useEffect(() => {
    const css = entry?.mod.style;
    const id = `spiel-css-${game.id}`;
    if (!css || document.getElementById(id)) return;
    const tag = document.createElement('style');
    tag.id = id;
    tag.textContent = css;
    document.head.append(tag);
  }, [entry, game.id]);

  // Nur neu zeichnen, wenn sich wirklich etwas geändert hat (sonst gehen z.B. Eingaben verloren).
  const key = JSON.stringify([game.id, game.view, game.result, players]);

  useEffect(() => {
    if (!entry || game.error) return;
    const api = {
      me,
      players,
      name: (id) => players.find((p) => p.id === id)?.name ?? '?',
      color: (id) => playerColor(players, id),
      send: (type, data) => onAction(type, data),
      esc,
      result: game.result,
    };
    try {
      entry.mod.render(ref.current, game.view, api);
    } catch (err) {
      console.error(err);
      setFailure({ key, message: `Fehler beim Anzeigen von „${game.name}“:\n${err.message}` });
    }
    // Absichtlich nur `key`: das ist der komplette sichtbare Stand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const error =
    game.error ?? (!entry ? 'Dieses Spiel gibt es nicht (mehr).' : failure?.key === key ? failure.message : null);

  const onClick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'FORM' || !ref.current.contains(el)) return;
    e.preventDefault();
    onAction(el.dataset.action, parseValue(el.dataset.value));
  };

  const onSubmit = (e) => {
    const form = e.target.closest('form[data-action]');
    if (!form) return;
    e.preventDefault();
    onAction(form.dataset.action, Object.fromEntries(new FormData(form)));
  };

  return (
    <>
      {error && <div className="game-error">{error}</div>}
      <div id="game" ref={ref} onClick={onClick} onSubmit={onSubmit} hidden={!!game.error || !entry} />
    </>
  );
}
