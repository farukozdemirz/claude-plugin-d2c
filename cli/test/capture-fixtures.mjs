#!/usr/bin/env node
/**
 * Captures test fixtures from a live XD link.
 *
 * The output is written under `test/fixtures/live/` and is GITIGNORED — it is specific
 * to a design file (the same policy as the repo's `fixtures/benchmark.json`).
 *
 * SANITISATION (main plan Rule 2): the raw manifest carries a LIVE TOKEN in
 * `linkTemplate.data.access_token` and `manifestURL`. It is redacted before writing.
 * AGC files carry no token (pure scenegraph) but go through the check anyway.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchShare, fetchComponentJson, CONTENT_TYPES, redactDeep, redactText } from '../dist/lib.mjs';
import { fileURLToPath } from 'node:url';

const URL_ = process.argv[2];
const EKRANLAR = process.argv.slice(3);
if (!URL_ || !EKRANLAR.length) {
  console.error('kullanım: capture-fixtures.mjs <xd-url> <ekran adı> [ekran adı…]');
  process.exit(2);
}
const OUT = fileURLToPath(new URL('./fixtures/live/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const slug = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

const proto = await fetchShare(URL_);

// The manifest is written SANITISED — a token never enters a fixture.
const temiz = redactDeep({ manifest: proto.manifest, modifiedDate: proto.modifiedDate ?? null });
const manifestStr = JSON.stringify(temiz, null, 1);
if (/public_[0-9a-f]{8}/.test(manifestStr) || /\d{10}_urn:aaid/.test(manifestStr)) {
  console.error('HATA: sanitizasyon başarısız — manifest hâlâ token içeriyor. YAZILMADI.');
  process.exit(1);
}
writeFileSync(join(OUT, 'manifest.json'), manifestStr + '\n');
console.log(`✓ manifest.json (sanitize edildi, ${proto.manifest.artboards.length} artboard)`);

for (const ad of EKRANLAR) {
  const ab = proto.manifest.artboards.find((a) => a.name === ad);
  if (!ab) { console.error(`✗ ekran bulunamadı: ${ad}`); process.exitCode = 1; continue; }
  const cid = ab.components.find((c) => c.rel === 'primary')?.id;
  const agc = await fetchComponentJson(proto, cid, CONTENT_TYPES.agc);
  const s = JSON.stringify(agc);
  if (s.includes('access_token') || /\d{10}_urn:aaid/.test(s)) {
    console.error(`✗ ${ad}: AGC token içeriyor — YAZILMADI`); process.exitCode = 1; continue;
  }
  const f = `${slug(ad)}.agc.json`;
  writeFileSync(join(OUT, f), s + '\n');
  console.log(`✓ ${f}  (${(s.length / 1024).toFixed(0)} KB · bounds ${ab.bounds.x},${ab.bounds.y})`);
}
console.log(`\nfixture dizini: ${OUT}  (gitignored)`);
