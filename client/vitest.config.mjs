import { readFileSync } from 'fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    globals: true,
    // Same as CRA's resetMocks: tests set their mock implementations in beforeEach
    mockReset: true,
    include: ['src/**/*.test.{js,jsx}'],
    // What craco.config.js injects at build time
    env: { REACT_APP_VERSION: version, REACT_APP_BUILD_TIME: new Date().toISOString() },
  },
});
