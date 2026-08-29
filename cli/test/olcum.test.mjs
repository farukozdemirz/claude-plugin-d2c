import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { project, tekrarBul, slugify, segment, OlcumSchema, ConfigSchema } from '../dist/lib.mjs';
import { designUret } from './helpers/design-uret.mjs';
import { fileURLToPath } from 'node:url';

const W = 1440, H = 3000;

const design = (elemanlar) => ({
  schemaVersion: 1,
  kaynak: { tip: 'adobe-xd-share', url: 'x', docId: null, modifiedDate: 123, agcVersion: '1.5.0', cikarilma: 'x', uyarilar: [] },
  ekran: { ad: 'test', desktop: { artboardId: 'ab', ad: 'Desktop - T', boyut: [W, H], koken: [0, 0] }, mobil: null },
  palet: [], stiller: [],
  elemanlar: elemanlar.map((e, i) => ({
    id: e.id ?? `e${i}`, ad: e.ad ?? `E${i}`, tip: e.tip ?? 'rect',
    ebeveyn: null, derinlik: 1, sira: i,
    ...(e.metin !== undefined ? { metin: e.metin } : {}),
    ...(e.font ? { font: { aile: 'F', agirlik: 'R', punto: e.font, satir: null, ls: 0, renk: '#000', hiza: null, fontKutusuAgc: e.font, postscript: null } } : {}),
    desktop: { kutu: e.kutu, ...(e.dolgu ? { dolgu: e.dolgu } : {}) },
  })),
});
const harita = (bolumler) => ({
  schemaVersion: 1, ekran: 'test', viewport: 'desktop', artboardId: 'ab',
  tasarim: [W, H], bantlar: [], bolumler,
});
const bol = (y, h, over = {}) => ({ index: 1, y, h, zemin: null, bant: null, ad: null, baslik: null, ...over });

const elsOf = (d) => d.elemanlar;

// ── section scope ─────────────────────────────────────────────────────────────
test('kapsam: orta nokta kuralı — sınırdaki eleman TEK bölüme düşer', () => {
  const d = design([
    { ad: 'Ust',  kutu: [10, 90, 50, 40] },   // orta 110 → bölüm 1 (0–200)
    { ad: 'Alt',  kutu: [10, 190, 50, 40] },  // orta 210 → bölüm 2
  ]);
  const h = harita([bol(0, 200), { ...bol(200, 200), index: 2 }]);
  const o1 = project(d, h, h.bolumler[0]);
  const o2 = project(d, h, h.bolumler[1]);
  assert.deepEqual(o1.elemanlar.map((e) => e.ad), ['Ust']);
  assert.deepEqual(o2.elemanlar.map((e) => e.ad), ['Alt']);
});

// ── repeat compression ────────────────────────────────────────────────────────
test('tekrar: düzenli 1B dizi tek temsilciye iner', () => {
  const d = design(Array.from({ length: 8 }, (_, i) => ({ ad: 'Kart', kutu: [64 + i * 332, 100, 316, 204] })));
  const t = tekrarBul(elsOf(d), 'desktop', 3);
  assert.equal(t.duzenli, true);
  assert.equal(t.eksen, 'x');
  assert.equal(t.adet, 8);
  assert.equal(t.adim, 332);
});

test('tekrar: düzenli ızgara (sütun × satır)', () => {
  const els = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) els.push({ ad: 'Hücre', kutu: [87.5 + c * 332, 3305 + r * 104, 100, 20] });
  const t = tekrarBul(elsOf(design(els)), 'desktop', 3);
  assert.equal(t.eksen, 'izgara');
  assert.equal(t.sutun, 8);
  assert.equal(t.satir, 2);
  assert.equal(t.adimX, 332);
  assert.equal(t.adimY, 104);
});

test('tekrar: DÜZENSİZ dizilim uydurulmaz — konumlar tam listeyle korunur', () => {
  const xs = [0, 14.1, 20.7, 28.7, 41.3];
  const d = design(xs.map((x) => ({ ad: 'Yildiz', kutu: [x, 100, 15, 15] })));
  const t = tekrarBul(elsOf(d), 'desktop', 3);
  assert.equal(t.duzenli, false);
  assert.equal(t.adim, undefined, 'düzensizde adım UYDURULMAMALI');
  assert.equal(t.konumlar.length, 5, 'her konum korunmalı — bilgi kaybı yok');
  assert.deepEqual(t.konumlar.map((k) => k[0]), xs);
});

test('tekrar: eşiğin altındaki grup sıkıştırılmaz', () => {
  const d = design([{ ad: 'K', kutu: [0, 0, 10, 10] }, { ad: 'K', kutu: [20, 0, 10, 10] }]);
  assert.equal(tekrarBul(elsOf(d), 'desktop', 3), null);
});

test('tekrar: farklı boyutlu aynı adlı elemanlar AYNI grup değil', () => {
  const d = design([
    { ad: 'K', kutu: [0, 0, 10, 10] }, { ad: 'K', kutu: [20, 0, 10, 10] },
    { ad: 'K', kutu: [40, 0, 99, 10] },
  ]);
  const o = project(d, harita([bol(0, 200)]), bol(0, 200));
  // Because the signature differs, the 10×10s (2 of them, below the threshold) + the 99×10 stay separate
  assert.equal(o.elemanlar.length, 3);
});

// ── hesaplanan ────────────────────────────────────────────────────────────────
test('hesaplanan: ADIM BAŞINA tek gap — iç elemanlar gürültü üretmez', () => {
  const els = [];
  for (let i = 0; i < 8; i++) {
    els.push({ ad: 'Kart', kutu: [64 + i * 332, 100, 316, 204] });
    els.push({ ad: 'Ikon', kutu: [88 + i * 332, 120, 18, 18] });   // aynı 332 adımı
  }
  const o = project(design(els), harita([bol(0, 500)]), bol(0, 500));
  const gaps = o.hesaplanan.filter((h) => h.ne.includes('arası boşluk'));
  assert.equal(gaps.length, 1, 'aynı adım için tek gap olmalı');
  assert.ok(gaps[0].ne.includes('Kart'), 'en büyük eleman kazanmalı');
  assert.equal(gaps[0].desktop, 16, '332 − 316');
  assert.match(gaps[0].nasil, /adim\(332\)/);
});

test('hesaplanan: her kayıt `nasil` ile kaynağını söyler', () => {
  const d = design(Array.from({ length: 3 }, (_, i) => ({ ad: 'K', kutu: [64 + i * 100, 10, 80, 20] })));
  const o = project(d, harita([bol(0, 200)]), bol(0, 200));
  for (const h of o.hesaplanan) assert.ok(h.nasil && h.nasil.length > 3, `nasil eksik: ${h.ne}`);
});

// ── testid lifecycle ──────────────────────────────────────────────────────────
const basit = () => {
  const d = design([{ id: 'a1', ad: 'Panel', kutu: [0, 10, 100, 50] }, { id: 'a2', ad: 'Baslik', kutu: [0, 70, 80, 20] }]);
  return { d, h: harita([bol(0, 200)]) };
};

test('testid: yeniden üretimde eleman id sine göre KORUNUR', () => {
  const { d, h } = basit();
  const ilk = project(d, h, h.bolumler[0]);
  ilk.elemanlar.find((e) => e.id === 'a1').testid = 'panel';
  ilk.elemanlar.find((e) => e.id === 'a2').testid = 'baslik';
  const ikinci = project(d, h, h.bolumler[0], { onceki: ilk });
  assert.equal(ikinci.elemanlar.find((e) => e.id === 'a1').testid, 'panel');
  assert.equal(ikinci.elemanlar.find((e) => e.id === 'a2').testid, 'baslik');
});

test('testid: --force sıfırlar', () => {
  const { d, h } = basit();
  const ilk = project(d, h, h.bolumler[0]);
  ilk.elemanlar[0].testid = 'panel';
  const ikinci = project(d, h, h.bolumler[0], { onceki: ilk, force: true });
  assert.equal(ikinci.elemanlar.every((e) => e.testid === null), true);
});

test('testid: kaybolan eleman SESSİZ geçilmez — cozulemedi ye yazılır', () => {
  const { d, h } = basit();
  const ilk = project(d, h, h.bolumler[0]);
  ilk.elemanlar.push({ id: 'silinmis', ad: 'Yok', tip: 'rect', rol: null, testid: 'eski-id', ebeveyn: null, sira: 99 });
  const ikinci = project(d, h, h.bolumler[0], { onceki: ilk });
  assert.ok(ikinci.cozulemedi.some((c) => c.includes('eski-id') && c.includes('taşınamadı')));
});

// ── M1 rule: the font box is not consumed ─────────────────────────────────────
test('M1: fontKutusuKaynak her zaman "tarayici", yariSatir null', () => {
  const d = design([{ ad: 'T', tip: 'metin', metin: 'Merhaba', font: 48, kutu: [0, 10, 200, 56] }]);
  const o = project(d, harita([bol(0, 200)]), bol(0, 200));
  const t = o.elemanlar.find((e) => e.font);
  assert.equal(t.font.fontKutusuKaynak, 'tarayici', 'M1 de AGC font kutusu TÜKETİLMEMELİ');
  assert.equal(t.font.yariSatir, null);
  assert.equal(t.font.fontKutusuAgc, 48, 'ham AGC değeri yine de taşınmalı');
});

// ── schema / config ───────────────────────────────────────────────────────────
test('Zod: testid null iken şema geçerli', () => {
  const { d, h } = basit();
  assert.doesNotThrow(() => OlcumSchema.parse(project(d, h, h.bolumler[0])));
});

test('Zod: bozuk olcum reddedilir', () => {
  assert.throws(() => OlcumSchema.parse({ schemaVersion: 1 }));
});

test('config: extractorStrategy varsayılanı "auto", legacy kabul edilir', () => {
  assert.equal(ConfigSchema.parse({}).extractorStrategy, 'auto');
  assert.equal(ConfigSchema.parse({ extractorStrategy: 'legacy' }).extractorStrategy, 'legacy');
  assert.throws(() => ConfigSchema.parse({ extractorStrategy: 'sacma' }));
});

test('slugify Türkçe karakterleri çevirir', () => {
  assert.equal(slugify('Ürün Yorumları'), 'urun-yorumlari');
  assert.equal(slugify('Sipariş Seç — 2'), 'siparis-sec-2');
});

// ── REAL DATA ─────────────────────────────────────────────────────────────────
// This used to depend on `/tmp/design-a.json`: once /tmp was cleared the test was
// SILENTLY skipped. It is now produced from the recorded AGC fixtures, without a network.
// Resolved relative to the repo: an absolute home-directory path would silently stop
// matching if the repo were cloned elsewhere (the test skips and nobody notices).
const BENCH = fileURLToPath(new URL('../../fixtures/benchmark.json', import.meta.url));
const d = await designUret();

if (!d) {
  skip('gerçek veri testi atlandı — cli/test/fixtures/live/ yok ' +
       '(node test/capture-fixtures.mjs <xd-url> ile yakalayın)');
} else {
  const h = segment(d);
  const b10 = h.bolumler.find((x) => x.ad === 'Ürün Yorumları');
  const o = project(d, h, b10);

  test('GERÇEK — kompaktlık: 507 elemanlı design.json → onlarca elemanlı olcum.json', () => {
    const designKB = Buffer.byteLength(JSON.stringify(d)) / 1024;
    const olcumKB = Buffer.byteLength(JSON.stringify(o)) / 1024;
    assert.ok(o.elemanlar.length < 40, `çok fazla eleman: ${o.elemanlar.length}`);
    assert.ok(olcumKB < designKB / 5, `yeterince küçülmedi: ${olcumKB.toFixed(1)} / ${designKB.toFixed(1)} KB`);
  });

  test('GERÇEK — kart tekrarı ve gap benchmark ile uyuşuyor', () => {
    const kart = o.elemanlar.find((e) => e.ad === 'Path 8258');
    assert.ok(kart, 'kart bulunamadı');
    assert.equal(kart.tekrar.adet, 8);
    assert.equal(kart.tekrar.adim, 332);
    assert.deepEqual([kart.desktop.kutu[2], kart.desktop.kutu[3]], [316, 204]);
    const gap = o.hesaplanan.find((x) => x.ne.includes('Path 8258'));
    assert.equal(gap.desktop, 16, 'benchmark: kartlar_arasi 16');
  });

  test('GERÇEK — kendine yeterlik: kod üretimi için gereken alanlar dolu', () => {
    const kart = o.elemanlar.find((e) => e.ad === 'Path 8258');
    assert.ok(kart.desktop.kutu, 'kutu');
    assert.deepEqual(kart.desktop.radius, [12, 12, 12, 12], 'radius');
    assert.equal(kart.desktop.kontur.renk, '#D7DFE9', 'kontur');
    assert.equal(kart.desktop.kontur.hiza, 'center');
    const metin = o.elemanlar.find((e) => e.font);
    assert.ok(metin.font.aile && metin.font.punto && metin.font.renk, 'tipografi');
    assert.ok(typeof metin.metin === 'string', 'metin içeriği');
    assert.ok(o.palet.length > 0 && o.stiller.length > 0, 'palet + stiller');
    assert.ok(o.bolum.desktop && o.bolum.zemin, 'bölüm kutusu + zemin');
  });

  test('GERÇEK — bölüm başlığı ve zemini benchmark ile uyuşuyor', () => {
    assert.equal(o.bolum.ad, 'Ürün Yorumları');
    assert.equal(o.bolum.zemin, '#FAFAFA');
    assert.deepEqual(o.bolum.desktop, [0, 2923, 1440, 730]);
    const baslik = o.elemanlar.find((e) => e.rol === 'baslik');
    assert.ok(baslik, 'baslik rolü atanmalı');
    assert.equal(baslik.font.punto, 48);
    assert.equal(baslik.font.aile, 'Tobias TRIAL');
  });

  if (existsSync(BENCH)) {
    test('GERÇEK — benchmark kart ölçüleri olcum.json da BİREBİR', () => {
      const bench = JSON.parse(readFileSync(BENCH, 'utf8'));
      const bk = bench.ekranlar.find((e) => e.id === 'a').beklenen.kart;
      const kart = o.elemanlar.find((e) => e.ad === bk.eleman);
      assert.deepEqual([kart.desktop.kutu[2], kart.desktop.kutu[3]], bk.boyut);
      assert.deepEqual(kart.desktop.radius, Array(4).fill(bk.radius));
      const gap = o.hesaplanan.find((x) => x.ne.includes(bk.eleman));
      assert.equal(gap.desktop, bk.kartlar_arasi);
    });
  }
}
