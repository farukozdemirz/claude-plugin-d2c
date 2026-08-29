/** visual.json — görsel karşılaştırmanın makine okunur çıktısı. */
import { z } from 'zod';

export const VISUAL_SCHEMA_VERSION = 1;

export const BolgeSchema = z.object({
  satir: z.number(), sutun: z.number(), yuzde: z.number(),
  kutu: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** Ajanın BAKACAĞI hazır kırpma (XD | render yan yana, büyütülmüş). */
  kirpma: z.string().nullable(),
});

export const VisualSchema = z.object({
  schemaVersion: z.literal(VISUAL_SCHEMA_VERSION),
  tur: z.number(),
  tarih: z.string(),
  referans: z.object({
    kaynak: z.enum(['thumbnail', 'tarayici']),
    png: z.string(),
    /** Tasarım → PNG eşlemesi. Thumbnail'da ölçek TAM bilinir, çapa türetilmez. */
    olcek: z.number(),
    kirpma: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
  render: z.object({ png: z.string(), kirpma: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  /**
   * Yüzdeler GEÇME NOTU DEĞİL. XD metni kendi rasterizer'ıyla, tarayıcı kendi
   * hinting'iyle çiziyor; metin ağırlıklı bölümde taban %5-10. Göreli kullanılır.
   */
  hamYuzde: z.number(),
  yapisalYuzde: z.number(),
  bolgeler: z.array(BolgeSchema),
  isiHaritasi: z.string(),
  sureMs: z.number(),
  /**
   * Sayıları hangi motor üretti. Varsayılan `ts`; `--kalibre` verildiğinde
   * otomatik `python` olur (çapa mantığı bilerek taşınmadı). Opsiyonel+varsayılan
   * olduğu için Faz 5b öncesi yazılmış `visual.json` dosyaları hâlâ okunuyor.
   */
  motor: z.enum(['ts', 'python']).default('ts'),
  notlar: z.array(z.string()).default([]),
});

export type Visual = z.infer<typeof VisualSchema>;
