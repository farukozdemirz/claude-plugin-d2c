/**
 * olcum.json — CLAUDE'S ONLY INPUT.
 *
 * The invariant from the main plan §8:
 *   design.json → deterministic tools only
 *   olcum.json  → Claude only
 *
 * So this file has to be **self-contained**: every value Claude needs to write the
 * component is inline, and no value requires looking at another file. The `id` fields
 * exist only for traceability and reproduction.
 */
import { z } from 'zod';

export const OLCUM_SCHEMA_VERSION = 1;

const Kutu = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Radius = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const KonturSchema = z.object({
  genislik: z.number(),
  renk: z.string(),
  hiza: z.enum(['inside', 'outside', 'center']),
});

export const OlcuSchema = z.object({
  kutu: Kutu,
  radius: Radius.nullable().optional(),
  radiusKaynak: z.enum(['rect', 'yol', 'bilinmiyor', 'yok']).optional(),
  dolgu: z.string().nullable().optional(),
  kontur: KonturSchema.nullable().optional(),
  metinGenisligi: z.number().nullable().optional(),
  satirSayisi: z.number().optional(),
});

export const FontSchema = z.object({
  aile: z.string().nullable(),
  agirlik: z.string().nullable(),
  punto: z.number().nullable(),
  satir: z.number().nullable(),
  ls: z.number().nullable(),
  renk: z.string().nullable(),
  hiza: z.string().nullable(),
  /** The RAW AGC value. NOT CONSUMED in M1 (POC-4, M2). */
  fontKutusuAgc: z.number().nullable(),
  /** Always "tarayici" in M1: the code phase keeps using the existing measurement. */
  fontKutusuKaynak: z.enum(['tarayici', 'agc']),
  /** Always null in M1 — the code phase computes it in the browser. */
  yariSatir: z.number().nullable(),
});

/**
 * The compressed form of 3+ elements with the same signature. Three shapes:
 *   · regular 1-D    → `eksen: "x"|"y"` + `adim`
 *   · regular grid   → `eksen: "izgara"` + `adimX`/`adimY` + `sutun`/`satir`
 *   · irregular      → `duzenli: false` + `konumlar` (every top-left corner)
 *
 * In the irregular case NO INFORMATION IS LOST: every element's position is preserved,
 * only the repeated style/size fields are written once.
 */
export const TekrarSchema = z.object({
  adet: z.number(),
  duzenli: z.boolean(),
  eksen: z.enum(['x', 'y', 'izgara']).optional(),
  adim: z.number().optional(),
  adimX: z.number().optional(),
  adimY: z.number().optional(),
  sutun: z.number().optional(),
  satir: z.number().optional(),
  konumlar: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export const ElemanSchema = z.object({
  id: z.string().nullable(),
  ad: z.string().nullable(),
  tip: z.string(),
  /** Labels that can be derived safely; null when they cannot — nothing is invented. */
  rol: z.string().nullable(),
  /** Filled in by the code phase. Must be populated before `render verify` is called. */
  testid: z.string().nullable(),
  ebeveyn: z.string().nullable(),
  sira: z.number(),
  tekrar: TekrarSchema.optional(),
  metin: z.string().optional(),
  font: FontSchema.optional(),
  gorselUid: z.string().nullable().optional(),
  desktop: OlcuSchema.optional(),
  mobil: OlcuSchema.optional(),
});

export const HesaplananSchema = z.object({
  ne: z.string(),
  desktop: z.number().nullable(),
  mobil: z.number().nullable(),
  /** Where the value came from — the playbook §14 discipline. */
  nasil: z.string(),
});

export const OlcumSchema = z.object({
  schemaVersion: z.literal(OLCUM_SCHEMA_VERSION),
  kaynak: z.object({
    design: z.string(),
    ekran: z.string(),
    modifiedDate: z.number().nullable(),
    uretilme: z.string(),
  }),
  bolum: z.object({
    index: z.number(),
    slug: z.string(),
    ad: z.string().nullable(),
    desktop: Kutu.nullable(),
    mobil: Kutu.nullable(),
    zemin: z.string().nullable(),
  }),
  palet: z.array(z.object({ hex: z.string(), adet: z.number() })),
  stiller: z.array(FontSchema.extend({ adet: z.number() })),
  elemanlar: z.array(ElemanSchema),
  hesaplanan: z.array(HesaplananSchema),
  referans: z.record(z.string(), z.object({
    png: z.string(), kirpma: Kutu,
  })).default({}),
  kabulEdilenSapmalar: z.array(z.string()).default([]),
  cozulemedi: z.array(z.string()).default([]),
});

export type Olcum = z.infer<typeof OlcumSchema>;
export type OlcumEleman = z.infer<typeof ElemanSchema>;
