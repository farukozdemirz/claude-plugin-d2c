import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureShape, radiusFromRoundedRectPath, pathBBox } from '../dist/lib.mjs';

test('rect r[] doğrudan okunur', () => {
  const m = measureShape({ type: 'rect', x: 0, y: 0, width: 635, height: 635, r: [8, 8, 8, 8] });
  assert.deepEqual(m.kutu, { x: 0, y: 0, w: 635, h: 635 });
  assert.deepEqual(m.radius, [8, 8, 8, 8]);
  assert.equal(m.radiusKaynak, 'rect');
});

test('r yoksa radiusKaynak "yok"', () => {
  const m = measureShape({ type: 'rect', x: 0, y: 0, width: 10, height: 10 });
  assert.equal(m.radius, null);
  assert.equal(m.radiusKaynak, 'yok');
});

test('GERÇEK Path 8257: yoldan radius 12 çıkar', () => {
  // Bu yol, benchmark'ta "radius 12" olarak kayıtlı; eski araç piksel oturtmayla
  // r=11.34 bulup 12'ye yuvarlıyordu. Kaynak veri kesin değeri taşıyor.
  const d = 'M 12 0 L 1300 0 C 1306.62744140625 0 1312 5.37258243560791 1312 12 L 1312 60 C 1312 66.6274185180664 1306.62744140625 72 1300 72 L 12 72 C 5.372583389282227 72 0 66.6274185180664 0 60 L 0 12 C 0 5.37258243560791 5.372583389282227 0 12 0 Z';
  assert.equal(radiusFromRoundedRectPath(d), 12);
  const m = measureShape({ type: 'path', path: d });
  assert.deepEqual(m.radius, [12, 12, 12, 12]);
  assert.equal(m.radiusKaynak, 'yol');
});

test('r=8 yolu da doğru çıkar', () => {
  const k = 0.5522847498307936;
  const r = 8, w = 100;
  const d = `M ${r} 0 L ${w - r} 0 C ${w - r + r * k} 0 ${w} ${r - r * k} ${w} ${r}`;
  assert.equal(radiusFromRoundedRectPath(d), 8);
});

test('yuvarlatılmış dikdörtgen OLMAYAN yol için radius UYDURULMAZ', () => {
  const m = measureShape({ type: 'path', path: 'M 119 574.5 L 111.5 567 L 119 559.5' });
  assert.equal(m.radius, null);
  assert.equal(m.radiusKaynak, 'bilinmiyor');
});

test('kübik doğrulaması tutmayan yol reddedilir', () => {
  // Kontrol noktası çember yayına ait değil -> desen tanınmamalı.
  const d = 'M 12 0 L 1300 0 C 1301 0 1312 11 1312 12';
  assert.equal(radiusFromRoundedRectPath(d), null);
});

test('pathBBox sınırları bulur', () => {
  assert.deepEqual(pathBBox('M 10 20 L 40 60'), { x: 10, y: 20, w: 30, h: 40 });
});

test('circle kutuya çevrilir', () => {
  const m = measureShape({ type: 'circle', cx: 50, cy: 50, r: 10 });
  assert.deepEqual(m.kutu, { x: 40, y: 40, w: 20, h: 20 });
  assert.deepEqual(m.radius, [10, 10, 10, 10]);
});

test('line kutuya çevrilir (ayraç çizgileri)', () => {
  const m = measureShape({ type: 'line', x1: 0, y1: 0, x2: 0, y2: 16 });
  assert.deepEqual(m.kutu, { x: 0, y: 0, w: 0, h: 16 });
  assert.equal(m.radiusKaynak, 'yok');
});

test('boş path ölçülemez — null döner (uydurulmaz)', () => {
  assert.equal(measureShape({ type: 'path', path: '' }), null);
});

// ── compound (boolean birleştirilmiş şekil) ──────────────────────────────────
test('compound şekil `path` gibi ölçülür', () => {
  // Gerçek tasarımda bulundu: 291 düğümün 10'u compound'du ve SESSİZCE düşüyordu
  // (bilinmeyen tip %3,44). `shape.path` boolean işlemin SONUCUNU taşıyor —
  // doğrulandı: compound'un bbox'ı çocuklarının birleşimiyle birebir aynı.
  const m = measureShape({
    type: 'compound',
    operation: 'exclude',
    path: 'M 0 0 L 24 0 L 24 24 L 0 24 Z M 8 8 L 16 8 L 16 16 L 8 16 Z',
    children: [],
  });
  assert.ok(m, 'compound ölçülmeli, null dönmemeli');
  assert.deepEqual(
    [m.kutu.x, m.kutu.y, m.kutu.w, m.kutu.h],
    [0, 0, 24, 24],
    'dış kontur kutuyu belirler'
  );
});

test('compound `path` taşımıyorsa yine null (uydurma yok)', () => {
  assert.equal(measureShape({ type: 'compound', operation: 'union', children: [] }), null);
});
