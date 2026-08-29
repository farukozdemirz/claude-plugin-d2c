/**
 * Render doğrulama testleri — GERÇEK tarayıcı, AMA AĞ YOK.
 * Statik HTML fixture'ları `file://` ile açılır.
 */
import { test, before, after, skip } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tarayiciAc, viewportAyarla, viewportHatasi, sayfayiOlc, elemaniKarsilastir, baglamKur,
  pariteHesapla, dogrula, testidKontrol, KABUL_SEBEPLERI,
} from '../dist/lib.mjs';

const SAYFA = fileURLToPath(new URL('./fixtures/sayfa/', import.meta.url));
const url = (f) => `file://${join(SAYFA, f)}`;

// Modülün kurulu olması yetmez: sistemde açılabilir bir Chrome de olmalı.
// Yalnız import'a bakmak, Chrome'suz bir CI'da testleri ATLAMAK yerine KIRIYORDU.
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

// ── saf fonksiyonlar (tarayıcısız) ────────────────────────────────────────────
const hedefEl = (over = {}) => ({
  id: 'e', ad: 'Kart', tip: 'rect', rol: null, testid: 'kart', ebeveyn: null, sira: 0,
  desktop: { kutu: [0, 0, 316, 204], radius: [12, 12, 12, 12], radiusKaynak: 'rect',
             dolgu: '#FFFFFF', kontur: { genislik: 1, renk: '#D7DFE9', hiza: 'center' } },
  ...over,
});
const olculenEl = (over = {}) => ({
  bulundu: true, adet: 1, x: 0, y: 0, w: 316, h: 204, yRel: 0,
  padding: '0px 0px 0px 0px', gap: 'normal', rowGap: 'normal', columnGap: 'normal',
  radius: '12px', border: '1px solid #D7DFE9',
  font: '', fontSize: '', lineHeight: '', fontWeight: '', fontFamily: '', letterSpacing: '',
  color: '#000000', background: '#FFFFFF', aralikYatay: null, aralikDikey: null,
  ...over,
});
const ctx = (kabul = ['border-box']) =>
  baglamKur({ kabulEdilenSapmalar: kabul }, 'desktop', []);

test('tolerans: ±3px geçer, 4px sapar', () => {
  const a = elemaniKarsilastir(hedefEl(), olculenEl({ w: 318 }), ctx());
  assert.equal(a.farklar.find((f) => f.alan === 'genişlik').durum, 'gecti');
  const b = elemaniKarsilastir(hedefEl(), olculenEl({ w: 324 }), ctx([]));
  assert.equal(b.farklar.find((f) => f.alan === 'genişlik').durum, 'sapan');
});

test('renk BİREBİR — 1 birim fark bile sapar', () => {
  const r = elemaniKarsilastir(hedefEl(), olculenEl({ background: '#FFFFFE' }), ctx());
  assert.equal(r.farklar.find((f) => f.alan === 'arka plan').durum, 'sapan');
});

test('kabul edilen sapma SINIRLI — sınır içi kabul', () => {
  const r = elemaniKarsilastir(hedefEl(), olculenEl({ w: 320 }), ctx(['border-box']));
  const f = r.farklar.find((x) => x.alan === 'genişlik');
  assert.equal(f.durum, 'kabul');
  assert.match(f.sebep, /Center Stroke/);
});

test('kabul edilen sapma SINIRSIZ DEĞİL — büyük fark GİZLENMEZ', () => {
  // Bu gerçekten oldu: ilk implementasyonda 1664px fark "kabul" çıkıyordu.
  const r = elemaniKarsilastir(hedefEl(), olculenEl({ w: 1440 }), ctx(['border-box']));
  const f = r.farklar.find((x) => x.alan === 'genişlik');
  assert.equal(f.durum, 'sapan', 'sınırı aşan fark KABUL sayılmamalı');
  assert.match(f.sebep, /açıklanamaz/);
});

test('kabul sebeplerinin hepsinin bir sınırı var', () => {
  for (const [ad, k] of Object.entries(KABUL_SEBEPLERI)) {
    assert.ok(typeof k.sinirPx === 'number', `${ad} sınırsız`);
    if (ad !== 'font-eksik') assert.ok(k.sinirPx < 100, `${ad} sınırı çok geniş: ${k.sinirPx}`);
  }
});

test('font eksikse metin satırı UYARI — sapan DEĞİL', () => {
  const c = baglamKur({ kabulEdilenSapmalar: [] }, 'desktop', ['Tobias TRIAL']);
  const h = hedefEl({
    tip: 'metin', desktop: { kutu: [0, 0, 100, 20] },
    font: { aile: 'Tobias TRIAL', agirlik: 'Light', punto: 48, satir: 56, ls: 0,
            renk: '#0C2380', hiza: null, fontKutusuAgc: 56, fontKutusuKaynak: 'tarayici', yariSatir: null },
  });
  const r = elemaniKarsilastir(h, olculenEl({ h: 20, w: 100, fontFamily: 'Arial', fontSize: '48px', lineHeight: '56px', color: '#0C2380' }), c);
  const aile = r.farklar.find((f) => f.alan === 'font ailesi');
  assert.equal(aile.durum, 'uyari', 'font eksikken ✗ değil ⚠ olmalı');
});

test('eleman bulunamazsa sapan', () => {
  const r = elemaniKarsilastir(hedefEl(), olculenEl({ bulundu: false }), ctx());
  assert.equal(r.bulundu, false);
  assert.equal(r.farklar[0].durum, 'sapan');
});

test('testid boşsa ÖLÇÜLMEZ', () => {
  const bos = { elemanlar: [{ testid: null }, { testid: null }] };
  assert.match(testidKontrol(bos), /ÖLÇÜM YAPILMADI/);
  assert.equal(testidKontrol({ elemanlar: [{ testid: 'x' }, { testid: null }] }), null);
});

test('POC-4: parite aile başına, tek punto sapsa bile tarayıcı korunur', () => {
  const olcum = {
    fontKutulari: [
      { aile: 'Bw Modelica', punto: 16, kutu: 20, oran: 1.25 },
      { aile: 'Bw Modelica', punto: 24, kutu: 29, oran: 1.208 },
      { aile: 'Tobias', punto: 48, kutu: 66, oran: 1.375 },
    ],
    fontlar: [{ aile: 'Bw Modelica', yuklu: true }, { aile: 'Tobias', yuklu: true }],
  };
  const agc = new Map([['Bw Modelica|16', 20], ['Bw Modelica|24', 29], ['Tobias|48', 56]]);
  const p = pariteHesapla(olcum, agc);
  assert.equal(p.kararlar['Bw Modelica'], 'agc');
  assert.equal(p.kararlar['Tobias'], 'tarayici', 'sapan aile için tarayıcı ölçümü korunmalı');
  assert.equal(p.satirlar.find((r) => r.aile === 'Tobias').fark, 10);
});

test('POC-4: AGC karşılığı olmayan aile güvenli tarafta kalır', () => {
  const p = pariteHesapla(
    { fontKutulari: [], fontlar: [{ aile: 'Inter', yuklu: true }] },
    new Map()
  );
  assert.equal(p.kararlar['Inter'], 'tarayici');
});

/**
 * Kaydırma çubuğu telafisi — sahte Page ile.
 *
 * Gerçek tarayıcıda bu dal, çalıştıran makinenin kaydırma çubuğu rejimine bağlı
 * (overlay çubukta hiç tetiklenmiyor). Ortama bağlı bir testin "yeşil" olması
 * dalın çalıştığını KANITLAMAZ — bu yüzden dal burada doğrudan koşuluyor.
 */
function sahtePage(clientWidthFn) {
  let w = 0;
  return {
    gecmis: [],
    async setViewportSize({ width }) { w = width; this.gecmis.push(width); },
    async waitForTimeout() {},
    async evaluate() { return clientWidthFn(w); },
  };
}

test('telafi: klasik kaydırma çubuğu 15px yiyorsa emülasyon büyütülür', async () => {
  // clientWidth = emüle - 15  → 1440 istemek için 1455 emüle edilmeli
  const p = sahtePage((w) => w - 15);
  const v = await viewportAyarla(p, 1440);
  assert.deepEqual(p.gecmis, [1440, 1455], 'önce hedef, sonra telafili denenmeli');
  assert.equal(v.emuleEdilen, 1455);
  assert.equal(v.clientWidth, 1440);
  assert.equal(v.dogrulandi, true);
});

test('telafi: overlay çubukta GEREKSİZ telafi yapılmaz', async () => {
  const p = sahtePage((w) => w);
  const v = await viewportAyarla(p, 1440);
  assert.deepEqual(p.gecmis, [1440], 'ikinci deneme yapılmamalı');
  assert.equal(v.emuleEdilen, 1440);
  assert.equal(v.dogrulandi, true);
});

test('telafi TUTMAZSA ölçüm yapılmaz — sessizce yanlış viewport yok', async () => {
  // Beklenmedik bir çubuk genişliği (ör. 17px): telafi hedefi tutturamaz.
  const p = sahtePage((w) => w - 17);
  const v = await viewportAyarla(p, 1440);
  assert.equal(v.dogrulandi, false);
  assert.match(viewportHatasi(v), /ÖLÇÜM YAPILMADI/);
  assert.match(viewportHatasi(v), /1438/);
});

// ── gerçek tarayıcı ───────────────────────────────────────────────────────────
if (!pwVar) {
  skip(`tarayıcı testleri atlandı — ${pwNeden}`);
} else {
  let oturum;
  before(async () => { oturum = await tarayiciAc({}); });
  after(async () => { await oturum?.kapat(); });

  test('TARAYICI: viewport ayarlanır ve DOĞRULANIR', async () => {
    await oturum.page.goto(url('bilinen.html'));
    const v = await viewportAyarla(oturum.page, 1440);
    assert.equal(v.dogrulandi, true);
    assert.equal(v.clientWidth, 1440);
  });

  test('TARAYICI: dar viewport (375) gerçekten 375 olur', async () => {
    await oturum.page.goto(url('bilinen.html'));
    const v = await viewportAyarla(oturum.page, 375);
    assert.equal(v.clientWidth, 375);
  });

  test('TARAYICI: DİKEY taşan sayfa hedef genişlikte ölçülür', async () => {
    // troubleshooting.md'nin kayıtlı tuzağı: klasik kaydırma çubuğu ~15px yer kapar,
    // 1440'lık ölçüm 1425 çıkar, 1312'lik bar 1297 görünür.
    //
    // ÖLÇÜLDÜ: bu (headless) Chrome OVERLAY kaydırma çubuğu kullanıyor — genişlik
    // yemiyor, dolayısıyla telafi TETİKLENMİYOR. Tuzak klasik çubuklu ortamlara
    // (headed Chrome) özgü. Bu yüzden burada telafinin UYGULANDIĞI değil, SONUCUN
    // her iki rejimde de doğru olduğu iddia ediliyor; telafi dalının kendisi
    // aşağıdaki sahte-Page testinde deterministik olarak koşuyor.
    await oturum.page.goto(url('uzun.html'));
    const v = await viewportAyarla(oturum.page, 1440);
    assert.equal(v.dogrulandi, true, JSON.stringify(v));
    assert.equal(v.clientWidth, 1440, 'layout genişliği hedefe eşitlenmeli');

    const w = await oturum.page.evaluate(() =>
      document.querySelector('[data-testid="bar"]').getBoundingClientRect().width);
    assert.equal(Math.round(w), 1440, '%100 genişlikteki bar hedefe eşit ölçülmeli');
  });

  test('TARAYICI: dikey taşma YOKSA telafi uygulanmaz', async () => {
    // Her sayfaya 15px eklemek ters hata olurdu: taşmayan sayfa 1455'te ölçülürdü.
    await oturum.page.goto(url('bilinen.html'));
    const v = await viewportAyarla(oturum.page, 1440);
    assert.equal(v.dogrulandi, true, JSON.stringify(v));
    assert.equal(v.emuleEdilen, 1440, 'gereksiz telafi uygulanmış');
  });

  test('TARAYICI: yatay taşma tespit edilir', async () => {
    await oturum.page.goto(url('tasan.html'));
    await viewportAyarla(oturum.page, 800);
    const o = await sayfayiOlc(oturum.page, { testidler: ['genis'], aileler: [], fontCiftleri: [] });
    assert.equal(o.yatayTasma, true);
  });

  test('TARAYICI: rect + computedStyle birebir ölçülür', async () => {
    await oturum.page.goto(url('bilinen.html'));
    await viewportAyarla(oturum.page, 1440);
    const o = await sayfayiOlc(oturum.page, {
      testidler: ['kart', 'baslik'], kokTestid: 'bolum', aileler: [], fontCiftleri: [],
    });
    assert.equal(o.elemanlar.kart.w, 316);
    assert.equal(o.elemanlar.kart.h, 204);
    assert.equal(o.elemanlar.kart.radius, '12px');
    assert.match(o.elemanlar.kart.border, /^1px solid #D7DFE9$/);
    assert.equal(o.elemanlar.baslik.fontSize, '48px');
    assert.equal(o.elemanlar.baslik.color, '#0C2380');
  });

  test('TARAYICI: tekrar eden elemanın adedi ve aralığı', async () => {
    await oturum.page.goto(url('bilinen.html'));
    await viewportAyarla(oturum.page, 1440);
    const o = await sayfayiOlc(oturum.page, { testidler: ['kart'], aileler: [], fontCiftleri: [] });
    assert.equal(o.elemanlar.kart.adet, 3);
    assert.equal(o.elemanlar.kart.aralikYatay, 17, '333 adım − 316 genişlik');
  });

  test('TARAYICI: yüklü OLMAYAN font tespit edilir (fonts.check yalan söyler)', async () => {
    await oturum.page.goto(url('bilinen.html'));
    const o = await sayfayiOlc(oturum.page, {
      testidler: [], aileler: ['Bw Modelica Olmayan XYZ'], fontCiftleri: [],
    });
    assert.equal(o.fontlar[0].yuklu, false, 'canvas testi yüklü değil demeli');
  });

  test('TARAYICI: uyumlu sayfa → SIFIR sapma', async () => {
    const olcumYolu = '/tmp/d2c-verify-test-olcum.json';
    writeFileSync(olcumYolu, JSON.stringify(ORNEK_OLCUM));
    const v = await dogrula({ olcumYolu, url: url('bilinen.html') });
    assert.equal(v.durduruldu, null);
    assert.equal(v.ozet.sapan, 0, JSON.stringify(v.viewportlar[0].elemanlar, null, 1));
    assert.ok(v.ozet.gecen > 10);
  });

  test('TARAYICI: bozuk sayfa → punto, radius ve border rengi yakalanır', async () => {
    const olcumYolu = '/tmp/d2c-verify-test-olcum.json';
    writeFileSync(olcumYolu, JSON.stringify(ORNEK_OLCUM));
    const v = await dogrula({ olcumYolu, url: url('bozuk.html') });
    const sapanlar = v.viewportlar[0].elemanlar.flatMap((e) => e.farklar).filter((f) => f.durum === 'sapan');
    const alanlar = sapanlar.map((f) => f.alan).sort();
    assert.deepEqual(alanlar, ['border rengi', 'font-size', 'radius']);
  });

  test('TARAYICI: yanlış uygulama açılırsa ÖLÇMEZ', async () => {
    const olcumYolu = '/tmp/d2c-verify-test-olcum.json';
    writeFileSync(olcumYolu, JSON.stringify(ORNEK_OLCUM));
    await assert.rejects(
      () => dogrula({ olcumYolu, url: url('eksik.html') }),
      /hiçbiri bulunamadı|ÖLÇÜM YAPILMADI/
    );
  });

  test('TARAYICI: süre < 20 sn (hedef)', async () => {
    const olcumYolu = '/tmp/d2c-verify-test-olcum.json';
    writeFileSync(olcumYolu, JSON.stringify(ORNEK_OLCUM));
    const v = await dogrula({ olcumYolu, url: url('bilinen.html') });
    assert.ok(v.sureMs < 20_000, `${v.sureMs} ms`);
  });
}

const ORNEK_OLCUM = {
  schemaVersion: 1,
  kaynak: { design: '../design.json', ekran: 'test', modifiedDate: null, uretilme: '2026-08-28T00:00:00Z' },
  bolum: { index: 1, slug: 'test', ad: 'Test', desktop: [0, 0, 1440, 600], mobil: null, zemin: '#FFFFFF' },
  palet: [{ hex: '#0C2380', adet: 1 }],
  stiller: [{ aile: 'Arial', agirlik: 'Light', punto: 48, satir: 56, ls: 0, renk: '#0C2380',
              hiza: null, fontKutusuAgc: 56, fontKutusuKaynak: 'tarayici', yariSatir: null, adet: 1 }],
  elemanlar: [
    { id: 'e0', ad: 'Bolum', tip: 'rect', rol: 'bolum-zemini', testid: 'bolum', ebeveyn: null, sira: 0,
      desktop: { kutu: [0, 0, 1440, 600] } },
    { id: 'e1', ad: 'Baslik', tip: 'metin', rol: 'baslik', testid: 'baslik', ebeveyn: null, sira: 1,
      metin: 'Ürün',
      font: { aile: 'Arial', agirlik: 'Light', punto: 48, satir: 56, ls: 0, renk: '#0C2380',
              hiza: null, fontKutusuAgc: 56, fontKutusuKaynak: 'tarayici', yariSatir: null },
      desktop: { kutu: [0, 0, 319, 56] } },
    { id: 'e2', ad: 'Kart', tip: 'rect', rol: null, testid: 'kart', ebeveyn: null, sira: 2,
      tekrar: { adet: 3, duzenli: true, eksen: 'x', adim: 333 },
      desktop: { kutu: [0, 60, 316, 204], radius: [12, 12, 12, 12], radiusKaynak: 'rect',
                 dolgu: '#FFFFFF', kontur: { genislik: 1, renk: '#D7DFE9', hiza: 'center' } } },
  ],
  hesaplanan: [], referans: {},
  kabulEdilenSapmalar: ['border-box', 'metin-cercevesi'], cozulemedi: [],
};
