/**
 * Target ↔ measurement comparison.
 *
 * The tolerances are taken **verbatim** from `agents/design-diff.md` §4:
 *
 *   | What                                                | Tolerance |
 *   |-----------------------------------------------------|-----------|
 *   | position, size, padding, gap, radius, border width   | ±3 px     |
 *   | colour (hex)                                         | NONE      |
 *   | font-size                                            | NONE      |
 *   | line-height, font-weight                             | NONE      |
 *
 * Accepted deviations are **not hidden**: they are reported with `durum: "kabul"` plus a
 * `sebep`, and do not count as `sapan`. When a font is missing, text-derived rows become
 * `uyari` — NOT `sapan` (design-diff's explicit rule).
 */
import type { Olcum, OlcumEleman } from '../contracts/olcum.js';
import type { Fark, ElemanSonucSchema } from '../contracts/verification.js';
import type { z } from 'zod';
import type { ElemanOlcum } from './measure.js';

export type ElemanSonuc = z.infer<typeof ElemanSonucSchema>;

/** Position/size tolerance — the same as design-diff. */
export const TOLERANS_PX = 3;

/**
 * Known and accepted deviations — each has an **UPPER BOUND**.
 *
 * The bound is essential: `border-box` is a ±2 px phenomenon. Unbounded acceptance would
 * label a 1664 px difference as "accepted" and hide a real deviation — the repo's
 * explicit rule forbids that ("no hiding, no loosening tolerances, no changing target
 * values"). This actually happened: in the first implementation a section height
 * difference of 600 → 2264 came out silently "accepted".
 *
 * A difference beyond the bound counts as **sapan**.
 */
export const KABUL_SEBEPLERI: Record<string, { aciklama: string; sinirPx: number }> = {
  'border-box': {
    aciklama: 'XD Center Stroke geometri kenarında durur, CSS border kutunun içine çizilir',
    sinirPx: 4, // 1px border × 2 kenar + yuvarlama payı
  },
  'metin-cercevesi': {
    aciklama: 'XD metin çerçevesi ≠ CSS satır kutusu — XD ≈1.25×punto, CSS line-height',
    sinirPx: 24, // en fazla bir satır kutusu kadar
  },
  'yaklasik-ikon': {
    aciklama: 'vektör ikon yaklaşık çizilmiş — kutu ve renk ölçülü, yol değil',
    sinirPx: 6,
  },
  'font-eksik': {
    aciklama: 'aile projede yüklü değil; metin kaynaklı ölçüler güvenilmez',
    sinirPx: Number.POSITIVE_INFINITY, // ölçüm zaten güvenilmez, büyüklük anlamsız
  },
};

const sayi = (v: string | number | null | undefined): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const m = v.match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};

/** `12px` / `12px 12px 12px 12px` → the first number. If the four corners differ, all are returned. */
const radiusSayilari = (css: string): number[] =>
  (css.match(/[\d.]+/g) ?? []).map(Number);

interface KarsilastirmaBaglam {
  kabulEdilenSapmalar: string[];
  eksikFontlar: Set<string>;
  viewport: 'desktop' | 'mobil';
}

function pxFark(
  alan: string,
  hedef: number | null,
  olculen: number | null,
  ctx: KarsilastirmaBaglam,
  kabulSebebi?: string
): Fark | null {
  if (hedef == null || olculen == null) return null;
  const fark = +(olculen - hedef).toFixed(2);
  if (Math.abs(fark) <= TOLERANS_PX) {
    return { alan, hedef, olculen, fark, durum: 'gecti' };
  }
  if (kabulSebebi && ctx.kabulEdilenSapmalar.includes(kabulSebebi)) {
    const kural = KABUL_SEBEPLERI[kabulSebebi];
    if (kural && Math.abs(fark) <= kural.sinirPx) {
      return { alan, hedef, olculen, fark, durum: 'kabul', sebep: kural.aciklama };
    }
    // Beyond the bound: it CANNOT be explained by the accepted deviation, it is real.
    return {
      alan, hedef, olculen, fark, durum: 'sapan',
      sebep: `"${kabulSebebi}" ile açıklanamaz — bu sapma en fazla ±${kural?.sinirPx ?? 0}px olabilirdi`,
    };
  }
  return { alan, hedef, olculen, fark, durum: 'sapan' };
}

function birebirFark(
  alan: string,
  hedef: string | number | null,
  olculen: string | number | null,
  ctx: KarsilastirmaBaglam,
  metneBagli = false,
  aile?: string | null
): Fark | null {
  if (hedef == null || olculen == null || hedef === '') return null;
  const esit = String(hedef).toUpperCase() === String(olculen).toUpperCase();
  if (esit) return { alan, hedef, olculen, fark: null, durum: 'gecti' };
  // If the font is missing, text-derived measurements are unreliable → WARNING, not a deviation.
  if (metneBagli && aile && ctx.eksikFontlar.has(aile)) {
    return { alan, hedef, olculen, fark: null, durum: 'uyari', sebep: KABUL_SEBEPLERI['font-eksik']!.aciklama };
  }
  return { alan, hedef, olculen, fark: null, durum: 'sapan' };
}

/** Compares an element's targets against the measurement. */
export function elemaniKarsilastir(
  hedefEl: OlcumEleman,
  olculen: ElemanOlcum,
  ctx: KarsilastirmaBaglam
): ElemanSonuc {
  const testid = hedefEl.testid!;
  const farklar: Fark[] = [];
  if (!olculen.bulundu) {
    return { testid, ad: hedefEl.ad, bulundu: false, farklar: [
      { alan: 'eleman', hedef: 'var', olculen: 'BULUNAMADI', fark: null, durum: 'sapan' },
    ] };
  }

  const h = hedefEl[ctx.viewport];
  if (h) {
    const [, , hw, hh] = h.kutu;
    const wF = pxFark('genişlik', hw, olculen.w, ctx, 'border-box');
    if (wF) farklar.push(wF);
    // Text height: the XD frame ≠ the CSS line box (an accepted deviation).
    const hF = pxFark('yükseklik', hh, olculen.h, ctx,
      hedefEl.tip === 'metin' ? 'metin-cercevesi' : 'border-box');
    if (hF) farklar.push(hF);

    if (h.radius) {
      const olcR = radiusSayilari(olculen.radius);
      const hedR = h.radius[0]!;
      const olc0 = olcR.length ? olcR[0]! : null;
      const rF = pxFark('radius', hedR, olc0, ctx);
      if (rF) farklar.push(rF);
    }
    // On TEXT elements the AGC `fill` is the TEXT COLOUR, not a background — it is
    // already compared as `font.renk`. Comparing it against the background here would
    // produce a fake "target #0C2380 · render transparent" deviation for every text.
    if (h.dolgu && hedefEl.tip !== 'metin') {
      const f = birebirFark('arka plan', h.dolgu, olculen.background, ctx);
      if (f) farklar.push(f);
    }
    if (h.kontur) {
      const bw = sayi(olculen.border);
      const bF = pxFark('border kalınlığı', h.kontur.genislik, bw, ctx);
      if (bF) farklar.push(bF);
      const bc = olculen.border.split(' ').pop() ?? '';
      const cF = birebirFark('border rengi', h.kontur.renk, bc, ctx);
      if (cF) farklar.push(cF);
    }
  }

  if (hedefEl.font) {
    const f = hedefEl.font;
    const aile = f.aile;
    if (f.punto != null) {
      const x = birebirFark('font-size', `${f.punto}px`, olculen.fontSize, ctx);
      if (x) farklar.push(x);
    }
    if (f.satir != null) {
      const x = birebirFark('line-height', `${f.satir}px`, olculen.lineHeight, ctx);
      if (x) farklar.push(x);
    }
    if (f.renk) {
      const x = birebirFark('renk', f.renk, olculen.color, ctx);
      if (x) farklar.push(x);
    }
    if (aile) {
      // `next/font/local` changes the generated name. Two real measured examples:
      //   "Bw Modelica"  → "bwModelica"   (same root)
      //   "Tobias TRIAL" → "tobias"       (the XD name is LONGER — it carries an extra tag)
      // So a one-directional `includes` is not enough; one must be a PREFIX of the other.
      const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9]/g, '');
      const a1 = norm(aile);
      const a2 = norm(olculen.fontFamily);
      const esles =
        a1.length >= 4 && a2.length >= 4 && (a1.startsWith(a2) || a2.startsWith(a1));
      farklar.push(
        esles
          ? { alan: 'font ailesi', hedef: aile, olculen: olculen.fontFamily, fark: null, durum: 'gecti' }
          : ctx.eksikFontlar.has(aile)
            ? { alan: 'font ailesi', hedef: aile, olculen: olculen.fontFamily, fark: null, durum: 'uyari', sebep: KABUL_SEBEPLERI['font-eksik']!.aciklama }
            : { alan: 'font ailesi', hedef: aile, olculen: olculen.fontFamily, fark: null, durum: 'sapan' }
      );
    }
  }

  // Repeated element: count + the gap between them
  if (hedefEl.tekrar?.duzenli && hedefEl.tekrar.adim != null && hedefEl.tekrar.eksen !== 'izgara') {
    const adetF: Fark = {
      alan: 'tekrar adedi', hedef: hedefEl.tekrar.adet, olculen: olculen.adet,
      fark: olculen.adet - hedefEl.tekrar.adet,
      durum: olculen.adet === hedefEl.tekrar.adet ? 'gecti' : 'sapan',
    };
    farklar.push(adetF);
    const hk = hedefEl[ctx.viewport]?.kutu;
    if (hk) {
      const boyut = hedefEl.tekrar.eksen === 'x' ? hk[2] : hk[3];
      const beklenenGap = +(hedefEl.tekrar.adim - boyut).toFixed(2);
      const olcGap = hedefEl.tekrar.eksen === 'x' ? olculen.aralikYatay : olculen.aralikDikey;
      const gF = pxFark('tekrar aralığı', beklenenGap, olcGap, ctx);
      if (gF) farklar.push(gF);
    }
  }

  return {
    testid, ad: hedefEl.ad, bulundu: true,
    olculen: {
      x: olculen.x, y: olculen.y, yRel: olculen.yRel, w: olculen.w, h: olculen.h,
      radius: olculen.radius, padding: olculen.padding, gap: olculen.gap,
      border: olculen.border, font: olculen.font, color: olculen.color,
      background: olculen.background, adet: olculen.adet,
    },
    farklar,
  };
}

export function baglamKur(
  olcum: Olcum,
  viewport: 'desktop' | 'mobil',
  eksikFontlar: string[]
): KarsilastirmaBaglam {
  return {
    kabulEdilenSapmalar: olcum.kabulEdilenSapmalar,
    eksikFontlar: new Set(eksikFontlar),
    viewport,
  };
}

export function ozetle(sonuclar: ElemanSonuc[]) {
  const hepsi = sonuclar.flatMap((s) => s.farklar);
  return {
    toplam: hepsi.length,
    gecen: hepsi.filter((f) => f.durum === 'gecti').length,
    kabul: hepsi.filter((f) => f.durum === 'kabul').length,
    uyari: hepsi.filter((f) => f.durum === 'uyari').length,
    sapan: hepsi.filter((f) => f.durum === 'sapan').length,
  };
}
