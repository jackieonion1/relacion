import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Button from './Button';
import { normalizePairCode, isValidPairCode } from '../lib/pairCode';
import { ROLE_LABELS } from '../lib/eventTypes';
import { membership } from '../lib/firebase';

const IDENTITY_KEY = 'identity'; // 'yo' | 'ella'
const PAIR_KEY = 'pairId';

// Who each stored identity is: the value never changes, only how it is called (Q7)
export const IDENTITIES = [
  { id: 'yo', label: ROLE_LABELS.novio, emoji: '🫒' },
  { id: 'ella', label: ROLE_LABELS.novia, emoji: '🍪' },
];

function readPairFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('pair');
    return raw ? raw.trim().toUpperCase() : '';
  } catch {
    return '';
  }
}

// Full-screen first-run page (Entrada / Quién of the canvas): no shell, no tab bar, the action at the bottom
function Puerta({ label, children, footer }) {
  return (
    <main
      aria-label={label}
      className="min-h-dvh flex flex-col bg-paper text-ink px-6"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 54px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 34px)' }}
    >
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col">
        {children}
        <p className="pt-3 text-[13px] text-ink-2 text-center">{footer}</p>
      </div>
    </main>
  );
}

export function PairGate({ children }) {
  const [pairId, setPairId] = useState(() => localStorage.getItem(PAIR_KEY) || readPairFromUrl() || '');
  const [code, setCode] = useState('');
  // joinPair runs in the background (membership.js): this gate only changes once someone has locked the pair
  const [redeeming, setRedeeming] = useState(false);
  const member = useSyncExternalStore(membership.subscribe, membership.get);

  useEffect(() => {
    if (!pairId) return;
    localStorage.setItem(PAIR_KEY, pairId);
    membership.start(pairId);
    // Limpia el parámetro de la URL si venía en el enlace
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('pair')) {
        url.searchParams.delete('pair');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, [pairId]);

  const valid = isValidPairCode(code);
  const bad = !!normalizePairCode(code) && !valid;

  function onSubmit(e) {
    e.preventDefault();
    const v = normalizePairCode(code);
    if (!isValidPairCode(v)) return;
    setPairId(v);
    setCode('');
  }

  function otherPair() {
    try { localStorage.removeItem(PAIR_KEY); } catch {}
    setPairId('');
  }

  async function redeem(invite) {
    setRedeeming(true);
    try { await membership.redeem(invite); } finally { setRedeeming(false); }
  }

  // Until start() runs, the state may still be another code's
  if (pairId && member.pairId === pairId && (member.status === 'invite' || redeeming)) {
    return <InviteDoor error={redeeming ? '' : member.error} busy={redeeming} onRedeem={redeem} onOtherPair={otherPair} />;
  }

  if (!pairId) {
    return (
      <Puerta label="Código de pareja" footer="Se guarda solo en este móvil.">
        <form onSubmit={onSubmit} className="flex-1 flex flex-col">
          <div className="flex-1 flex flex-col justify-center gap-4">
            <p className="text-[40px] leading-none" role="img" aria-label="Nosotros">🍪🫒</p>
            <h1 className="serif text-[42px] leading-[1.04] font-normal tracking-[-0.015em]">
              Hola. <em className="text-accent-ink">¿Sois vosotros?</em>
            </h1>
            <p className="text-base text-ink-2">Escribe el código de pareja que te ha pasado la otra persona.</p>
            <div className="flex flex-col gap-2 pt-2">
              <label htmlFor="codigo-pareja" className="etiqueta">Código de pareja</label>
              <input
                id="codigo-pareja" name="pair" placeholder="AB12CD" maxLength={12}
                autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                aria-invalid={bad || undefined} aria-describedby="codigo-pareja-ayuda"
                className="input w-full h-16 rounded-[18px] px-5 text-[26px] font-semibold tracking-[0.22em] placeholder:text-ink-2/50"
              />
              <p id="codigo-pareja-ayuda" className={`text-[13px] ${bad ? 'text-danger' : 'text-ink-2'}`}>
                {bad ? 'Entre 4 y 12 letras o números.' : 'Lo tiene la otra persona en Ajustes.'}
              </p>
            </div>
          </div>
          <Button type="submit" size="xl" disabled={!valid} className="w-full">Continuar</Button>
        </form>
      </Puerta>
    );
  }

  return <>{children}</>;
}

// The pair is locked and this device is not in it: a one-time code from Ajustes › Añadir un dispositivo
function InviteDoor({ error, busy, onRedeem, onOtherPair }) {
  const [invite, setInvite] = useState('');
  const clean = invite.replace(/[^A-Z0-9]/g, '');
  const valid = clean.length === 8;
  const help = error === 'invite'
    ? 'Ese código no vale o ha caducado. Pide otro.'
    : error === 'network'
      ? 'No hay conexión. Prueba otra vez en un momento.'
      : 'Caduca a los 15 minutos y sirve una vez.';

  function onSubmit(e) {
    e.preventDefault();
    if (valid && !busy) onRedeem(clean);
  }

  return (
    <Puerta label="Invitación" footer="Así solo entran vuestros dispositivos.">
      <form onSubmit={onSubmit} className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col justify-center gap-4">
          <p className="text-[40px] leading-none" role="img" aria-label="Nosotros">🍪🫒</p>
          <h1 className="serif text-[42px] leading-[1.04] font-normal tracking-[-0.015em]">
            Falta <em className="text-accent-ink">una invitación.</em>
          </h1>
          <p className="text-base text-ink-2">En el otro móvil, ve a Ajustes › Añadir un dispositivo y escribe aquí el código que sale.</p>
          <div className="flex flex-col gap-2 pt-2">
            <label htmlFor="codigo-invitacion" className="etiqueta">Código de invitación</label>
            <input
              id="codigo-invitacion" name="invite" placeholder="ABCD-EFGH" maxLength={9}
              autoComplete="one-time-code" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())}
              aria-invalid={!!error || undefined} aria-describedby="codigo-invitacion-ayuda"
              className="input w-full h-16 rounded-[18px] px-5 text-[26px] font-semibold tracking-[0.22em] placeholder:text-ink-2/50"
            />
            <p id="codigo-invitacion-ayuda" role={error ? 'alert' : undefined} className={`text-[13px] ${error ? 'text-danger' : 'text-ink-2'}`}>{help}</p>
          </div>
        </div>
        <Button type="submit" size="xl" disabled={!valid} busy={busy} busyText="Entrando…" className="w-full">Entrar</Button>
        <Button variant="txt" onClick={onOtherPair} disabled={busy} className="w-full">Usar otro código de pareja</Button>
      </form>
    </Puerta>
  );
}

export function IdentityGate({ children }) {
  const [identity, setIdentity] = useState(() => localStorage.getItem(IDENTITY_KEY) || '');

  function choose(id) {
    localStorage.setItem(IDENTITY_KEY, id);
    setIdentity(id);
  }

  if (!identity) {
    // One tap chooses and goes in, as before: the canvas's extra «Empezar» step would be new friction
    return (
      <Puerta label="Quién eres" footer="Se puede cambiar en Ajustes.">
        <div className="flex-1 flex flex-col justify-center gap-4">
          <h1 className="serif text-[42px] leading-[1.04] font-normal tracking-[-0.015em]">¿Quién eres?</h1>
          <p className="text-base text-ink-2">Así sabremos de quién es cada nota y cada foto.</p>
          <div className="flex flex-col gap-2.5 pt-2">
            {IDENTITIES.map((q) => (
              <button
                key={q.id} type="button" onClick={() => choose(q.id)}
                className="flex items-center gap-4 min-h-[84px] px-5 rounded-[22px] border-[1.5px] border-line bg-card text-left transition-transform active:scale-[0.98] active:border-lacre active:bg-lacre-soft focus-visible:outline-2 focus-visible:outline-lacre focus-visible:outline-offset-2"
              >
                <span aria-hidden="true" className="w-12 h-12 rounded-full bg-sunk flex items-center justify-center text-2xl leading-none flex-none">{q.emoji}</span>
                <span className="flex-1 text-lg font-semibold">{q.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Puerta>
    );
  }

  return <>{children}</>;
}
