/** Visual comparison tests — synthetic PNG pairs, NO NETWORK. */
import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gorselKarsilastir, pngBoyutu, VisualSchema } from '../dist/lib.mjs';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../skills/d2c-code/scripts/visual-diff.py', import.meta.url));

let pilVar = true;
try { execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' }); } catch { pilVar = false; }

/** A simple PNG generator — via PIL, without an extra JS dependency. */
function uret(dir, ad, cizim) {
  const yol = join(dir, ad);
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
im = Image.new('RGB', (200, 120), 'white')
d = ImageDraw.Draw(im)
${cizim}
im.save(${JSON.stringify(yol)})
`]);
  return yol;
}

const TEMEL = `
d.rectangle([10,10,90,60], fill=(255,255,255), outline=(215,223,233))
d.text((16,16), "Merhaba", fill=(12,35,128))
d.rectangle([110,10,190,60], fill=(12,35,128))
`;

if (!pilVar) {
  skip('görsel testler atlandı — python3 + PIL yok');
} else {
  const dir = mkdtempSync(join(tmpdir(), 'd2c-visual-'));
  const a = uret(dir, 'a.png', TEMEL);

  const calistir = (b, over = {}) =>
    gorselKarsilastir({ xdPng: a, renderPng: b, outDir: mkdtempSync(join(tmpdir(), 'd2c-out-')), scriptYolu: SCRIPT, ...over });

  test('aynı iki görüntü → %0 fark', () => {
    const r = calistir(uret(dir, 'ayni.png', TEMEL));
    assert.equal(r.ham, 0);
    assert.equal(r.yapisal, 0);
    assert.deepEqual(r.bolgeler, []);
  });

  test('renk değişimi yakalanır', () => {
    const r = calistir(uret(dir, 'renk.png', TEMEL.replace('(12,35,128))\n', '(255,0,0))\n')));
    assert.ok(r.ham > 0.5, `ham ${r.ham}`);
    assert.ok(r.bolgeler.length > 0);
  });

  test('EKLENEN ELLIPSIS yakalanır ve LOKALİZE edilir', () => {
    // A known finding class: the "…" that line-clamp adds
    const r = calistir(uret(dir, 'ellipsis.png', TEMEL + `
d.text((16,40), "...", fill=(65,65,65))
`));
    assert.ok(r.bolgeler.length > 0, 'ellipsis bulunamadı');
    const b = r.bolgeler[0];
    // The grid cell must point at the region containing the text (top-left quadrant)
    assert.ok(b.kutu[0] < 100 && b.kutu[1] < 80, `yanlış bölge: ${JSON.stringify(b.kutu)}`);
  });

  test('eksik görsel (düz kutu) yakalanır', () => {
    const r = calistir(uret(dir, 'eksik.png', TEMEL.replace(
      'd.rectangle([110,10,190,60], fill=(12,35,128))',
      'd.rectangle([110,10,190,60], fill=(200,200,200))'
    )));
    assert.ok(r.yapisal > 1, `yapısal ${r.yapisal}`);
  });

  test('hazır kırpma üretiliyor ve BÜTÇEYLE sınırlı (≤4)', () => {
    const out = mkdtempSync(join(tmpdir(), 'd2c-out-'));
    const b = uret(dir, 'cok.png', `
for i in range(0, 200, 20):
    d.rectangle([i, 0, i+10, 120], fill=(255, 0, 0))
`);
    const r = gorselKarsilastir({ xdPng: a, renderPng: b, outDir: out, scriptYolu: SCRIPT, kirpmaAdet: 4 });
    const kirpmalar = r.bolgeler.filter((x) => x.kirpma);
    assert.ok(kirpmalar.length <= 4, `${kirpmalar.length} kırpma — bütçe 4`);
    assert.ok(kirpmalar.length > 0, 'hiç kırpma yok');
    for (const k of kirpmalar) assert.ok(existsSync(k.kirpma), `dosya yok: ${k.kirpma}`);
    // Regions beyond the budget are NOT HIDDEN — they stay in the list, they just have no crop.
    assert.ok(r.bolgeler.length >= kirpmalar.length);
  });


  test('MOTOR: python yolu KORUNUYOR ve aynı sayıları veriyor', () => {
    // The Phase 5b port did not delete Python. If the fallback path does not work,
    // saying "it is preserved" is an empty claim — so it is actually executed here.
    const b = uret(dir, 'motor.png', TEMEL.replace('(12,35,128))\n', '(255,0,0))\n'));
    const ts = calistir(b, { motor: 'ts' });
    const py = calistir(b, { motor: 'python' });
    assert.equal(ts.motor, 'ts');
    assert.equal(py.motor, 'python');
    assert.equal(ts.ham, py.ham, `ham ${ts.ham} vs ${py.ham}`);
    assert.equal(ts.yapisal, py.yapisal, `yapısal ${ts.yapisal} vs ${py.yapisal}`);
  });

  test('MOTOR: --kalibre verilince otomatik python (çapa TS\'e taşınmadı)', () => {
    const b = uret(dir, 'kalibre.png', TEMEL);
    const r = calistir(b, { motor: 'ts', kalibre: '#0C2380:110,10,80,50', tasarimKutu: [0, 0, 200, 120] });
    assert.equal(r.motor, 'python', 'çapa istenmişse sessizce TS ile ölçme');
  });

  test('JSON çıktısı şemaya uygun alanları taşır', () => {
    const r = calistir(uret(dir, 'json.png', TEMEL));
    for (const k of ['ham', 'yapisal', 'esik', 'boyut', 'izgara', 'bolgeler', 'isiHaritasi']) {
      assert.ok(k in r, `eksik alan: ${k}`);
    }
    assert.equal(r.boyut.length, 2);
  });

  test('yapısal eşik aşılınca ÇIKIŞ 1 — hata değil, bulgudur', () => {
    // A completely different image: the script exits 1; the wrapper must not treat that as an error.
    const r = calistir(uret(dir, 'bambaska.png', `d.rectangle([0,0,200,120], fill=(0,0,0))`));
    assert.ok(r.yapisal > 8, `yapısal ${r.yapisal} — eşiği aşmalıydı`);
    assert.ok(r.bolgeler.length > 0);
  });

  test('pngBoyutu IHDR den okur', () => {
    assert.deepEqual(pngBoyutu(readFileSync(a)), { w: 200, h: 120 });
    assert.equal(pngBoyutu(Buffer.from('bozuk')), null);
  });

  test('Zod: visual.json şeması', () => {
    const v = {
      schemaVersion: 1, tur: 1, tarih: new Date().toISOString(),
      referans: { kaynak: 'thumbnail', png: 'x.png', olcek: 0.5, kirpma: [0, 0, 10, 10] },
      render: { png: 'r.png', kirpma: [0, 0, 10, 10] },
      hamYuzde: 1, yapisalYuzde: 0.5, bolgeler: [], isiHaritasi: 'f.png', sureMs: 100, notlar: [],
    };
    assert.doesNotThrow(() => VisualSchema.parse(v));
    assert.throws(() => VisualSchema.parse({ ...v, referans: { ...v.referans, kaynak: 'sacma' } }));
  });
}
