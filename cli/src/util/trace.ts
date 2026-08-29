/**
 * Phase duration measurement.
 *
 * Why this is needed: in Phase 0 the baseline had to be reconstructed retrospectively
 * from transcripts because the tool did not break time down by phase. Saying "it is
 * slow" is easy; saying **which step** is slow takes measurement. This module provides
 * that.
 *
 * Silent by default: `--verbose` prints a human-readable summary (to stderr), `--trace`
 * writes JSON. stderr was chosen because `--json` output goes to stdout and is read by
 * machines — the trace must not contaminate it.
 */

export interface Faz {
  ad: string;
  ms: number;
  /** Nesting depth of the measurement. 0 = top level. */
  derinlik: number;
}

let kayitlar: Faz[] = [];
let t0 = 0;
let acik = false;
let derinlik = 0;

/** Starts the measurement. Called once at the beginning of a command. */
export function izlemeBaslat(): void {
  kayitlar = [];
  t0 = performance.now();
  derinlik = 0;
  acik = true;
}

/** Measure one phase. Works while disabled too — it just does not record. */
export async function olc<T>(ad: string, f: () => Promise<T> | T): Promise<T> {
  if (!acik) return await f();
  const b = performance.now();
  const d = derinlik++;
  try {
    return await f();
  } finally {
    derinlik--;
    // The duration is INCLUSIVE: `cikarma` also contains `xd-shell`. Without depth the
    // two would be summed and exceed the total — the reports account for this.
    kayitlar.push({ ad, ms: +(performance.now() - b).toFixed(1), derinlik: d });
  }
}

/** Record a duration measured elsewhere (for places already timed with `Date.now()`). */
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
 * The shape that goes into `runs.jsonl`: phase name → seconds.
 * The main plan asks for "extraction/verification/visual durations **separately**".
 */
export function fazSn(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of kayitlar) {
    // The same name can be measured more than once (e.g. two artboards) — they are summed.
    out[f.ad] = +(((out[f.ad] ?? 0) * 1000 + f.ms) / 1000).toFixed(2);
  }
  out.toplam = +(toplamMs() / 1000).toFixed(2);
  return out;
}

/** The unmeasured remainder is computed from TOP-LEVEL phases only (nested ones do not count). */
function ustSeviyeToplam(): number {
  return kayitlar.filter((k) => k.derinlik === 0).reduce((a, k) => a + k.ms, 0);
}

/** Human-readable summary — the slowest phase is marked. */
export function rapor(): string {
  if (!kayitlar.length) return '';
  const toplam = toplamMs();
  const enUzun = Math.max(...kayitlar.map((k) => k.ms));
  const genislik = Math.max(...kayitlar.map((k) => k.ad.length));
  // Records are in completion order; sort by depth so nested ones read correctly.
  const sirali = [...kayitlar].sort((a, b) => a.derinlik - b.derinlik || 0);
  const satirlar = sirali.map((k) => {
    const pay = toplam > 0 ? (100 * k.ms) / toplam : 0;
    const bar = '█'.repeat(Math.max(1, Math.round(pay / 4)));
    const isaret = k.ms === enUzun && sirali.length > 1 ? '  ← en yavaş' : '';
    const girinti = '  '.repeat(k.derinlik);
    const ad = (girinti + k.ad).padEnd(genislik + k.derinlik * 2);
    return `  ${ad}  ${String(Math.round(k.ms)).padStart(6)} ms  ${bar}${isaret}`;
  });
  // The unmeasured remainder: I/O, parsing and writing that no phase covers.
  // Nested phases were already counted inside their parents; only top level is summed.
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
