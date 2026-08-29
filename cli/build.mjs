/**
 * esbuild yapılandırması.
 *
 * Neden script değil de dosya: `d2c.mjs`'in başına önce shebang, sonra bir
 * `createRequire` kalkanı gerekiyor ve aradaki SATIR SONU npm script'inin çift
 * tırnağı içinde ifade edilemiyor (`\n` orada harfi harfine iki karakter kalıyor).
 *
 * Kalkan `pngjs` için: paket CommonJS ve `require("util")` çağırıyor; ESM bundle
 * içinde `require` tanımlı olmadan çalışmıyor.
 */
import { build } from 'esbuild';

const KALKAN = "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);";

const ortak = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  // Playwright isteğe bağlı çalışma zamanı bağımlılığı — bundle'a girmez.
  external: ['playwright-core'],
};

await build({
  ...ortak,
  entryPoints: ['src/bin.ts'],
  outfile: 'dist/d2c.mjs',
  banner: { js: `#!/usr/bin/env node\n${KALKAN}` },
});

await build({
  ...ortak,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/lib.mjs',
  banner: { js: KALKAN },
});

console.log('dist/d2c.mjs + dist/lib.mjs yazıldı');
