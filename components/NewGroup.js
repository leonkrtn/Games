'use client';

import { useState } from 'react';
import { account } from './api';
import { useHomeData } from './Home';
import { Check } from './NotifySettings';

const MAX_OTHERS = 5; // mit dir zusammen höchstens sechs

// Gruppe gründen: Name und zwei bis fünf Freunde wählen, danach geht es direkt ins neue Spielzimmer.
export default function NewGroup({ user, goHome, openRoom, showToast, onUnauthorized }) {
  const { data } = useHomeData(user, showToast, onUnauthorized);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  const friends = data?.friends ?? [];

  const toggle = (id, on) => setChosen((list) => (on ? [...list, id] : list.filter((x) => x !== id)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await account({ t: 'group-create', name, members: chosen });
      openRoom(r.room);
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else showToast(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page" id="group-page">
      <header>
        <button className="link back" onClick={goHome}>
          Startseite
        </button>
        <h1 className="page-title">Gruppe gründen</h1>
      </header>
      <p className="page-intro">
        Eine Gruppe hat ein eigenes Spielzimmer mit Punktestand und Verlauf, für bis zu sechs Leute. Dazuholen kannst du
        deine Freunde, auch später noch.
      </p>

      <form className="group-form" onSubmit={submit}>
        <div>
          <label htmlFor="group-name">Name der Gruppe</label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            autoComplete="off"
            enterKeyHint="next"
          />
        </div>

        <fieldset>
          <legend className="section-title">Wer ist dabei?</legend>
          {!data ? (
            <p className="muted">Lädt …</p>
          ) : friends.length < 2 ? (
            <p className="empty">Für eine Gruppe brauchst du mindestens zwei Freunde.</p>
          ) : (
            <>
              <p className="page-intro">Wähle zwei bis fünf Freunde.</p>
              <div className="checks">
                {friends.map((f) => (
                  <Check
                    key={f.id}
                    id={`group-friend-${f.user.username}`}
                    title={f.user.name}
                    checked={chosen.includes(f.user.id)}
                    disabled={!chosen.includes(f.user.id) && chosen.length >= MAX_OTHERS}
                    onChange={(on) => toggle(f.user.id, on)}
                  />
                ))}
              </div>
            </>
          )}
        </fieldset>

        <div>
          <button className="btn primary" id="group-create" disabled={busy || chosen.length < 2}>
            Gruppe gründen
          </button>
        </div>
      </form>
    </div>
  );
}
