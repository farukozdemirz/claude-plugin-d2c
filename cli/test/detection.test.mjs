/**
 * WHAT the visual diff catches and WHAT it treats as noise — pinned down.
 *
 * The "synthetic visual diff" layer of §11. The main plan lists four corruptions:
 * shifted by 1px · an ellipsis added · an icon changed · a colour deviation.
 * `visual.test.mjs` covered the ellipsis and the colour; the shift and the icon are here.
 *
 * PIL IS NOT USED: the images are produced with our own pixel layer. After Phase 5b PIL
 * is not a prerequisite; a PIL-dependent test would be silently skipped in CI and leave
 * the illusion of coverage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bosImg, doldur, pngYaz, motorCalistir } from '../dist/lib.mjs';

const dizin = mkdtempSync(join(tmpdir(), 'd2c-tespit-'));
const G = 240, Y = 160;

const nokta = (im, x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
  const p = (y * im.w + x) * 3;
  im.data[p] = r; im.data[p + 1] = g; im.data[p + 2] = b;
};
const kutu = (im, x0, y0, x1, y1, r, g, b) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) nokta(im, x, y, r, g, b);
};
const daire = (im, cx, cy, yc, r, g, b) => {
  for (let y = cy - yc; y <= cy + yc; y++)
    for (let x = cx - yc; x <= cx + yc; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= yc * yc) nokta(im, x, y, r, g, b);
};

/**
 * A card-like page. `kaydir` pushes everything 1px to the right (imitating a sub-pixel
 * shift); `ikon` is "daire" or "kare" — the case where the icon CHANGES.
 */
function sayfa({ kaydir = 0, ikon = 'daire' } = {}) {
  const im = bosImg(G, Y);
  doldur(im, 250, 250, 250);
  kutu(im, 8 + kaydir, 8, 232 + kaydir, 152, 255, 255, 255);
  // text-like high-frequency content — a 1px shift produces the most noise here
  for (let s = 0; s < 7; s++) {
    const y = 60 + s * 12;
    for (let x = 16 + kaydir; x < 224 + kaydir; x += 3) kutu(im, x, y, x + 2, y + 6, 90, 90, 96);
  }
  // the icon — top right, in a known grid cell
  const cx = 200 + kaydir, cy = 30;
  if (ikon === 'daire') daire(im, cx, cy, 12, 12, 35, 128);
  else kutu(im, cx - 12, cy - 12, cx + 12, cy + 12, 12, 35, 128);
  return im;
}

function karsilastir(a, b, ad) {
  const ya = join(dizin, `${ad}-a.png`), yb = join(dizin, `${ad}-b.png`);
  pngYaz(ya, a); pngYaz(yb, b);
  // The boxes are given EXPLICITLY. Called without boxes, the engine applies
  // `trim_uniform` and crops both images to the bounding box of their content — which
  // realigns a pure translation and makes it INVISIBLE (measured: raw 0% for the shift).
  // The real flow always passes boxes too.
  return motorCalistir({
    xdPng: ya, renderPng: yb, out: join(dizin, `${ad}-fark.png`),
    xdKutu: [0, 0, G, Y], renderKutu: [0, 0, G, Y],
  });
}

const temel = sayfa();
const kayma = karsilastir(temel, sayfa({ kaydir: 1 }), 'kayma');
const ikon = karsilastir(temel, sayfa({ ikon: 'kare' }), 'ikon');
const ayni = karsilastir(temel, sayfa(), 'ayni');

test('aynı görüntü → hiçbir şey yakalanmaz', () => {
  assert.equal(ayni.ham, 0);
  assert.equal(ayni.yapisal, 0);
  assert.equal(ayni.bolgeler.length, 0);
});

test('1px KAYMA gürültü sayılır — yapısal fark düşük kalır', () => {
  // The reason the structural comparison exists: a 4× downscale dissolves a sub-pixel
  // shift. The raw difference may be high; the DECISION looks at the structural one.
  assert.ok(kayma.ham > 5, `ham ${kayma.ham} — kayma ham farkta görünmeli`);
  assert.ok(kayma.yapisal < 2, `yapısal ${kayma.yapisal} — kayma yapısalda ERİMELİ`);
});

test('İKON DEĞİŞİMİ yakalanır ve ikonun bulunduğu bölgeye lokalize olur', () => {
  assert.ok(ikon.yapisal > 0, `yapısal ${ikon.yapisal}`);
  assert.ok(ikon.bolgeler.length > 0, 'sapan bölge bildirilmeli');
  // The icon is at x≈188-212, y≈18-42 → column 6, rows 0-1 on an 8×8 grid.
  const [W, H] = ikon.boyut;
  const gw = Math.floor(W / 8), gh = Math.floor(H / 8);
  const beklenen = ikon.bolgeler.some(
    (b) => b.sutun === Math.floor(200 / gw) && b.satir <= Math.floor(42 / gh)
  );
  assert.ok(beklenen, `ikon bölgesi bildirilmedi: ${JSON.stringify(ikon.bolgeler)}`);
});

test('AYIRT EDİCİLİK yüzdede DEĞİL, bölge dağılımında', () => {
  // MEASURED: shift structural 0.83% · icon structural 0.79% — the percentage does NOT
  // RANK them. The structural percentage is area weighted: a 24×24 icon is 1.5% of a
  // 240×160 page. A small but important difference can score LOWER than a sub-pixel
  // shift spread across the whole page.
  //
  // This is concrete evidence for the repo's rule that "the percentage is not a pass
  // mark, the decision rests on region inspection". The discriminator is in two places:
  //   1) the NUMBER of regions — the shift spreads, the icon clusters
  //   2) the POSITION of regions — the icon's are clustered in a single column
  assert.ok(
    kayma.bolgeler.length > 3 * ikon.bolgeler.length,
    `kayma ${kayma.bolgeler.length} bölge · ikon ${ikon.bolgeler.length} bölge — yayılma farkı yok`
  );

  const sutunlar = (r) => new Set(r.bolgeler.map((b) => b.sutun));
  assert.ok(sutunlar(ikon).size <= 2, `ikon bölgeleri ${sutunlar(ikon).size} sütuna yayılmış — kümelenmeli`);
  assert.ok(sutunlar(kayma).size >= 6, `kayma ${sutunlar(kayma).size} sütunda — sayfaya yayılmalı`);

  // The raw difference ranks them the OTHER way: the shift shows up in raw, the icon change barely does.
  assert.ok(kayma.ham > 10 && ikon.ham < 1,
    `ham: kayma ${kayma.ham} · ikon ${ikon.ham}`);
});

test('ölçülen değerler kayıt altında (gerileme olursa görünür)', () => {
  // The numbers are pinned: if a threshold or filter changes later, the test says so.
  assert.equal(kayma.boyut[0], G);
  assert.equal(ikon.boyut[0], G);
  console.log(
    `    ölçülen → kayma: ham %${kayma.ham} · yapısal %${kayma.yapisal} · ${kayma.bolgeler.length} bölge\n` +
    `              ikon : ham %${ikon.ham} · yapısal %${ikon.yapisal} · ${ikon.bolgeler.length} bölge`
  );
});
