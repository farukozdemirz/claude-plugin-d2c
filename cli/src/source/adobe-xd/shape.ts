/**
 * AGC şekil düğümlerini kutuya + yarıçapa çevirir.
 *
 * `rect` doğrudan `r: [tl,tr,br,bl]` veriyor. `path` için yarıçap YOL VERİSİNDEN
 * çıkarılır — mevcut araç bunu dpr-3 screenshot + en küçük kareler ile yapıyordu;
 * kaynak veride kübik kontrol noktası zaten kesin değeri taşıyor.
 *
 * KURAL: desen tanınmazsa yarıçap UYDURULMAZ — `kaynak: "bilinmiyor"` döner.
 */

export type RadiusKaynak = 'rect' | 'yol' | 'bilinmiyor' | 'yok';

export interface Kutu { x: number; y: number; w: number; h: number }
export interface SekilOlcu {
  kutu: Kutu;
  radius: [number, number, number, number] | null;
  radiusKaynak: RadiusKaynak;
}

/** Çember yaklaşıklama sabiti: bir kübik yay için kontrol noktası r·k uzaklıkta. */
const KAPPA = 0.5522847498307936;

/** SVG yol verisindeki tüm sayıları sırayla çıkarır. */
export function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
}

/** Yol verisinin sınır kutusu — kontrol noktaları dahil (üst sınır, güvenli taraf). */
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
 * Yuvarlatılmış dikdörtgen yolundan yarıçap çıkarır.
 *
 * Desen: `M r 0 L (w−r) 0 C (w−r+r·κ) 0 w (r−r·κ) w r L …`
 * Yarıçap, düz kenarın bittiği nokta ile köşe arasındaki mesafedir. Doğrulama:
 * BİRİNCİ kontrol noktası, yay başlangıcından hareket yönünde `r·κ` uzaklıkta durur.
 * Tutmazsa desen tanınmamış sayılır (yalnız köşesi yuvarlatılmış dikdörtgen kabul edilir).
 *
 * Doğrulanmış örnek (Path 8257): `M 12 0 L 1300 0 C 1306.627 0 1312 5.373 1312 12`
 *   → r = 1312 − 1300 = 12
 *   → kontrol: 1306.627 − 1300 = 6.627 ≈ 12·0.5523 = 6.627 ✓
 */
export function radiusFromRoundedRectPath(d: string): number | null {
  // İlk kübik yay: "L x1 y1 C cx1 cy1 cx2 cy2 x2 y2"
  const m = /L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*C\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  if (!m) return null;
  const [x1, y1, c1x, c1y, , , x2, y2] = m.slice(1).map(Number) as number[];
  if ([x1, y1, c1x, c1y, x2, y2].some((v) => !Number.isFinite(v))) return null;
  // Yay, düz kenarın bitiminden köşeye dönüyor: yarıçap iki eksendeki mesafe.
  const rx = Math.abs(x2! - x1!);
  const ry = Math.abs(y2! - y1!);
  const r = Math.max(rx, ry);
  if (r <= 0) return null;
  // Kontrol noktası doğrulaması — desen gerçekten çember yayı mı?
  // İlk kontrol noktası, yay başlangıcından hareket yönünde r·κ uzaklıkta olmalı.
  const beklenen = r * KAPPA;
  const gozlenen = Math.hypot(c1x! - x1!, c1y! - y1!);
  if (Math.abs(gozlenen - beklenen) > Math.max(0.05, r * 0.02)) return null;
  return +r.toFixed(4);
}

/** AGC şekil düğümünü ölçüye çevirir. */
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
    // Ayraç çizgileri; kalınlık kontur genişliğinden gelir, kutu sıfır kalınlıktadır.
    const x1 = +(shape.x1 ?? 0), y1 = +(shape.y1 ?? 0);
    const x2 = +(shape.x2 ?? 0), y2 = +(shape.y2 ?? 0);
    return {
      kutu: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) },
      radius: null,
      radiusKaynak: 'yok',
    };
  }
  if (t === 'path' && typeof shape.path === 'string') {
    const kutu = pathBBox(shape.path);
    if (!kutu) return null;
    const r = radiusFromRoundedRectPath(shape.path);
    return {
      kutu,
      radius: r != null ? [r, r, r, r] : null,
      // Desen tanınmadıysa UYDURMA — bilinmiyor de.
      radiusKaynak: r != null ? 'yol' : 'bilinmiyor',
    };
  }
  return null;
}
