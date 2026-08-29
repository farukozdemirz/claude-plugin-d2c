/** Renk dönüşümleri. Karşılaştırma her zaman BÜYÜK HARF hex üzerinden yapılır. */

export interface Rgb { r: number; g: number; b: number }

/** AGC `style.fill.color.value` → `#RRGGBB` */
export function rgbToHex(c: Rgb): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * AGC metin stillerinde renk ARGB tamsayısı olarak geliyor
 * (ör. 4278985600 = 0xFF0C2380). Alfa yok sayılır — CSS rengi ayrı taşınır.
 */
export function argbToHex(v: number): string {
  const rgb = v & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}
