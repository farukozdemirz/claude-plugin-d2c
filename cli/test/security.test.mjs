/**
 * Tests for the main plan's two security acceptance rules.
 * These are not "nice to have" — they are Phase 1's ACCEPTANCE CRITERIA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { redactUrl, redactText, redactDeep, parsePrototypeData } from '../dist/lib.mjs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function allFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...allFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

// ── RULE 1: remote JS is never executed ──────────────────────────────────────
test('KURAL 1 — kaynakta eval / new Function / vm / dinamik import YOK', () => {
  const yasak = [
    { re: /\beval\s*\(/, ad: 'eval(' },
    { re: /new\s+Function\s*\(/, ad: 'new Function(' },
    { re: /require\s*\(\s*['"]vm['"]\s*\)/, ad: "require('vm')" },
    { re: /from\s+['"]node:vm['"]/, ad: "import node:vm" },
    // A dynamic import with a COMPUTED specifier — `import(variable)`.
    // A literal specifier (`import('playwright-core')`) is NOT FORBIDDEN: it is the
    // standard way to load a known npm package as an optional dependency and it does not
    // execute remote content. What Rule 1 forbids is executing REMOTE CONTENT.
    { re: /\bimport\s*\(\s*(?!['"])/, ad: 'dinamik import( hesaplanmış specifier ile' },
  ];
  const ihlal = [];
  for (const f of allFiles(SRC)) {
    const src = readFileSync(f, 'utf8');
    for (const { re, ad } of yasak) {
      // Appearing in comments is fine; it must not appear in a code line.
      const kodSatirlari = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
      if (re.test(kodSatirlari)) ihlal.push(`${f.replace(SRC, '')}: ${ad}`);
    }
  }
  assert.deepEqual(ihlal, [], `Kural 1 ihlali:\n${ihlal.join('\n')}`);
});

test('KURAL 1 — dinamik import YALNIZ literal paket adıyla kullanılıyor', () => {
  // The point of the rule is that remote content is not executed. An import with a
  // literal specifier (loading an optional dependency) does not violate it; but when the
  // specifier is computed we cannot audit its source, and that is forbidden.
  const literaller = [];
  for (const f of allFiles(SRC)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1/g)) {
      literaller.push(m[2]);
    }
  }
  // All of them must be known package names — no URL, path joining or variable.
  for (const spec of literaller) {
    assert.ok(
      /^[a-z@][a-z0-9@/._-]*$/i.test(spec) && !spec.includes('://'),
      `şüpheli dinamik import specifier: ${spec}`
    );
  }
});

test('KURAL 1 — zararlı yük yan etki üretmeden reddedilir', () => {
  globalThis.__SIZINTI = undefined;
  const yukler = [
    'window.prototypeData = {"x": (globalThis.__SIZINTI = "pwned")};',
    'window.prototypeData = (function(){globalThis.__SIZINTI="pwned";return {manifest:{artboards:[1]}}})();',
    'window.prototypeData = {a:1};',            // JS objesi ama JSON değil (tırnaksız anahtar)
  ];
  for (const y of yukler) {
    assert.throws(() => parsePrototypeData(y), Error, `bu yük hata vermeliydi: ${y}`);
  }
  assert.equal(globalThis.__SIZINTI, undefined, 'uzak kod ÇALIŞTIRILDI — Kural 1 ihlali');
});

// ── RULE 2: the access_token is written nowhere ──────────────────────────────
// SAHTE-TOKEN: the structure matches a real one, the value is made up. A real token can
// never be written here (Rule 2) — `token-scan.test.mjs` looks for this marker and lets
// only that through.
const TOKEN = '1700000000_urn:aaid:sc:XX:00000000-0000-4000-8000-000000000000;public_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL_ORNEK = `https://cdn-sharing.adobecc.com/content/storage/id/urn:x;revision=0?component_id=c1&api_key=CometServer1&access_token=${encodeURIComponent(TOKEN)}`;

test('KURAL 2 — URL redaksiyonu token ve api_key i gizler', () => {
  const r = redactUrl(URL_ORNEK);
  assert.ok(!r.includes('public_ee54'), 'token URL de kaldı');
  assert.ok(!r.includes('1787794582'), 'token öneki URL de kaldı');
  assert.ok(r.includes('access_token=***'));
  assert.ok(r.includes('api_key=***'));
  assert.ok(r.includes('component_id=c1'), 'zararsız parametre korunmalı');
});

test('KURAL 2 — serbest metindeki token maskelenir', () => {
  const m = redactText(`hata oluştu: ${TOKEN} — devam`);
  assert.ok(!m.includes('public_ee54'));
  assert.ok(m.includes('***'));
});

test('KURAL 2 — derin yapıda token maskelenir (fixture yazımı)', () => {
  const manifest = {
    linkTemplate: { href: 'https://x/y', data: { api_key: 'CometServer1', access_token: TOKEN } },
    manifestURL: URL_ORNEK,
    manifest: { name: 'X', artboards: [] },
  };
  const s = JSON.stringify(redactDeep(manifest));
  assert.ok(!s.includes('public_ee54'), 'fixture ta token kaldı');
  assert.ok(!s.includes('1787794582'), 'fixture ta token öneki kaldı');
  assert.ok(s.includes('"name":"X"'), 'zararsız veri korunmalı');
});

test('KURAL 2 — parse edilemeyen URL de kaba maskeye düşer', () => {
  const r = redactUrl(`bozuk-url access_token=${TOKEN}`);
  assert.ok(!r.includes('public_ee54'));
});
