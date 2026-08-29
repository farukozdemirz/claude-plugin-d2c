/**
 * Extracts typography from AGC text nodes.
 *
 * It gives more than the spec panel does:
 *   · line height    = the `position` difference between consecutive lines
 *   · font box       = |ascent| + descent   ← NOT CONSUMED in M1 (POC-4, M2)
 *   · text width     = layoutBounds.right
 *   · alignment      = paragraphAlign
 *
 * IMPORTANT (the main plan's M1 rule): `fontKutusuAgc` is the RAW AGC value and does
 * NOT count as Chrome's `fontBoundingBox` metric. Measured: Bw Modelica matches exactly
 * at four sizes, but Tobias TRIAL is off by 10px at 48px (56 vs 66) and flips the sign
 * of the half-line. Parity will be decided per family in M2 via POC-4; until then the
 * code phase keeps using the existing browser measurement.
 */
import { argbToHex } from '../../util/color.js';

export interface Tipografi {
  aile: string | null;
  agirlik: string | null;
  punto: number | null;
  satir: number | null;
  ls: number | null;
  renk: string | null;
  hiza: string | null;
  fontKutusuAgc: number | null;
  postscript: string | null;
}

export interface MetinOlcu {
  metin: string;
  font: Tipografi;
  metinGenisligi: number | null;
  satirSayisi: number;
  /**
   * The first line's ascent (positive). In AGC a text node's transform points at the
   * BASELINE of the first line; the frame top XD reports is `baseline − ascent`.
   * Verified: "Ürün Yorumları" 48px Tobias → baseline 3068, ascent 45, frame top
   * 3023 = the benchmark value.
   */
  ascent: number | null;
}

interface Line { position?: number; layoutBounds?: { left?: number; right?: number; ascent?: number; descent?: number } }

/** Flattens all lines in a text node into paragraph order. */
export function flattenLines(ux: Record<string, any>): Line[] {
  const paras = ux?.outlinesLayout?.static?.paragraphs;
  if (!Array.isArray(paras)) return [];
  const out: Line[] = [];
  for (const p of paras) if (Array.isArray(p?.lines)) out.push(...(p.lines as Line[]));
  return out;
}

/**
 * Line height: the `position` difference between two consecutive lines.
 * On single-line text it CANNOT BE MEASURED — returns `null`, it is not invented.
 */
export function lineHeightFrom(lines: Line[]): number | null {
  if (lines.length < 2) return null;
  const a = lines[0]?.position, b = lines[1]?.position;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  const lh = b - a;
  return lh > 0 ? +lh.toFixed(4) : null;
}

/** The first line's ascent, as a positive number. */
export function ascentFrom(lines: Line[]): number | null {
  const a = lines[0]?.layoutBounds?.ascent;
  return typeof a === 'number' ? Math.abs(a) : null;
}

/** Font box: |ascent| + descent. The raw AGC value (see the note at the top of the file). */
export function fontBoxFrom(lines: Line[]): number | null {
  const lb = lines[0]?.layoutBounds;
  if (!lb || typeof lb.ascent !== 'number' || typeof lb.descent !== 'number') return null;
  return +(Math.abs(lb.ascent) + lb.descent).toFixed(4);
}

/** Text width: the right edge of the widest line. */
export function textWidthFrom(lines: Line[]): number | null {
  const rights = lines
    .map((l) => l.layoutBounds?.right)
    .filter((v): v is number => typeof v === 'number');
  return rights.length ? +Math.max(...rights).toFixed(4) : null;
}

/** Turns an AGC text node into a measurement. */
export function measureText(node: Record<string, any>): MetinOlcu {
  const ux = node?.meta?.ux ?? {};
  const rs = Array.isArray(ux.rangedStyles) && ux.rangedStyles.length ? ux.rangedStyles[0] : {};
  const lines = flattenLines(ux);
  const run = lines[0]?.layoutBounds ? (ux.outlinesLayout?.static?.paragraphs?.[0]?.lines?.[0]?.runs?.[0]?.style ?? {}) : {};

  return {
    // In AGC the text content lives in the node's `name` field.
    metin: typeof node?.name === 'string' ? node.name : '',
    font: {
      aile: rs.fontFamily ?? run.fontFamily ?? null,
      agirlik: rs.fontStyle ?? run.fontStyle ?? null,
      punto: typeof rs.fontSize === 'number' ? rs.fontSize : (run.fontSize ?? null),
      satir: lineHeightFrom(lines),
      ls: typeof rs.charSpacing === 'number' ? rs.charSpacing : null,
      renk: typeof rs?.fill?.value === 'number' ? argbToHex(rs.fill.value) : null,
      hiza: ux.paragraphAlign ?? null,
      fontKutusuAgc: fontBoxFrom(lines),
      postscript: run.postscriptName ?? null,
    },
    metinGenisligi: textWidthFrom(lines),
    satirSayisi: lines.length,
    ascent: ascentFrom(lines),
  };
}
