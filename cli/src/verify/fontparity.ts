/**
 * POC-4 — parity between the AGC font metric and Chrome's `fontBoundingBox`.
 *
 * The main plan's M1 rule: `fontKutusuAgc` is the raw AGC value and does NOT count as
 * the Chrome metric. This POC determines, **per family**, where the two are equal.
 *
 * Preliminary measurement (from the main plan): Bw Modelica matches exactly at four
 * sizes, while Tobias TRIAL is off by 10px at 48px and flips the SIGN of the half-line.
 * So a mixed result is expected and the decision must not be all-or-nothing.
 *
 * For families where parity is not proven, the browser measurement from `d2c-code` §3
 * is **preserved**.
 */
import type { SayfaOlcum } from './measure.js';

/** The upper bound for a difference to count as "parity" (px). */
export const PARITE_ESIGI = 0.5;

export interface PariteSatir {
  aile: string;
  /** The family actually rendered (may be the name next/font generated). */
  cozulmusAile: string;
  punto: number;
  agc: number | null;
  chrome: number;
  fark: number | null;
  parite: boolean | null;
}

export interface PariteSonuc {
  satirlar: PariteSatir[];
  /** The per-family decision — `agc` only when there is parity at EVERY size. */
  kararlar: Record<string, 'agc' | 'tarayici'>;
  fontYuklu: Record<string, boolean>;
}

/**
 * @param agcKutulari `olcum.json`/`design.json`'dan gelen `aile|punto -> fontKutusuAgc`
 */
export function pariteHesapla(
  olcum: SayfaOlcum,
  agcKutulari: Map<string, number>
): PariteSonuc {
  const satirlar: PariteSatir[] = [];
  const aileHatali = new Set<string>();
  const aileGorulen = new Set<string>();

  for (const fk of olcum.fontKutulari) {
    const agc = agcKutulari.get(`${fk.aile}|${fk.punto}`) ?? null;
    const fark = agc == null ? null : +(fk.kutu - agc).toFixed(3);
    const parite = fark == null ? null : Math.abs(fark) < PARITE_ESIGI;
    const yuklu = olcum.fontlar.find((f) => f.aile === fk.aile)?.yuklu ?? true;
    satirlar.push({
      aile: fk.aile, cozulmusAile: fk.cozulmusAile, punto: fk.punto,
      agc, chrome: fk.kutu, fark,
      // If the font is not loaded, parity is UNDETERMINED — unreliable even if it matches.
      parite: yuklu ? parite : null,
    });
    if (parite === false) aileHatali.add(fk.aile);
    if (parite !== null) aileGorulen.add(fk.aile);
  }

  // Parity CANNOT BE DETERMINED for a font that is not loaded.
  //
  // Measured: Helvetica Neue is absent from the project; Chrome measured the fallback's
  // metric (14) and it matched the AGC value (14) BY COINCIDENCE → a wrong "agc"
  // decision. Measurement is unreliable for an unloaded font anyway; the safe side is
  // `tarayici`.
  const yukluOlmayan = new Set(olcum.fontlar.filter((f) => !f.yuklu).map((f) => f.aile));

  const kararlar: Record<string, 'agc' | 'tarayici'> = {};
  for (const aile of aileGorulen) {
    // If even a single size deviates, OR the font is not loaded, the browser measurement is kept.
    kararlar[aile] = aileHatali.has(aile) || yukluOlmayan.has(aile) ? 'tarayici' : 'agc';
  }
  // Families with no AGC counterpart could not be measured → default to the safe side.
  for (const f of olcum.fontlar) {
    if (!(f.aile in kararlar)) kararlar[f.aile] = 'tarayici';
  }

  return {
    satirlar,
    kararlar,
    fontYuklu: Object.fromEntries(olcum.fontlar.map((f) => [f.aile, f.yuklu])),
  };
}
