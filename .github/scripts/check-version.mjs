// Falla si la versión de client/package.json no es mayor que la del último tag de deploy (vX.Y.Z).
// La usan el workflow de PR (aviso temprano) y el de deploy (requisito). Sin tags todavía: pasa.
// Uso: node .github/scripts/check-version.mjs   (desde la raíz del repo, con los tags descargados)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const parse = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? m.slice(1).map(Number) : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const version = JSON.parse(readFileSync('client/package.json', 'utf8')).version;
const current = parse(version);
if (!current) {
  console.error(`client/package.json tiene una versión no válida: "${version}"`);
  process.exit(1);
}

const tags = execSync("git tag --list 'v*'", { encoding: 'utf8' }).split('\n').map((t) => [t, parse(t)]).filter(([, p]) => p);
if (!tags.length) {
  console.log(`Sin tags de deploy todavía: ${version} pasa como primera versión.`);
  process.exit(0);
}
const [lastTag, last] = tags.sort((a, b) => cmp(a[1], b[1])).at(-1);

if (cmp(current, last) <= 0) {
  console.error(`La versión no ha subido: client/package.json dice ${version} y el último deploy es ${lastTag}. Sube "version" antes de desplegar.`);
  process.exit(1);
}
console.log(`Versión OK: ${version} > ${lastTag}`);
