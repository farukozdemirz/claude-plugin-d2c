/** Bölüm haritası sözleşmesi. */
import { z } from 'zod';

export const SECTIONS_SCHEMA_VERSION = 1;

export const BantSchema = z.object({
  y: z.number(), h: z.number(), ad: z.string().nullable(), renk: z.string().nullable(),
});

export const BaslikSchema = z.object({
  metin: z.string(), punto: z.number().nullable(), satir: z.number().nullable(),
  aile: z.string().nullable(), agirlik: z.string().nullable(), renk: z.string().nullable(),
  kutu: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const BolumSchema = z.object({
  index: z.number(), y: z.number(), h: z.number(),
  zemin: z.string().nullable(), bant: z.string().nullable(),
  ad: z.string().nullable(), baslik: BaslikSchema.nullable().optional(),
});

export const SectionMapSchema = z.object({
  schemaVersion: z.literal(SECTIONS_SCHEMA_VERSION),
  ekran: z.string(),
  viewport: z.enum(['desktop', 'mobil']),
  artboardId: z.string(),
  tasarim: z.tuple([z.number(), z.number()]),
  bantlar: z.array(BantSchema),
  bolumler: z.array(BolumSchema),
});

export type SectionMap = z.infer<typeof SectionMapSchema>;
export type Bolum = z.infer<typeof BolumSchema>;
