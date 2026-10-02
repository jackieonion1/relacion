import fs from 'fs';
import path from 'path';

// The Carta CSS as it ships (client/build), like the build checks in sw.test.js: what only the compiled CSS shows
const BUILD = path.join(__dirname, '..', 'build');
const hasBuild = fs.existsSync(path.join(BUILD, 'asset-manifest.json'));
const css = hasBuild
  ? fs.readFileSync(path.join(BUILD, JSON.parse(fs.readFileSync(path.join(BUILD, 'asset-manifest.json'), 'utf8')).files['main.css']), 'utf8')
  : '';
// The minifier merges rules with the same body (".text-gray-900,.text-ink{…}"): find the selector inside a list
const ruleRe = (selector, flags) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[},])${esc}(?:,[^{}]*)?\\{[^}]*\\}`, flags);
};
const rule = (selector) => css.match(ruleRe(selector))?.[0] || '';
// The minifier may split one source rule in several (".marca{position:…}" … ".marca{-webkit-backdrop-filter:…}")
const rules = (selector) => [...css.matchAll(ruleRe(selector, 'g'))].map((m) => m[0]).join('');

// Locally it is skipped without a build; in CI the build step goes first, so a missing build is a failure
describe.skipIf(!hasBuild && !process.env.CI)('el CSS de la build', () => {
  test('hay build', () => {
    expect(hasBuild, 'falta client/build: npm run build antes de npm test').toBe(true);
  });

  test('drop-shadow-sm y -lg pintan sus dos capas (una drop-shadow() con coma no es válida)', () => {
    for (const s of ['.drop-shadow-sm', '.drop-shadow-lg']) {
      const value = rule(s).match(/--tw-drop-shadow:([^;}]*)/)[1];
      expect(value.match(/drop-shadow\(/g)).toHaveLength(2);
      expect(value).not.toMatch(/drop-shadow\([^)]*\([^)]*\),/);
    }
  });

  test('conserva los prefijos y los bloques de iOS', () => {
    // Selector by selector: Safari on the iPhone blurs only with the prefix
    for (const s of ['.marca', '.barra', '.heart-rain-stop', '.backdrop-blur-sm', '.backdrop-blur-xs', '.backdrop-blur-\\[18px\\]']) {
      expect(rules(s), s).toMatch(/-webkit-backdrop-filter:/);
    }
    expect(css).toContain('@supports (-webkit-touch-callout:none)');
    expect(css).toMatch(/@media\s*\(hover:none\)\s*and \(pointer:coarse\)\{html,body\{overflow:hidden\}\.app-shell\{[^}]*position:fixed/);
  });

  test('tokens claros en :root y oscuros bajo html[data-tema=oscuro]', () => {
    expect(css).toMatch(/:root,\.tema-claro[^{]*\{--paper:oklch\(97\.5% \.009 35\)/);
    expect(css).toMatch(/html\[data-tema=oscuro\]\{color-scheme:dark;--paper:oklch\(18\.5% \.014 25\)/);
  });

  test('el puente: rosa → lacre, gris → tinta, blanco solo como superficie, blanco sobre rosa → on-lacre', () => {
    expect(rule('.bg-rose-600')).toContain('var(--lacre)');
    expect(rule('.text-gray-900')).toContain('var(--ink)');
    expect(css).toMatch(/\.bg-white,[^{]*\.to-white\{--color-white:var\(--card\)\}/);
    expect(css).toContain('.text-white:is(.bg-rose-500,.bg-rose-600,.bg-rose-700,.bg-red-600){color:var(--on-lacre)}');
  });

  test('el fondo ya no lleva !important y la barra de progreso toma el lacre', () => {
    expect(css).not.toMatch(/background-color:[^;}]*!important/);
    expect(rule('.progress-range')).toContain('--prg:var(--lacre)');
  });
});
