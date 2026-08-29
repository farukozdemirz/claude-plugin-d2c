/**
 * Section map — from scenegraph geometry, WITHOUT probes or screenshots.
 *
 * The verified method in `segmentation.md` combined two signals:
 *   1. Full-width background rectangles (XD probe) — AUTHORITATIVE section boundaries
 *   2. Blank-row analysis (screenshot) — splits regions with no band
 *
 * Here both come out of `design.json`. The method is the same; its input is now
 * deterministic.
 */
import type { Design, Eleman, ArtboardOlcu } from '../contracts/design.js';
import { SECTIONS_SCHEMA_VERSION, type SectionMap, type Bolum } from '../contracts/sections.js';

export interface SegmentSecenek {
  viewport?: 'desktop' | 'mobil';
  /** The shortest blank run that counts as a separator (design px). Same default as section-map.py. */
  bosluk?: number;
  /** Content column margin — so decorative strips at the edge are not mistaken for sections. */
  gutter?: number;
  /** Blocks shorter than this height count as noise. */
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
 * Finds the full-width bands.
 *
 * Three conditions — all three are the REASON behind the probe behaviour in
 * `segmentation.md`:
 *   · `w ≥ 0.9·W`      — "wider than 90% of the artboard" (exactly the same rule)
 *   · it covers the left edge strip — the old method scanned from `x ≈ 8`; an element
 *     invisible from there is not a band. (Verified: `Path 8257` has w=1312, i.e. 91%,
 *     but because x=64 it is NOT a band — it is an element inside a section.)
 *   · the artboard itself is excluded (`w == W && h == H`)
 *
 * Then **containing candidates are dropped**: a candidate that fully contains another
 * band is an outer box, not a section boundary. (Verified: `Rectangle 386` y=0 h=180
 * contains `Rectangle 387` and `Rectangle 388`.)
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
 * Finds the vertical ranges no element covers inside the content column.
 * The geometric equivalent of `section-map.py`'s "blank row run" analysis.
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

/** The largest-point text in the section's top third. */
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
 * The filled element with the largest area covering the section → its background colour.
 * If the section IS a band, the band's own colour is authoritative: an outer container
 * (e.g. `Rectangle 386` y=0 h=180, white) would wrongly win on area.
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

  // Band authority: band edges are ALWAYS boundaries; the INSIDE of a band is not split.
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

  // A section with NO ELEMENTS INSIDE it is not a section — it is merged into a neighbour.
  //
  // Two real cases share this root: (a) the gap just before a band produced a fake 46 px
  // section because of the gap midpoint; (b) the empty area at the end of the artboard
  // was split in two. The gap belongs to the band/neighbour, it is not a section of its own.
  const doluMu = (y: number, h: number) =>
    kutular.some((k) => k.h > 0.5 && k.w > 0.5 && k.y < y + h - 0.5 && k.y + k.h > y + 0.5);

  for (let i = bolumler.length - 1; i >= 0; i--) {
    const b = bolumler[i]!;
    if (doluMu(b.y, b.h) || bolumler.length === 1) continue;
    // A band section is never merged — the band is authoritative.
    if (b.bant) continue;
    const onceki = bolumler[i - 1];
    const sonraki = bolumler[i + 1];
    // If there is no NON-band neighbour, NO merge happens: adding the empty block to a
    // band would corrupt the band's height and violate the "bands are authoritative" rule.
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
