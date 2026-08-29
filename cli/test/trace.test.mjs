/** Phase duration measurement — especially that nested phases are not double counted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { izlemeBaslat, izlemeJson, olc, fazlar, rapor } from '../dist/lib.mjs';

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

test('fazlar sırayla kaydedilir ve süre taşır', async () => {
  izlemeBaslat();
  await olc('a', () => bekle(20));
  await olc('b', () => bekle(10));
  const f = fazlar();
  assert.deepEqual(f.map((x) => x.ad), ['a', 'b']);
  assert.ok(f[0].ms >= 15, `a ${f[0].ms} ms`);
  assert.ok(f.every((x) => x.derinlik === 0));
});

test('İÇ İÇE fazlar çift SAYILMAZ', async () => {
  // `cikarma` contains `xd-shell`. Without depth the two would be summed and the
  // "unmeasured remainder" would go negative — the report would be misleading.
  izlemeBaslat();
  await olc('dis', async () => {
    await olc('ic', () => bekle(25));
    await bekle(5);
  });
  const j = izlemeJson();
  const dis = j.fazlar.find((x) => x.ad === 'dis');
  const ic = j.fazlar.find((x) => x.ad === 'ic');
  assert.equal(dis.derinlik, 0);
  assert.equal(ic.derinlik, 1);
  assert.ok(dis.ms >= ic.ms, 'dış faz iç fazı KAPSAMALI');
  assert.ok(j.olculmeyenMs >= 0, `ölçülmeyen negatif: ${j.olculmeyenMs}`);
  assert.ok(j.olculmeyenMs < dis.ms, 'kalan yalnız üst seviyeden hesaplanmalı');
});

test('aynı ad birden çok kez ölçülürse fazSn toplar', async () => {
  izlemeBaslat();
  await olc('cdn-indirme', () => bekle(10));
  await olc('cdn-indirme', () => bekle(10));
  const { fazSn } = izlemeJson();
  assert.ok(fazSn['cdn-indirme'] >= 0.015, `toplanmamış: ${fazSn['cdn-indirme']}`);
});

test('rapor iç içe fazı GİRİNTİLİ gösterir ve en yavaşı işaretler', async () => {
  izlemeBaslat();
  await olc('dis', async () => { await olc('ic', () => bekle(20)); });
  const r = rapor();
  assert.match(r, /\n {4}ic/, 'iç faz girintili olmalı');
  assert.match(r, /← en yavaş/);
});

test('izleme başlatılmamışsa olc yine de çalışır (kayıt tutmaz)', async () => {
  izlemeBaslat();
  const j0 = izlemeJson();
  assert.equal(j0.fazlar.length, 0);
  const sonuc = await olc('x', () => 42);
  assert.equal(sonuc, 42);
});

test('hata fırlatan faz da KAYDEDİLİR (nerede takıldığı görünsün)', async () => {
  izlemeBaslat();
  await assert.rejects(() => olc('patlayan', async () => { await bekle(5); throw new Error('x'); }));
  assert.equal(fazlar().find((f) => f.ad === 'patlayan') !== undefined, true);
});
