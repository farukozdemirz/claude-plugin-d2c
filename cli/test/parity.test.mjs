/**
 * PARİTE — `visual-diff.py` ↔ TypeScript motoru.
 *
 * Ana plan Faz 5b'yi açıkça şartlamıştı: *"Parite kanıtlanmadan yapılmaz."*
 * Kabul ölçütü aynı girdilerde ham/yapısal yüzde farkının **< %0,1** olması.
 *
 * Test iki katmanlı:
 *
 *   1. **Canlı** — python3 + PIL varsa iki motor da koşar, sayılar karşılaştırılır.
 *   2. **Altın** — Python yokken bile TS motoru kayıtlı değerleri üretmeli.
 *      (Faz 5b'nin amacı Python'u önkoşul olmaktan çıkarmak; testin kendisi
 *      Python'a bağlı kalırsa o amaç yarım kalırdı.)
 *
 * Fixture'lar gerçek gliflerle çizilmiş kart görüntüleri + bir gürültü çifti.
 * Gürültü bilerek var: yeniden örnekleyicideki en küçük katsayı hatası orada
 * görünür, düz zeminde görünmez.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motorCalistir, pngOku } from '../dist/lib.mjs';

const FIX = fileURLToPath(new URL('./fixtures/parite/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../../skills/d2c-code/scripts/visual-diff.py', import.meta.url));
const ALTIN = fileURLToPath(new URL('./fixtures/parite/altin.json', import.meta.url));

let pilVar = true;
try { execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' }); } catch { pilVar = false; }

/** Ana plandaki kabul ölçütü. */
const TOLERANS = 0.1;

const DURUMLAR = [
  { ad: 'ayni',     a: 'ayni-a.png',     b: 'ayni-b.png' },
  { ad: 'renk',     a: 'renk-a.png',     b: 'renk-b.png' },
  { ad: 'ellipsis', a: 'ellipsis-a.png', b: 'ellipsis-b.png' },
  { ad: 'kayma',    a: 'kayma-a.png',    b: 'kayma-b.png' },
  { ad: 'fotosuz',  a: 'fotosuz-a.png',  b: 'fotosuz-b.png' },
  { ad: 'gurultu',  a: 'gurultu-a.png',  b: 'gurultu-b.png' },
  // --olcekle yolu: b tam 2×, LANCZOS ile küçültülüp karşılaştırılıyor
  { ad: 'olcek',    a: 'olcek-a.png',    b: 'olcek-b.png', olcekle: true },
  // kırpma yolları: --xd-kutu ve --render-kutu birlikte
  { ad: 'kirpma',   a: 'renk-a.png',     b: 'renk-b.png',
    xdKutu: [12, 16, 300, 180], renderKutu: [20, 10, 300, 180] },
];

function tsKos(d, dizin) {
  return motorCalistir({
    xdPng: join(FIX, d.a), renderPng: join(FIX, d.b),
    out: join(dizin, 'fark.png'),
    xdKutu: d.xdKutu, renderKutu: d.renderKutu, olcekle: d.olcekle,
    kirpmaDizin: join(dizin, 'bolgeler'), kirpmaAdet: 4,
  });
}

function pythonKos(d, dizin) {
  const jsonYol = join(dizin, 'raw.json');
  const args = [SCRIPT, join(FIX, d.a), join(FIX, d.b),
    '--out', join(dizin, 'fark.png'), '--json', jsonYol,
    '--kirpma-dizin', join(dizin, 'bolgeler'), '--kirpma-adet', '4'];
  if (d.xdKutu) args.push('--xd-kutu', d.xdKutu.join(','));
  if (d.renderKutu) args.push('--render-kutu', d.renderKutu.join(','));
  if (d.olcekle) args.push('--olcekle');
  try {
    execFileSync('python3', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    // Çıkış kodu 1 = yapısal eşik aşıldı; bulgu, hata değil.
    if (e.status !== 1) throw e;
  }
  return JSON.parse(readFileSync(jsonYol, 'utf8'));
}

const tmp = (ad) => mkdtempSync(join(tmpdir(), `d2c-parite-${ad}-`));

for (const d of DURUMLAR) {
  test(`parite/${d.ad}: TS motoru Python ile aynı sayıları üretiyor`, { skip: !pilVar && 'PIL yok' }, () => {
    const ts = tsKos(d, tmp(d.ad + '-ts'));
    const py = pythonKos(d, tmp(d.ad + '-py'));

    assert.ok(Math.abs(ts.ham - py.ham) < TOLERANS,
      `ham: TS ${ts.ham} vs Python ${py.ham}`);
    assert.ok(Math.abs(ts.yapisal - py.yapisal) < TOLERANS,
      `yapısal: TS ${ts.yapisal} vs Python ${py.yapisal}`);
    assert.deepEqual(ts.boyut, py.boyut, 'karşılaştırılan boyut');
    assert.equal(ts.bolgeler.length, py.bolgeler.length, 'sapan bölge sayısı');
    ts.bolgeler.forEach((b, i) => {
      const p = py.bolgeler[i];
      assert.equal(b.satir, p.satir, `bölge ${i} satır`);
      assert.equal(b.sutun, p.sutun, `bölge ${i} sütun`);
      assert.ok(Math.abs(b.yuzde - p.yuzde) < TOLERANS, `bölge ${i} yüzde`);
      assert.deepEqual(b.kutu, p.kutu, `bölge ${i} kutu`);
    });
  });
}

test('parite: ısı haritası PNG\'i piksel düzeyinde aynı', { skip: !pilVar && 'PIL yok' }, () => {
  // Sayılar tutup görüntü tutmuyorsa port yarım demektir; ajan ısı haritasına BAKIYOR.
  for (const d of DURUMLAR) {
    const dt = tmp(d.ad + '-ts'), dp = tmp(d.ad + '-py');
    tsKos(d, dt); pythonKos(d, dp);
    const x = pngOku(join(dt, 'fark.png'));
    const y = pngOku(join(dp, 'fark.png'));
    assert.deepEqual([x.w, x.h], [y.w, y.h], `${d.ad}: ısı haritası boyutu`);
    let farkli = 0;
    for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) farkli++;
    assert.equal(farkli, 0, `${d.ad}: ısı haritasında ${farkli} bayt farkı`);
  }
});

test('parite: hazır kırpmalar da aynı', { skip: !pilVar && 'PIL yok' }, () => {
  const d = DURUMLAR.find((x) => x.ad === 'renk');
  const dt = tmp('kirpma-ts'), dp = tmp('kirpma-py');
  const ts = tsKos(d, dt); pythonKos(d, dp);
  assert.ok(ts.bolgeler.length > 0, 'bu durumda sapan bölge olmalı');
  const at = readdirSync(join(dt, 'bolgeler')).sort();
  const ap = readdirSync(join(dp, 'bolgeler')).sort();
  assert.deepEqual(at, ap, 'kırpma dosya adları');
  for (const ad of at) {
    const x = pngOku(join(dt, 'bolgeler', ad));
    const y = pngOku(join(dp, 'bolgeler', ad));
    assert.deepEqual([x.w, x.h], [y.w, y.h], `${ad}: boyut`);
    let farkli = 0;
    for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) farkli++;
    assert.equal(farkli, 0, `${ad}: ${farkli} bayt farkı`);
  }
});

test('parite: altın değerler — Python OLMADAN da korunuyor', () => {
  assert.ok(existsSync(ALTIN), 'altin.json yok — `node test/fixtures/parite/uret.mjs` ile üret');
  const altin = JSON.parse(readFileSync(ALTIN, 'utf8'));
  for (const d of DURUMLAR) {
    const ts = tsKos(d, tmp(d.ad + '-altin'));
    const g = altin[d.ad];
    assert.ok(g, `${d.ad} için altın değer yok`);
    assert.equal(ts.ham, g.ham, `${d.ad}: ham`);
    assert.equal(ts.yapisal, g.yapisal, `${d.ad}: yapısal`);
    assert.deepEqual(ts.boyut, g.boyut, `${d.ad}: boyut`);
    assert.equal(ts.bolgeler.length, g.bolge, `${d.ad}: bölge sayısı`);
  }
});

test('aynı görüntü çifti tam sıfır verir', () => {
  const r = tsKos({ ad: 'ayni', a: 'ayni-a.png', b: 'ayni-b.png' }, tmp('sifir'));
  assert.equal(r.ham, 0);
  assert.equal(r.yapisal, 0);
  assert.equal(r.bolgeler.length, 0);
});
