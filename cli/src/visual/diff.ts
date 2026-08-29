/**
 * Görsel karşılaştırma — motor seçimi.
 *
 * Faz 5b'de hesaplama TypeScript'e taşındı (`engine.ts`) ve piksel düzeyinde
 * PIL ile eşdeğerliği kanıtlandı. Python script'i **silinmedi**:
 *
 *   - `--kalibre` çapa mantığı bilerek taşınmadı; ölçek bilinmediğinde tek yol o.
 *   - `--motor python` her zaman elde: TS motorundan şüphe edilirse geri dönülür.
 *
 * `kalibre` verildiğinde motor otomatik olarak Python'a düşer — sessizce yanlış
 * sonuç üretmektense bilinen yolu kullanmak doğrusu.
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
  /** XD görüntüsünden kırpılacak TASARIM kutusu (thumbnail ölçeği uygulanır). */
  tasarimKutu?: [number, number, number, number];
  /** Referans PNG'nin tasarım→piksel ölçeği (thumbnail'da tam 0,5). */
  olcek?: number;
  /** Render'dan kırpılacak piksel kutusu. */
  renderKutu?: [number, number, number, number];
  /** Çapa mekanizması — KORUNUYOR, geri dönüş yolu. Yalnız Python motorunda. */
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

/** Tasarım kutusu + bilinen ölçek → referans PNG'deki piksel kutusu. */
function xdPikselKutu(sec: DiffSecenek): [number, number, number, number] | undefined {
  if (sec.kalibre || !sec.tasarimKutu || !sec.olcek) return undefined;
  const s = sec.olcek;
  return sec.tasarimKutu.map((v) => Math.round(v * s)) as [number, number, number, number];
}

/**
 * Referans tam çözünürlükte DEĞİLSE render'ı aynı ölçeğe indir.
 *
 * Bu, script'in uyardığı "ölçekleme birikimli kaymayı gizler" durumu DEĞİL:
 * buradaki ölçek farkı BİLİNEN ve kasıtlı (thumbnail tam 0,5×). Ölçeklemezsek
 * ikisi ortak minimuma kırpılır ve her şey kayar — ölçüldü: %30 sahte fark.
 */
function olcekliMi(sec: DiffSecenek): boolean {
  return !!sec.olcek && Math.abs(sec.olcek - 1) > 0.001 && !sec.kalibre;
}

export function gorselKarsilastir(sec: DiffSecenek): DiffSonuc {
  // Çapa yolu yalnız Python'da var; istenmişse motoru zorla.
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
    // Çıkış kodu 1 = yapısal eşik aşıldı; HATA DEĞİL, bulgudur.
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
