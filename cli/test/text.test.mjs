import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureText, lineHeightFrom, fontBoxFrom, ascentFrom, textWidthFrom, argbToHex, rgbToHex } from '../dist/lib.mjs';

const satir = (position, right, ascent, descent) => ({ position, layoutBounds: { left: 0, right, ascent, descent } });

/** GERÇEK veri: "Benzer \nÜrünler", Bw Modelica Medium 14px, iki satır. */
const ikiSatir = {
  type: 'text', name: 'Benzer \nÜrünler',
  meta: { ux: {
    rangedStyles: [{ fontFamily: 'Bw Modelica', fontStyle: 'Medium', fontSize: 14, charSpacing: 0, fill: { value: 4278985600 } }],
    outlinesLayout: { static: { paragraphs: [
      { lines: [satir(0, 51.52, -14, 3)] },
      { lines: [satir(21, 51.898, -14, 3)] },
    ] } },
  } },
};

test('satır yüksekliği ardışık position farkından çıkar', () => {
  const l = [satir(0, 10, -14, 3), satir(21, 10, -14, 3)];
  assert.equal(lineHeightFrom(l), 21);
});

test('tek satırda satır yüksekliği ÖLÇÜLEMEZ — null döner, uydurulmaz', () => {
  assert.equal(lineHeightFrom([satir(0, 10, -14, 3)]), null);
});

test('fontKutusuAgc = |ascent| + descent', () => {
  assert.equal(fontBoxFrom([satir(0, 10, -14, 3)]), 17);
  assert.equal(ascentFrom([satir(0, 10, -45, 11)]), 45);
});

test('metin genişliği en geniş satırdan alınır', () => {
  assert.equal(textWidthFrom([satir(0, 51.52, -14, 3), satir(21, 51.898, -14, 3)]), 51.898);
});

test('gerçek iki satırlı metin düğümü', () => {
  const m = measureText(ikiSatir);
  assert.equal(m.metin, 'Benzer \nÜrünler');
  assert.equal(m.satirSayisi, 2);
  assert.equal(m.font.aile, 'Bw Modelica');
  assert.equal(m.font.agirlik, 'Medium');
  assert.equal(m.font.punto, 14);
  assert.equal(m.font.satir, 21);
  assert.equal(m.font.fontKutusuAgc, 17);   // Chrome metriği DEĞİL — POC-4 (M2)
  assert.equal(m.font.renk, '#0C2380');
  assert.equal(m.ascent, 14);
});

test('ARGB tamsayısı hex e çevrilir (alfa yok sayılır)', () => {
  assert.equal(argbToHex(4278985600), '#0C2380');
});

test('RGB nesnesi BÜYÜK HARF hex e çevrilir', () => {
  assert.equal(rgbToHex({ r: 215, g: 223, b: 233 }), '#D7DFE9');
  assert.equal(rgbToHex({ r: 255, g: 255, b: 255 }), '#FFFFFF');
});
