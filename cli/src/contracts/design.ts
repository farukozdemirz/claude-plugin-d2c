/**
 * The design.json contract — Zod.
 *
 * Main plan §8: `design.json` is READ-ONLY, screen-scoped data extracted from the source.
 * Claude does NOT read it (the Claude boundary) — only deterministic tools consume it.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const Kutu = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Radius = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const KonturSchema = z.object({
  genislik: z.number(),
  renk: z.string(),
  hiza: z.enum(['inside', 'outside', 'center']),
});

export const ArtboardOlcuSchema = z.object({
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
  /**
   * The RAW AGC value. It is NOT Chrome's `fontBoundingBox` metric and is NOT consumed
   * in M1. Parity is decided per family in M2 via POC-4 (the main plan's M1 rule).
   */
  fontKutusuAgc: z.number().nullable(),
  postscript: z.string().nullable().optional(),
});

export const ElemanSchema = z.object({
  id: z.string().nullable(),
  ad: z.string().nullable(),
  tip: z.enum(['rect', 'path', 'circle', 'line', 'metin', 'gorsel', 'sekil']),
  ebeveyn: z.string().nullable(),
  derinlik: z.number(),
  sira: z.number(),
  metin: z.string().optional(),
  font: FontSchema.optional(),
  /** Phase 6 (M4) will download this; in M1 it is only carried. */
  gorselUid: z.string().nullable().optional(),
  olcekDavranisi: z.string().nullable().optional(),
  desktop: ArtboardOlcuSchema.optional(),
  mobil: ArtboardOlcuSchema.optional(),
});

export const ArtboardSchema = z.object({
  artboardId: z.string(),
  ad: z.string(),
  boyut: z.tuple([z.number(), z.number()]),
  koken: z.tuple([z.number(), z.number()]),
});

export const DesignSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kaynak: z.object({
    tip: z.literal('adobe-xd-share'),
    url: z.string(),
    docId: z.string().nullable(),
    modifiedDate: z.number().nullable(),
    agcVersion: z.string().nullable(),
    cikarilma: z.string(),
    /** If the contract check produced a warning it lands here — it is never passed over silently. */
    uyarilar: z.array(z.string()).default([]),
  }),
  ekran: z.object({
    ad: z.string(),
    desktop: ArtboardSchema.nullable(),
    mobil: ArtboardSchema.nullable(),
  }),
  palet: z.array(z.object({ hex: z.string(), adet: z.number() })).default([]),
  stiller: z
    .array(
      z.object({
        aile: z.string().nullable(),
        agirlik: z.string().nullable(),
        punto: z.number().nullable(),
        satir: z.number().nullable(),
        fontKutusuAgc: z.number().nullable(),
        renk: z.string().nullable(),
        adet: z.number(),
      })
    )
    .default([]),
  elemanlar: z.array(ElemanSchema),
});

export type Design = z.infer<typeof DesignSchema>;
export type Eleman = z.infer<typeof ElemanSchema>;
export type ArtboardOlcu = z.infer<typeof ArtboardOlcuSchema>;
