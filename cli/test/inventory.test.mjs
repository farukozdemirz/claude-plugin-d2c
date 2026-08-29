/**
 * Bileşen envanteri testleri.
 *
 * Kabul ölçütü ana plandan: *"envanter `export default` ve re-export'ları yakalıyor"*.
 * Regex script bunları kaçırıyordu; buradaki son test farkı sayıyla sabitliyor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { envanterCikar, envanterYaz } from '../dist/lib.mjs';

const KOK = fileURLToPath(new URL('./fixtures/proje/components/', import.meta.url));
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
  // `(anonim)` demek envanteri işe yaramaz kılardı — sarmalanan bileşen adı lazım.
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
  // Sessizce atlamak "bileşen yok" demekle aynı sonucu verir — en tehlikeli hâli.
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
  // Regex script yalnız `export function` ve `export const` görüyor.
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
