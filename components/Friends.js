'use client';

import { useState } from 'react';
import { COLORS, formatDay, shareInvite, useHomeData } from './Home';

// Freunde verwalten: Anfragen beantworten, hinzufügen, einladen, Freundschaften beenden.
export default function Friends({ user, goHome, openRoom, showToast, onUnauthorized }) {
  const { data, act } = useHomeData(user, showToast, onUnauthorized);

  const resetInvite = () => {
    if (confirm('Neuen Einladungslink erstellen? Der alte Link funktioniert dann nicht mehr.')) act({ t: 'invite-reset' });
  };
  const unfriend = (f) => {
    if (confirm(`Freundschaft mit ${f.user.name} beenden? Euer Spielzimmer mit Punkten und Verlauf wird gelöscht.`))
      act({ t: 'friend-remove', id: f.id });
  };

  return (
    <div className="page" id="friends-page">
      <header>
        <button className="link back" onClick={goHome}>
          Startseite
        </button>
        <h1 className="page-title">Freunde</h1>
      </header>

      {data?.incoming.length > 0 && (
        <section>
          <h2 className="section-title">Anfragen an dich</h2>
          <ul className="rows">
            {data.incoming.map((r) => (
              <li key={r.id} className="request-row">
                <span>
                  <strong>{r.user.name}</strong> möchte mit dir spielen.
                </span>
                <span className="row">
                  <button className="btn primary small-btn" onClick={() => act({ t: 'friend-accept', id: r.id })}>
                    Annehmen
                  </button>
                  <button className="link" onClick={() => act({ t: 'friend-remove', id: r.id })}>
                    Ablehnen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddFriend data={data} act={act} />

      <section>
        <h2 className="section-title">Einladungslink</h2>
        <p className="page-intro">Wer deinen Link öffnet, ist sofort mit dir befreundet.</p>
        <div className="row">
          <button className="btn" id="invite" onClick={() => shareInvite(data.inviteCode, showToast)} disabled={!data}>
            Link teilen
          </button>
          <button className="link" id="invite-reset" onClick={resetInvite} disabled={!data}>
            Neuen Link erstellen
          </button>
        </div>
      </section>

      {data?.outgoing.length > 0 && (
        <section>
          <h2 className="section-title">Gesendete Anfragen</h2>
          <ul className="rows">
            {data.outgoing.map((r) => (
              <li key={r.id} className="request-row">
                <span>
                  Wartet auf <strong>{r.user.name}</strong>.
                </span>
                <button className="link" onClick={() => act({ t: 'friend-remove', id: r.id })}>
                  Zurückziehen
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">Deine Freunde</h2>
        {!data ? (
          <p className="muted">Lädt …</p>
        ) : data.friends.length === 0 ? (
          <p className="empty">Noch niemand. Schick eine Anfrage oder deinen Einladungslink.</p>
        ) : (
          <ul className="rows">
            {data.friends.map((f) => (
              <li key={f.id} className="manage-row" data-friend={f.user.username}>
                <span>
                  <span className="friend-name">
                    <span
                      className="marker"
                      style={{ color: COLORS[f.order?.indexOf(f.user.id)] ?? 'var(--ink)' }}
                      aria-hidden="true"
                    />
                    {f.user.name}
                  </span>
                  {f.since && <span className="manage-meta">Befreundet seit {formatDay(f.since)}.</span>}
                </span>
                <span className="row">
                  {f.room && (
                    <button className="link" onClick={() => openRoom(f.room)}>
                      Spielzimmer
                    </button>
                  )}
                  <button className="link" data-cmd="unfriend" onClick={() => unfriend(f)}>
                    Freundschaft beenden
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddFriend({ data, act }) {
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await act({ t: 'friend-add', username: name })) setName('');
  };
  return (
    <section className="add-friend">
      <h2 className="section-title">Freund hinzufügen</h2>
      <form onSubmit={submit} className="add-form">
        <label htmlFor="friend-name">Benutzername</label>
        <div className="row nowrap">
          <input
            id="friend-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            required
            enterKeyHint="send"
            disabled={!data}
          />
          <button className="btn" id="friend-add" disabled={!data}>
            Anfrage senden
          </button>
        </div>
      </form>
    </section>
  );
}
