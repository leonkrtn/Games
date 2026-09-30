'use client';

import { useEffect, useState } from 'react';
import { account } from './api';

export default function Auth({ onLogin, showToast }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviter, setInviter] = useState(null);

  // Über einen Einladungslink gekommen: zeigen, wer einlädt, und gleich "Konto erstellen" anbieten.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('einladung');
    if (!code) return;
    setMode('signup');
    account({ t: 'invite-info', code })
      .then((r) => setInviter(r.name))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = await account({ t: mode, username, password });
      onLogin(user);
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signup = mode === 'signup';
  return (
    <section className="start">
      <div>
        <h1 className="start-title">Spielzimmer</h1>
        <p className="start-intro">
          {inviter
            ? `${inviter} lädt dich zum Spielen ein. Erstelle ein Konto oder melde dich an, dann seid ihr befreundet.`
            : 'Hier spielt ihr zu zweit die Spiele, die ihr euch selbst ausdenkt. Melde dich an und füge Freunde hinzu.'}
        </p>
      </div>

      <form className="start-form" onSubmit={submit}>
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!signup}
            className={!signup ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Anmelden
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={signup}
            className={signup ? 'active' : ''}
            onClick={() => setMode('signup')}
            id="tab-signup"
          >
            Konto erstellen
          </button>
        </div>
        <div>
          <label htmlFor="username">Benutzername</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 8 : undefined}
            required
            aria-describedby={signup ? 'password-hint' : undefined}
          />
          {signup && (
            <p className="field-hint muted" id="password-hint">
              Mindestens 8 Zeichen. Merk es dir gut, ein Zurücksetzen per E-Mail gibt es nicht.
            </p>
          )}
        </div>
        <button className="btn primary" id="auth-submit" disabled={busy}>
          {signup ? 'Konto erstellen' : 'Anmelden'}
        </button>
      </form>
    </section>
  );
}
