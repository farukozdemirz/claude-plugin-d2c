/** Varlık export'u testleri — SVG üretimi ve görsel indirme. */
import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  svgUret, svgleriYaz, vektorGruplari, pathTransform, invert, slug, flatten,
} from '../dist/lib.mjs';

const sekil = (over = {}) => ({
  tip: 'sekil', id: 'a1', ad: 'ikon', derinlik: 1, ebeveyn: 'g1',
  matrix: [1, 0, 0, 1, 0, 0], dolgu: '#0C2380', kontur: null, opaklik: null,
  olcu: { kutu: { x: 0, y: 0, w: 10, h: 10 }, radius: null, radiusKaynak: 'bilinmiyor' },
  sekilTipi: 'path', yol: 'M 0 0 L 10 0 L 10 10 Z',
  ...over,
});

test('tek yoldan SVG — viewBox bbox a eşit', () => {
  const r = svgUret([sekil()], 'ikon');
  assert.deepEqual(r.kutu, [0, 0, 10, 10]);
  assert.match(r.svg, /viewBox="0 0 10 10"/);
  assert.match(r.svg, /width="10" height="10"/);
  assert.match(r.svg, /fill="#0C2380"/);
  assert.equal((r.svg.match(/<path/g) ?? []).length, 1);
});

test('çok yollu grup TEK SVG de birleşir, yollar grup-yerele çevrilir', () => {
  const a = sekil({ id: 'a', matrix: [1, 0, 0, 1, 100, 200] });
  const b = sekil({ id: 'b', matrix: [1, 0, 0, 1, 110, 200], yol: 'M 0 0 L 5 5' });
  const r = svgUret([a, b], 'coklu');
  assert.equal((r.svg.match(/<path/g) ?? []).length, 2);
  // b, a'ya göre 10 px sağda → yerel koordinatta 10'dan başlamalı
  assert.match(r.svg, /d="M 10 0 L 15 5"/);
  assert.deepEqual(r.kutu, [0, 0, 15, 10]);
});

test('kontur SVG ye geçer; stroke.align NOT olarak düşülür (uydurulmaz)', () => {
  const r = svgUret([sekil({ kontur: { genislik: 2, renk: '#FF0000', hiza: 'inside' } })], 'k');
  assert.match(r.svg, /stroke="#FF0000"/);
  assert.match(r.svg, /stroke-width="2"/);
  assert.match(r.svg, /stroke\.align="inside".*karşılığı yok/s, 'align notu yok');
});

test('yolsuz eleman SVG üretmez', () => {
  assert.equal(svgUret([sekil({ yol: undefined })], 'x'), null);
});

test('gruplama: `ebeveyn` e göre', () => {
  const g = vektorGruplari([
    sekil({ id: '1', ebeveyn: 'A' }), sekil({ id: '2', ebeveyn: 'A' }),
    sekil({ id: '3', ebeveyn: 'B' }),
    { ...sekil({ id: '4' }), tip: 'metin' },
  ]);
  assert.equal(g.size, 2);
  assert.equal(g.get('A').length, 2);
});

test('yazma: gradient dolgu RAPORLANIR, sessizce atlanmaz', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-svg-'));
  const r = svgleriYaz([sekil({ desteklenmeyenDolgu: 'gradient' })], dir);
  assert.ok(r.atlananlar.some((a) => /gradient/.test(a.sebep)), JSON.stringify(r.atlananlar));
});

test('yazma: boş yol RAPORLANIR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-svg-'));
  const r = svgleriYaz([sekil({ yol: undefined, sekilTipi: 'path' })], dir);
  assert.ok(r.atlananlar.some((a) => /yol verisi boş/.test(a.sebep)));
});

test('yazma: AYNI içerik tek dosya, kullanim sayılır', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-svg-'));
  const kopyalar = [0, 1, 2].map((i) =>
    sekil({ id: `k${i}`, ebeveyn: `g${i}`, matrix: [1, 0, 0, 1, i * 100, 0] })
  );
  const r = svgleriYaz(kopyalar, dir);
  assert.equal(r.svgler.length, 1, 'özdeş içerik tek dosya olmalı');
  assert.equal(r.svgler[0].kullanim, 3);
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.svg')).length, 1);
});

test('üretilen SVG geçerli XML kökü', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-svg-'));
  svgleriYaz([sekil()], dir);
  const f = join(dir, readdirSync(dir)[0]);
  const s = readFileSync(f, 'utf8');
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(s, /<\/svg>\n$/);
  assert.match(s, /role="img"/);
  assert.match(s, /aria-label=/);
});

test('pathTransform koordinatları dönüştürür, komutları bozmaz', () => {
  assert.equal(pathTransform('M 1 2 L 3 4 Z', [1, 0, 0, 1, 10, 20]), 'M 11 22 L 13 24 Z');
  assert.equal(pathTransform('M 2 2', [2, 0, 0, 2, 0, 0]), 'M 4 4');
});

test('invert: tekil matris null', () => {
  assert.equal(invert([0, 0, 0, 0, 0, 0]), null);
  assert.deepEqual(invert([1, 0, 0, 1, 5, 7]), [1, -0, -0, 1, -5, -7]);
});

test('slug Türkçe karakterleri çevirir', () => {
  assert.equal(slug('Ürün İkonu'), 'urun-ikonu');
  assert.equal(slug('***'), 'varlik');
});

// ── gerçek fixture ────────────────────────────────────────────────────────────
// fileURLToPath şart: dosya adındaki `ü` URL pathname'inde yüzde-kodlanıyor.
const FIX = fileURLToPath(new URL('./fixtures/canli/desktop-ürün-detay.agc.json', import.meta.url));
if (!existsSync(FIX)) {
  skip('gerçek fixture testi atlandı — canlı AGC yok');
} else {
  test('GERÇEK: user-icon SVG si üretilir ve ölçüsü kaynak veriyle tutar', () => {
    const { elemanlar } = flatten(JSON.parse(readFileSync(FIX, 'utf8')));
    const dir = mkdtempSync(join(tmpdir(), 'd2c-svg-'));
    const r = svgleriYaz(elemanlar, dir);
    const ui = r.svgler.find((s) => s.ad === 'user-icon');
    assert.ok(ui, 'user-icon SVG si yok');
    // AGC kaynak verisi 18×19 diyor. limitations.md'deki "hedef 19×19" ELLE yazılmış
    // bir referanstı; araç iki görsel diff turunda 18×19'a ulaşıp "1px artık" diye
    // raporlamıştı — o artık YOKTU, referans yanlıştı.
    assert.deepEqual([ui.kutu[2], ui.kutu[3]], [18, 19]);
    assert.ok(ui.kullanim >= 2, `carousel de tekrar eden ikon tekilleşmeli (${ui.kullanim})`);
    const s = readFileSync(ui.dosya, 'utf8');
    assert.match(s, /fill="#0C2380"/);
    assert.ok(s.length > 500, 'gerçek yol verisi bekleniyordu');
  });

  test('GERÇEK: gradient düğümleri raporlanıyor', () => {
    const { elemanlar } = flatten(JSON.parse(readFileSync(FIX, 'utf8')));
    const dir = mkdtempSync(join(tmpdir(), 'd2c-svg-'));
    const r = svgleriYaz(elemanlar, dir);
    assert.ok(r.atlananlar.length > 0, 'atlananlar boş — gradient raporlanmalıydı');
    assert.ok(r.atlananlar.every((a) => a.sebep), 'her atlanan bir sebep taşımalı');
  });
}
