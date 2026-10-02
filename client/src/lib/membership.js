// Pair membership without Firebase imports, so it can be tested with fakes (wired in firebase.js)

// The rules let anyone with the code in while the pair is open, and only uids listed in pairs/{pairId}/members
// once someone locks it from Ajustes; only the joinPair callable writes there. So 3.1 joins in the background and
// nothing waits for it: an open pair reads as before, online or not. A device that has joined keeps a mark
// (pairId:uid) and doesn't call joinPair again.
//
// state.status: 'member' | 'joining' | 'invite' (the pair is locked and this uid is not in it: PairGate asks for an
// invite) | 'retrying' (no answer from joinPair: tried again later, and when the network comes back)
const MARK_KEY = 'member';

export function createMembership({ join, check, getUid, store, isOnline = () => true, delays = [2000, 5000, 15000], onError = () => {} } = {}) {
  // No join (no Firebase config, or tests): everyone is a member, as before
  const enabled = typeof join === 'function';
  let state = { status: enabled ? 'idle' : 'member', pairId: '', error: '' };
  const listeners = new Set();
  let uid = null;
  let timer = null;
  let failures = 0;

  function set(patch) {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  }
  const readMark = () => { try { return store?.getItem(MARK_KEY) || ''; } catch { return ''; } };
  const writeMark = (v) => { try { if (v) store?.setItem(MARK_KEY, v); else store?.removeItem(MARK_KEY); } catch {} };

  async function attempt(invite = '') {
    const { pairId } = state;
    clearTimeout(timer); timer = null;
    set({ status: 'joining', error: '' });
    try {
      await join({ pairId, ...(invite ? { invite } : {}) });
      if (pairId !== state.pairId) return false;
      failures = 0;
      writeMark(`${pairId}:${uid}`);
      set({ status: 'member' });
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
      // Someone typing an invite stays on that screen; anyone else carries on and joins later
      if (invite) { set({ status: 'invite', error: 'network' }); return false; }
      set({ status: 'retrying' });
      // Offline the 'online' event calls retry(); no point in spinning a timer meanwhile
      if (isOnline()) timer = setTimeout(() => attempt(), delays[Math.min(failures, delays.length - 1)]);
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
      await attempt();
    }
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start,
    // From the invite screen; resolves true when it got in
    redeem: (invite) => (enabled && state.pairId ? attempt(invite) : Promise.resolve(false)),
    // The 'online' event: a pending join goes now instead of waiting for its timer
    retry() { if (enabled && state.status === 'retrying') attempt(); },
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
