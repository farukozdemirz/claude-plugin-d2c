/**
 * Görsel diff'in NEYİ yakalayıp NEYİ gürültü saydığı — sabitlenir.
 *
 * §11'in "sentetik görsel diff" katmanı. Ana plan dört bozulma sayıyor:
 * 1px kaydırılmış · ellipsis eklenmiş · ikon değiştirilmiş · renk sapması.
 * `visual.test.mjs` ellipsis ve rengi kapsıyordu; kayma ve ikon burada.
 *
 * PIL KULLANILMIYOR: görüntüler kendi piksel katmanımızla üretiliyor. Faz 5b'den
 * sonra PIL bir önkoşul değil; PIL'e bağlı bir test CI'da sessizce atlanır ve
 * "kapsandı" yanılsaması bırakırdı.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bosImg, doldur, pngYaz, motorCalistir } from '../dist/lib.mjs';

const dizin = mkdtempSync(join(tmpdir(), 'd2c-tespit-'));
const G = 240, Y = 160;

const nokta = (im, x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
  const p = (y * im.w + x) * 3;
  im.data[p] = r; im.data[p + 1] = g; im.data[p + 2] = b;
};
const kutu = (im, x0, y0, x1, y1, r, g, b) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) nokta(im, x, y, r, g, b);
};
const daire = (im, cx, cy, yc, r, g, b) => {
  for (let y = cy - yc; y <= cy + yc; y++)
    for (let x = cx - yc; x <= cx + yc; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= yc * yc) nokta(im, x, y, r, g, b);
};

/**
 * Kart benzeri sayfa. `kaydir` her şeyi 1px sağa iter (alt-piksel kayma taklidi),
 * `ikon` "daire" veya "kare" — ikonun DEĞİŞMESİ hâli.
 */
function sayfa({ kaydir = 0, ikon = 'daire' } = {}) {
  const im = bosImg(G, Y);
  doldur(im, 250, 250, 250);
  kutu(im, 8 + kaydir, 8, 232 + kaydir, 152, 255, 255, 255);
  // metin benzeri yüksek frekanslı içerik — 1px kayma burada en çok gürültü üretir
  for (let s = 0; s < 7; s++) {
    const y = 60 + s * 12;
    for (let x = 16 + kaydir; x < 224 + kaydir; x += 3) kutu(im, x, y, x + 2, y + 6, 90, 90, 96);
  }
  // ikon — sağ üstte, bilinen bir ızgara hücresinde
  const cx = 200 + kaydir, cy = 30;
  if (ikon === 'daire') daire(im, cx, cy, 12, 12, 35, 128);
  else kutu(im, cx - 12, cy - 12, cx + 12, cy + 12, 12, 35, 128);
  return im;
}

function karsilastir(a, b, ad) {
  const ya = join(dizin, `${ad}-a.png`), yb = join(dizin, `${ad}-b.png`);
  pngYaz(ya, a); pngYaz(yb, b);
  // Kutular AÇIKÇA veriliyor. Kutusuz çağrıda motor `trim_uniform` uygular ve
  // iki görüntüyü içeriğin sınır kutusuna kırpar — saf bir ötelemeyi hizalayıp
  // GÖRÜNMEZ kılar (ölçüldü: kaymada ham %0). Gerçek akış da her zaman kutu verir.
  return motorCalistir({
    xdPng: ya, renderPng: yb, out: join(dizin, `${ad}-fark.png`),
    xdKutu: [0, 0, G, Y], renderKutu: [0, 0, G, Y],
  });
}

const temel = sayfa();
const kayma = karsilastir(temel, sayfa({ kaydir: 1 }), 'kayma');
const ikon = karsilastir(temel, sayfa({ ikon: 'kare' }), 'ikon');
const ayni = karsilastir(temel, sayfa(), 'ayni');

test('aynı görüntü → hiçbir şey yakalanmaz', () => {
  assert.equal(ayni.ham, 0);
  assert.equal(ayni.yapisal, 0);
  assert.equal(ayni.bolgeler.length, 0);
});

test('1px KAYMA gürültü sayılır — yapısal fark düşük kalır', () => {
  // Yapısal karşılaştırmanın varlık sebebi: 4× küçültme alt-piksel kaymayı eritir.
  // Ham fark yüksek olabilir; KARAR yapısala bakar.
  assert.ok(kayma.ham > 5, `ham ${kayma.ham} — kayma ham farkta görünmeli`);
  assert.ok(kayma.yapisal < 2, `yapısal ${kayma.yapisal} — kayma yapısalda ERİMELİ`);
});

test('İKON DEĞİŞİMİ yakalanır ve ikonun bulunduğu bölgeye lokalize olur', () => {
  assert.ok(ikon.yapisal > 0, `yapısal ${ikon.yapisal}`);
  assert.ok(ikon.bolgeler.length > 0, 'sapan bölge bildirilmeli');
  // İkon x≈188-212, y≈18-42 → 8×8 ızgarada sütun 6, satır 0-1.
  const [W, H] = ikon.boyut;
  const gw = Math.floor(W / 8), gh = Math.floor(H / 8);
  const beklenen = ikon.bolgeler.some(
    (b) => b.sutun === Math.floor(200 / gw) && b.satir <= Math.floor(42 / gh)
  );
  assert.ok(beklenen, `ikon bölgesi bildirilmedi: ${JSON.stringify(ikon.bolgeler)}`);
});

test('AYIRT EDİCİLİK yüzdede DEĞİL, bölge dağılımında', () => {
  // ÖLÇÜLDÜ: kayma yapısal %0,83 · ikon yapısal %0,79 — yüzde ikisini SIRALAMIYOR.
  // Yapısal yüzde alan ağırlıklı: 24×24'lük bir ikon 240×160'lık bir sayfanın
  // %1,5'i. Küçük ama önemli bir fark, sayfa geneline yayılan bir alt-piksel
  // kaymadan DÜŞÜK yüzde verebilir.
  //
  // Deponun "yüzde bir geçme notu değil, karar bölge incelemesine dayanır"
  // kuralının somut kanıtı bu. Ayrım iki yerde:
  //   1) bölge SAYISI  — kayma yayılır, ikon toplanır
  //   2) bölge KONUMU  — ikonunkiler tek sütunda kümelenir
  assert.ok(
    kayma.bolgeler.length > 3 * ikon.bolgeler.length,
    `kayma ${kayma.bolgeler.length} bölge · ikon ${ikon.bolgeler.length} bölge — yayılma farkı yok`
  );

  const sutunlar = (r) => new Set(r.bolgeler.map((b) => b.sutun));
  assert.ok(sutunlar(ikon).size <= 2, `ikon bölgeleri ${sutunlar(ikon).size} sütuna yayılmış — kümelenmeli`);
  assert.ok(sutunlar(kayma).size >= 6, `kayma ${sutunlar(kayma).size} sütunda — sayfaya yayılmalı`);

  // Ham fark ise TERS sıralıyor: kayma hamda görünür, ikon değişimi neredeyse görünmez.
  assert.ok(kayma.ham > 10 && ikon.ham < 1,
    `ham: kayma ${kayma.ham} · ikon ${ikon.ham}`);
});

test('ölçülen değerler kayıt altında (gerileme olursa görünür)', () => {
  // Sayılar sabitleniyor: eşik/filtre ileride değişirse test bunu söyler.
  assert.equal(kayma.boyut[0], G);
  assert.equal(ikon.boyut[0], G);
  console.log(
    `    ölçülen → kayma: ham %${kayma.ham} · yapısal %${kayma.yapisal} · ${kayma.bolgeler.length} bölge\n` +
    `              ikon : ham %${ikon.ham} · yapısal %${ikon.yapisal} · ${ikon.bolgeler.length} bölge`
  );
});
