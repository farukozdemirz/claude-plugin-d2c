/**
 * The design source boundary.
 *
 * The point is NOT future sources — it is separating XD-specific code from the D2C core.
 * `sections/`, `verify/` and `visual/` see only these types; they never know words like
 * `agc`, `prototypeData` or `component_id`.
 */
import type { Design } from '../contracts/design.js';
import type { Kontrol } from './adobe-xd/contract.js';

export interface EkranOzeti {
  id: string;
  ad: string;
  boyut: [number, number];
  /** The same screen's counterpart on the other platform (found by name similarity). */
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
