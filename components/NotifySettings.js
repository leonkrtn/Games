'use client';

import { useCallback, useEffect, useState } from 'react';
import { account } from './api';
import { formatDay } from './Home';

const KINDS = [
  { key: 'turn', title: 'Du bist dran', hint: 'Ein Spiel wartet auf deinen Zug.' },
  { key: 'start', title: 'Neues Spiel', hint: 'Jemand startet ein Spiel mit dir.' },
  { key: 'end', title: 'Spielende', hint: 'Ein Spiel ist vorbei, mit dem Ergebnis.' },
  { key: 'friends', title: 'Freunde und Gruppen', hint: 'Neue und angenommene Anfragen, jemand holt dich in eine Gruppe.' },
  { key: 'hai', title: 'Hai', hint: 'Jemand füttert euren Hai, putzt ihn oder reist mit ihm.' },
];

// Benachrichtigungen verwalten: dieses Gerät, worüber, von wem, alle Geräte des Kontos.
export default function NotifySettings({ goHome, showToast, push, onUnauthorized }) {
  const [info, setInfo] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await account({ t: 'notify-get', endpoint: push.endpoint }));
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else showToast(err.message);
    }
  }, [push.endpoint, onUnauthorized, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Sofort umschalten, bei einem Fehler den gespeicherten Stand zurückholen
  const change = async (patch, update) => {
    setInfo((i) => ({ ...i, settings: update(i.settings) }));
    try {
      const r = await account({ t: 'notify-set', ...patch });
      setInfo((i) => ({ ...i, settings: r.settings }));
    } catch (err) {
      showToast(err.message);
      load();
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await account({ t: 'push-test', endpoint: push.endpoint });
      showToast(r.message);
    } catch (err) {
      showToast(err.message);
    } finally {
      setTesting(false);
    }
  };

  const removeDevice = async (d) => {
    if (d.current) return push.turnOff(); // lädt danach über push.endpoint neu
    try {
      await account({ t: 'push-remove', id: d.id });
      showToast(`${d.label} bekommt keine Benachrichtigungen mehr.`);
    } catch (err) {
      showToast(err.message);
    }
    load();
  };

  const off = push.support === 'off' || info?.configured === false;

  return (
    <div className="page" id="notify-page">
      <header>
        <button className="link back" onClick={goHome}>
          Startseite
        </button>
        <h1 className="page-title">Benachrichtigungen</h1>
      </header>

      {off ? (
        <section className="setup-note" id="notify-setup">
          <p>Benachrichtigungen sind für das Spielzimmer noch nicht eingerichtet.</p>
          <p className="page-intro">
            Für alle, die das Spielzimmer betreiben: In Vercel unter Settings, Environment Variables die Schlüssel{' '}
            <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> und <code>VAPID_PRIVATE_KEY</code> eintragen und neu deployen. Wie
            man das Schlüsselpaar erzeugt, steht im README.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h2 className="section-title">Dieses Gerät</h2>
            <ThisDevice push={push} testing={testing} onTest={test} />
          </section>

          {info && (
            <>
              <fieldset>
                <legend className="section-title">Worüber</legend>
                <p className="page-intro">Gilt für alle deine Geräte.</p>
                <div className="checks">
                  {KINDS.map((k) => (
                    <Check
                      key={k.key}
                      id={`notify-${k.key}`}
                      title={k.title}
                      hint={k.hint}
                      checked={info.settings[k.key]}
                      onChange={(on) => change({ key: k.key, on }, (s) => ({ ...s, [k.key]: on }))}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="section-title">Von wem</legend>
                {info.friends.length === 0 ? (
                  <p className="empty">Noch keine Freunde.</p>
                ) : (
                  <>
                    <p className="page-intro">Ohne Haken bekommst du zu Spielen mit dieser Person nichts mehr.</p>
                    <div className="checks">
                      {info.friends.map((f) => (
                        <Check
                          key={f.id}
                          id={`notify-friend-${f.username}`}
                          title={f.name}
                          checked={!info.settings.muted.includes(f.id)}
                          onChange={(on) =>
                            change({ friend: f.id, on }, (s) => ({
                              ...s,
                              muted: on ? s.muted.filter((id) => id !== f.id) : [...s.muted, f.id],
                            }))
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </fieldset>

              <section>
                <h2 className="section-title">Deine Geräte</h2>
                {info.devices.length === 0 ? (
                  <p className="empty">Noch auf keinem Gerät eingeschaltet.</p>
                ) : (
                  <ul className="rows" id="devices">
                    {info.devices.map((d) => (
                      <li key={d.id} className="manage-row">
                        <span>
                          <strong>{d.label}</strong>
                          {d.current && <span className="tag">dieses Gerät</span>}
                          {d.since && <span className="manage-meta">Eingeschaltet am {formatDay(d.since)}.</span>}
                        </span>
                        <button className="link" disabled={push.busy} onClick={() => removeDevice(d)}>
                          Entfernen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ThisDevice({ push, testing, onTest }) {
  const { support, endpoint, busy, turnOn, turnOff } = push;
  if (support === 'ios-browser')
    return (
      <p className="page-intro">
        Auf dem iPhone gibt es Benachrichtigungen nur in der App vom Home-Bildschirm. Tippe im Browser auf Teilen und
        dann auf „Zum Home-Bildschirm“.
      </p>
    );
  if (support === 'unsupported') return <p className="page-intro">Dieser Browser kann keine Benachrichtigungen.</p>;
  if (support === 'denied')
    return (
      <p className="page-intro">
        Benachrichtigungen sind für das Spielzimmer blockiert. Erlaube sie in den Einstellungen deines Geräts oder
        Browsers.
      </p>
    );
  return endpoint ? (
    <div className="device-state">
      <p>Dieses Gerät bekommt Benachrichtigungen.</p>
      <div className="row">
        <button className="btn" id="notify-test" disabled={testing} onClick={onTest}>
          Testnachricht schicken
        </button>
        <button className="link" id="notify-off" disabled={busy} onClick={turnOff}>
          Ausschalten
        </button>
      </div>
    </div>
  ) : (
    <div className="device-state">
      <p>Dieses Gerät bekommt keine Benachrichtigungen.</p>
      <div className="row">
        <button className="btn primary" id="notify-on" disabled={busy} onClick={turnOn}>
          Einschalten
        </button>
      </div>
    </div>
  );
}

export function Check({ id, title, hint, checked, onChange, disabled = false }) {
  return (
    <label className={`check ${disabled ? 'disabled' : ''}`} htmlFor={id}>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="check-title">{title}</span>
        {hint && <span className="check-hint">{hint}</span>}
      </span>
    </label>
  );
}
