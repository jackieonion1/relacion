// Pair membership without Firebase imports, so it can be tested with fakes (wired in firebase.js)

// The rules only let in uids listed in pairs/{pairId}/members, and only the joinPair callable writes there. A device
// that has joined keeps a mark (pairId:uid) and never waits for the network again: offline it reads its cache as
// before. Without the mark (a new uid, or the first run after 3.1) every read waits until joinPair answers.
//
// state.status: 'member' | 'joining' | 'invite' (the pair is locked: PairGate asks for an invite) | 'retrying'
// (no answer from joinPair). state.epoch grows when membership arrives after the screens may already have read
// without it, so PairGate remounts them and their listeners start again.
const MARK_KEY = 'member';

export function createMembership({ join, check, getUid, store, isOnline = () => true, delays = [2000, 5000, 15000], onError = () => {} } = {}) {
  // No join (no Firebase config, or tests): everyone is a member, as before
  const enabled = typeof join === 'function';
  let state = { status: enabled ? 'idle' : 'member', pairId: '', epoch: 0, error: '' };
  const listeners = new Set();
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  if (!enabled) release();
  let uid = null;
  let timer = null;
  let failures = 0;

  function set(patch) {
    state = { ...state, ...patch };
    if (state.status === 'member') release();
    listeners.forEach((fn) => fn());
  }
  const readMark = () => { try { return store?.getItem(MARK_KEY) || ''; } catch { return ''; } };
  const writeMark = (v) => { try { if (v) store?.setItem(MARK_KEY, v); else store?.removeItem(MARK_KEY); } catch {} };

  // One joinPair at a time. `late`: the screens may have read without membership, so a success remounts them
  async function attempt({ invite = '', late = false } = {}) {
    const { pairId } = state;
    clearTimeout(timer); timer = null;
    set({ status: 'joining', error: '' });
    try {
      await join({ pairId, ...(invite ? { invite } : {}) });
      if (pairId !== state.pairId) return false;
      failures = 0;
      writeMark(`${pairId}:${uid}`);
      set({ status: 'member', epoch: late ? state.epoch + 1 : state.epoch });
      return true;
    } catch (e) {
      if (pairId !== state.pairId) return false;
      const code = String(e?.code || '').replace(/^functions\//, '');
      // failed-precondition: locked and no invite; permission-denied: the invite is wrong, used or expired
      if (code === 'failed-precondition' || code === 'permission-denied') {
        set({ status: 'invite', error: invite ? 'invite' : '' });
        return false;
      }
      onError(e);
      // Someone typing an invite stays on that screen; anyone else goes on with the cache meanwhile
      if (invite) { set({ status: 'invite', error: 'network' }); return false; }
      set({ status: 'retrying' });
      // Offline the reads can only come from the cache: no point in holding them until the network is back
      if (!isOnline()) release();
      else timer = setTimeout(() => attempt({ late: true }), delays[Math.min(failures, delays.length - 1)]);
      failures += 1;
      return false;
    }
  }

  // Called by PairGate with the stored or just-typed code. A new code (another pair) starts over
  async function start(pairId) {
    if (!pairId || pairId === state.pairId) return;
    if (!enabled) { set({ pairId }); return; }
    clearTimeout(timer); timer = null;
    failures = 0;
    set({ pairId, status: 'joining', error: '' });
    const u = await getUid();
    if (pairId !== state.pairId || !u) return;
    uid = u;
    if (readMark() !== `${pairId}:${uid}`) { await attempt(); return; }
    set({ status: 'member' });
    // A device removed from Ajustes still has its mark: the server says so (null = could not ask, e.g. offline)
    let ok = null;
    try { ok = check ? await check(pairId, uid) : null; } catch {}
    if (ok === false && pairId === state.pairId) {
      writeMark('');
      await attempt({ late: true });
    }
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Resolves once this device may read (a member, or offline with nothing better than the cache)
    ready: () => ready,
    start,
    // From the invite screen; resolves true when it got in
    redeem: (invite) => (enabled && state.pairId ? attempt({ invite, late: true }) : Promise.resolve(false)),
    // The 'online' event: a pending join goes now instead of waiting for its timer
    retry() { if (enabled && state.status === 'retrying') attempt({ late: true }); },
  };
}

// What Ajustes shows for each member: the device kind, from the user agent (an iPad says Macintosh but has touch)
export function deviceLabel(ua = '', touchPoints = 0) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android' : 'Tablet Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}
