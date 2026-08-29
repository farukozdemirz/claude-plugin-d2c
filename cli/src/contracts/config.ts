/** `.d2c.json` proje konfigürasyonu. */
import { z } from 'zod';

/**
 * Çıkarma stratejisi — geçiş dönemi anahtarı.
 *
 *   auto    → ağ yolu denenir; sözleşme bozuksa teşhisle durur (kullanıcı legacy'ye geçebilir)
 *   network → yalnız ağ yolu
 *   legacy  → 1.4.0 davranışı: chrome-devtools MCP + playbook probe yöntemi
 *
 * `legacy` ilgili migration fazına (M3/Faz 7) kadar **çalışır durumda kalır**.
 */
export const ExtractorStrategySchema = z.enum(['auto', 'network', 'legacy']).default('auto');

export const ConfigSchema = z.object({
  styling: z.object({
    tailwind: z.union([z.literal(3), z.literal(4)]),
    themeFile: z.string().optional(),
    config: z.string().optional(),
  }).optional(),
  componentsDir: z.string().default('components'),
  previewDir: z.string().default('app'),
  devCommand: z.string().default('npm run dev'),
  devPort: z.number().optional(),
  fonts: z.array(z.string()).default([]),
  reportDir: z.string().default('docs/d2c'),
  writeAllowlist: z.array(z.string()).default([]),
  extractorStrategy: ExtractorStrategySchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type ExtractorStrategy = z.infer<typeof ExtractorStrategySchema>;
