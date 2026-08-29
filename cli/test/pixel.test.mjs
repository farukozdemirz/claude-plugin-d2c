/** Piksel katmanı birim testleri — PNG G/Ç, kırpma, Lanczos, yuvarlama. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bosImg, doldur, kirp, luma, nearest, olcekle, pngOku, pngYaz, yapistir, pyRound }
  from '../dist/lib.mjs';

const FIX = fileURLToPath(new URL('./fixtures/parite/', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'd2c-pixel-'));

let pilVar = true;
try { execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' }); } catch { pilVar = false; }

test('PNG oku/yaz round-trip', () => {
  const im = bosImg(7, 5);
  for (let i = 0; i < im.data.length; i++) im.data[i] = (i * 37) % 256;
  const yol = join(tmp(), 'r.png');
  pngYaz(yol, im);
  const geri = pngOku(yol);
  assert.equal(geri.w, 7);
  assert.equal(geri.h, 5);
  assert.deepEqual([...geri.data], [...im.data]);
});

test('kırpma sınır dışını SİYAHLA doldurur (PIL davranışı)', () => {
  const im = bosImg(4, 4);
  doldur(im, 200, 100, 50);
  const c = kirp(im, -2, -2, 2, 2);
  assert.deepEqual([c.w, c.h], [4, 4]);
  // sol-üst çeyrek sınır dışı → siyah
  assert.deepEqual([c.data[0], c.data[1], c.data[2]], [0, 0, 0]);
  // sağ-alt çeyrek görüntünün içinden geliyor
  const p = (3 * 4 + 3) * 3;
  assert.deepEqual([c.data[p], c.data[p + 1], c.data[p + 2]], [200, 100, 50]);
});

test('luma = PIL convert("L") tamsayı formülü', () => {
  assert.equal(luma(0, 0, 0), 0);
  assert.equal(luma(255, 255, 255), 255);
  // (0*19595 + 0*38470 + 1*7471 + 32768) >> 16 = 0 — küçük mavi farkı ERİR
  assert.equal(luma(0, 0, 1), 0);
  assert.equal(luma(128, 128, 128), 128);
});

test('boyut aynıysa yeniden örnekleme YAPILMAZ (PIL kısayolu)', () => {
  const im = bosImg(9, 9);
  for (let i = 0; i < im.data.length; i++) im.data[i] = (i * 13) % 256;
  const r = olcekle(im, 9, 9);
  assert.deepEqual([...r.data], [...im.data]);
  assert.notEqual(r.data, im.data, 'kopya dönmeli, aynı tampon değil');
});

test('Lanczos: sabit renk küçültmede korunur', () => {
  const im = bosImg(64, 64);
  doldur(im, 33, 177, 90);
  const k = olcekle(im, 16, 16);
  for (let i = 0; i < k.data.length; i += 3) {
    assert.deepEqual([k.data[i], k.data[i + 1], k.data[i + 2]], [33, 177, 90]);
  }
});

test('Lanczos: PIL ile BİREBİR (gürültü dahil)', { skip: !pilVar && 'PIL yok' }, () => {
  const dizin = tmp();
  for (const [ad, w, h] of [['gurultu-a.png', 25, 18], ['renk-a.png', 90, 56], ['renk-a.png', 720, 480]]) {
    const cikti = join(dizin, `pil-${ad}-${w}x${h}.png`);
    execFileSync('python3', ['-c',
      `from PIL import Image\n` +
      `Image.open(${JSON.stringify(join(FIX, ad))}).convert("RGB")` +
      `.resize((${w},${h}), Image.LANCZOS).save(${JSON.stringify(cikti)})`]);
    const benim = olcekle(pngOku(join(FIX, ad)), w, h);
    const pil = pngOku(cikti);
    assert.deepEqual([benim.w, benim.h], [pil.w, pil.h]);
    let farkli = 0;
    for (let i = 0; i < benim.data.length; i++) if (benim.data[i] !== pil.data[i]) farkli++;
    assert.equal(farkli, 0, `${ad} → ${w}×${h}: ${farkli} bayt PIL'den farklı`);
  }
});

test('nearest büyütme piksel çoğaltır', () => {
  const im = bosImg(2, 1);
  im.data.set([10, 20, 30, 40, 50, 60]);
  const b = nearest(im, 4, 2);
  assert.deepEqual([b.data[0], b.data[1], b.data[2]], [10, 20, 30]);
  assert.deepEqual([b.data[3], b.data[4], b.data[5]], [10, 20, 30]);
  assert.deepEqual([b.data[6], b.data[7], b.data[8]], [40, 50, 60]);
});

test('yapıştırma hedef sınırını taşmaz', () => {
  const hedef = bosImg(4, 4);
  const kucuk = bosImg(3, 3);
  doldur(kucuk, 9, 9, 9);
  yapistir(hedef, kucuk, 2, 2);           // yarısı dışarı taşar
  const p = (3 * 4 + 3) * 3;
  assert.equal(hedef.data[p], 9);
  assert.equal(hedef.data[0], 0, 'dokunulmayan piksel değişmemeli');
});

test('pyRound = Python round() (bankacı yuvarlaması)', () => {
  // Math.round bunların yarısını yanlış verir; kırpma sınırında 1px kayma demek.
  assert.equal(pyRound(0.5), 0);
  assert.equal(pyRound(1.5), 2);
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(-0.5), 0);
  assert.equal(pyRound(-1.5), -2);
  assert.equal(pyRound(-2.5), -2);
  assert.equal(pyRound(3.7), 4);
  assert.equal(pyRound(3.2), 3);
});

test('pyRound Python ile birebir', { skip: !pilVar && 'python yok' }, () => {
  const degerler = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, 0.49, 0.51, 12.5, 13.5, 1023.5];
  const beklenen = execFileSync('python3', ['-c',
    `print(",".join(str(round(v)) for v in [${degerler.join(',')}]))`], { encoding: 'utf8' })
    .trim().split(',').map(Number);
  assert.deepEqual(degerler.map(pyRound), beklenen);
});
