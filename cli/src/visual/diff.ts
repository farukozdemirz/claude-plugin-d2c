/**
 * Visual comparison — engine selection.
 *
 * In Phase 5b the computation moved to TypeScript (`engine.ts`) and its equivalence
 * with PIL was proven at the pixel level. The Python script was **not deleted**:
 *
 *   - the `--kalibre` anchor logic was deliberately not ported; it is the only way when
 *     the scale is unknown.
 *   - `--motor python` is always at hand: fall back if the TS engine is in doubt.
 *
 * When `kalibre` is given the engine falls back to Python automatically — using the
 * known path is right, rather than silently producing a wrong result.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { motorCalistir } from './engine.js';

export type Motor = 'ts' | 'python';

export interface DiffSecenek {
  xdPng: string;
  renderPng: string;
  outDir: string;
  /** The DESIGN box to crop from the XD image (the thumbnail scale is applied). */
  tasarimKutu?: [number, number, number, number];
  /** The reference PNG's design→pixel scale (exactly 0.5 for a thumbnail). */
  olcek?: number;
  /** The pixel box to crop from the render. */
  renderKutu?: [number, number, number, number];
  /** The anchor mechanism — PRESERVED, a fallback path. Python engine only. */
  kalibre?: string;
  kirpmaAdet?: number;
  scriptYolu: string;
  motor?: Motor;
}

export interface DiffSonuc {
  ham: number;
  yapisal: number;
  esik: number;
  esikYapisal: number;
  boyut: [number, number];
  izgara: number;
  bolgeler: Array<{
    satir: number; sutun: number; yuzde: number;
    kutu: [number, number, number, number]; kirpma: string | null;
  }>;
  isiHaritasi: string;
  stdout: string;
  motor: Motor;
}

/** Design box + known scale → the pixel box in the reference PNG. */
function xdPikselKutu(sec: DiffSecenek): [number, number, number, number] | undefined {
  if (sec.kalibre || !sec.tasarimKutu || !sec.olcek) return undefined;
  const s = sec.olcek;
  return sec.tasarimKutu.map((v) => Math.round(v * s)) as [number, number, number, number];
}

/**
 * If the reference is NOT at full resolution, scale the render down to match.
 *
 * This is NOT the "scaling hides cumulative drift" case the script warns about: the
 * scale difference here is KNOWN and deliberate (the thumbnail is exactly 0.5×).
 * Without scaling, both are cropped to their common minimum and everything shifts —
 * measured: a 30% fake difference.
 */
function olcekliMi(sec: DiffSecenek): boolean {
  return !!sec.olcek && Math.abs(sec.olcek - 1) > 0.001 && !sec.kalibre;
}

export function gorselKarsilastir(sec: DiffSecenek): DiffSonuc {
  // The anchor path exists only in Python; force the engine if it was requested.
  const motor: Motor = sec.kalibre ? 'python' : (sec.motor ?? 'ts');
  return motor === 'ts' ? tsMotor(sec) : pythonMotor(sec);
}

function tsMotor(sec: DiffSecenek): DiffSonuc {
  const r = motorCalistir({
    xdPng: sec.xdPng,
    renderPng: sec.renderPng,
    out: join(sec.outDir, 'fark.png'),
    xdKutu: xdPikselKutu(sec),
    renderKutu: sec.renderKutu,
    olcekle: olcekliMi(sec),
    kirpmaDizin: join(sec.outDir, 'bolgeler'),
    kirpmaAdet: sec.kirpmaAdet ?? 4,
  });
  return { ...r, motor: 'ts' };
}

function pythonMotor(sec: DiffSecenek): DiffSonuc {
  const jsonYol = join(sec.outDir, 'visual-raw.json');
  const isiYol = join(sec.outDir, 'fark.png');
  const args = [
    sec.scriptYolu, sec.xdPng, sec.renderPng,
    '--out', isiYol,
    '--json', jsonYol,
    '--kirpma-dizin', join(sec.outDir, 'bolgeler'),
    '--kirpma-adet', String(sec.kirpmaAdet ?? 4),
  ];
  if (sec.kalibre) {
    args.push('--kalibre', sec.kalibre);
    if (sec.tasarimKutu) args.push('--tasarim-kutu', sec.tasarimKutu.join(','));
  } else {
    const k = xdPikselKutu(sec);
    if (k) args.push('--xd-kutu', k.join(','));
  }
  if (sec.renderKutu) args.push('--render-kutu', sec.renderKutu.join(','));
  if (olcekliMi(sec)) args.push('--olcekle');

  let stdout = '';
  try {
    stdout = execFileSync('python3', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    stdout = err.stdout ?? '';
    // Exit code 1 = the structural threshold was exceeded; NOT AN ERROR, a finding.
    if (err.status !== 1) {
      throw new Error(
        `visual-diff.py başarısız (çıkış ${err.status}):\n${err.stderr ?? err.stdout ?? ''}`
      );
    }
  }
  if (!existsSync(jsonYol)) {
    throw new Error(`visual-diff.py JSON üretmedi (${jsonYol}).\n${stdout}`);
  }
  return { ...JSON.parse(readFileSync(jsonYol, 'utf8')), stdout, motor: 'python' };
}
