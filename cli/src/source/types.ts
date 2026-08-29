/**
 * Tasarım kaynağı sınırı.
 *
 * Amaç gelecekteki kaynaklar DEĞİL — XD'ye özgü kodu D2C çekirdeğinden ayırmak.
 * `sections/`, `verify/`, `visual/` yalnız bu tipleri görür; `agc`, `prototypeData`,
 * `component_id` gibi kelimeleri hiç bilmez.
 */
import type { Design } from '../contracts/design.js';
import type { Kontrol } from './adobe-xd/contract.js';

export interface EkranOzeti {
  id: string;
  ad: string;
  boyut: [number, number];
  /** Aynı ekranın karşı platformdaki eşi (ad benzerliğiyle bulunur). */
  esId?: string | null;
}

export interface Inspection {
  kaynakTipi: string;
  belgeAdi: string;
  ekranlar: EkranOzeti[];
  kontroller: Kontrol[];
  sureMs: number;
}

export interface DesignSource {
  inspect(): Promise<Inspection>;
  extractScreen(screenIdOrName: string, opts?: { pairMobile?: boolean }): Promise<Design>;
}
