#!/usr/bin/env node
/**
 * Canlı XD linkinden test fixture'ları yakalar.
 *
 * Çıktı `test/fixtures/canli/` altına yazılır ve GITIGNORED'dır — tasarım dosyasına
 * özeldir (deponun `fixtures/benchmark.json` politikasıyla aynı).
 *
 * SANITIZASYON (ana plan Kural 2): manifest ham haliyle `linkTemplate.data.access_token`
 * ve `manifestURL` alanlarında CANLI TOKEN taşır. Yazmadan önce redakte edilir.
 * AGC dosyaları token içermez (saf scenegraph) ama yine de kontrolden geçer.
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
const OUT = fileURLToPath(new URL('./fixtures/canli/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const slug = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

const proto = await fetchShare(URL_);

// Manifest SANITIZE edilerek yazılır — token asla fixture'a girmez.
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
