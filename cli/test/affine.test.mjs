import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiply, nodeMatrix, applyPoint, IDENTITY, flatten, toArtboardBox } from '../dist/lib.mjs';

test('kimlik matrisi noktayı değiştirmez', () => {
  assert.deepEqual(applyPoint(IDENTITY, 10, 20), { x: 10, y: 20 });
});

test('öteleme kompozisyonu toplanır', () => {
  const a = [1, 0, 0, 1, 10, 5];
  const b = [1, 0, 0, 1, 3, 7];
  assert.deepEqual(applyPoint(multiply(a, b), 0, 0), { x: 13, y: 12 });
});

test('ölçek + öteleme doğru sırada uygulanır', () => {
  const olcek = [2, 0, 0, 2, 0, 0];
  const otele = [1, 0, 0, 1, 5, 5];
  // önce öteleme sonra ölçek: (0,0) -> (5,5) -> (10,10)
  assert.deepEqual(applyPoint(multiply(olcek, otele), 0, 0), { x: 10, y: 10 });
});

test('nodeMatrix eksik alanları kimlikle doldurur', () => {
  assert.deepEqual(nodeMatrix({ transform: { tx: 4, ty: 9 } }), [1, 0, 0, 1, 4, 9]);
  assert.deepEqual(nodeMatrix({}), IDENTITY);
});

test('iç içe grup transformları birikir ve artboard kökeni düşülür', () => {
  const agc = {
    children: [{
      type: 'artboard', id: 'ab', transform: { tx: -100, ty: -200 },
      artboard: { children: [{
        type: 'group', id: 'g', transform: { tx: 30, ty: 40 },
        group: { children: [{
          type: 'shape', id: 's', name: 'Kutu', transform: { tx: 5, ty: 6 },
          style: { fill: { type: 'solid', color: { value: { r: 0, g: 0, b: 0 } } } },
          shape: { type: 'rect', x: 0, y: 0, width: 10, height: 20 },
        }] },
      }] },
    }],
  };
  const { elemanlar } = flatten(agc);
  assert.equal(elemanlar.length, 1);
  // doküman uzayı: -100+30+5 = -65 ; artboard kökeni (-100,-200) düşülür -> 35, 46
  const kutu = toArtboardBox(elemanlar[0], { x: -100, y: -200 });
  assert.deepEqual(kutu, { x: 35, y: 46, w: 10, h: 20 });
});
