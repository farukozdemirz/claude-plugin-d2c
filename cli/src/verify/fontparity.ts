/**
 * POC-4 — AGC font metriği ↔ Chrome `fontBoundingBox` pariteşi.
 *
 * Ana planın M1 kuralı: `fontKutusuAgc` ham AGC değeridir ve Chrome metriği
 * SAYILMAZ. Bu POC, hangi ailelerde eşit olduğunu **aile başına** belirler.
 *
 * Ön ölçüm (ana plandan): Bw Modelica dört puntoda birebir, Tobias TRIAL 48px'te
 * 10px sapıyor ve yarı-satırın İŞARETİNİ değiştiriyor. Yani sonuç karışık bekleniyor
 * ve karar hep-ya-hiç olmamalı.
 *
 * Parite kanıtlanmayan ailelerde `d2c-code` §3'teki tarayıcı ölçümü **korunur**.
 */
import type { SayfaOlcum } from './measure.js';

/** Farkın "parite" sayılması için üst sınır (px). */
export const PARITE_ESIGI = 0.5;

export interface PariteSatir {
  aile: string;
  /** Gerçekte render edilen aile (next/font üretilen adı olabilir). */
  cozulmusAile: string;
  punto: number;
  agc: number | null;
  chrome: number;
  fark: number | null;
  parite: boolean | null;
}

export interface PariteSonuc {
  satirlar: PariteSatir[];
  /** Aile başına karar — `agc` yalnız TÜM puntolarda parite varsa. */
  kararlar: Record<string, 'agc' | 'tarayici'>;
  fontYuklu: Record<string, boolean>;
}

/**
 * @param agcKutulari `olcum.json`/`design.json`'dan gelen `aile|punto -> fontKutusuAgc`
 */
export function pariteHesapla(
  olcum: SayfaOlcum,
  agcKutulari: Map<string, number>
): PariteSonuc {
  const satirlar: PariteSatir[] = [];
  const aileHatali = new Set<string>();
  const aileGorulen = new Set<string>();

  for (const fk of olcum.fontKutulari) {
    const agc = agcKutulari.get(`${fk.aile}|${fk.punto}`) ?? null;
    const fark = agc == null ? null : +(fk.kutu - agc).toFixed(3);
    const parite = fark == null ? null : Math.abs(fark) < PARITE_ESIGI;
    const yuklu = olcum.fontlar.find((f) => f.aile === fk.aile)?.yuklu ?? true;
    satirlar.push({
      aile: fk.aile, cozulmusAile: fk.cozulmusAile, punto: fk.punto,
      agc, chrome: fk.kutu, fark,
      // Font yüklü değilse parite BELİRSİZ — eşleşse bile güvenilmez.
      parite: yuklu ? parite : null,
    });
    if (parite === false) aileHatali.add(fk.aile);
    if (parite !== null) aileGorulen.add(fk.aile);
  }

  // YÜKLÜ OLMAYAN font için parite BELİRLENEMEZ.
  //
  // Ölçüldü: Helvetica Neue projede yok; Chrome fallback'in metriğini (14) ölçtü ve
  // AGC değeriyle (14) TESADÜFEN eşleşti → yanlış "agc" kararı. Yüklü olmayan fontta
  // ölçüm zaten güvenilmez; güvenli taraf `tarayici`.
  const yukluOlmayan = new Set(olcum.fontlar.filter((f) => !f.yuklu).map((f) => f.aile));

  const kararlar: Record<string, 'agc' | 'tarayici'> = {};
  for (const aile of aileGorulen) {
    // Tek bir punto bile sapıyorsa VEYA font yüklü değilse tarayıcı ölçümü korunur.
    kararlar[aile] = aileHatali.has(aile) || yukluOlmayan.has(aile) ? 'tarayici' : 'agc';
  }
  // Hiç AGC karşılığı olmayan aileler ölçülemedi → varsayılan güvenli taraf.
  for (const f of olcum.fontlar) {
    if (!(f.aile in kararlar)) kararlar[f.aile] = 'tarayici';
  }

  return {
    satirlar,
    kararlar,
    fontYuklu: Object.fromEntries(olcum.fontlar.map((f) => [f.aile, f.yuklu])),
  };
}
