/**
 * Turns AGC shape nodes into a box + radius.
 *
 * `rect` gives `r: [tl,tr,br,bl]` directly. For a `path` the radius is derived FROM THE
 * PATH DATA — the previous tool did this with a dpr-3 screenshot and least squares;
 * the source data's cubic control point already carries the exact value.
 *
 * RULE: if the pattern is not recognised the radius is NOT invented — it returns
 * `kaynak: "bilinmiyor"`.
 */

export type RadiusKaynak = 'rect' | 'yol' | 'bilinmiyor' | 'yok';

export interface Kutu { x: number; y: number; w: number; h: number }
export interface SekilOlcu {
  kutu: Kutu;
  radius: [number, number, number, number] | null;
  radiusKaynak: RadiusKaynak;
}

/** Circle approximation constant: for one cubic arc the control point sits r·k away. */
const KAPPA = 0.5522847498307936;

/** Extracts every number from SVG path data, in order. */
export function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
}

/** Bounding box of the path data — control points included (an upper bound, the safe side). */
export function pathBBox(d: string): Kutu | null {
  const n = pathNumbers(d);
  if (n.length < 2) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]!); ys.push(n[i + 1]!); }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Derives the radius from a rounded-rectangle path.
 *
 * Pattern: `M r 0 L (w−r) 0 C (w−r+r·κ) 0 w (r−r·κ) w r L …`
 * The radius is the distance between where the straight edge ends and the corner.
 * Validation: the FIRST control point sits `r·κ` away from the start of the arc along
 * the direction of travel. If that does not hold, the pattern counts as unrecognised
 * (only rounded rectangles are accepted).
 *
 * Verified example (Path 8257): `M 12 0 L 1300 0 C 1306.627 0 1312 5.373 1312 12`
 *   → r = 1312 − 1300 = 12
 *   → check: 1306.627 − 1300 = 6.627 ≈ 12·0.5523 = 6.627 ✓
 */
export function radiusFromRoundedRectPath(d: string): number | null {
  // The first cubic arc: "L x1 y1 C cx1 cy1 cx2 cy2 x2 y2"
  const m = /L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*C\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  if (!m) return null;
  const [x1, y1, c1x, c1y, , , x2, y2] = m.slice(1).map(Number) as number[];
  if ([x1, y1, c1x, c1y, x2, y2].some((v) => !Number.isFinite(v))) return null;
  // The arc turns the corner where the straight edge ends: the radius is the distance on both axes.
  const rx = Math.abs(x2! - x1!);
  const ry = Math.abs(y2! - y1!);
  const r = Math.max(rx, ry);
  if (r <= 0) return null;
  // Control point validation — is the pattern really a circular arc?
  // The first control point must sit r·κ from the start of the arc along the direction of travel.
  const beklenen = r * KAPPA;
  const gozlenen = Math.hypot(c1x! - x1!, c1y! - y1!);
  if (Math.abs(gozlenen - beklenen) > Math.max(0.05, r * 0.02)) return null;
  return +r.toFixed(4);
}

/** Turns an AGC shape node into a measurement. */
export function measureShape(shape: Record<string, any>): SekilOlcu | null {
  const t = shape?.type;
  if (t === 'rect') {
    const r = Array.isArray(shape.r)
      ? (shape.r.map(Number) as [number, number, number, number])
      : null;
    return {
      kutu: { x: +(shape.x ?? 0), y: +(shape.y ?? 0), w: +shape.width, h: +shape.height },
      radius: r,
      radiusKaynak: r ? 'rect' : 'yok',
    };
  }
  if (t === 'circle') {
    const cx = +(shape.cx ?? 0), cy = +(shape.cy ?? 0), r = +(shape.r ?? 0);
    return {
      kutu: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
      radius: [r, r, r, r],
      radiusKaynak: 'rect',
    };
  }
  if (t === 'line') {
    // Separator lines; the thickness comes from the stroke width, the box has zero thickness.
    const x1 = +(shape.x1 ?? 0), y1 = +(shape.y1 ?? 0);
    const x2 = +(shape.x2 ?? 0), y2 = +(shape.y2 ?? 0);
    return {
      kutu: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) },
      radius: null,
      radiusKaynak: 'yok',
    };
  }
  // `compound` = a boolean-combined shape. `shape.path` carries the RESULT of the
  // operation (verified: the compound's own bbox matches the union of its children
  // exactly), so it is measured just like a `path`. Without this branch these shapes
  // were dropped silently — in a real design 10 of 291 nodes turned out to be compound.
  if ((t === 'path' || t === 'compound') && typeof shape.path === 'string') {
    const kutu = pathBBox(shape.path);
    if (!kutu) return null;
    const r = radiusFromRoundedRectPath(shape.path);
    return {
      kutu,
      radius: r != null ? [r, r, r, r] : null,
      // If the pattern was not recognised, do NOT invent — say unknown.
      radiusKaynak: r != null ? 'yol' : 'bilinmiyor',
    };
  }
  return null;
}
