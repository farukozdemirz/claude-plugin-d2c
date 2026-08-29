/**
 * GOLDEN TEST — Faz 1'in ana kabul ölçütü.
 *
 * `fixtures/benchmark.json`'daki bilinen-doğru değerler BİREBİR üretilmeli (tolerans
 * yok — aynı kaynağın türevleri). İki `referans_duzeltmesi` özellikle kritik: eski araç
 * bunları piksel oturtmayla bulmuştu ve elle yazılmış referansın YANLIŞ olduğunu
 * kanıtlamıştı.
 *
 * Tamamen ÇEVRİMDIŞI: kayıtlı AGC fixture'ları üzerinden koşar. Fixture yoksa
 * test ATLANIR ve sebebini söyler (sessizce geçmez).
 */
import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flatten, toArtboardBox } from '../dist/lib.mjs';
import { fileURLToPath } from 'node:url';

const FIX = fileURLToPath(new URL('./fixtures/canli/', import.meta.url));
const BENCH = fileURLToPath(new URL('../../fixtures/benchmark.json', import.meta.url));

const eksik = [];
if (!existsSync(BENCH)) eksik.push('fixtures/benchmark.json');
if (!existsSync(join(FIX, 'manifest.json'))) eksik.push('cli/test/fixtures/canli/manifest.json');

if (eksik.length) {
  skip(`golden testi atlandı — eksik: ${eksik.join(', ')}. ` +
       `Yakalamak için: node test/capture-fixtures.mjs <xd-url> "<ekran>"…`);
} else {
  const bench = JSON.parse(readFileSync(BENCH, 'utf8'));
  const manifest = JSON.parse(readFileSync(join(FIX, 'manifest.json'), 'utf8')).manifest;
  const slug = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

  /** Bir artboard'ı fixture'dan yükleyip artboard-göreli elemanlara çevirir. */
  const yukle = (artboardId) => {
    const ab = manifest.artboards.find((a) => a.id === artboardId);
    if (!ab) return null;
    const f = join(FIX, `${slug(ab.name)}.agc.json`);
    if (!existsSync(f)) return null;
    const { elemanlar } = flatten(JSON.parse(readFileSync(f, 'utf8')));
    const org = { x: ab.bounds.x, y: ab.bounds.y };
    return {
      ab,
      bul: (ad) => elemanlar
        .filter((e) => e.ad === ad)
        .map((e) => ({ el: e, kutu: toArtboardBox(e, org) }))
        .filter((x) => x.kutu),
      metin: (t) => elemanlar
        .filter((e) => e.tip === 'metin' && e.olcu.metin.trim() === t)
        .map((e) => ({ el: e, kutu: toArtboardBox(e, org) })),
    };
  };

  const r2 = (v) => Math.round(v * 100) / 100;
  const yakin = (a, b) => Math.abs(a - b) < 0.005;

  const ekran = (id) => bench.ekranlar.find((e) => e.id === id);

  // ── ekran (a) ──────────────────────────────────────────────────────────────
  test('golden (a) — özet barı: kutu + radius 12 [REFERANS DÜZELTMESİ]', () => {
    const D = yukle(ekran('a').desktop.screen);
    assert.ok(D, 'desktop fixture yok');
    const b = ekran('a').beklenen.ozet_bari;
    const [x, y, w, h] = b.desktop.kutu;
    const hit = D.bul(b.desktop.eleman).find((c) => yakin(c.kutu.x, x) && yakin(c.kutu.y, y));
    assert.ok(hit, `${b.desktop.eleman} ${x},${y} bulunamadı`);
    assert.equal(r2(hit.kutu.w), w);
    assert.equal(r2(hit.kutu.h), h);
    // Eski araç bunu dpr-3 screenshot + en küçük karelerle 11.34 bulmuştu.
    assert.deepEqual(hit.el.olcu.radius, [12, 12, 12, 12]);
    assert.equal(hit.el.olcu.radiusKaynak, 'yol');
    assert.equal(hit.el.dolgu, b.renk);
  });

  test('golden (a) — mobil bar 343×80 radius 8 [REFERANS DÜZELTMESİ]', () => {
    const M = yukle(ekran('a').mobil.screen);
    assert.ok(M, 'mobil fixture yok');
    const b = ekran('a').beklenen.ozet_bari.mobil;
    const [x, y, w, h] = b.kutu;
    const hit = M.bul(b.eleman)[0];
    assert.ok(hit, `${b.eleman} bulunamadı`);
    // Elle yazılan referans 343×95 diyordu; ölçüm 343×80 dedi ve ölçüm kazandı.
    assert.deepEqual([r2(hit.kutu.x), r2(hit.kutu.y), r2(hit.kutu.w), r2(hit.kutu.h)], [x, y, w, h]);
    assert.deepEqual(hit.el.olcu.radius, [b.radius, b.radius, b.radius, b.radius]);
  });

  test('golden (a) — yorum kartı 316×204, 1px #D7DFE9, radius 12', () => {
    const D = yukle(ekran('a').desktop.screen);
    const b = ekran('a').beklenen.kart;
    const kartlar = D.bul(b.eleman);
    assert.ok(kartlar.length >= 1, `${b.eleman} bulunamadı`);
    const k = kartlar[0];
    assert.deepEqual([r2(k.kutu.w), r2(k.kutu.h)], b.boyut);
    assert.deepEqual(k.el.olcu.radius, [b.radius, b.radius, b.radius, b.radius]);
    assert.equal(k.el.kontur.genislik, 1);
    assert.equal(k.el.kontur.renk, '#D7DFE9');
  });

  test('golden (a) — başlık: Tobias TRIAL Light 48, kutu ve genişlik', () => {
    const D = yukle(ekran('a').desktop.screen);
    const b = ekran('a').beklenen.baslik;
    const t = D.metin('Ürün Yorumları')[0];
    assert.ok(t, 'başlık metni bulunamadı');
    const [x, y, w, h] = b.desktop.kutu;
    assert.equal(r2(t.kutu.x), x);
    assert.equal(r2(t.kutu.y), y);          // taban çizgisi → çerçeve üstü dönüşümü
    assert.equal(Math.round(t.kutu.w), w);  // benchmark yuvarlak: 319 (ölçüm 318.55)
    assert.equal(r2(t.kutu.h), h);
    assert.equal(t.el.olcu.font.aile, b.aile);
    assert.equal(t.el.olcu.font.agirlik, b.agirlik);
    assert.equal(t.el.olcu.font.punto, b.desktop.punto);
    assert.equal(t.el.olcu.font.renk, b.renk);
  });

  // ── ekran (b) ──────────────────────────────────────────────────────────────
  test('golden (b) — bölüm zemini #F9FAFB ve kart 640×248.89', () => {
    const D = yukle(ekran('b').desktop.screen);
    assert.ok(D, 'desktop fixture yok');
    const bb = ekran('b').beklenen;
    const z = D.bul(bb.bolum_zemini.eleman)[0];
    assert.ok(z, 'bölüm zemini bulunamadı');
    assert.deepEqual([r2(z.kutu.x), r2(z.kutu.y), r2(z.kutu.w), r2(z.kutu.h)], bb.bolum_zemini.kutu);
    assert.equal(z.el.dolgu, bb.bolum_zemini.renk);
    const k = D.bul(bb.kart.eleman)[0];
    assert.ok(k, 'kart bulunamadı');
    assert.deepEqual([r2(k.kutu.w), r2(k.kutu.h)], bb.kart.desktop.boyut);
    assert.deepEqual(k.el.olcu.radius, [bb.kart.radius, bb.kart.radius, bb.kart.radius, bb.kart.radius]);
  });

  test('golden (b) — mobil ürün barı 343×95', () => {
    const M = yukle(ekran('b').mobil.screen);
    assert.ok(M, 'mobil fixture yok');
    const b = ekran('b').beklenen.urun_bari.mobil;
    const hit = M.bul(b.eleman)[0];
    assert.ok(hit, `${b.eleman} bulunamadı`);
    assert.deepEqual([r2(hit.kutu.w), r2(hit.kutu.h)], b.kutu.slice(2));
  });

  // ── ekran (c) ──────────────────────────────────────────────────────────────
  test('golden (c) — panel 500×1080 radius 24 ve gönder 436×64 radius 8', () => {
    const D = yukle(ekran('c').desktop.screen);
    assert.ok(D, 'desktop fixture yok');
    const bc = ekran('c').beklenen;
    const p = D.bul(bc.panel.eleman)[0];
    assert.ok(p, 'panel bulunamadı');
    assert.deepEqual([r2(p.kutu.x), r2(p.kutu.y), r2(p.kutu.w), r2(p.kutu.h)], bc.panel.desktop.kutu);
    assert.deepEqual(p.el.olcu.radius, Array(4).fill(bc.panel.desktop.radius));
    const g = D.bul(bc.gonder.eleman)[0];
    assert.deepEqual([r2(g.kutu.w), r2(g.kutu.h)], bc.gonder.desktop.boyut);
    assert.deepEqual(g.el.olcu.radius, Array(4).fill(bc.gonder.radius));
    assert.equal(g.el.dolgu, bc.gonder.renk);
  });

  test('golden (c) — kapatma butonu çemberi 47.2×47.2 [eski araçta ÇÖZÜLEMEDİ]', () => {
    const D = yukle(ekran('c').desktop.screen);
    const b = ekran('c').beklenen.kapatma_butonu;
    const hit = D.bul(b.eleman)[0];
    // Eski araçta bu eleman "yalnız glif seçilebiliyor" diye ölçülemiyordu.
    assert.ok(hit, `${b.eleman} bulunamadı`);
    assert.deepEqual([r2(hit.kutu.w), r2(hit.kutu.h)], b.boyut);
    assert.equal(hit.el.kontur.genislik, 1);
    assert.equal(hit.el.kontur.renk, '#0C2380');
    assert.equal(hit.el.kontur.hiza, 'center', 'XD Center Stroke');
  });

  test('golden (c) — toggle ray 40×24 ve top 16×16', () => {
    const D = yukle(ekran('c').desktop.screen);
    const t = ekran('c').beklenen.toggle;
    const ray = D.bul(t.ray.eleman)[0];
    const top = D.bul(t.top.eleman)[0];
    assert.ok(ray && top, 'toggle parçaları bulunamadı');
    assert.deepEqual([r2(ray.kutu.w), r2(ray.kutu.h)], t.ray.boyut);
    assert.deepEqual([r2(top.kutu.w), r2(top.kutu.h)], t.top.boyut);
    assert.equal(ray.el.dolgu, t.ray.renk);
    assert.equal(top.el.dolgu, t.top.renk);
  });

  test('golden (c) — textarea 435.5×223.5 radius 8, 1px #D7DFE9', () => {
    const D = yukle(ekran('c').desktop.screen);
    const b = ekran('c').beklenen.textarea;
    const hit = D.bul(b.eleman)[0];
    assert.ok(hit, `${b.eleman} bulunamadı`);
    assert.deepEqual([r2(hit.kutu.w), r2(hit.kutu.h)], b.desktop.boyut);
    assert.deepEqual(hit.el.olcu.radius, Array(4).fill(b.radius));
    assert.equal(hit.el.kontur.renk, '#D7DFE9');
  });
}
