// Session plumbing without Firebase imports, so it can be tested with fakes (wired in firebase.js)

// Anonymous sign-in with retry. Single flight: two concurrent signInAnonymously without a user would create
// two anonymous uids (the last one wins and whatever was written with the first keeps an orphan `createdBy`),
// so a new attempt only starts after the pending one has rejected, never while it hangs on a slow network.
export function createSignIn({ signIn, hasUser, isOnline = () => true, delays = [2000, 5000, 15000], onError = () => {} }) {
  let inFlight = null;
  let timer = null;
  let failures = 0;
  function run() {
    if (inFlight) return inFlight;
    if (timer) { clearTimeout(timer); timer = null; }
    if (hasUser()) return Promise.resolve(null);
    inFlight = new Promise((resolve) => resolve(signIn())).then(
      (res) => { inFlight = null; failures = 0; return res; },
      (e) => {
        inFlight = null;
        onError(e);
        // Offline the 'online' event calls run() again; no point in spinning a timer meanwhile
        if (!hasUser() && isOnline()) {
          timer = setTimeout(run, delays[Math.min(failures, delays.length - 1)]);
        }
        failures += 1;
        return null;
      }
    );
    return inFlight;
  }
  return run;
}

// whenAuthed(ms): resolves with the user once there is a session, or with getUser() (null) after `ms`.
// whenAuthed(Infinity) waits with no cap: for listeners, where a pending subscription blocks no UI.
export function createWhenAuthed(ready, getUser) {
  const current = () => getUser() || null;
  return function whenAuthed(ms = 15000) {
    if (!ready) return Promise.resolve(current());
    const settled = ready.then(current, current);
    if (!Number.isFinite(ms)) return settled;
    let t;
    const timeout = new Promise((resolve) => { t = setTimeout(() => resolve(current()), ms); });
    return Promise.race([settled, timeout]).finally(() => clearTimeout(t));
  };
}
