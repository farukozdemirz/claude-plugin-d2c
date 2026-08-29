/**
 * Varlık export'u — vektör → SVG, `pattern` → görsel dosyası.
 *
 * `limitations.md`'nin iki maddesini kapatır:
 *   · "Vektör ikonlar: XD viewer SVG vermiyor, yolu yaklaşıktır"
 *   · "Görseller: indirilemiyor, placeholder bırakılır"
 *
 * İkisi de AGC'de zaten var; iş onları dosyaya çıkarmak. Ölçülen gerçek maliyet:
 * kullanıcı ikonu yaklaşık çizildiği için iki görsel diff turu harcanmıştı.
 *
 * KURAL: dönüştürülemeyen düğüm **raporlanır**, sessizce atlanmaz.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DuzEleman, DuzSekil, Matrix } from './agc.js';
import { multiply, applyPoint } from './agc.js';
import { componentUrl } from './cdn.js';
import type { PrototypeData } from './share.js';
import { redactUrl, redactedError } from '../../util/redact.js';
import { pathNumbers } from './shape.js';

export interface Atlanan { ad: string | null; id: string | null; sebep: string }

export interface SvgSonuc {
  dosya: string;
  ad: string;
  kutu: [number, number, number, number];
  yolAdedi: number;
  /** Aynı içerikten kaç kopya vardı — carousel'de 8 özdeş ikon tek dosya olur. */
  kullanim: number;
}

export interface GorselSonuc { dosya: string; uid: string; boyutBayt: number; tip: string }

export interface AssetSonuc {
  svgler: SvgSonuc[];
  gorseller: GorselSonuc[];
  atlananlar: Atlanan[];
}

export function slug(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'varlik';
}

/** 2×3 affine tersi — grup-yerel koordinata dönmek için. */
export function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Yol verisindeki tüm koordinat çiftlerine matris uygular. */
export function pathTransform(d: string, m: Matrix): string {
  let i = 0;
  const sayilar: number[] = [];
  const parcalar = d.split(/(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/);
  for (const p of parcalar) if (/^-?\d/.test(p)) sayilar.push(Number(p));
  const donmus: number[] = [];
  for (let k = 0; k + 1 < sayilar.length; k += 2) {
    const pt = applyPoint(m, sayilar[k]!, sayilar[k + 1]!);
    donmus.push(+pt.x.toFixed(4), +pt.y.toFixed(4));
  }
  if (sayilar.length % 2) donmus.push(sayilar[sayilar.length - 1]!);
  return parcalar.map((p) => (/^-?\d/.test(p) ? String(donmus[i++]) : p)).join('');
}

function bbox(yollar: string[]): [number, number, number, number] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const d of yollar) {
    const n = pathNumbers(d);
    for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]!); ys.push(n[i + 1]!); }
  }
  if (!xs.length) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return [+x.toFixed(4), +y.toFixed(4), +(Math.max(...xs) - x).toFixed(4), +(Math.max(...ys) - y).toFixed(4)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Vektör grubundan SVG üretir.
 *
 * Yollar grubun ilk elemanının matrisine göre **yerelleştirilir**, böylece SVG
 * kendi başına anlamlı olur. `stroke.align` SVG'de karşılığı olmadığı için
 * **yazılmaz ve not düşülür** — uydurulmaz.
 */
export function svgUret(grup: DuzSekil[], ad: string): { svg: string; kutu: [number, number, number, number] } | null {
  const ilk = grup[0];
  if (!ilk) return null;
  const ters = invert(ilk.matrix);
  const yollar: Array<{ d: string; el: DuzSekil }> = [];
  for (const el of grup) {
    if (!el.yol) continue;
    // Elemanın kendi matrisi → grup-yerel: inv(ilk) ∘ kendi
    const yerel = ters ? multiply(ters, el.matrix) : ([1, 0, 0, 1, 0, 0] as Matrix);
    yollar.push({ d: pathTransform(el.yol, yerel), el });
  }
  if (!yollar.length) return null;
  const kutu = bbox(yollar.map((y) => y.d));
  if (!kutu) return null;

  const parcalar = yollar.map(({ d, el }) => {
    const f = el.dolgu ?? 'none';
    const s = el.kontur;
    const attrs = [
      `d="${esc(d)}"`,
      `fill="${f}"`,
      // Boolean şekil (compound) delik içerebilir; SVG varsayılanı `nonzero` deliği
      // DOLDURUR. XD'nin `exclude`/`subtract` sonucu ancak evenodd ile doğru çıkar.
      ...(el.sekilTipi === 'compound' ? ['fill-rule="evenodd"'] : []),
      ...(s ? [`stroke="${s.renk}"`, `stroke-width="${s.genislik}"`] : ['stroke="none"']),
    ];
    return `  <path ${attrs.join(' ')}/>`;
  });

  const notlar = grup.some((e) => e.kontur && e.kontur.hiza !== 'center')
    ? `\n  <!-- not: XD stroke.align="${grup.find((e) => e.kontur)?.kontur?.hiza}" — SVG'de karşılığı yok, uygulanmadı -->`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${kutu[0]} ${kutu[1]} ${kutu[2]} ${kutu[3]}" ` +
    `width="${kutu[2]}" height="${kutu[3]}" role="img" aria-label="${esc(ad)}">${notlar}\n` +
    parcalar.join('\n') + '\n</svg>\n';
  return { svg, kutu };
}

/** Vektörleri `ebeveyn`e göre gruplar — çok yollu ikonlar tek SVG olur. */
export function vektorGruplari(elemanlar: DuzEleman[]): Map<string, DuzSekil[]> {
  const g = new Map<string, DuzSekil[]>();
  for (const el of elemanlar) {
    if (el.tip !== 'sekil') continue;
    const s = el as DuzSekil;
    if (!s.yol) continue;
    const k = s.ebeveyn ?? s.id ?? 'kok';
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(s);
  }
  return g;
}

const UZANTI: Record<string, string> = {
  'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg',
  'image/svg+xml': '.svg', 'image/gif': '.gif',
};

/** `pattern` uid'lerini manifest üzerinden indirir. Aynı uid BİR KEZ iner. */
export async function gorselleriIndir(
  proto: PrototypeData,
  uidler: string[],
  hedefDizin: string
): Promise<{ gorseller: GorselSonuc[]; atlananlar: Atlanan[] }> {
  mkdirSync(hedefDizin, { recursive: true });
  const res = proto.manifest.resources ?? {};
  const gorseller: GorselSonuc[] = [];
  const atlananlar: Atlanan[] = [];
  const inen = new Set<string>();

  for (const uid of uidler) {
    if (inen.has(uid)) continue;
    inen.add(uid);
    const kayit = res[uid];
    if (!kayit) {
      atlananlar.push({ ad: uid, id: null, sebep: 'manifest resources içinde uid yok' });
      continue;
    }
    const u = componentUrl(proto, kayit.id);
    const r = await fetch(u);
    if (!r.ok) {
      atlananlar.push({ ad: uid, id: kayit.id, sebep: `indirilemedi: ${r.status} ${redactUrl(u)}` });
      continue;
    }
    const tip = (r.headers.get('content-type') ?? '').split(';')[0]!.trim();
    const uzanti = UZANTI[tip];
    if (!uzanti) {
      atlananlar.push({ ad: uid, id: kayit.id, sebep: `bilinmeyen içerik tipi: "${tip}"` });
      continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const dosya = join(hedefDizin, `${uid.slice(0, 12)}${uzanti}`);
    writeFileSync(dosya, buf);
    gorseller.push({ dosya, uid, boyutBayt: buf.length, tip });
  }
  return { gorseller, atlananlar };
}

/** Bir artboard'ın vektörlerini SVG'ye yazar. */
export function svgleriYaz(elemanlar: DuzEleman[], hedefDizin: string): { svgler: SvgSonuc[]; atlananlar: Atlanan[] } {
  mkdirSync(hedefDizin, { recursive: true });
  const svgler: SvgSonuc[] = [];
  const atlananlar: Atlanan[] = [];

  for (const el of elemanlar) {
    if (el.tip !== 'sekil') continue;
    const s = el as DuzSekil;
    if (s.desteklenmeyenDolgu) {
      atlananlar.push({ ad: s.ad, id: s.id, sebep: `dolgu tipi "${s.desteklenmeyenDolgu}" SVG'ye çevrilmiyor` });
    }
    if (s.sekilTipi === 'path' && !s.yol) {
      atlananlar.push({ ad: s.ad, id: s.id, sebep: 'yol verisi boş' });
    }
  }

  // İÇERİK BAZLI TEKİLLEŞTİRME: bir carousel'de 8 özdeş kart varsa aynı ikon 8 kez
  // üretilir. Aynı SVG'yi 8 dosyaya yazmak gereksiz ve kod fazını "hangisini
  // kullanayım" sorusuyla bırakır. Aynı içerik → tek dosya; kaç yerde kullanıldığı
  // `kullanim` alanında durur.
  const icerikIndeksi = new Map<string, SvgSonuc>();
  const kullanilanAd = new Map<string, number>();
  for (const [, grup] of vektorGruplari(elemanlar)) {
    const ad = grup[0]!.ad ?? 'varlik';
    const uretim = svgUret(grup, ad);
    if (!uretim) {
      atlananlar.push({ ad, id: grup[0]!.id, sebep: 'SVG üretilemedi (geçerli yol yok)' });
      continue;
    }
    const mevcut = icerikIndeksi.get(uretim.svg);
    if (mevcut) { mevcut.kullanim++; continue; }

    const temel = slug(ad);
    const n = (kullanilanAd.get(temel) ?? 0) + 1;
    kullanilanAd.set(temel, n);
    const dosya = join(hedefDizin, `${temel}${n > 1 ? `-${n}` : ''}.svg`);
    writeFileSync(dosya, uretim.svg);
    const kayit: SvgSonuc = { dosya, ad, kutu: uretim.kutu, yolAdedi: grup.length, kullanim: 1 };
    icerikIndeksi.set(uretim.svg, kayit);
    svgler.push(kayit);
  }
  return { svgler, atlananlar };
}
