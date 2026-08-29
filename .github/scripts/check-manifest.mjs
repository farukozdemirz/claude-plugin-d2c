/**
 * Plugin manifest tutarlılığı.
 *
 * `claude plugin validate` CI'da her zaman çalıştırılamıyor (kimlik doğrulama
 * isteyebiliyor). Buradaki kontrol sürüm/ad/dosya varlığı gibi elle bozulabilen
 * şeyleri tutuyor — sürüm her fazda elle artırılıyor, en olası hata orası.
 */
import { readFileSync, existsSync } from 'node:fs';

const hata = [];
const oku = (y) => { try { return JSON.parse(readFileSync(y, 'utf8')); } catch (e) { hata.push(`${y}: ${e.message}`); return null; } };

const plugin = oku('.claude-plugin/plugin.json');
const market = oku('.claude-plugin/marketplace.json');

if (plugin) {
  for (const alan of ['name', 'version', 'description']) {
    if (!plugin[alan]) hata.push(`plugin.json: "${alan}" eksik`);
  }
  if (plugin.version && !/^\d+\.\d+\.\d+$/.test(plugin.version)) {
    hata.push(`plugin.json: sürüm semver değil: "${plugin.version}"`);
  }
}

if (market) {
  const p = (market.plugins ?? []).find((x) => x.name === plugin?.name);
  if (!p) hata.push(`marketplace.json: "${plugin?.name}" listelenmemiş`);
}

// Skill'lerin ve CLI bundle'ının gerçekten yerinde olduğu.
for (const y of [
  'cli/dist/d2c.mjs',
  'skills/d2c/SKILL.md',
  'skills/d2c-spec/SKILL.md',
  'skills/d2c-code/SKILL.md',
  'skills/d2c-verify/SKILL.md',
]) {
  if (!existsSync(y)) hata.push(`eksik dosya: ${y}`);
}

if (hata.length) {
  console.error('Manifest kontrolü BAŞARISIZ:');
  for (const h of hata) console.error(`  ✗ ${h}`);
  process.exit(1);
}
console.log(`✓ manifest tutarlı — ${plugin.name} ${plugin.version}`);
