/**
 * Faz süresi ölçümü.
 *
 * Neden gerek var: Faz 0'da temel, transcript'ten geriye dönük çıkarıldı çünkü
 * araç süreyi fazlara bölmüyordu. "Yavaş" demek kolay, **hangi adımın** yavaş
 * olduğunu söylemek ölçüm ister. Bu modül onu veriyor.
 *
 * Varsayılan sessiz: `--verbose` insan okunur özet (stderr), `--trace` JSON.
 * stderr seçildi çünkü `--json` çıktısı stdout'ta ve makine tarafından okunuyor —
 * izleme oraya karışmamalı.
 */

export interface Faz {
  ad: string;
  ms: number;
  /** İç içe ölçüm derinliği. 0 = üst seviye. */
  derinlik: number;
}

let kayitlar: Faz[] = [];
let t0 = 0;
let acik = false;
let derinlik = 0;

/** Ölçümü başlatır. Komut başında bir kez çağrılır. */
export function izlemeBaslat(): void {
  kayitlar = [];
  t0 = performance.now();
  derinlik = 0;
  acik = true;
}

/** Bir fazı ölç. Kapalıyken de çalışır — yalnız kayıt tutmaz. */
export async function olc<T>(ad: string, f: () => Promise<T> | T): Promise<T> {
  if (!acik) return await f();
  const b = performance.now();
  const d = derinlik++;
  try {
    return await f();
  } finally {
    derinlik--;
    // Süre KAPSAYICI: `cikarma` içinde `xd-shell` de var. Derinlik olmadan ikisi
    // toplanır ve toplam süreyi aşar — raporlar bunu bilerek hesaplıyor.
    kayitlar.push({ ad, ms: +(performance.now() - b).toFixed(1), derinlik: d });
  }
}

/** Dışarıdan ölçülmüş bir süreyi kaydet (zaten `Date.now()` ile ölçülen yerler için). */
export function fazEkle(ad: string, ms: number): void {
  if (acik) kayitlar.push({ ad, ms: +ms.toFixed(1), derinlik: 0 });
}

export function fazlar(): Faz[] {
  return [...kayitlar];
}

export function toplamMs(): number {
  return acik ? +(performance.now() - t0).toFixed(1) : 0;
}

/**
 * `runs.jsonl`'a giden biçim: faz adı → saniye.
 * Ana plan "çıkarma/doğrulama/görsel süreleri **ayrı ayrı**" istiyor.
 */
export function fazSn(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of kayitlar) {
    // Aynı ad birden çok kez ölçülebilir (ör. iki artboard) — toplanır.
    out[f.ad] = +(((out[f.ad] ?? 0) * 1000 + f.ms) / 1000).toFixed(2);
  }
  out.toplam = +(toplamMs() / 1000).toFixed(2);
  return out;
}

/** Ölçülmeyen kalan yalnız ÜST SEVİYE fazlardan hesaplanır (iç içe olanlar sayılmaz). */
function ustSeviyeToplam(): number {
  return kayitlar.filter((k) => k.derinlik === 0).reduce((a, k) => a + k.ms, 0);
}

/** İnsan okunur özet — en yavaş faz işaretlenir. */
export function rapor(): string {
  if (!kayitlar.length) return '';
  const toplam = toplamMs();
  const enUzun = Math.max(...kayitlar.map((k) => k.ms));
  const genislik = Math.max(...kayitlar.map((k) => k.ad.length));
  // Kayıtlar bitiş sırasında; iç içe olanların okunması için başlangıç sırasına al.
  const sirali = [...kayitlar].sort((a, b) => a.derinlik - b.derinlik || 0);
  const satirlar = sirali.map((k) => {
    const pay = toplam > 0 ? (100 * k.ms) / toplam : 0;
    const bar = '█'.repeat(Math.max(1, Math.round(pay / 4)));
    const isaret = k.ms === enUzun && sirali.length > 1 ? '  ← en yavaş' : '';
    const girinti = '  '.repeat(k.derinlik);
    const ad = (girinti + k.ad).padEnd(genislik + k.derinlik * 2);
    return `  ${ad}  ${String(Math.round(k.ms)).padStart(6)} ms  ${bar}${isaret}`;
  });
  // Ölçülmeyen kalan: fazlara girmeyen G/Ç, parse, yazma.
  // İç içe fazlar ebeveynlerinin içinde zaten sayıldı; yalnız üst seviye toplanır.
  const kalan = toplam - ustSeviyeToplam();
  return [
    '',
    `# izleme  (toplam ${Math.round(toplam)} ms)`,
    ...satirlar,
    kalan > 1 ? `  ${'(ölçülmeyen)'.padEnd(genislik)}  ${String(Math.round(kalan)).padStart(6)} ms` : '',
  ].filter(Boolean).join('\n');
}

export function izlemeJson(): {
  toplamMs: number; olculmeyenMs: number; fazlar: Faz[]; fazSn: Record<string, number>;
} {
  return {
    toplamMs: toplamMs(),
    olculmeyenMs: +(toplamMs() - ustSeviyeToplam()).toFixed(1),
    fazlar: fazlar(),
    fazSn: fazSn(),
  };
}
