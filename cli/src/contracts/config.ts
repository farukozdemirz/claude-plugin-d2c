/** The `.d2c.json` project configuration. */
import { z } from 'zod';

/**
 * Extraction strategy — the transition-period switch.
 *
 *   auto    → the network path is tried; if the contract is broken it stops with a
 *             diagnosis (the user can switch to legacy)
 *   network → the network path only
 *   legacy  → 1.4.0 behaviour: chrome-devtools MCP + the playbook probe method
 *
 * `legacy` **stays working** until its migration phase (M3/Phase 7).
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
