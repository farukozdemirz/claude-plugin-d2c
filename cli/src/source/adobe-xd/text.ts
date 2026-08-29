/**
 * AGC metin düğümlerinden tipografi çıkarır.
 *
 * Spec panelinin verdiğinden fazlasını veriyor:
 *   · satır yüksekliği   = ardışık satırların `position` farkı
 *   · font kutusu        = |ascent| + descent   ← M1'de TÜKETİLMEZ (POC-4, M2)
 *   · metin genişliği    = layoutBounds.right
 *   · hiza               = paragraphAlign
 *
 * ÖNEMLİ (ana plan M1 kuralı): `fontKutusuAgc` HAM AGC değeridir ve Chrome
 * `fontBoundingBox` metriği SAYILMAZ. Ölçüldü: Bw Modelica dört puntoda birebir
 * tutuyor ama Tobias TRIAL 48px'te 10px sapıyor (56 vs 66) ve yarı-satırın işaretini
 * değiştiriyor. Parite aile başına M2'de POC-4 ile belirlenecek; o zamana kadar kod
 * fazı mevcut tarayıcı ölçümünü sürdürür.
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
   * İlk satırın ascent'i (pozitif). AGC'de metin düğümünün transform'u ilk satırın
   * TABAN ÇİZGİSİNİ gösteriyor; XD'nin raporladığı çerçeve üstü `taban − ascent`.
   * Doğrulandı: "Ürün Yorumları" 48px Tobias → taban 3068, ascent 45, çerçeve üstü
   * 3023 = benchmark değeri.
   */
  ascent: number | null;
}

interface Line { position?: number; layoutBounds?: { left?: number; right?: number; ascent?: number; descent?: number } }

/** Bir metin düğümündeki tüm satırları paragraf sırasına göre düzler. */
export function flattenLines(ux: Record<string, any>): Line[] {
  const paras = ux?.outlinesLayout?.static?.paragraphs;
  if (!Array.isArray(paras)) return [];
  const out: Line[] = [];
  for (const p of paras) if (Array.isArray(p?.lines)) out.push(...(p.lines as Line[]));
  return out;
}

/**
 * Satır yüksekliği: ardışık iki satırın `position` farkı.
 * Tek satırlık metinde ÖLÇÜLEMEZ — `null` döner, uydurulmaz.
 */
export function lineHeightFrom(lines: Line[]): number | null {
  if (lines.length < 2) return null;
  const a = lines[0]?.position, b = lines[1]?.position;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  const lh = b - a;
  return lh > 0 ? +lh.toFixed(4) : null;
}

/** İlk satırın ascent'i, pozitif olarak. */
export function ascentFrom(lines: Line[]): number | null {
  const a = lines[0]?.layoutBounds?.ascent;
  return typeof a === 'number' ? Math.abs(a) : null;
}

/** Font kutusu: |ascent| + descent. AGC ham değeri (bkz. dosya başı notu). */
export function fontBoxFrom(lines: Line[]): number | null {
  const lb = lines[0]?.layoutBounds;
  if (!lb || typeof lb.ascent !== 'number' || typeof lb.descent !== 'number') return null;
  return +(Math.abs(lb.ascent) + lb.descent).toFixed(4);
}

/** Metin genişliği: en geniş satırın sağ kenarı. */
export function textWidthFrom(lines: Line[]): number | null {
  const rights = lines
    .map((l) => l.layoutBounds?.right)
    .filter((v): v is number => typeof v === 'number');
  return rights.length ? +Math.max(...rights).toFixed(4) : null;
}

/** AGC metin düğümünü ölçüye çevirir. */
export function measureText(node: Record<string, any>): MetinOlcu {
  const ux = node?.meta?.ux ?? {};
  const rs = Array.isArray(ux.rangedStyles) && ux.rangedStyles.length ? ux.rangedStyles[0] : {};
  const lines = flattenLines(ux);
  const run = lines[0]?.layoutBounds ? (ux.outlinesLayout?.static?.paragraphs?.[0]?.lines?.[0]?.runs?.[0]?.style ?? {}) : {};

  return {
    // AGC'de metin içeriği düğümün `name` alanında duruyor.
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
