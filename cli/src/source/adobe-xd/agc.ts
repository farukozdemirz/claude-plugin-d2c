/**
 * AGC scenegraph traversal + affine flattening.
 *
 * Nodes carry nested `transform`s; boxes have to end up artboard-relative.
 * The artboard origin is `bounds.x/y` from the manifest — verified in POC-1:
 * `Rectangle 8235` comes out at x=16.00 on the mobile artboard (benchmark says 16).
 */
import { rgbToHex, type Rgb } from '../../util/color.js';
import { measureShape, type SekilOlcu } from './shape.js';
import { measureText, type MetinOlcu } from './text.js';

/** 2B affine: [a, b, c, d, tx, ty] */
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m ∘ n — n is applied first, then m. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function nodeMatrix(node: Record<string, any>): Matrix {
  const t = node?.transform;
  if (!t) return IDENTITY;
  return [t.a ?? 1, t.b ?? 0, t.c ?? 0, t.d ?? 1, t.tx ?? 0, t.ty ?? 0];
}

export function applyPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export interface Stroke { genislik: number; renk: string; hiza: 'inside' | 'outside' | 'center' }

export interface DuzElemanBase {
  id: string | null;
  ad: string | null;
  derinlik: number;
  ebeveyn: string | null;
  matrix: Matrix;
  dolgu: string | null;
  kontur: Stroke | null;
  opaklik: number | null;
}
export interface DuzSekil extends DuzElemanBase {
  tip: 'sekil';
  olcu: SekilOlcu;
  sekilTipi: string;
  /** Vector path data — carried for the Phase 6 SVG export (only on the `path` type). */
  yol?: string;
  /** If the fill is an unsupported type such as `gradient`, it lands here; the export reports it. */
  desteklenmeyenDolgu?: string;
}
export interface DuzMetin extends DuzElemanBase { tip: 'metin'; olcu: MetinOlcu }
export interface DuzGorsel extends DuzElemanBase { tip: 'gorsel'; uid: string | null; olcekDavranisi: string | null; olcu: SekilOlcu | null }
export type DuzEleman = DuzSekil | DuzMetin | DuzGorsel;

export interface DuzlestirmeSonucu {
  elemanlar: DuzEleman[];
  bilinmeyenTipler: Record<string, number>;
  toplamDugum: number;
}

function fillHex(node: Record<string, any>): string | null {
  const f = node?.style?.fill;
  if (!f || f.type === 'none') return null;
  const v = f?.color?.value as Rgb | undefined;
  return v && typeof v.r === 'number' ? rgbToHex(v) : null;
}

function strokeOf(node: Record<string, any>): Stroke | null {
  const s = node?.style?.stroke;
  if (!s || s.type !== 'solid') return null;
  const v = s?.color?.value as Rgb | undefined;
  if (!v || typeof v.r !== 'number') return null;
  // Without `align`, XD's default is center — what the spec panel calls "Center Stroke".
  const hiza = s.align === 'inside' || s.align === 'outside' ? s.align : 'center';
  return { genislik: typeof s.width === 'number' ? s.width : 1, renk: rgbToHex(v), hiza };
}

/** A `pattern` fill → an image. Phase 6 downloads it; in M1 only the field is carried. */
function patternUid(node: Record<string, any>): { uid: string | null; scale: string | null } | null {
  const f = node?.style?.fill;
  if (f?.type !== 'pattern') return null;
  const ux = f?.pattern?.meta?.ux ?? node?.style?.fill?.meta?.ux ?? {};
  return { uid: ux.uid ?? null, scale: ux.scaleBehavior ?? null };
}

/**
 * Flattens the scenegraph. Boxes are still in DOCUMENT space — converting them to the
 * artboard is the caller's job (`toArtboardBox`).
 */
export function flatten(agc: Record<string, any>): DuzlestirmeSonucu {
  const elemanlar: DuzEleman[] = [];
  const bilinmeyen: Record<string, number> = {};
  let toplam = 0;

  const walk = (node: Record<string, any>, m: Matrix, depth: number, parentId: string | null) => {
    const tip = node?.type;
    if (!tip) return;
    toplam++;
    const own = ['artboard', 'group', 'shape', 'text'].includes(tip)
      ? multiply(m, nodeMatrix(node))
      : m;

    const base = (): DuzElemanBase => ({
      id: node.id ?? null,
      ad: typeof node.name === 'string' ? node.name : null,
      derinlik: depth,
      ebeveyn: parentId,
      matrix: own,
      dolgu: fillHex(node),
      kontur: strokeOf(node),
      opaklik: typeof node?.style?.opacity === 'number' ? node.style.opacity : null,
    });

    if (tip === 'shape') {
      const pat = patternUid(node);
      const olcu = measureShape(node.shape ?? {});
      if (pat) elemanlar.push({ ...base(), tip: 'gorsel', uid: pat.uid, olcekDavranisi: pat.scale, olcu });
      else if (olcu) {
        const f = node?.style?.fill;
        elemanlar.push({
          ...base(), tip: 'sekil', olcu, sekilTipi: node.shape?.type ?? '?',
          ...(typeof node.shape?.path === 'string' && node.shape.path ? { yol: node.shape.path } : {}),
          // Fills other than `solid`/`none` (gradient…) cannot be converted to SVG — MARK them.
          ...(f && f.type !== 'solid' && f.type !== 'none' && f.type !== 'pattern'
            ? { desteklenmeyenDolgu: String(f.type) }
            : {}),
        });
      }
      else bilinmeyen[`shape:${node.shape?.type ?? '?'}`] = (bilinmeyen[`shape:${node.shape?.type ?? '?'}`] ?? 0) + 1;
    } else if (tip === 'text') {
      elemanlar.push({ ...base(), tip: 'metin', olcu: measureText(node) });
    } else if (tip !== 'artboard' && tip !== 'group') {
      bilinmeyen[tip] = (bilinmeyen[tip] ?? 0) + 1;
    }

    const kids =
      tip === 'artboard' ? node.artboard?.children : tip === 'group' ? node.group?.children : null;
    if (Array.isArray(kids)) {
      const pid = node.id ?? parentId;
      for (const k of kids) walk(k, own, depth + 1, pid);
    }
  };

  for (const child of agc?.children ?? []) walk(child, IDENTITY, 0, null);
  return { elemanlar, bilinmeyenTipler: bilinmeyen, toplamDugum: toplam };
}

/**
 * The XD text frame box.
 *
 * Two points were verified by measurement:
 *
 * 1. **Height.** The formula documented in `tailwind.md`: for an auto-height text frame
 *    XD reports `(n−1) × line-height + fontBox` — which DIFFERS from CSS rendering
 *    `n × line-height`, and that is the reason half-line compensation exists.
 * 2. **Vertical origin.** In AGC a text node's transform points at the BASELINE of the
 *    first line; the frame top XD reports is `baseline − ascent`. Verified:
 *    "Ürün Yorumları" 48px Tobias → baseline 3068, ascent 45 → 3023 (benchmark: 3023).
 *
 * Here we produce the box XD reports; converting it to CSS is the code phase's job.
 */
function textFrame(el: DuzMetin): { x: number; y: number; w: number; h: number } {
  const { satirSayisi, font, metinGenisligi, ascent } = el.olcu;
  const kutu = font.fontKutusuAgc ?? font.punto ?? 0;
  const satir = font.satir ?? kutu;
  const n = Math.max(1, satirSayisi);
  return {
    x: 0,
    y: -(ascent ?? 0),
    w: metinGenisligi ?? 0,
    h: +((n - 1) * satir + kutu).toFixed(4),
  };
}

/** Converts a flattened element's box into artboard-relative coordinates. */
export function toArtboardBox(
  el: DuzEleman,
  origin: { x: number; y: number }
): { x: number; y: number; w: number; h: number } | null {
  const local = el.tip === 'metin' ? textFrame(el) : (el.olcu?.kutu ?? null);
  if (!local) return null;
  const p = applyPoint(el.matrix, local.x, local.y);
  // Only scale+translation are supported; if there is rotation the box is approximate.
  const sx = Math.hypot(el.matrix[0], el.matrix[1]);
  const sy = Math.hypot(el.matrix[2], el.matrix[3]);
  return {
    x: +(p.x - origin.x).toFixed(4),
    y: +(p.y - origin.y).toFixed(4),
    w: +(local.w * sx).toFixed(4),
    h: +(local.h * sy).toFixed(4),
  };
}
