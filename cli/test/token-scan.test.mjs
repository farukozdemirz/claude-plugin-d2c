/**
 * KURAL 2 — depo genelinde token taraması.
 *
 * Ana plan §7: manifest fixture'ı ham hâliyle `access_token` ve `manifestURL`
 * taşır; commit öncesi temizlenir ve **CI'da token deseni taraması** yapılır.
 *
 * Tarama ayrı bir CI adımı değil, bir TEST: `npm test` her yerde koşuyor, ayrı
 * adım unutulabilir ya da atlanabilir.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../../', import.meta.url));

// Gerçek Adobe token biçimi: <epoch>_urn:aaid:sc:<bölge>:<uuid>;public_<hex>
const TOKEN = /\d{10}_urn:aaid:sc:[^;\s"']+;public_[0-9a-f]{6,}/;
// Ham manifest URL'i de token taşır.
const MANIFEST_URL = /manifestURL["'\s:=]+https?:\/\/[^\s"']*access_token=/i;

const ATLA = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);
// İkili dosyalarda metin araması anlamsız.
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
 * Uydurma token mu?
 *
 * Muafiyeti "işaretli dosya" ile sınırlamak yetmez: gerçek bir token da yanına
 * işaret konularak geçirilebilirdi. Bu yüzden değerin kendisi de sınanıyor —
 * gerçek Adobe token'ları böyle tekdüze olmaz.
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
    // Bu dosyanın kendisi deseni tanımlıyor; kendini yakalamasın.
    if (f.endsWith('token-scan.test.mjs')) continue;
    // Redaksiyon testlerinin token BİÇİMİNE ihtiyacı var. Dosya bazında muafiyet
    // yerine satır bazında işaret: `SAHTE-TOKEN` yorumu olan yerde uydurma değer
    // beklenir ve o değer gerçekten uydurma mı diye AYRICA bakılır.
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
  // Yanlış negatif en tehlikeli hâl: hiçbir şey bulamayan bir tarama da "yeşil" görünür.
  const sahte = '1798761600_urn:aaid:sc:EU:2f1a-4b;public_a1b2c3d4e5f6';
  assert.ok(TOKEN.test(sahte), 'gerçek biçimli token yakalanmalı');
  assert.ok(TOKEN.test(`{"access_token":"${sahte}"}`), 'JSON içinde de yakalanmalı');
  assert.ok(
    MANIFEST_URL.test('"manifestURL": "https://x.adobe.io/m?access_token=abc"'),
    'manifestURL yakalanmalı'
  );
  assert.ok(!TOKEN.test('access_token=REDACTED'), 'redakte edilmiş metin yanlış pozitif olmamalı');
  // Muafiyet sızıntıya kapı açmamalı: işaret koymak tek başına yetmez.
  assert.equal(sahteMi(sahte), false, 'gerçek biçimli token "sahte" sayılmamalı');
  assert.equal(
    sahteMi('1700000000_urn:aaid:sc:XX:00000000-0000-4000-8000-000000000000;public_' + 'a'.repeat(40)),
    true, 'tekdüze uydurma değer sahte sayılmalı');
});

test('tarama boş kümede koşmuyor (dosya gerçekten okunuyor)', () => {
  // Bir yol hatası taramayı sessizce 0 dosyaya indirir ve test yine geçerdi.
  assert.ok(hepsi.length > 40, `yalnız ${hepsi.length} dosya tarandı — yol yanlış olabilir`);
  assert.ok(hepsi.some((f) => f.endsWith('README.md')), 'depo kökü taranmalı');
  assert.ok(hepsi.some((f) => f.includes('cli/src/')), 'kaynak taranmalı');
});
