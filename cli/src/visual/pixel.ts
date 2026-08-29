/**
 * Pixel layer — PIL compatible.
 *
 * This is the only hard part of Phase 5b. The STRUCTURAL percentage of
 * `visual-diff.py` comes out of a 4× LANCZOS downscale; a different resampler shifts
 * that percentage and the port becomes a silent regression. So this is not "a Lanczos"
 * but a line-by-line port of Pillow's implementation in `Resample.c`:
 *
 *   - `precompute_coeffs` — when downscaling, the window widens by `support × scale`
 *   - `normalize_coeffs_8bpc` — coefficients are rounded to 22-bit fixed point
 *   - two passes: horizontal first, then vertical; **the intermediate drops to 8 bit**
 *
 * That last point matters: keeping the intermediate as float would be "more accurate"
 * but would diverge from PIL. The goal is not accuracy, it is **equivalence**.
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

/** 3 bytes/pixel RGB — what PIL's `convert("RGB")` produces. */
export interface Img {
  w: number;
  h: number;
  data: Uint8Array;
}

export function bosImg(w: number, h: number): Img {
  return { w, h, data: new Uint8Array(w * h * 3) };
}

/**
 * Read a PNG → RGB.
 *
 * PIL's `convert("RGB")` **does not composite alpha onto white, it drops it**. Since
 * pngjs expands every format to RGBA, discarding the alpha channel makes the two match.
 */
export function pngOku(yol: string): Img {
  const png = PNG.sync.read(readFileSync(yol));
  const im = bosImg(png.width, png.height);
  for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
    im.data[j] = png.data[i]!;
    im.data[j + 1] = png.data[i + 1]!;
    im.data[j + 2] = png.data[i + 2]!;
  }
  return im;
}

export function pngYaz(yol: string, im: Img): void {
  const png = new PNG({ width: im.w, height: im.h });
  for (let i = 0, j = 0; j < im.data.length; i += 4, j += 3) {
    png.data[i] = im.data[j]!;
    png.data[i + 1] = im.data[j + 1]!;
    png.data[i + 2] = im.data[j + 2]!;
    png.data[i + 3] = 255;
  }
  writeFileSync(yol, PNG.sync.write(png));
}

/** PIL `Image.crop` — area outside the bounds is filled with **black** (PIL does the same). */
export function kirp(src: Img, x0: number, y0: number, x1: number, y1: number): Img {
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const out = bosImg(w, h);
  for (let y = 0; y < h; y++) {
    const sy = y + y0;
    if (sy < 0 || sy >= src.h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x + x0;
      if (sx < 0 || sx >= src.w) continue;
      const s = (sy * src.w + sx) * 3;
      const d = (y * w + x) * 3;
      out.data[d] = src.data[s]!;
      out.data[d + 1] = src.data[s + 1]!;
      out.data[d + 2] = src.data[s + 2]!;
    }
  }
  return out;
}

/** PIL `convert("L")` — ITU-R 601-2, with Pillow's integer coefficients. */
export function luma(r: number, g: number, b: number): number {
  return (r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16;
}

// ── LANCZOS (Pillow uyumlu) ──────────────────────────────────────────────────

const DESTEK = 3.0;
const PRECISION_BITS = 32 - 8 - 2; // 22 — Pillow'un sabiti
const BIR = 1 << PRECISION_BITS;
const YUVARLA = 1 << (PRECISION_BITS - 1);

function sinc(x: number): number {
  if (x === 0) return 1;
  const p = x * Math.PI;
  return Math.sin(p) / p;
}

function lanczos(x: number): number {
  // Pillow's range is asymmetric: [-3, 3). Writing it symmetrically changes the edge coefficient.
  if (x >= -DESTEK && x < DESTEK) return sinc(x) * sinc(x / DESTEK);
  return 0;
}

interface Katsayi {
  ksize: number;
  sinir: Int32Array;
  kk: Int32Array;
}

/** Pillow `precompute_coeffs` + `normalize_coeffs_8bpc`. */
function katsayilar(inSize: number, outSize: number): Katsayi {
  const olcek = inSize / outSize;
  // When downscaling, the filter window WIDENS with the scale; skipping this makes the
  // downscale alias and shifts the structural percentage.
  const filtreOlcek = olcek < 1 ? 1 : olcek;
  const destek = DESTEK * filtreOlcek;
  const ksize = Math.ceil(destek) * 2 + 1;

  const sinir = new Int32Array(outSize * 2);
  const ham = new Float64Array(outSize * ksize);
  const ss = 1 / filtreOlcek;

  for (let xx = 0; xx < outSize; xx++) {
    const merkez = (xx + 0.5) * olcek;
    // C's `(int)` truncates toward zero — NOT Math.floor.
    let xmin = Math.trunc(merkez - destek + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(merkez + destek + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;

    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const w = lanczos((x + xmin - merkez + 0.5) * ss);
      ham[xx * ksize + x] = w;
      ww += w;
    }
    if (ww !== 0) for (let x = 0; x < xmax; x++) ham[xx * ksize + x]! /= ww;

    sinir[xx * 2] = xmin;
    sinir[xx * 2 + 1] = xmax;
  }

  const kk = new Int32Array(outSize * ksize);
  for (let i = 0; i < ham.length; i++) {
    const v = ham[i]!;
    kk[i] = Math.trunc(v < 0 ? -0.5 + v * BIR : 0.5 + v * BIR);
  }
  return { ksize, sinir, kk };
}

/** Pillow `clip8` — shift 22 bits, clamp to 0-255. */
function clip8(v: number): number {
  const s = v >> PRECISION_BITS;
  return s < 0 ? 0 : s > 255 ? 255 : s;
}

function yatay(src: Img, outW: number): Img {
  const { ksize, sinir, kk } = katsayilar(src.w, outW);
  const out = bosImg(outW, src.h);
  for (let yy = 0; yy < src.h; yy++) {
    const satir = yy * src.w * 3;
    for (let xx = 0; xx < outW; xx++) {
      const xmin = sinir[xx * 2]!;
      const xmax = sinir[xx * 2 + 1]!;
      const ko = xx * ksize;
      let s0 = YUVARLA, s1 = YUVARLA, s2 = YUVARLA;
      for (let x = 0; x < xmax; x++) {
        const k = kk[ko + x]!;
        const p = satir + (x + xmin) * 3;
        s0 += src.data[p]! * k;
        s1 += src.data[p + 1]! * k;
        s2 += src.data[p + 2]! * k;
      }
      const q = (yy * outW + xx) * 3;
      out.data[q] = clip8(s0);
      out.data[q + 1] = clip8(s1);
      out.data[q + 2] = clip8(s2);
    }
  }
  return out;
}

function dikey(src: Img, outH: number): Img {
  const { ksize, sinir, kk } = katsayilar(src.h, outH);
  const out = bosImg(src.w, outH);
  for (let yy = 0; yy < outH; yy++) {
    const ymin = sinir[yy * 2]!;
    const ymax = sinir[yy * 2 + 1]!;
    const ko = yy * ksize;
    for (let xx = 0; xx < src.w; xx++) {
      let s0 = YUVARLA, s1 = YUVARLA, s2 = YUVARLA;
      for (let y = 0; y < ymax; y++) {
        const k = kk[ko + y]!;
        const p = ((y + ymin) * src.w + xx) * 3;
        s0 += src.data[p]! * k;
        s1 += src.data[p + 1]! * k;
        s2 += src.data[p + 2]! * k;
      }
      const q = (yy * src.w + xx) * 3;
      out.data[q] = clip8(s0);
      out.data[q + 1] = clip8(s1);
      out.data[q + 2] = clip8(s2);
    }
  }
  return out;
}

/**
 * PIL `Image.resize(..., Image.LANCZOS)`.
 *
 * When the size is unchanged PIL returns a copy and does not resample — that shortcut
 * was ported too, otherwise the `--olcekle` path would introduce needless blur.
 */
export function olcekle(src: Img, outW: number, outH: number): Img {
  if (src.w === outW && src.h === outH) {
    return { w: src.w, h: src.h, data: src.data.slice() };
  }
  let cur = src;
  if (cur.w !== outW) cur = yatay(cur, outW);
  if (cur.h !== outH) cur = dikey(cur, outH);
  return cur;
}

/** PIL `Image.resize(..., Image.NEAREST)` — only for enlarging crops. */
export function nearest(src: Img, outW: number, outH: number): Img {
  const out = bosImg(outW, outH);
  for (let y = 0; y < outH; y++) {
    // PIL's NEAREST uses the inverse affine transform: floor((y + 0.5) * sy).
    const sy = Math.min(src.h - 1, Math.floor(((y + 0.5) * src.h) / outH));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(src.w - 1, Math.floor(((x + 0.5) * src.w) / outW));
      const s = (sy * src.w + sx) * 3;
      const d = (y * outW + x) * 3;
      out.data[d] = src.data[s]!;
      out.data[d + 1] = src.data[s + 1]!;
      out.data[d + 2] = src.data[s + 2]!;
    }
  }
  return out;
}

/** `panel.paste(im, (x, y))`. */
export function yapistir(hedef: Img, src: Img, x0: number, y0: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = y + y0;
    if (ty < 0 || ty >= hedef.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = x + x0;
      if (tx < 0 || tx >= hedef.w) continue;
      const s = (y * src.w + x) * 3;
      const d = (ty * hedef.w + tx) * 3;
      hedef.data[d] = src.data[s]!;
      hedef.data[d + 1] = src.data[s + 1]!;
      hedef.data[d + 2] = src.data[s + 2]!;
    }
  }
}

export function doldur(im: Img, r: number, g: number, b: number): void {
  for (let i = 0; i < im.data.length; i += 3) {
    im.data[i] = r;
    im.data[i + 1] = g;
    im.data[i + 2] = b;
  }
}
