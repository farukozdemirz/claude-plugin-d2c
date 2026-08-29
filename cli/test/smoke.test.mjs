/**
 * Contract smoke test — NO NETWORK.
 *
 * The acceptance criterion: *"the weekly smoke test warns when the contract breaks"*.
 * The "breakage" scenarios are PRODUCED here on a fixture; a test depending on a live
 * link would lose the green/red distinction whenever Adobe was unreachable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { degerlendir, smokeYaz } from '../dist/lib.mjs';

// SYNTHETIC data: the tests exercising the acceptance criterion must NOT depend on a
// live fixture. `cli/test/fixtures/live/` is design-file specific and gitignored — it
// does not exist in CI.
const AGC = {
  version: '1.5.0',
  children: [{
    type: 'artboard', id: 'ab1', name: 'Ekran',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    artboard: { children: [{
      type: 'shape', id: 's1', name: 'Kutu',
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 16, ty: 24 },
      shape: { type: 'rect', x: 0, y: 0, width: 100, height: 40 },
      style: { fill: { type: 'solid', color: { value: { r: 12, g: 35, b: 128 } } } },
    }] },
  }],
};

const MANIFEST = {
  artboards: [{
    id: 'ab1', name: 'Ekran',
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    components: [{ id: 'c1', rel: 'primary' }, { id: 't1', rel: 'thumbnail' }],
  }],
};

function proto(over = {}) {
  const gelecek = Math.floor(Date.now() / 1000) + 12 * 3600;
  return {
    manifest: MANIFEST,
    linkTemplate: { data: { access_token: `${gelecek}_urn:aaid:sc:EU:test;public_deadbeef` } },
    ...over,
  };
}

test('sağlıklı sözleşme → ok, çıkış kodu 0 olur', () => {
  const s = degerlendir(proto(), AGC, null, 'Ekran');
  assert.equal(s.seviye, 'ok', JSON.stringify(s.kontroller.filter((k) => k.seviye !== 'ok'), null, 1));
  assert.match(s.ozet, /sözleşme sağlam/);
  assert.ok(s.artboardSayisi > 0);
});

test('BOZULMA: access_token yok → hata', () => {
  const s = degerlendir(proto({ linkTemplate: { data: {} } }), AGC, null, 'x');
  assert.equal(s.seviye, 'hata');
  assert.match(s.ozet, /access_token/);
});

test('BOZULMA: token süresi dolmuş → hata', () => {
  const gecmis = Math.floor(Date.now() / 1000) - 60;
  const s = degerlendir(
    proto({ linkTemplate: { data: { access_token: `${gecmis}_urn:aaid:sc:EU:t;public_ab` } } }),
    AGC, null, 'x');
  assert.equal(s.seviye, 'hata');
});

test('BOZULMA: manifest.artboards boş → hata', () => {
  const p = proto();
  const s = degerlendir({ ...p, manifest: { ...p.manifest, artboards: [] } }, AGC, null, null);
  assert.equal(s.seviye, 'hata');
  assert.match(s.ozet, /artboards/);
});

test('BOZULMA: bilinmeyen AGC sürümü → uyarı, sessiz kalmaz', () => {
  // This is exactly the "Adobe changed the schema" case.
  const s = degerlendir(proto(), { ...AGC, version: '9.9.9' }, null, 'x');
  assert.equal(s.seviye, 'uyari');
  assert.match(smokeYaz(s), /bilinmeyen sürüm "9\.9\.9"/);
});

test('BOZULMA: AGC indirilemedi (content-type değişti) → hata', () => {
  const s = degerlendir(proto(), null, 'beklenen içerik tipi değil: "text/html"', 'x');
  assert.equal(s.seviye, 'hata');
  assert.match(s.ozet, /agc indirme/);
});

test('BOZULMA: düzleştirme hiç eleman vermiyor → hata', () => {
  const s = degerlendir(proto(), { version: '1.5.0', children: [] }, null, 'x');
  assert.equal(s.seviye, 'hata');
  assert.match(smokeYaz(s), /düzleştirme/);
});

test('KURAL 2: smoke çıktısında token GEÇMEZ', () => {
  const gelecek = Math.floor(Date.now() / 1000) + 3600;
  const tok = `${gelecek}_urn:aaid:sc:EU:gizli-olan;public_c0ffee1234`;
  const s = degerlendir(proto({ linkTemplate: { data: { access_token: tok } } }), AGC, null, 'x');
  const hepsi = JSON.stringify(s) + smokeYaz(s);
  assert.ok(!hepsi.includes(tok), 'ham token çıktıya sızdı');
  assert.ok(!hepsi.includes('c0ffee1234'), 'token public kısmı sızdı');
});

test('KURAL 2: AGC hata mesajındaki URL de redakte edilir', () => {
  const gelecek = Math.floor(Date.now() / 1000) + 3600;
  const tok = `${gelecek}_urn:aaid:sc:EU:x;public_beefcafe99`;
  const s = degerlendir(
    proto({ linkTemplate: { data: { access_token: tok } } }),
    null,
    `403: https://cdn.example/comp;revision=0?api_key=CometServer1&access_token=${tok}`,
    'x');
  const hepsi = JSON.stringify(s) + smokeYaz(s);
  assert.ok(!hepsi.includes('beefcafe99'), 'hata mesajındaki token sızdı');
});

test('rapor okunur ve seviyeyi başlıkta söyler', () => {
  const y = smokeYaz(degerlendir(proto(), AGC, null, 'Ekran'));
  assert.match(y, /^# xd smoke — OK/);
  assert.match(y, /✓ prototypeData/);
});

// ── extra verification when the real fixture is present (skipped otherwise — absent in CI) ──
const FIX = fileURLToPath(new URL('./fixtures/live/', import.meta.url));
const gercek = FIX + 'desktop-ürün-detay.agc.json';
test('GERÇEK FIXTURE: canlı AGC sözleşmesi sağlam',
  { skip: !existsSync(gercek) && 'canlı fixture yok' }, () => {
  const agc = JSON.parse(readFileSync(gercek, 'utf8'));
  const m = JSON.parse(readFileSync(FIX + 'manifest.json', 'utf8'));
  const gelecek = Math.floor(Date.now() / 1000) + 3600;
  const s = degerlendir(
    { manifest: m.manifest ?? m,
      linkTemplate: { data: { access_token: `${gelecek}_urn:aaid:sc:EU:t;public_ab` } } },
    agc, null, 'Desktop - Ürün Detay');
  assert.equal(s.seviye, 'ok',
    JSON.stringify(s.kontroller.filter((k) => k.seviye !== 'ok'), null, 1));
});
