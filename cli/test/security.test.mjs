/**
 * Ana planın iki güvenlik kabul kuralının testi.
 * Bunlar "iyi olurdu" değil, Faz 1'in KABUL ÖLÇÜTÜ.
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

// ── KURAL 1: uzak JS asla çalıştırılmaz ──────────────────────────────────────
test('KURAL 1 — kaynakta eval / new Function / vm / dinamik import YOK', () => {
  const yasak = [
    { re: /\beval\s*\(/, ad: 'eval(' },
    { re: /new\s+Function\s*\(/, ad: 'new Function(' },
    { re: /require\s*\(\s*['"]vm['"]\s*\)/, ad: "require('vm')" },
    { re: /from\s+['"]node:vm['"]/, ad: "import node:vm" },
    // HESAPLANMIŞ specifier'lı dinamik import — `import(degisken)`.
    // Literal specifier (`import('playwright-core')`) YASAK DEĞİL: bilinen bir npm
    // paketini opsiyonel bağımlılık olarak yüklemenin standart yolu ve uzak içerik
    // çalıştırmıyor. Kural 1'in yasakladığı şey UZAK İÇERİĞİN çalıştırılması.
    { re: /\bimport\s*\(\s*(?!['"])/, ad: 'dinamik import( hesaplanmış specifier ile' },
  ];
  const ihlal = [];
  for (const f of allFiles(SRC)) {
    const src = readFileSync(f, 'utf8');
    for (const { re, ad } of yasak) {
      // Yorum satırlarında geçmesi sorun değil; kod satırında olmamalı.
      const kodSatirlari = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
      if (re.test(kodSatirlari)) ihlal.push(`${f.replace(SRC, '')}: ${ad}`);
    }
  }
  assert.deepEqual(ihlal, [], `Kural 1 ihlali:\n${ihlal.join('\n')}`);
});

test('KURAL 1 — dinamik import YALNIZ literal paket adıyla kullanılıyor', () => {
  // Kuralın amacı uzak içeriğin çalıştırılmaması. Literal specifier'lı import
  // (opsiyonel bağımlılık yükleme) buna aykırı değil; ama specifier hesaplanmışsa
  // kaynağı denetleyemeyiz ve yasaktır.
  const literaller = [];
  for (const f of allFiles(SRC)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1/g)) {
      literaller.push(m[2]);
    }
  }
  // Hepsi bilinen paket adı olmalı — URL, yol birleştirme veya değişken yok.
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

// ── KURAL 2: access_token hiçbir yere yazılmaz ───────────────────────────────
// SAHTE-TOKEN: yapısı gerçeğiyle aynı, değeri uydurma. Gerçek bir token buraya
// yazılamaz (Kural 2) — `token-scan.test.mjs` bu işareti arar ve yalnız onu geçirir.
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
