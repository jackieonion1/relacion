import React, { useEffect, useState } from 'react';
import Button from '../components/Button';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import RepairApp from '../components/RepairApp';
import { IDENTITIES } from '../components/Entrada';
import { useOnline } from '../components/MarcaSuperior';
import { subscribeToPush, getPushSubscription, unsubscribeFromPush, getPushDiag } from '../lib/push';
import { getResyncInfo } from '../lib/pushResync';
import { applyUpdate, checkForUpdate, getRegistration } from '../lib/appUpdate';
import { normalizePairCode, isValidPairCode } from '../lib/pairCode';
import { versionLabel } from '../lib/buildInfo';
import { readTheme, setTheme } from '../lib/theme';

const IDENTITY_KEY = 'identity'; // 'yo' | 'ella'
const PAIR_KEY = 'pairId';

// The dot of each real notification state (P:1992 only had on/off): green subscribed, amber half-way, red blocked
const DOT = {
  'Suscrito': 'bg-[oklch(0.62_0.13_150)]',
  'Permiso concedido, sin suscripción': 'bg-el',
  'Bloqueadas': 'bg-danger',
};

function Seccion({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="etiqueta px-1">{title}</h2>
      {children}
    </section>
  );
}

const tarjeta = 'rounded-tarjeta bg-card border border-line';

const TEMAS = [['sistema', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']];
// How long «Comprobando…» waits for the service worker before saying what it knows (adversario-cascara O1)
const CHECK_TIMEOUT_MS = 4000;

export default function Settings() {
  // `pair` es el código guardado; lo que se escribe en el input vive aparte hasta confirmar uno válido
  const [pair] = useState(() => localStorage.getItem(PAIR_KEY) || '');
  const [pairInput, setPairInput] = useState(pair);
  const [pairConfirm, setPairConfirm] = useState(''); // '' | 'save' | 'clear'
  const [copied, setCopied] = useState(false);
  const newPair = normalizePairCode(pairInput);
  const canSavePair = isValidPairCode(newPair) && newPair !== pair;
  const pairBad = !!pairInput && !isValidPairCode(pairInput);

  // Las páginas leen el código de localStorage al montarse y la puerta (PairGate) lo guarda en su
  // estado: tras guardar o borrar se recarga para que todo arranque con el código nuevo
  function applyPair(code) {
    try {
      if (code) localStorage.setItem(PAIR_KEY, code);
      else localStorage.removeItem(PAIR_KEY);
    } catch {}
    window.location.reload();
  }

  const shareLink = typeof window !== 'undefined' && pair
    ? `${window.location.origin}/?pair=${encodeURIComponent(pair)}`
    : '';

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(shareLink);
      setCopied(true);
    } catch {}
  }

  const [identity, setIdentity] = useState(() => localStorage.getItem(IDENTITY_KEY) || 'yo');
  function chooseIdentity(id) {
    localStorage.setItem(IDENTITY_KEY, id);
    setIdentity(id);
  }

  const [tema, setTema] = useState(() => readTheme(localStorage));
  function chooseTheme(t) {
    setTheme(t);
    setTema(t);
  }

  // Notifications (step 1): UI and permission only
  const [notifPerm, setNotifPerm] = useState(() => {
    try { return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; }
  });
  const [supports, setSupports] = useState({ notif: false, sw: false });
  // null = aún no se sabe: getPushSubscription espera al service worker, y un SW lento no es «sin suscripción»
  const [subscribed, setSubscribed] = useState(null);
  const [confirmOff, setConfirmOff] = useState(false);
  // Última vez que el doc de esta suscripción se escribió en Firestore desde este móvil (null = sin confirmar)
  const [syncedAt, setSyncedAt] = useState(() => getResyncInfo(localStorage)?.at || null);
  const [pushDiag, setPushDiag] = useState(() => getPushDiag());
  // What used to be an alert(): the result of the last notification action, shown under its buttons
  const [notifMsg, setNotifMsg] = useState(null); // { text, error }
  const [notifBusy, setNotifBusy] = useState('');
  useEffect(() => {
    try {
      setSupports({ notif: 'Notification' in window, sw: 'serviceWorker' in navigator });
      if ('Notification' in window) setNotifPerm(Notification.permission);
    } catch {}
  }, []);
  // A service worker that never gets ready must not leave «Comprobando…» for ever; a late answer still wins
  const [checkSlow, setCheckSlow] = useState(false);
  useEffect(() => {
    const slow = setTimeout(() => setCheckSlow(true), CHECK_TIMEOUT_MS);
    (async () => {
      try {
        const sub = await getPushSubscription();
        setSubscribed(!!sub);
      } catch {}
    })();
    return () => clearTimeout(slow);
  }, []);
  useEffect(() => {
    // Refresh diagnostics when permission/sub state changes
    try { setPushDiag(getPushDiag()); } catch {}
  }, [notifPerm, subscribed]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(e) {
      try {
        if (e?.data?.type === 'pushsubscriptionchange') {
          if (Notification.permission === 'granted' && pair) {
            const vapid = import.meta.env.REACT_APP_VAPID_PUBLIC_KEY || '';
            const identity = localStorage.getItem(IDENTITY_KEY) || 'yo';
            if (vapid) {
              subscribeToPush(pair, identity, vapid).then(() => setSubscribed(true)).catch(() => {});
            }
          }
        }
      } catch {}
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [pair]);
  async function requestNotifications() {
    try {
      if (!('Notification' in window)) return;
      const res = await Notification.requestPermission();
      setNotifPerm(res);
    } catch (e) {
      console.warn('Notification permission error', e);
    }
  }

  async function onSubscribe() {
    setNotifMsg(null);
    setNotifBusy('subscribe');
    try {
      const vapid = import.meta.env.REACT_APP_VAPID_PUBLIC_KEY || '';
      if (!vapid) { setNotifMsg({ text: 'Falta REACT_APP_VAPID_PUBLIC_KEY', error: true }); return; }
      if (!pair) { setNotifMsg({ text: 'Configura el código de pareja primero', error: true }); return; }
      const identity = localStorage.getItem(IDENTITY_KEY) || 'yo';
      await subscribeToPush(pair, identity, vapid);
      setSubscribed(true);
      setSyncedAt(getResyncInfo(localStorage)?.at || null);
      try { setPushDiag(getPushDiag()); } catch {}
    } catch (e) {
      console.warn('subscribe error', e);
      setNotifMsg({ text: 'No se pudo activar: ' + (e?.message || 'Error'), error: true });
      try { setPushDiag(getPushDiag()); } catch {}
    } finally {
      setNotifBusy('');
    }
  }

  async function onUnsubscribe() {
    setConfirmOff(false);
    setNotifMsg(null);
    try {
      const identity = localStorage.getItem(IDENTITY_KEY) || 'yo';
      await unsubscribeFromPush(pair, identity);
      setSubscribed(false);
    } catch (e) {
      console.warn('unsubscribe error', e);
    }
  }

  async function onTestPush() {
    setNotifMsg(null);
    setNotifBusy('test');
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const fn = httpsCallable(getFunctions(undefined, 'europe-southwest1'), 'sendTestPush');
      await fn({ pairId: pair, title: 'Prueba', body: 'Esto es una notificación de prueba', url: '/notes' });
      setNotifMsg({ text: 'Notificación de prueba enviada' });
    } catch (e) {
      console.warn('test push error', e);
      setNotifMsg({ text: 'Error enviando prueba: ' + (e?.message || 'Error'), error: true });
    } finally {
      setNotifBusy('');
    }
  }

  const notifState = supports.notif
    ? (notifPerm === 'granted' ? (subscribed === null ? (checkSlow ? 'No se pudo comprobar' : 'Comprobando…') : subscribed ? 'Suscrito' : 'Permiso concedido, sin suscripción') : notifPerm === 'denied' ? 'Bloqueadas' : 'No activadas')
    : 'No soportadas';
  const checking = notifPerm === 'granted' && subscribed === null;
  const notifLine = notifState === 'Bloqueadas'
    ? 'Desbloquéalas en los ajustes del móvil: Notificaciones › 🍪🫒.'
    : notifState === 'No se pudo comprobar'
      ? (syncedAt ? `Permiso concedido. Última sincronización con el servidor: ${new Date(syncedAt).toLocaleDateString()}` : 'Permiso concedido, pero el móvil aún no ha dicho si está suscrito. Vuelve a mirarlo en un rato.')
    : checking
      ? 'Mirando si este móvil ya está suscrito.'
      : subscribed && notifPerm === 'granted'
        ? (syncedAt ? `Última sincronización con el servidor: ${new Date(syncedAt).toLocaleDateString()}` : 'Suscrito en este móvil, sin confirmar en el servidor')
        : 'Requiere instalar la PWA y HTTPS.';

  return (
    <div className="max-w-(--breakpoint-md) mx-auto px-4">
      <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em] px-1 pt-1.5 pb-[18px]">Ajustes</h1>
      <div className="flex flex-col gap-[22px]">
        <Seccion title="Pareja">
          <div className={`${tarjeta} px-4 py-3.5 flex flex-col gap-2.5`}>
            <label htmlFor="ajustes-codigo" className="text-base">Código de pareja</label>
            <form onSubmit={(e) => { e.preventDefault(); if (canSavePair) setPairConfirm('save'); }} className="flex gap-2">
              <input
                id="ajustes-codigo" value={pairInput} onChange={(e) => setPairInput(e.target.value.toUpperCase())} placeholder="AB12CD" maxLength={12}
                autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                aria-invalid={pairBad || undefined} aria-describedby="ajustes-codigo-ayuda"
                className="input flex-1 min-w-0 min-h-12 h-12 py-0 bg-paper text-lg font-semibold tracking-[0.18em]"
              />
              <Button type="submit" size="m" disabled={!canSavePair}>Guardar</Button>
            </form>
            <p id="ajustes-codigo-ayuda" className={`text-[13px] ${pairBad ? 'text-danger' : 'text-ink-2'}`}>
              {pairBad ? 'Entre 4 y 12 letras o números.' : 'Es el mismo en los dos móviles.'}
            </p>
            {shareLink && (
              <div className="flex flex-col gap-1.5 pt-2.5 border-t border-line">
                <div className="flex items-center gap-2">
                  <span className="num flex-1 min-w-0 text-[13px] text-ink-2 whitespace-nowrap overflow-hidden text-ellipsis">{shareLink}</span>
                  <Button variant="sec" onClick={copyLink} className="px-4">Copiar enlace</Button>
                </div>
                <p role="status" className="text-[13px] text-ink-2">
                  {copied ? 'Enlace copiado.' : 'Comparte este enlace por WhatsApp. Al abrirlo, se configura automáticamente.'}
                </p>
              </div>
            )}
            {pair && (
              <Button variant="txt" onClick={() => setPairConfirm('clear')} className="self-start px-0 text-danger">Borrar código de este móvil</Button>
            )}
          </div>
        </Seccion>

        <Seccion title="Quién eres">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-[26px] bg-sunk">
            {IDENTITIES.map((q) => {
              const on = identity === q.id;
              return (
                <button
                  key={q.id} type="button" aria-pressed={on} onClick={() => chooseIdentity(q.id)}
                  className={`h-11 rounded-full flex items-center justify-center gap-2 text-base font-semibold transition-colors duration-200 ease-suave focus-visible:outline-2 focus-visible:outline-lacre ${on ? 'bg-raised text-ink shadow-carta' : 'text-ink-2'}`}
                >
                  <span aria-hidden="true">{q.emoji}</span>{q.label}
                </button>
              );
            })}
          </div>
        </Seccion>

        <Seccion title="Avisos">
          <div className={`${tarjeta} px-4 py-3.5 flex flex-col gap-2.5`}>
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full flex-none ${DOT[notifState] || 'bg-line'}`} />
              <span className="flex-1 text-base">{notifState}</span>
            </div>
            <p className="text-[13px] text-ink-2">{notifLine}</p>
            <div className="flex flex-wrap gap-2">
              {notifPerm === 'denied' && supports.notif ? null : notifPerm !== 'granted' ? (
                <Button onClick={requestNotifications} disabled={!supports.notif}>Activar</Button>
              ) : checking ? null : subscribed ? (
                <>
                  <Button variant="sec" onClick={onTestPush} busy={notifBusy === 'test'} busyText="Enviando…">Probar</Button>
                  <Button variant="txt" onClick={() => setConfirmOff(true)} disabled={!!notifBusy} className="text-ink-2">Desactivar</Button>
                </>
              ) : (
                <Button onClick={onSubscribe} busy={notifBusy === 'subscribe'} busyText="Suscribiendo…">Suscribirme</Button>
              )}
            </div>
            {notifMsg && (
              <p role={notifMsg.error ? 'alert' : 'status'} className={`text-[13px] ${notifMsg.error ? 'text-danger' : 'text-ink-2'}`}>{notifMsg.text}</p>
            )}
            {pushDiag && (
              <details className="group border-t border-line pt-2.5">
                <summary className="list-none flex items-center justify-between min-h-11 -my-1 cursor-pointer text-[15px] text-ink-2 [&::-webkit-details-marker]:hidden">
                  Detalles
                  <Icon name="abajo" size={18} className="transition-transform group-open:rotate-180" />
                </summary>
                <p className="pt-1 text-xs text-ink-2 break-all whitespace-pre-wrap font-mono">{pushDiag}</p>
              </details>
            )}
          </div>
        </Seccion>

        <Seccion title="Apariencia">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-[26px] bg-sunk">
            {TEMAS.map(([id, label]) => {
              const on = tema === id;
              return (
                <button
                  key={id} type="button" aria-pressed={on} onClick={() => chooseTheme(id)}
                  className={`h-11 rounded-full text-[15px] font-semibold transition-colors duration-200 ease-suave focus-visible:outline-2 focus-visible:outline-lacre ${on ? 'bg-raised text-ink shadow-carta' : 'text-ink-2'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Seccion>

        <Seccion title="La app">
          <div className={`${tarjeta} overflow-hidden divide-y divide-line`}>
            <BuscarActualizaciones />
            <div><RepairApp /></div>
          </div>
        </Seccion>

        {/* Qué versión tiene cada móvil, sin pedir nada técnico */}
        <p className="num pt-2 text-center text-[13px] text-ink-2">{versionLabel()}</p>
      </div>

      <Sheet isOpen={confirmOff} onClose={() => setConfirmOff(false)}>
        <div className="flex flex-col gap-1.5 px-5 pt-2 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Desactivar las notificaciones?</h2>
          <p className="pb-3.5 text-[15px] text-ink-2">
            Este móvil dejará de recibir avisos de la pareja. Podrás volver a activarlos desde aquí.
          </p>
          <Button variant="dan" size="l" onClick={onUnsubscribe}>Desactivar</Button>
          <Button variant="txt" size="l" onClick={() => setConfirmOff(false)}>Cancelar</Button>
        </div>
      </Sheet>

      <Sheet isOpen={!!pairConfirm} onClose={() => setPairConfirm('')}>
        <div className="flex flex-col gap-1.5 px-5 pt-2 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal">
            {pairConfirm === 'clear' ? '¿Borrar el código de este móvil?' : '¿Cambiar el código de pareja?'}
          </h2>
          <p className="pb-3.5 text-[15px] text-ink-2">
            {pairConfirm === 'clear'
              ? `Se borrará ${pair} de este dispositivo y la app te pedirá un código otra vez. Los datos de la pareja no se borran.`
              : `Pasarás de ${pair} a ${newPair} y verás los datos de ese código. Para volver, escribe ${pair}.`}
          </p>
          <Button variant="dan" size="l" onClick={() => applyPair(pairConfirm === 'clear' ? '' : newPair)}>
            {pairConfirm === 'clear' ? 'Borrar código' : 'Cambiar código'}
          </Button>
          <Button variant="txt" size="l" onClick={() => setPairConfirm('')}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  );
}

// C7: the same check the update notice makes, on demand. A new version offers «Actualizar» (applyUpdate, as the notice)
export function BuscarActualizaciones() {
  const online = useOnline();
  const [state, setState] = useState(''); // '' | 'checking' | 'latest' | 'newer' | 'updating'

  async function check() {
    setState('checking');
    let newer = await checkForUpdate();
    if (!newer) {
      // A new service worker already waiting is a new version too (UpdateBanner counts it the same way)
      const reg = await getRegistration();
      newer = !!(reg?.waiting && navigator.serviceWorker?.controller);
    }
    setState(newer ? 'newer' : 'latest');
  }

  async function update() {
    setState('updating');
    try { await applyUpdate(); } catch { setState('newer'); }
  }

  const busy = state === 'checking' || state === 'updating';
  return (
    <div>
      <button
        type="button" onClick={check} disabled={busy || !online} aria-busy={state === 'checking' || undefined}
        className="w-full min-h-14 px-4 flex items-center justify-between gap-3 text-left active:bg-sunk disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-lacre focus-visible:-outline-offset-2"
      >
        <span className="text-base">{state === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}</span>
        <Icon name="recargar" size={20} className="text-ink-2" />
      </button>
      {!online && <p className="px-4 pb-3 text-[13px] text-danger">Necesita conexión.</p>}
      {(state === 'latest' || state === 'newer' || state === 'updating') && (
        <div role="status" className="px-4 pb-3 flex items-center justify-between gap-3 text-[13px] text-ink-2">
          {state === 'latest' ? 'Ya tienes la última versión.' : 'Hay una versión nueva.'}
          {state !== 'latest' && (
            <Button size="m" onClick={update} busy={state === 'updating'} busyText="Actualizando…">Actualizar</Button>
          )}
        </div>
      )}
    </div>
  );
}
