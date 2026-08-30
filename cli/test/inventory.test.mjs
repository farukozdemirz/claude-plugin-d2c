/**
 * Component inventory tests.
 *
 * The acceptance criterion from the main plan: *"the inventory catches `export default`
 * and re-exports"*. The regex script missed those; the last test here pins the
 * difference down with a number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envanterCikar, envanterYaz, duzenCikar, paketleriBul, paketleriYaz } from '../dist/lib.mjs';

const KOK = fileURLToPath(new URL('./fixtures/project/components/', import.meta.url));
const PY = fileURLToPath(new URL('../../skills/d2c-code/scripts/component-inventory.py', import.meta.url));
const env = envanterCikar(KOK);

const dosya = (ad) => env.dosyalar.find((d) => d.yol.replace(/\\/g, '/') === ad);
const adlar = (ad) => dosya(ad).exportlar.map((e) => e.ad);

test('export default function yakalanır', () => {
  const e = dosya('UrunKarti.tsx').exportlar;
  assert.equal(e.length, 1);
  assert.equal(e[0].ad, 'UrunKarti');
  assert.equal(e[0].varsayilan, true);
  assert.equal(e[0].tur, 'fonksiyon');
});

test('export default class ve adlandırılmış sınıf birlikte', () => {
  const e = dosya('EskiKart.tsx').exportlar;
  assert.deepEqual(adlar('EskiKart.tsx'), ['EskiKart', 'Anonim']);
  assert.equal(e.find((x) => x.ad === 'Anonim').varsayilan, true);
  assert.equal(e.find((x) => x.ad === 'Anonim').tur, 'sinif');
});

test('export default memo(X) sarmalanan adı gösterir', () => {
  // Saying `(anonymous)` would make the inventory useless — the wrapped component name is what matters.
  assert.deepEqual(adlar('Sarmalanmis.tsx'), ['memo(Sarmalanmis)']);
  assert.equal(dosya('Sarmalanmis.tsx').exportlar[0].varsayilan, true);
});

test('re-export biçimlerinin hepsi: *, * as ns, adlandırılmış, default as', () => {
  assert.deepEqual(adlar('index.ts'), ['*', '* as Rozetler', 'EskiKart', 'default as Kart']);
  const e = dosya('index.ts').exportlar;
  assert.equal(e[0].kaynak, './UrunKarti');
  assert.equal(e[1].kaynak, './Rozet');
  assert.equal(e[3].kaynak, './UrunKarti');
  assert.ok(e.every((x) => x.tur === 'yeniden' || x.tur === 'hepsi'));
});

test('arrow bileşenleri ve tip-only export ayırt edilir', () => {
  assert.deepEqual(adlar('Rozet.tsx'), ['Rozet', 'RozetKucuk', 'RozetProps']);
  const tip = dosya('Rozet.tsx').exportlar.find((e) => e.ad === 'RozetProps');
  assert.equal(tip.sadeceTip, true, 'tip export bileşen sanılmamalı');
  assert.equal(dosya('Rozet.tsx').exportlar.find((e) => e.ad === 'Rozet').sadeceTip, undefined);
});

test('JSDoc, testid, ölçü, radius, renk korunuyor', () => {
  const d = dosya('UrunKarti.tsx');
  assert.match(d.jsdoc, /Desktop - Ürün Detay/);
  assert.deepEqual(d.testidler, ['urun-karti', 'urun-rozet']);
  assert.deepEqual(d.olculer, ['h-[266px]', 'w-[312px]']);
  assert.deepEqual(d.radiuslar, ['rounded-[12px]']);
  assert.deepEqual(d.renkler, ['#0C2380']);
});

test('token adayı: 3+ dosyada geçen hex', () => {
  assert.equal(env.tokenAdaylari.length, 1);
  assert.equal(env.tokenAdaylari[0].renk, '#0C2380');
  assert.equal(env.tokenAdaylari[0].dosyalar.length, 3);
});

test('bozuk dosya RAPORLANIR, sessizce atlanmaz', () => {
  // Skipping silently gives the same outcome as "no component" — the most dangerous form.
  assert.equal(env.hatalar.length, 1);
  assert.match(env.hatalar[0].yol.replace(/\\/g, '/'), /alt\/Bozuk\.tsx/);
  assert.match(envanterYaz(env), /PARSE EDİLEMEDİ/);
  assert.match(envanterYaz(env), /envanter EKSİK/);
});

test('node_modules ve .d.ts taranmaz', () => {
  const yollar = env.dosyalar.map((d) => d.yol.replace(/\\/g, '/'));
  assert.ok(!yollar.some((y) => y.includes('node_modules')), yollar.join(', '));
  assert.ok(!yollar.some((y) => y.endsWith('.d.ts')), yollar.join(', '));
  assert.equal(env.dosyalar.length, 6);
});

test('dizin yoksa çökmez', () => {
  const bos = envanterCikar('/olmayan/dizin/xyz');
  assert.deepEqual(bos.dosyalar, []);
  assert.match(envanterYaz(bos), /bileşen yok/);
});

test('KABUL ÖLÇÜTÜ: regex script\'in kaçırdıklarını yakalıyor', () => {
  let py;
  try {
    py = execFileSync('python3', [PY, KOK], { encoding: 'utf8' });
  } catch {
    return; // python yoksa karşılaştırma yapılamaz; diğer testler zaten kapsıyor
  }
  // The regex script only sees `export function` and `export const`.
  const pyExportlar = [...py.matchAll(/^\s+export : (.+)$/gm)]
    .flatMap((m) => m[1].split(', ').map((s) => s.trim()))
    .filter((s) => s !== '-');

  const kritik = ['UrunKarti', 'Anonim', 'EskiKart', 'memo(Sarmalanmis)', 'default as Kart'];
  for (const k of kritik) {
    assert.ok(adlarHepsi().includes(k), `AST envanteri "${k}" bulmalı`);
  }
  const kacirilan = kritik.filter((k) => !pyExportlar.includes(k));
  assert.ok(
    kacirilan.length >= 4,
    `regex script'in kaçırdığı beklenirdi, kaçırdıkları: ${kacirilan.join(', ')}`
  );
});

function adlarHepsi() {
  return env.dosyalar.flatMap((d) => d.exportlar.map((e) => e.ad));
}

// ── project convention detection ─────────────────────────────────────────────
// The reported failure: ten components dumped flat into one directory. The rule is
// "follow the project's convention; if there is none, group" — so the convention has to
// be a counted fact, not a judgement call.
test('flat dump is detected as "no convention"', () => {
  const d = duzenCikar([
    'HeroCarousel.tsx', 'ProductCard.tsx', 'ProductCarousel.tsx', 'StarRating.tsx',
    'icons.tsx', 'useCarousel.ts',
  ]);
  assert.equal(d.duz, true);
  assert.deepEqual(d.gruplar, []);
  assert.equal(d.derinlik, 0);
  assert.equal(d.kokteDosya, 6);
});

test('an existing grouping is NOT reported as flat', () => {
  const d = duzenCikar([
    'carousel/HeroCarousel.tsx', 'carousel/ProductCarousel.tsx',
    'product/ProductCard.tsx', 'ui/StarRating.tsx', 'index.ts',
  ]);
  assert.equal(d.duz, false);
  assert.deepEqual(d.gruplar, ['carousel', 'product', 'ui']);
  assert.equal(d.derinlik, 1);
  assert.equal(d.barrel, true);
});

test('a couple of loose files is not enough to call it a flat dump', () => {
  // Two files at the root is a young project, not a convention to warn about.
  assert.equal(duzenCikar(['Button.tsx', 'Input.tsx']).duz, false);
});

test('naming style is derived, mixed is reported as mixed', () => {
  assert.equal(duzenCikar(['ProductCard.tsx', 'StarRating.tsx', 'HeroCarousel.tsx']).adlandirma, 'PascalCase');
  assert.equal(duzenCikar(['product-card.tsx', 'star-rating.tsx', 'hero-carousel.tsx']).adlandirma, 'kebab-case');
  assert.equal(duzenCikar(['ProductCard.tsx', 'star-rating.tsx', 'useThing.ts']).adlandirma, 'karisik');
});

test('the convention is part of the inventory output', () => {
  assert.ok(env.duzen, 'envanterde duzen alanı olmalı');
  assert.match(envanterYaz(env), /Mevcut düzen/);
});

// ── installed UI packages ────────────────────────────────────────────────────
// The reported failure: with no package installed and no question asked, a carousel
// engine was hand-written. Step one of the rule has to be a measured fact.
test('an installed carousel package is detected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-pkg-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { next: '15', 'embla-carousel-react': '^8' },
    devDependencies: { '@radix-ui/react-tabs': '^1' },
  }));
  const p = paketleriBul(dir);
  assert.deepEqual(p.carousel, ['embla-carousel-react']);
  assert.deepEqual(p.uiKit, ['@radix-ui/react-tabs']);
  assert.match(paketleriYaz(p), /MEVCUT paketi kullan/);
});

test('NO carousel package → the output says "do not write your own"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-pkg-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }));
  const p = paketleriBul(dir);
  assert.deepEqual(p.carousel, []);
  const y = paketleriYaz(p);
  assert.match(y, /YOK/);
  assert.match(y, /kendi motorunu YAZMA/);
});

test('package.json is found by walking UP from the component directory', () => {
  const kok = mkdtempSync(join(tmpdir(), 'd2c-pkg-'));
  writeFileSync(join(kok, 'package.json'), JSON.stringify({ dependencies: { swiper: '^11' } }));
  const derin = join(kok, 'src', 'components', 'proshop');
  mkdirSync(derin, { recursive: true });
  assert.deepEqual(paketleriBul(derin).carousel, ['swiper']);
});

test('no package.json → says so, does NOT claim "there is no package"', () => {
  // Claiming absence would send the caller straight to "ask", which is the safe
  // direction — but the output must not pretend it measured something it did not.
  const dir = mkdtempSync(join(tmpdir(), 'd2c-nopkg-'));
  const p = paketleriBul(dir);
  assert.equal(p.paketJson, null);
  assert.match(paketleriYaz(p), /bulunamadı/);
});

test('a broken package.json does not crash and does not claim a package exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-pkg-'));
  writeFileSync(join(dir, 'package.json'), '{ bozuk json');
  const p = paketleriBul(dir);
  assert.deepEqual(p.carousel, []);
  assert.ok(p.paketJson, 'dosya bulundu olarak işaretlenmeli');
});

test('the package block is part of the inventory output', () => {
  assert.ok(env.paketler, 'envanterde paketler alanı olmalı');
  assert.match(envanterYaz(env), /Kurulu UI paketleri/);
});
