/**
 * RULE 2 — a repository-wide token scan.
 *
 * Main plan §7: the raw manifest fixture carries `access_token` and `manifestURL`; those
 * are cleaned before committing and **a token pattern scan runs in CI**.
 *
 * The scan is not a separate CI step but a TEST: `npm test` runs everywhere, while a
 * separate step can be forgotten or skipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../../', import.meta.url));

// The real Adobe token format: <epoch>_urn:aaid:sc:<region>:<uuid>;public_<hex>
const TOKEN = /\d{10}_urn:aaid:sc:[^;\s"']+;public_[0-9a-f]{6,}/;
// The raw manifest URL carries a token too.
const MANIFEST_URL = /manifestURL["'\s:=]+https?:\/\/[^\s"']*access_token=/i;

const ATLA = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);
// Searching for text in binary files is meaningless.
const IKILI = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2', '.ttf', '.otf', '.ico', '.pdf', '.zip']);

function dosyalar(kok) {
  const out = [];
  const gez = (d) => {
    let g;
    try { g = readdirSync(d); } catch { return; }
    for (const ad of g) {
      if (ATLA.has(ad)) continue;
      const tam = join(d, ad);
      let st;
      try { st = statSync(tam); } catch { continue; }
      if (st.isDirectory()) gez(tam);
      else if (!IKILI.has(extname(ad).toLowerCase()) && st.size < 8 * 1024 * 1024) out.push(tam);
    }
  };
  gez(kok);
  return out;
}

/**
 * Is this a fake token?
 *
 * Limiting the exemption to "a marked file" is not enough: a real token could be slipped
 * through by putting the marker next to it. So the value itself is checked as well —
 * real Adobe tokens are not this uniform.
 */
function sahteMi(t) {
  const hex = /public_([0-9a-f]+)/.exec(t)?.[1] ?? '';
  const uuid = /sc:[^:]+:([^;]+)/.exec(t)?.[1] ?? '';
  const tekDuze = (x) => x.length > 0 && new Set(x.replace(/-/g, '')).size <= 2;
  return tekDuze(hex) || tekDuze(uuid);
}

const hepsi = dosyalar(KOK);

test('deponun hiçbir dosyasında Adobe access_token YOK', () => {
  const ihlal = [];
  for (const f of hepsi) {
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    // This file defines the pattern itself; it must not catch itself.
    if (f.endsWith('token-scan.test.mjs')) continue;
    // The redaction tests need the token FORMAT. Instead of a file-level exemption, a
    // line-level marker: where a `SAHTE-TOKEN` comment appears a fake value is expected,
    // and whether that value really is fake is checked SEPARATELY.
    const isaretli = src.includes('SAHTE-TOKEN');
    const bulunan = src.match(new RegExp(TOKEN.source, 'g')) ?? [];
    for (const t of bulunan) {
      if (isaretli && sahteMi(t)) continue;
      ihlal.push(`${f.replace(KOK, '')}  →  ${t.slice(0, 24)}…`);
    }
    if (MANIFEST_URL.test(src)) ihlal.push(f.replace(KOK, '') + ' (manifestURL)');
  }
  assert.deepEqual(ihlal, [], `token sızıntısı:\n  ${ihlal.join('\n  ')}`);
});

test('tarama GERÇEKTEN yakalıyor — desen kendi kendini kanıtlar', () => {
  // A false negative is the most dangerous case: a scan that finds nothing also looks "green".
  const sahte = '1798761600_urn:aaid:sc:EU:2f1a-4b;public_a1b2c3d4e5f6';
  assert.ok(TOKEN.test(sahte), 'gerçek biçimli token yakalanmalı');
  assert.ok(TOKEN.test(`{"access_token":"${sahte}"}`), 'JSON içinde de yakalanmalı');
  assert.ok(
    MANIFEST_URL.test('"manifestURL": "https://x.adobe.io/m?access_token=abc"'),
    'manifestURL yakalanmalı'
  );
  assert.ok(!TOKEN.test('access_token=REDACTED'), 'redakte edilmiş metin yanlış pozitif olmamalı');
  // The exemption must not open a door to a leak: placing the marker is not enough on its own.
  assert.equal(sahteMi(sahte), false, 'gerçek biçimli token "sahte" sayılmamalı');
  assert.equal(
    sahteMi('1700000000_urn:aaid:sc:XX:00000000-0000-4000-8000-000000000000;public_' + 'a'.repeat(40)),
    true, 'tekdüze uydurma değer sahte sayılmalı');
});

test('tarama boş kümede koşmuyor (dosya gerçekten okunuyor)', () => {
  // A path error would silently reduce the scan to 0 files and the test would still pass.
  assert.ok(hepsi.length > 40, `yalnız ${hepsi.length} dosya tarandı — yol yanlış olabilir`);
  assert.ok(hepsi.some((f) => f.endsWith('README.md')), 'depo kökü taranmalı');
  assert.ok(hepsi.some((f) => f.includes('cli/src/')), 'kaynak taranmalı');
});
