/** Colour conversions. Comparison is always done on UPPERCASE hex. */

export interface Rgb { r: number; g: number; b: number }

/** AGC `style.fill.color.value` → `#RRGGBB` */
export function rgbToHex(c: Rgb): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * In AGC text styles the colour arrives as an ARGB integer
 * (e.g. 4278985600 = 0xFF0C2380). Alpha is ignored — the CSS colour is carried separately.
 */
export function argbToHex(v: number): string {
  const rgb = v & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}
