/** robust.json — multi-width layout robustness output. */
import { z } from 'zod';

export const ROBUST_SCHEMA_VERSION = 1;

/**
 * A finding's severity.
 *
 * The distinction matters: as the window narrows, text reflowing is EXPECTED and is not
 * a defect. Elements landing on top of each other, or escaping their container, is.
 * Without this separation every narrow viewport would look "broken" and the check would
 * be ignored.
 */
export const SeviyeSchema = z.enum(['hata', 'uyari', 'bilgi']);

export const BulguSchema = z.object({
  seviye: SeviyeSchema,
  /**
   * `cakisma`            — two siblings overlap
   * `yatay-tasma`        — the page scrolls horizontally
   * `kapsayici-tasmasi`  — a child escapes its container
   * `sarma`              — an element got taller (text reflowed) · expected
   */
  tur: z.enum(['cakisma', 'yatay-tasma', 'kapsayici-tasmasi', 'sarma']),
  genislik: z.number(),
  elemanlar: z.array(z.string()),
  miktarPx: z.number().nullable(),
  detay: z.string(),
});

export const GenislikSonucSchema = z.object({
  genislik: z.number(),
  dogrulandi: z.boolean(),
  /** Was measurement skipped? If the viewport could not be verified, we do not measure. */
  atlandi: z.string().nullable(),
  bulgular: z.array(BulguSchema),
});

export const RobustSchema = z.object({
  schemaVersion: z.literal(ROBUST_SCHEMA_VERSION),
  tarih: z.string(),
  url: z.string(),
  /** The design's own width — the pixel-perfect anchor, not a robustness check. */
  referansGenislik: z.number().nullable(),
  genislikler: z.array(GenislikSonucSchema),
  ozet: z.object({ hata: z.number(), uyari: z.number(), bilgi: z.number() }),
  sureMs: z.number(),
});

export type Bulgu = z.infer<typeof BulguSchema>;
export type Robust = z.infer<typeof RobustSchema>;
