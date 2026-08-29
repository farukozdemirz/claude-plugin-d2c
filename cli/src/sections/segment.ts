/**
 * Bölüm haritası — scenegraph geometrisinden, probe/screenshot OLMADAN.
 *
 * `segmentation.md`'deki doğrulanmış yöntem iki sinyali birleştiriyordu:
 *   1. Tam genişlik zemin dikdörtgenleri (XD probe) — OTORİTER bölüm sınırları
 *   2. Boş satır analizi (ekran görüntüsü) — bantsız bölgeleri böler
 *
 * Burada ikisi de `design.json`'dan çıkıyor. Yöntem aynı; girdisi artık deterministik.
 */
import type { Design, Eleman, ArtboardOlcu } from '../contracts/design.js';
import { SECTIONS_SCHEMA_VERSION, type SectionMap, type Bolum } from '../contracts/sections.js';

export interface SegmentSecenek {
  viewport?: 'desktop' | 'mobil';
  /** Ayraç sayılacak en küçük boş koşu (tasarım px). section-map.py ile aynı varsayılan. */
  bosluk?: number;
  /** İçerik sütunu kenar boşluğu — kenardaki dekoratif şeritler bölüm sanılmasın. */
  gutter?: number;
  /** Bu yükseklikten kısa bloklar gürültü sayılır. */
  minYukseklik?: number;
}

export interface Kutulu { el: Eleman; o: ArtboardOlcu; x: number; y: number; w: number; h: number }

export const kutula = (els: Eleman[], vp: 'desktop' | 'mobil'): Kutulu[] =>
  els
    .map((el) => {
      const o = el[vp];
      if (!o) return null;
      const [x, y, w, h] = o.kutu;
      return { el, o, x, y, w, h };
    })
    .filter((v): v is Kutulu => v !== null);

/**
 * Tam genişlik bantları bulur.
 *
 * Üç şart — üçü de `segmentation.md`'deki probe davranışının SEBEBİ:
 *   · `w ≥ 0.9·W`      — "genişliği artboard'ın %90'ından büyük" (birebir aynı kural)
 *   · sol kenar şeridini kapsar — eski yöntem `x ≈ 8`'den tarıyordu; oradan görünmeyen
 *     eleman bant değildir. (Doğrulanmış: `Path 8257` w=1312 yani %91, ama x=64 olduğu
 *     için bant DEĞİL — bölüm içi bir eleman.)
 *   · artboard'ın kendisi elenir (`w == W && h == H`)
 *
 * Sonra **kapsayan adaylar elenir**: başka bir bandı tümüyle içine alan aday, bölüm
 * sınırı değil dış kutudur. (Doğrulanmış: `Rectangle 386` y=0 h=180, içinde
 * `Rectangle 387` ve `Rectangle 388` var.)
 */
export function bantlariBul(kutular: Kutulu[], W: number, H: number, kenarSeridi = 8): Kutulu[] {
  const aday = kutular.filter(
    (k) =>
      k.w >= 0.9 * W &&
      k.x <= kenarSeridi &&
      k.x + k.w >= W - kenarSeridi &&
      k.h >= 8 &&
      !(Math.abs(k.w - W) < 1 && Math.abs(k.h - H) < 1)
  );
  const kapsiyor = (a: Kutulu, b: Kutulu) =>
    a !== b && a.y <= b.y + 0.5 && a.y + a.h >= b.y + b.h - 0.5 && a.h > b.h + 0.5;
  return aday.filter((a) => !aday.some((b) => kapsiyor(a, b))).sort((p, q) => p.y - q.y);
}

/**
 * İçerik sütununda hiçbir elemanın örtmediği dikey aralıkları bulur.
 * `section-map.py`'ın "boş satır koşusu" analizinin geometrik karşılığı.
 */
export function bosluklariBul(
  kutular: Kutulu[],
  W: number,
  H: number,
  gutter: number,
  esik: number
): Array<[number, number]> {
  const x0 = gutter;
  const x1 = W - gutter;
  const araliklar = kutular
    .filter((k) => k.x < x1 && k.x + k.w > x0 && k.h > 0.5 && k.w > 0.5)
    .map((k) => [k.y, k.y + k.h] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const bosluk: Array<[number, number]> = [];
  let kapak = 0;
  for (const [a, b] of araliklar) {
    if (a - kapak >= esik) bosluk.push([kapak, a]);
    kapak = Math.max(kapak, b);
  }
  if (H - kapak >= esik) bosluk.push([kapak, H]);
  return bosluk;
}

/** Bölümün üst üçte birindeki en büyük puntolu metin. */
export function baslikBul(kutular: Kutulu[], y: number, h: number): Kutulu | null {
  const sinir = y + h / 3;
  const adaylar = kutular.filter(
    (k) =>
      k.el.tip === 'metin' &&
      k.el.font?.punto &&
      k.y >= y - 0.5 &&
      k.y < sinir &&
      (k.el.metin ?? '').trim()
  );
  if (!adaylar.length) return null;
  return adaylar.sort((a, b) => b.el.font!.punto! - a.el.font!.punto! || a.y - b.y)[0]!;
}

/**
 * Bölümü örten en büyük alanlı dolgulu eleman → zemin rengi.
 * Bölüm bir BANT ise bandın kendi rengi otoriterdir: dış kapsayıcı (ör. `Rectangle 386`
 * y=0 h=180 beyaz) daha büyük alanlı olduğu için yanlış kazanırdı.
 */
function zeminBul(kutular: Kutulu[], y: number, h: number, W: number): string | null {
  const ortY = y + h / 2;
  const orten = kutular.filter(
    (k) => k.o.dolgu && k.y <= ortY && k.y + k.h >= ortY && k.w >= 0.5 * W
  );
  if (!orten.length) return null;
  return orten.sort((a, b) => b.w * b.h - a.w * a.h)[0]!.o.dolgu ?? null;
}

export function segment(design: Design, sec: SegmentSecenek = {}): SectionMap {
  const vp = sec.viewport ?? 'desktop';
  const ab = design.ekran[vp];
  if (!ab) throw new Error(`design.json'da "${vp}" artboard'ı yok`);
  const [W, H] = ab.boyut;
  const bosluk = sec.bosluk ?? 40;
  const gutter = sec.gutter ?? 64;
  const minY = sec.minYukseklik ?? 24;

  const kutular = kutula(design.elemanlar, vp);
  const bantlar = bantlariBul(kutular, W, H);

  // Bant otoritesi: bant kenarları HER ZAMAN sınır; bandın İÇİ bölünmez.
  const bantIci = (y: number) => bantlar.find((b) => b.y + 1 < y && y < b.y + b.h - 1);

  const sinirlar = new Set<number>([0, H]);
  for (const b of bantlar) {
    sinirlar.add(b.y);
    sinirlar.add(b.y + b.h);
  }
  for (const [a, b] of bosluklariBul(kutular, W, H, gutter, bosluk)) {
    const orta = (a + b) / 2;
    if (orta <= 1 || orta >= H - 1) continue;
    if (bantIci(orta)) continue;
    sinirlar.add(+orta.toFixed(2));
  }

  const sirali = [...sinirlar].filter((v) => v >= 0 && v <= H).sort((a, b) => a - b);
  const bolumler: Bolum[] = [];
  for (let i = 0; i < sirali.length - 1; i++) {
    const y = sirali[i]!;
    const h = sirali[i + 1]! - y;
    if (h < minY) continue;
    const bant = bantlar.find((b) => Math.abs(b.y - y) < 0.5 && Math.abs(b.h - h) < 0.5);
    const bas = baslikBul(kutular, y, h);
    const zemin = bant ? (bant.o.dolgu ?? null) : zeminBul(kutular, y, h, W);
    bolumler.push({
      index: bolumler.length + 1,
      y: +y.toFixed(1),
      h: +h.toFixed(1),
      zemin,
      bant: bant?.el.ad ?? null,
      ad: bas ? (bas.el.metin ?? '').trim() || null : null,
      baslik: bas
        ? {
            metin: (bas.el.metin ?? '').trim(),
            punto: bas.el.font?.punto ?? null,
            satir: bas.el.font?.satir ?? null,
            aile: bas.el.font?.aile ?? null,
            agirlik: bas.el.font?.agirlik ?? null,
            renk: bas.el.font?.renk ?? null,
            kutu: [bas.x, bas.y, bas.w, bas.h],
          }
        : null,
    });
  }

  // İÇİNDE ELEMAN OLMAYAN bölüm, bölüm değildir — komşusuna birleştirilir.
  //
  // İki gerçek durumun kökü bu: (a) bir bandın hemen öncesindeki boşluk, gap
  // midpoint'i yüzünden 46 px'lik sahte bir bölüm üretiyordu; (b) artboard sonundaki
  // boş alan ikiye bölünüyordu. Boşluk bandın/komşunun kendi payıdır, ayrı bölüm değil.
  const doluMu = (y: number, h: number) =>
    kutular.some((k) => k.h > 0.5 && k.w > 0.5 && k.y < y + h - 0.5 && k.y + k.h > y + 0.5);

  for (let i = bolumler.length - 1; i >= 0; i--) {
    const b = bolumler[i]!;
    if (doluMu(b.y, b.h) || bolumler.length === 1) continue;
    // Bant bölümü asla birleştirilmez — bant otoriterdir.
    if (b.bant) continue;
    const onceki = bolumler[i - 1];
    const sonraki = bolumler[i + 1];
    // Bant OLMAYAN bir komşu yoksa birleştirme YAPILMAZ: boş bloğu banda eklemek
    // bandın yüksekliğini bozar ve "bant otoriterdir" kuralını ihlal eder.
    if (onceki && !onceki.bant) { onceki.h = +(onceki.h + b.h).toFixed(1); bolumler.splice(i, 1); }
    else if (sonraki && !sonraki.bant) { sonraki.y = b.y; sonraki.h = +(sonraki.h + b.h).toFixed(1); bolumler.splice(i, 1); }
  }
  bolumler.forEach((b, i) => { b.index = i + 1; });

  return {
    schemaVersion: SECTIONS_SCHEMA_VERSION,
    ekran: design.ekran.ad,
    viewport: vp,
    artboardId: ab.artboardId,
    tasarim: [W, H],
    bantlar: bantlar.map((b) => ({
      y: +b.y.toFixed(1),
      h: +b.h.toFixed(1),
      ad: b.el.ad,
      renk: b.o.dolgu ?? null,
    })),
    bolumler,
  };
}
