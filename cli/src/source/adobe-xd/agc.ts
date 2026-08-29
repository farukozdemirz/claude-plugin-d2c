/**
 * AGC scenegraph gezinme + affine düzleştirme.
 *
 * Düğümler iç içe `transform` taşıyor; kutular artboard-göreli olmalı.
 * Artboard kökeni manifest'teki `bounds.x/y` — POC-1'de doğrulandı:
 * `Rectangle 8235` mobil artboard'da x=16.00 çıkıyor (benchmark 16).
 */
import { rgbToHex, type Rgb } from '../../util/color.js';
import { measureShape, type SekilOlcu } from './shape.js';
import { measureText, type MetinOlcu } from './text.js';

/** 2B affine: [a, b, c, d, tx, ty] */
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m ∘ n — önce n, sonra m uygulanır. */
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
  /** Vektör yol verisi — Faz 6 SVG export'u için taşınır (yalnız `path` tipinde). */
  yol?: string;
  /** Dolgu `gradient` gibi desteklenmeyen bir tipse burada durur; export raporlar. */
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
  // `align` yoksa XD varsayılanı center — spec panelinin "Center Stroke" dediği hal.
  const hiza = s.align === 'inside' || s.align === 'outside' ? s.align : 'center';
  return { genislik: typeof s.width === 'number' ? s.width : 1, renk: rgbToHex(v), hiza };
}

/** `pattern` dolgusu → görsel. Faz 6 bunu indirecek; M1'de yalnız alan taşınır. */
function patternUid(node: Record<string, any>): { uid: string | null; scale: string | null } | null {
  const f = node?.style?.fill;
  if (f?.type !== 'pattern') return null;
  const ux = f?.pattern?.meta?.ux ?? node?.style?.fill?.meta?.ux ?? {};
  return { uid: ux.uid ?? null, scale: ux.scaleBehavior ?? null };
}

/**
 * Scenegraph'ı düzleştirir. Kutular hâlâ DOKÜMAN uzayında — artboard'a çevirmek
 * çağıranın işi (`toArtboardBox`).
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
          // `solid`/`none` dışındaki dolgular (gradient…) SVG'ye çevrilemiyor — İŞARETLE.
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
 * XD metin çerçevesi kutusu.
 *
 * İki nokta ölçümle doğrulandı:
 *
 * 1. **Yükseklik.** `tailwind.md`'de belgelenen formül: XD, otomatik yükseklikli metin
 *    çerçevesi için `(n−1) × line-height + fontKutusu` verir — CSS'in `n × line-height`
 *    render etmesinden FARKLIDIR ve yarı-satır telafisinin sebebi budur.
 * 2. **Dikey köken.** AGC'de metin düğümünün transform'u ilk satırın TABAN ÇİZGİSİNİ
 *    gösteriyor; XD'nin raporladığı çerçeve üstü `taban − ascent`. Doğrulandı:
 *    "Ürün Yorumları" 48px Tobias → taban 3068, ascent 45 → 3023 (benchmark: 3023).
 *
 * Burada XD'nin verdiği kutuyu üretiyoruz; CSS'e çevirmek kod fazının işi.
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

/** Düz elemanın kutusunu artboard-göreli koordinata çevirir. */
export function toArtboardBox(
  el: DuzEleman,
  origin: { x: number; y: number }
): { x: number; y: number; w: number; h: number } | null {
  const local = el.tip === 'metin' ? textFrame(el) : (el.olcu?.kutu ?? null);
  if (!local) return null;
  const p = applyPoint(el.matrix, local.x, local.y);
  // Yalnız ölçek+öteleme destekleniyor; döndürme varsa kutu yaklaşıktır.
  const sx = Math.hypot(el.matrix[0], el.matrix[1]);
  const sy = Math.hypot(el.matrix[2], el.matrix[3]);
  return {
    x: +(p.x - origin.x).toFixed(4),
    y: +(p.y - origin.y).toFixed(4),
    w: +(local.w * sx).toFixed(4),
    h: +(local.h * sy).toFixed(4),
  };
}
