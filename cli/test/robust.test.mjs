/**
 * Layout robustness tests — a REAL browser, NO NETWORK.
 *
 * The fixture pair reproduces the reported bug: a 1920 design copied out as absolute
 * pixels. `header-fixed.html` puts the actions on top of the search bar as the window
 * narrows; `header-flex.html` expresses the same design as layout intent and stays
 * clean. If the check cannot tell those two apart it proves nothing.
 */
import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tarayiciAc, robustDogrula, bulgulariCikar, VARSAYILAN_GENISLIKLER } from '../dist/lib.mjs';

const SAYFA = fileURLToPath(new URL('./fixtures/page/', import.meta.url));
const url = (f) => `file://${join(SAYFA, f)}`;
const IDS = ['header', 'logo', 'search', 'actions'];

// ── pure detection (no browser) ───────────────────────────────────────────────
const el = (testid, x, w, over = {}) => ({
  testid, bulundu: true, x, y: 0, w, h: 32, ebeveyn: 'header', gorunur: true, ...over,
});
const olcum = (elemanlar, scrollWidth = 1280, clientWidth = 1280) => ({
  elemanlar, scrollWidth, clientWidth,
});

test('overlapping siblings → hata', () => {
  const b = bulgulariCikar(olcum([el('search', 620, 920), el('actions', 960, 256)]), 1280, null);
  const c = b.filter((x) => x.tur === 'cakisma');
  assert.equal(c.length, 1);
  assert.equal(c[0].seviye, 'hata');
  assert.deepEqual(c[0].elemanlar.sort(), ['actions', 'search']);
});

test('siblings that merely touch are NOT an overlap', () => {
  // 620+920 = 1540 exactly where actions start: adjacency, not collision.
  const b = bulgulariCikar(olcum([el('search', 620, 920), el('actions', 1540, 256)]), 1920, null);
  assert.equal(b.filter((x) => x.tur === 'cakisma').length, 0);
});

test('elements under DIFFERENT parents are not compared', () => {
  // A child overlapping something in another container is not a sibling collision;
  // reporting it would flood the output with false positives.
  const b = bulgulariCikar(olcum([
    el('search', 620, 920),
    el('actions', 960, 256, { ebeveyn: 'baska-kapsayici' }),
  ]), 1280, null);
  assert.equal(b.filter((x) => x.tur === 'cakisma').length, 0);
});

test('horizontal overflow → hata', () => {
  const b = bulgulariCikar(olcum([el('search', 620, 920)], 1856, 1280), 1280, null);
  const t = b.find((x) => x.tur === 'yatay-tasma');
  assert.equal(t.seviye, 'hata');
  assert.equal(t.miktarPx, 576);
});

test('a child escaping its container → hata', () => {
  const b = bulgulariCikar(olcum([
    el('header', 0, 1280, { ebeveyn: null }),
    el('search', 620, 920),
  ]), 1280, null);
  const k = b.find((x) => x.tur === 'kapsayici-tasmasi');
  assert.equal(k.seviye, 'hata');
  assert.equal(k.miktarPx, 260);
});

test('text reflow is BİLGİ, not an error', () => {
  // The whole point of the severity split: narrowing makes text wrap, and that is the
  // layout working. Calling it an error would make every narrow viewport look broken.
  const ref = olcum([el('baslik', 0, 400, { h: 32 })]);
  const dar = olcum([el('baslik', 0, 300, { h: 64 })]);
  const b = bulgulariCikar(dar, 1024, ref);
  const s = b.find((x) => x.tur === 'sarma');
  assert.equal(s.seviye, 'bilgi');
  assert.equal(s.miktarPx, 32);
  assert.equal(b.filter((x) => x.seviye === 'hata').length, 0);
});

test('default widths are the ones the rule names', () => {
  assert.deepEqual(VARSAYILAN_GENISLIKLER, [1920, 1440, 1366, 1280, 1024]);
});

// ── real browser ──────────────────────────────────────────────────────────────
let pwVar = true;
let pwNeden = 'playwright-core yok';
try {
  await import('playwright-core');
  const o = await tarayiciAc({});
  await o.kapat();
} catch (e) {
  pwVar = false;
  pwNeden = `tarayıcı açılamadı: ${String(e.message ?? e).split('\n')[0]}`;
}

if (!pwVar) {
  skip(`tarayıcı testleri atlandı — ${pwNeden}`);
} else {
  test('TARAYICI: sabit-px header daralınca ÇAKIŞIYOR (bildirilen hata)', async () => {
    const r = await robustDogrula({
      url: url('header-fixed.html'), testidler: IDS,
      referansGenislik: 1920, genislikler: [1920, 1440, 1280],
    });
    assert.ok(r.ozet.hata > 0, 'hata bekleniyordu');
    const cakisma = r.genislikler.flatMap((g) => g.bulgular).filter((b) => b.tur === 'cakisma');
    assert.ok(cakisma.length >= 2, `çakışma 1440 ve 1280'de bekleniyordu: ${JSON.stringify(cakisma)}`);
    assert.deepEqual(cakisma[0].elemanlar.sort(), ['actions', 'search']);
  });

  test('TARAYICI: referans genişlikte (1920) TEMİZ — tasarım orada doğru', async () => {
    const r = await robustDogrula({
      url: url('header-fixed.html'), testidler: IDS,
      referansGenislik: 1920, genislikler: [1920],
    });
    assert.equal(r.ozet.hata, 0, JSON.stringify(r.genislikler[0].bulgular));
  });

  test('TARAYICI: flex header BEŞ genişlikte de temiz', async () => {
    const r = await robustDogrula({
      url: url('header-flex.html'), testidler: IDS, referansGenislik: 1920,
    });
    assert.equal(r.genislikler.length, 5);
    assert.equal(r.ozet.hata, 0, JSON.stringify(r.genislikler.flatMap((g) => g.bulgular)));
  });

  test('TARAYICI: AYIRT EDİCİLİK — aynı tasarım, iki kurulum, farklı sonuç', async () => {
    // Both are identical at 1920; they diverge only as the window narrows. Without this
    // the check could be passing for some unrelated reason.
    const dar = { testidler: IDS, referansGenislik: 1920, genislikler: [1280] };
    const kirik = await robustDogrula({ ...dar, url: url('header-fixed.html') });
    const saglam = await robustDogrula({ ...dar, url: url('header-flex.html') });
    assert.ok(kirik.ozet.hata > 0, 'kırık kurulum hata vermeliydi');
    assert.equal(saglam.ozet.hata, 0, 'sağlam kurulum temiz olmalıydı');
  });

  test('TARAYICI: yatay taşma yakalanıyor', async () => {
    const r = await robustDogrula({
      url: url('tasan.html'), testidler: ['genis'], genislikler: [1280],
    });
    assert.ok(r.genislikler[0].bulgular.some((b) => b.tur === 'yatay-tasma'));
  });

  test('TARAYICI: beş genişlik TEK komutta, süre makul', async () => {
    const t = Date.now();
    const r = await robustDogrula({ url: url('header-flex.html'), testidler: IDS });
    assert.equal(r.genislikler.length, 5);
    assert.ok(Date.now() - t < 20000, `çok yavaş: ${Date.now() - t} ms`);
  });
}
