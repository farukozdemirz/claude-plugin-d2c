import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { segment, bantlariBul, bosluklariBul, baslikBul, kutula } from '../dist/lib.mjs';
import { designUret } from './helpers/design-uret.mjs';

const W = 1440, H = 3000;

/** Sentetik design.json kurucu. */
const design = (elemanlar) => ({
  schemaVersion: 1,
  kaynak: { tip: 'adobe-xd-share', url: 'x', docId: null, modifiedDate: null, agcVersion: null, cikarilma: 'x', uyarilar: [] },
  ekran: { ad: 'test', desktop: { artboardId: 'ab', ad: 'Desktop - T', boyut: [W, H], koken: [0, 0] }, mobil: null },
  palet: [], stiller: [],
  elemanlar: elemanlar.map((e, i) => ({
    id: `e${i}`, ad: e.ad ?? `E${i}`, tip: e.tip ?? 'rect', ebeveyn: null, derinlik: e.derinlik ?? 1, sira: i,
    ...(e.metin !== undefined ? { metin: e.metin } : {}),
    ...(e.font ? { font: { aile: 'F', agirlik: 'R', punto: e.font, satir: null, ls: 0, renk: '#000', hiza: null, fontKutusuAgc: e.font, postscript: null } } : {}),
    desktop: { kutu: e.kutu, ...(e.dolgu ? { dolgu: e.dolgu } : {}) },
  })),
});
const kut = (d) => kutula(d.elemanlar, 'desktop');

// ── bant tespiti ──────────────────────────────────────────────────────────────
test('bant: kapsayan aday elenir (Rectangle 386 senaryosu)', () => {
  const d = design([
    { ad: 'Dis',  kutu: [0, 0, 1440, 180], dolgu: '#FFFFFF' },
    { ad: 'Ust',  kutu: [0, 0, 1440, 34],  dolgu: '#0C2380' },
    { ad: 'Alt',  kutu: [0, 34, 1440, 96], dolgu: '#FFFFFF' },
  ]);
  const b = bantlariBul(kut(d), W, H).map((x) => x.el.ad);
  assert.deepEqual(b, ['Ust', 'Alt'], 'kapsayan "Dis" elenmeliydi');
});

test('bant: sol kenarı kapsamayan geniş eleman BANT DEĞİL (Path 8257 senaryosu)', () => {
  // w=1312 → 91%, above the threshold; but because x=64 the old probe (x≈8) would not see it.
  const d = design([{ ad: 'Bar', kutu: [64, 3133, 1312, 72], dolgu: '#0C2380' }]);
  assert.deepEqual(bantlariBul(kut(d), W, H), []);
});

test('bant: artboard\'ın kendisi elenir', () => {
  const d = design([{ ad: 'Artboard', kutu: [0, 0, W, H], dolgu: '#FFF' }]);
  assert.deepEqual(bantlariBul(kut(d), W, H), []);
});

test('bant: 8 px\'ten kısa şerit bant sayılmaz', () => {
  const d = design([{ ad: 'Ince', kutu: [0, 10, 1440, 4], dolgu: '#000' }]);
  assert.deepEqual(bantlariBul(kut(d), W, H), []);
});

// ── gap analysis ──────────────────────────────────────────────────────────────
test('boşluk: eşikten kısa aralık ayraç değil', () => {
  const d = design([
    { kutu: [100, 0, 200, 100] },
    { kutu: [100, 130, 200, 100] },   // 30 px boşluk, eşik 40
  ]);
  const bos = bosluklariBul(kut(d), W, H, 64, 40).filter(([a, b]) => b - a < 200);
  assert.equal(bos.length, 0);
});

test('boşluk: eşikten uzun aralık ayraç', () => {
  const d = design([
    { kutu: [100, 0, 200, 100] },
    { kutu: [100, 200, 200, 100] },   // 100 px boşluk
  ]);
  const bos = bosluklariBul(kut(d), W, H, 64, 40);
  assert.ok(bos.some(([a, b]) => Math.abs(a - 100) < 0.1 && Math.abs(b - 200) < 0.1));
});

test('boşluk: gutter DIŞINDAKİ dekoratif şerit boşluğu bozmaz', () => {
  const d = design([
    { kutu: [100, 0, 200, 100] },
    { kutu: [0, 120, 40, 60] },       // sol kenarda, içerik sütunu dışında
    { kutu: [100, 200, 200, 100] },
  ]);
  const bos = bosluklariBul(kut(d), W, H, 64, 40);
  assert.ok(bos.some(([a, b]) => Math.abs(a - 100) < 0.1 && Math.abs(b - 200) < 0.1));
});

// ── bant otoritesi ────────────────────────────────────────────────────────────
test('bant otoritesi: bandın İÇİ bölünmez', () => {
  const d = design([
    { ad: 'Bant', kutu: [0, 0, 1440, 1000], dolgu: '#FAFAFA' },
    { kutu: [100, 10, 200, 100] },
    { kutu: [100, 500, 200, 100] },   // içeride 390 px boşluk var ama bölünmemeli
    { kutu: [100, 1100, 200, 100] },
  ]);
  const m = segment(d);
  const bant = m.bolumler.find((b) => b.bant === 'Bant');
  assert.ok(bant, 'bant bölümü yok');
  assert.equal(bant.y, 0);
  assert.equal(bant.h, 1000, 'bant bölünmüş');
});

// ── isimlendirme ──────────────────────────────────────────────────────────────
test('isim: üst üçte bir içindeki EN BÜYÜK punto kazanır', () => {
  const d = design([
    { tip: 'metin', metin: 'Kucuk', font: 14, kutu: [64, 10, 100, 20] },
    { tip: 'metin', metin: 'Buyuk', font: 48, kutu: [64, 30, 300, 56] },
    { tip: 'metin', metin: 'Devasa ama altta', font: 96, kutu: [64, 700, 400, 100] },
  ]);
  const b = baslikBul(kut(d), 0, 900);
  assert.equal(b.el.metin, 'Buyuk');
});

test('isim: metin yoksa null — uydurulmaz', () => {
  const d = design([{ kutu: [64, 10, 100, 20] }]);
  assert.equal(baslikBul(kut(d), 0, 900), null);
});

// ── empty section merging ─────────────────────────────────────────────────────
test('içinde eleman olmayan bölüm komşusuna birleşir', () => {
  const d = design([
    { kutu: [100, 0, 200, 100] },
    { kutu: [100, 300, 200, 100] },
    // 400 → 3000 is completely empty: it must not be a section of its own
  ]);
  const m = segment(d);
  const bos = m.bolumler.filter((b) => !kut(d).some((k) => k.y < b.y + b.h && k.y + k.h > b.y));
  assert.ok(bos.length <= 1, `birden çok boş bölüm kaldı: ${JSON.stringify(bos)}`);
});

test('boş bölüm BANDA birleştirilmez — bandın yüksekliği korunur', () => {
  const d = design([
    { ad: 'Bant', kutu: [0, 0, 1440, 500], dolgu: '#FAFAFA' },
    { kutu: [100, 50, 200, 100] },
    // 500 → 3000 is empty; the band's h must stay 500
  ]);
  const m = segment(d);
  const bant = m.bolumler.find((b) => b.bant === 'Bant');
  assert.equal(bant.h, 500, 'boş blok banda eklenmiş — bant otoritesi ihlali');
});

test('bant bölümünün zemini BANDIN rengidir (kapsayanın değil)', () => {
  const d = design([
    { ad: 'Dis', kutu: [0, 0, 1440, 180], dolgu: '#FFFFFF' },
    { ad: 'Ust', kutu: [0, 0, 1440, 34], dolgu: '#0C2380' },
    { kutu: [100, 40, 200, 100] },
  ]);
  const m = segment(d);
  assert.equal(m.bolumler[0].zemin, '#0C2380');
});

// ── ORACLE ────────────────────────────────────────────────────────────────────
// The oracle is the legacy `section-map.py` output and lives OUTSIDE this repo.
// Its path comes from an environment variable; without it the test is skipped. (It used
// to be hardcoded to a personal repo path on one machine — it never ran anywhere else.)
const ORACLE = process.env.D2C_ORACLE ?? '';
// `design.json` is now produced from fixtures without the network; the oracle, however,
// lives OUTSIDE this repo (the legacy `section-map.py` output) — without it the test is
// rightly skipped.
const designA = await designUret();

if (!existsSync(ORACLE) || !designA) {
  skip(
    !designA
      ? 'oracle testi atlandı — cli/test/fixtures/live/ yok'
      : 'oracle testi atlandı — D2C_ORACLE tanımlı değil ' +
        '(legacy section-map.py çıktısının yolu; bu deponun dışında)'
  );
} else {
  const ora = JSON.parse(readFileSync(ORACLE, 'utf8'));
  const mine = segment(designA);

  test('ORACLE — 4 bant birebir (y, h, ad, renk)', () => {
    assert.equal(mine.bantlar.length, ora.bantlar.length);
    for (const o of ora.bantlar) {
      const m = mine.bantlar.find((b) => Math.abs(b.y - o.y) < 0.5 && Math.abs(b.h - o.h) < 0.5);
      assert.ok(m, `bant bulunamadı: y=${o.y} h=${o.h} ${o.ad}`);
      assert.equal(m.ad, o.ad);
      assert.equal(m.renk, o.renk);
    }
  });

  test('ORACLE — bölüm sayısı aynı', () => {
    assert.equal(mine.bolumler.length, ora.bolumler.length);
  });

  test('ORACLE — bant bölümlerinin sınırları BİREBİR', () => {
    for (const o of ora.bolumler.filter((b) => b.bant)) {
      const m = mine.bolumler.find((b) => b.bant === o.bant);
      assert.ok(m, `bant bölümü yok: ${o.bant}`);
      assert.equal(m.y, o.y, `${o.bant} y`);
      assert.equal(m.h, o.h, `${o.bant} h`);
      assert.equal(m.zemin, o.zemin, `${o.bant} zemin`);
    }
  });

  test('ORACLE — boşluk türevli sınırlar ≤ 5 px sapıyor (son boş blok hariç)', () => {
    // The old method used the INK in a screenshot, the new one uses element BOXES; a text
    // frame extends slightly beyond the ink. The deviation comes from that difference.
    const sapmalar = [];
    for (let i = 0; i < ora.bolumler.length - 1; i++) {
      const o = ora.bolumler[i], m = mine.bolumler[i];
      sapmalar.push({ i: i + 1, d: Math.abs(o.y - m.y) });
    }
    const kotu = sapmalar.filter((s) => s.d > 5);
    assert.deepEqual(kotu, [], `5 px'i aşan sapma: ${JSON.stringify(kotu)}`);
  });

  test('ORACLE — bölüm 10 adı ve başlık kutusu', () => {
    const o = ora.bolumler.find((b) => b.ad);
    const m = mine.bolumler.find((b) => b.bant === o.bant);
    assert.equal(m.ad, o.ad);
    assert.equal(m.baslik.punto, o.baslik.punto);
    assert.equal(m.baslik.aile, o.baslik.aile);
    assert.equal(m.baslik.agirlik, o.baslik.agirlik);
    assert.equal(m.baslik.renk, o.baslik.renk);
    assert.deepEqual(m.baslik.kutu.map((v) => Math.round(v)), o.baslik.kutu.map((v) => Math.round(v)));
  });
}
