/** verification.json — deterministik render doğrulamasının çıktısı. */
import { z } from 'zod';

export const VERIFICATION_SCHEMA_VERSION = 1;

export const FarkSchema = z.object({
  alan: z.string(),
  hedef: z.union([z.number(), z.string()]).nullable(),
  olculen: z.union([z.number(), z.string()]).nullable(),
  fark: z.number().nullable(),
  /**
   * `gecti`  — tolerans içinde
   * `kabul`  — bilinen ve kabul edilmiş sapma (sebep zorunlu) · sapan SAYILMAZ ama GİZLENMEZ
   * `uyari`  — ölçüm güvenilmez (ör. font yüklü değil) · `✗` değil
   * `sapan`  — gerçek sapma
   */
  durum: z.enum(['gecti', 'kabul', 'uyari', 'sapan']),
  sebep: z.string().optional(),
});

export const ElemanSonucSchema = z.object({
  testid: z.string(),
  ad: z.string().nullable(),
  bulundu: z.boolean(),
  olculen: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
  farklar: z.array(FarkSchema),
});

export const ViewportSonucSchema = z.object({
  genislik: z.number(),
  emuleEdilen: z.number(),
  clientWidthDogrulandi: z.boolean(),
  yatayTasma: z.boolean(),
  fontlar: z.array(z.object({ aile: z.string(), yuklu: z.boolean() })),
  elemanlar: z.array(ElemanSonucSchema),
});

export const VerificationSchema = z.object({
  schemaVersion: z.literal(VERIFICATION_SCHEMA_VERSION),
  tur: z.number(),
  tarih: z.string(),
  url: z.string(),
  olcum: z.string(),
  sureMs: z.number(),
  viewportlar: z.array(ViewportSonucSchema),
  ozet: z.object({
    toplam: z.number(), gecen: z.number(), kabul: z.number(),
    uyari: z.number(), sapan: z.number(),
  }),
  /** Ölçüm yapılamadıysa sebebi — sessiz başarısızlık yok. */
  durduruldu: z.string().nullable(),
});

export type Verification = z.infer<typeof VerificationSchema>;
export type Fark = z.infer<typeof FarkSchema>;
