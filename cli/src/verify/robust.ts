/**
 * Layout robustness across several widths.
 *
 * WHY THIS IS A TOOL AND NOT AN INSTRUCTION: the rule is "check at 1920/1440/1366/1280/
 * 1024". Written as an instruction that is five viewports × (navigate + emulate +
 * evaluate) ≈ 15 tool calls — exactly the pattern this repo cut from ~229 calls to 1.
 * The measurement belongs here; the JUDGEMENT (which element should flex, which stays
 * fixed) stays with Claude.
 *
 * WHAT IT DOES NOT DO: it does not decide whether a layout is "beautiful" or whether a
 * breakpoint is needed. It reports three objective facts — overlap, overflow, a child
 * escaping its container — plus reflow as information.
 *
 * The reference width is the design's own width. There the check is pixel-perfect
 * parity's job (`render verify`); here it only serves as the baseline for reflow.
 */
import type { Page } from 'playwright-core';
import { tarayiciAc } from './browser.js';
import { viewportAyarla, viewportHatasi } from './viewport.js';
import { olc } from '../util/trace.js';
import {
  ROBUST_SCHEMA_VERSION, RobustSchema, type Bulgu, type Robust,
} from '../contracts/robust.js';

export interface RobustSecenek {
  url: string;
  testidler: string[];
  /** Design width — the baseline for reflow comparison. */
  referansGenislik?: number | null;
  genislikler?: number[];
  cdp?: string;
  headed?: boolean;
}

/** The widths the rule names. 1920 is usually the design's own width. */
export const VARSAYILAN_GENISLIKLER = [1920, 1440, 1366, 1280, 1024];

/** Below this an intersection counts as a rounding artefact, not an overlap. */
const CAKISMA_ESIGI_PX = 2;
/** A child may exceed its container by this much (border/rounding) without it being an escape. */
const TASMA_ESIGI_PX = 1;

interface OlculenEleman {
  testid: string;
  bulundu: boolean;
  x: number; y: number; w: number; h: number;
  /** The nearest ancestor that also carries a data-testid — used for sibling grouping. */
  ebeveyn: string | null;
  gorunur: boolean;
}

interface SayfaOlcum {
  elemanlar: OlculenEleman[];
  scrollWidth: number;
  clientWidth: number;
}

/** One `page.evaluate` per width — the whole measurement in a single round-trip. */
async function sayfayiOlc(page: Page, testidler: string[]): Promise<SayfaOlcum> {
  return page.evaluate((ids: string[]) => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
    const elemanlar = ids.map((testid) => {
      const el = q(testid);
      if (!el) {
        return { testid, bulundu: false, x: 0, y: 0, w: 0, h: 0, ebeveyn: null, gorunur: false };
      }
      const r = el.getBoundingClientRect();
      // The nearest ancestor carrying a testid. Grouping siblings by the DOM rather than
      // by the XD hierarchy: the code phase is free to restructure the DOM, and what
      // matters for overlap is what actually renders.
      let p: Element | null = el.parentElement;
      let ebeveyn: string | null = null;
      while (p) {
        const t = p.getAttribute?.('data-testid');
        if (t && ids.includes(t)) { ebeveyn = t; break; }
        p = p.parentElement;
      }
      const st = getComputedStyle(el);
      return {
        testid, bulundu: true,
        x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2),
        ebeveyn,
        gorunur: st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      };
    });
    return {
      elemanlar,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  }, testidler);
}

/** Intersection area of two boxes; 0 when they do not touch. */
function kesisim(a: OlculenEleman, b: OlculenEleman): { w: number; h: number } {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { w: w > 0 ? w : 0, h: h > 0 ? h : 0 };
}

/**
 * Turns one width's measurement into findings.
 *
 * Pure and exported so the detection can be tested without a browser — whether a
 * finding is produced must not depend on the machine running it.
 */
export function bulgulariCikar(
  o: SayfaOlcum,
  genislik: number,
  referans: SayfaOlcum | null
): Bulgu[] {
  const bulgular: Bulgu[] = [];
  const gorunur = o.elemanlar.filter((e) => e.bulundu && e.gorunur);

  // 1) Horizontal overflow — the page scrolls sideways. Always an error.
  if (o.scrollWidth > o.clientWidth + TASMA_ESIGI_PX) {
    bulgular.push({
      seviye: 'hata', tur: 'yatay-tasma', genislik, elemanlar: [],
      miktarPx: +(o.scrollWidth - o.clientWidth).toFixed(2),
      detay: `page scrolls horizontally: scrollWidth ${o.scrollWidth} > clientWidth ${o.clientWidth}`,
    });
  }

  // 2) Overlap between siblings sharing a parent.
  //
  // Only siblings: a child overlapping its own parent is normal (it sits inside it).
  // Deliberate stacking (badges, avatar stacks) does exist — that is why the amount is
  // reported, so the judgement stays with the reader.
  for (let i = 0; i < gorunur.length; i++) {
    for (let j = i + 1; j < gorunur.length; j++) {
      const a = gorunur[i]!, b = gorunur[j]!;
      if (a.ebeveyn !== b.ebeveyn) continue;
      const k = kesisim(a, b);
      if (k.w > CAKISMA_ESIGI_PX && k.h > CAKISMA_ESIGI_PX) {
        bulgular.push({
          seviye: 'hata', tur: 'cakisma', genislik, elemanlar: [a.testid, b.testid],
          miktarPx: +k.w.toFixed(2),
          detay: `"${a.testid}" and "${b.testid}" overlap by ${k.w.toFixed(0)}×${k.h.toFixed(0)} px`,
        });
      }
    }
  }

  // 3) A child escaping its container.
  for (const e of gorunur) {
    if (!e.ebeveyn) continue;
    const p = gorunur.find((x) => x.testid === e.ebeveyn);
    if (!p) continue;
    const sag = e.x + e.w - (p.x + p.w);
    const sol = p.x - e.x;
    const tasma = Math.max(sag, sol);
    if (tasma > TASMA_ESIGI_PX) {
      bulgular.push({
        seviye: 'hata', tur: 'kapsayici-tasmasi', genislik, elemanlar: [e.testid, p.testid],
        miktarPx: +tasma.toFixed(2),
        detay: `"${e.testid}" escapes its container "${p.testid}" by ${tasma.toFixed(0)} px`,
      });
    }
  }

  // 4) Reflow — INFORMATION, not a defect. Text wrapping as the window narrows is the
  //    layout doing its job. Reporting it as an error would make every narrow viewport
  //    look broken and the check would stop being read.
  if (referans) {
    for (const e of gorunur) {
      const r = referans.elemanlar.find((x) => x.testid === e.testid);
      if (!r || !r.bulundu) continue;
      if (e.h > r.h + 1) {
        bulgular.push({
          seviye: 'bilgi', tur: 'sarma', genislik, elemanlar: [e.testid],
          miktarPx: +(e.h - r.h).toFixed(2),
          detay: `"${e.testid}" is ${(e.h - r.h).toFixed(0)} px taller than at the reference width (text reflowed)`,
        });
      }
    }
  }

  return bulgular;
}

export async function robustDogrula(sec: RobustSecenek): Promise<Robust> {
  const t0 = Date.now();
  const genislikler = sec.genislikler?.length ? sec.genislikler : VARSAYILAN_GENISLIKLER;
  const ref = sec.referansGenislik ?? null;
  // The reference width is measured first, so reflow has a baseline to compare against.
  const sira = ref && !genislikler.includes(ref) ? [ref, ...genislikler] : [...genislikler];
  if (ref) sira.sort((a, b) => (a === ref ? -1 : b === ref ? 1 : b - a));

  const oturum = await tarayiciAc({ cdp: sec.cdp, headed: sec.headed });
  const sonuclar: Robust['genislikler'] = [];
  let referansOlcum: SayfaOlcum | null = null;

  try {
    await olc('sayfa-yukleme', () => oturum.page.goto(sec.url, { waitUntil: 'networkidle' }));

    for (const g of sira) {
      const v = await viewportAyarla(oturum.page, g);
      if (!v.dogrulandi) {
        // The existing rule is preserved: if the viewport cannot be verified we DO NOT
        // measure. Silently measuring at the wrong width produces wrong findings.
        sonuclar.push({ genislik: g, dogrulandi: false, atlandi: viewportHatasi(v), bulgular: [] });
        continue;
      }
      await oturum.page.waitForTimeout(80);
      const o = await olc('olcum', () => sayfayiOlc(oturum.page, sec.testidler));
      if (ref && g === ref) referansOlcum = o;
      sonuclar.push({
        genislik: g, dogrulandi: true, atlandi: null,
        bulgular: bulgulariCikar(o, g, g === ref ? null : referansOlcum),
      });
    }
  } finally {
    await oturum.kapat();
  }

  const hepsi = sonuclar.flatMap((s) => s.bulgular);
  const sonuc: Robust = {
    schemaVersion: ROBUST_SCHEMA_VERSION,
    tarih: new Date().toISOString(),
    url: sec.url,
    referansGenislik: ref,
    genislikler: sonuclar,
    ozet: {
      hata: hepsi.filter((b) => b.seviye === 'hata').length,
      uyari: hepsi.filter((b) => b.seviye === 'uyari').length,
      bilgi: hepsi.filter((b) => b.seviye === 'bilgi').length,
    },
    sureMs: Date.now() - t0,
  };
  return RobustSchema.parse(sonuc);
}
