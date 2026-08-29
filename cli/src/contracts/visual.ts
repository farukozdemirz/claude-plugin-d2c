/** visual.json — the machine-readable output of the visual comparison. */
import { z } from 'zod';

export const VISUAL_SCHEMA_VERSION = 1;

export const BolgeSchema = z.object({
  satir: z.number(), sutun: z.number(), yuzde: z.number(),
  kutu: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** The ready-made crop the agent will LOOK at (XD | render side by side, enlarged). */
  kirpma: z.string().nullable(),
});

export const VisualSchema = z.object({
  schemaVersion: z.literal(VISUAL_SCHEMA_VERSION),
  tur: z.number(),
  tarih: z.string(),
  referans: z.object({
    kaynak: z.enum(['thumbnail', 'tarayici']),
    png: z.string(),
    /** The design → PNG mapping. With a thumbnail the scale is known EXACTLY, no anchor is derived. */
    olcek: z.number(),
    kirpma: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
  render: z.object({ png: z.string(), kirpma: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  /**
   * The percentages are NOT A PASS MARK. XD draws text with its own rasterizer and the
   * browser with its own hinting; in a text-heavy section the floor is 5-10%. Use them
   * relatively.
   */
  hamYuzde: z.number(),
  yapisalYuzde: z.number(),
  bolgeler: z.array(BolgeSchema),
  isiHaritasi: z.string(),
  sureMs: z.number(),
  /**
   * Which engine produced the numbers. Defaults to `ts`; becomes `python` automatically
   * when `--kalibre` is given (the anchor logic was deliberately not ported). Because it
   * is optional with a default, `visual.json` files written before Phase 5b still parse.
   */
  motor: z.enum(['ts', 'python']).default('ts'),
  notlar: z.array(z.string()).default([]),
});

export type Visual = z.infer<typeof VisualSchema>;
