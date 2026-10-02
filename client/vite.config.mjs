import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Version and build time shown in Ajustes, as craco did: envPrefix exposes REACT_APP_* already in process.env
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
process.env.REACT_APP_VERSION = version;
process.env.REACT_APP_BUILD_TIME = process.env.REACT_APP_BUILD_TIME || new Date().toISOString();

// asset-manifest.json as CRA wrote it: appUpdate.js compares its entrypoints with the loaded ones
function assetManifest() {
  return {
    name: 'asset-manifest',
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = {};
      const entrypoints = [];
      const out = Object.values(bundle);
      const main = out.find((f) => f.type === 'chunk' && f.isEntry);
      const css = [...(main?.viteMetadata?.importedCss || [])];
      for (const f of out) {
        const name = f.fileName;
        if (name.endsWith('.map')) files[name.split('/').pop()] = `/${name}`;
        else if (f === main) files['main.js'] = `/${name}`;
        else if (css.includes(name)) files['main.css'] = `/${name}`;
        else if (/^static\/(js|css)\//.test(name)) files[name] = `/${name}`;
      }
      files['index.html'] = '/index.html';
      entrypoints.push(...css, main.fileName);
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: `${JSON.stringify({ files, entrypoints }, null, 2)}\n` });
    },
  };
}

export default defineConfig({
  plugins: [react(), assetManifest()],
  envPrefix: 'REACT_APP_',
  server: { port: 3000 },
  build: {
    outDir: 'build',
    sourcemap: true,
    // Tailwind 4 already runs its own Lightning CSS inside the PostCSS plugin. Vite's default one on top would add
    // --lightningcss-light/-dark polyfills and more -webkit-text-decoration (measured in the Tailwind 4 spike);
    // esbuild keeps the prefixes the PostCSS pipeline left, the same set CRA shipped
    cssMinify: 'esbuild',
    // CRA's file names: public/sw.js only caches /static/js/*.js and /static/css/*.css and needs main.*
    rolldownOptions: {
      output: {
        entryFileNames: 'static/js/main.[hash].js',
        chunkFileNames: 'static/js/[name].[hash].chunk.js',
        assetFileNames: ({ names }) => (names.some((n) => n.endsWith('.css')) ? 'static/css/main.[hash].css' : 'static/media/[name].[hash][extname]'),
        hashCharacters: 'hex',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Same as CRA's resetMocks: tests set their mock implementations in beforeEach
    mockReset: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
