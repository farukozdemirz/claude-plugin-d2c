/**
 * olcum.json — CLAUDE'UN TEK GİRDİSİ.
 *
 * Ana plan §8'in değişmez kuralı:
 *   design.json → yalnız deterministik araçlar
 *   olcum.json  → yalnız Claude
 *
 * Bu yüzden dosya **kendi içinde yeterli** olmak zorunda: Claude'un bileşeni yazmak
 * için ihtiyaç duyduğu her değer inline bulunur, hiçbir değer için başka dosyaya
 * bakılmaz. `id` alanları yalnız izlenebilirlik ve yeniden üretim içindir.
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
  /** HAM AGC değeri. M1'de TÜKETİLMEZ (POC-4, M2). */
  fontKutusuAgc: z.number().nullable(),
  /** M1'de her zaman "tarayici": kod fazı mevcut ölçümü sürdürür. */
  fontKutusuKaynak: z.enum(['tarayici', 'agc']),
  /** M1'de her zaman null — kod fazı tarayıcıda hesaplar. */
  yariSatir: z.number().nullable(),
});

/**
 * Aynı imzalı 3+ elemanın sıkıştırılmış hali. Üç biçim:
 *   · düzenli 1B  → `eksen: "x"|"y"` + `adim`
 *   · düzenli ızgara → `eksen: "izgara"` + `adimX`/`adimY` + `sutun`/`satir`
 *   · düzensiz    → `duzenli: false` + `konumlar` (tüm sol-üst köşeler)
 *
 * Düzensiz durumda BİLGİ KAYBI YOK: her elemanın konumu korunur, yalnız tekrarlanan
 * stil/boyut alanları bir kez yazılır.
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
  /** Güvenle türetilebilen etiketler; türetilemezse null — uydurulmaz. */
  rol: z.string().nullable(),
  /** Kod fazı doldurur. `render verify` çağrılmadan önce dolu olmalı. */
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
  /** Değerin nereden geldiği — playbook §14 disiplini. */
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
