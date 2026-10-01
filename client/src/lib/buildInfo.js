// "Versión 2.3.0 · 30/09/2026 18:42" (build time in the viewer's time zone). Values injected by vite.config.mjs
export function versionLabel(version = import.meta.env.REACT_APP_VERSION, builtAt = import.meta.env.REACT_APP_BUILD_TIME, timeZone) {
  if (!version) return '';
  const d = builtAt ? new Date(builtAt) : null;
  if (!d || Number.isNaN(d.getTime())) return `Versión ${version}`;
  const when = d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  }).replace(',', '');
  return `Versión ${version} · ${when}`;
}
