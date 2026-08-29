/**
 * Generator for `altin.json` — it takes the values **FROM THE PYTHON ENGINE**.
 *
 * Anchoring to Python is essential: if the golden values were produced by the TS engine,
 * the test would be approving its own output and a regression would silently count as
 * "correct".
 *
 * When the fixtures or `visual-diff.py` change:  node test/fixtures/parity/uret.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX = dirname(fileURLToPath(import.meta.url));
const SCRIPT = fileURLToPath(new URL('../../../../skills/d2c-code/scripts/visual-diff.py', import.meta.url));

const DURUMLAR = [
  { ad: 'ayni',     a: 'ayni-a.png',     b: 'ayni-b.png' },
  { ad: 'renk',     a: 'renk-a.png',     b: 'renk-b.png' },
  { ad: 'ellipsis', a: 'ellipsis-a.png', b: 'ellipsis-b.png' },
  { ad: 'kayma',    a: 'kayma-a.png',    b: 'kayma-b.png' },
  { ad: 'fotosuz',  a: 'fotosuz-a.png',  b: 'fotosuz-b.png' },
  { ad: 'gurultu',  a: 'gurultu-a.png',  b: 'gurultu-b.png' },
  { ad: 'olcek',    a: 'olcek-a.png',    b: 'olcek-b.png', olcekle: true },
  { ad: 'kirpma',   a: 'renk-a.png',     b: 'renk-b.png',
    xdKutu: [12, 16, 300, 180], renderKutu: [20, 10, 300, 180] },
];

const altin = {};
for (const d of DURUMLAR) {
  const dizin = mkdtempSync(join(tmpdir(), `d2c-altin-${d.ad}-`));
  const jsonYol = join(dizin, 'raw.json');
  const args = [SCRIPT, join(FIX, d.a), join(FIX, d.b),
    '--out', join(dizin, 'fark.png'), '--json', jsonYol];
  if (d.xdKutu) args.push('--xd-kutu', d.xdKutu.join(','));
  if (d.renderKutu) args.push('--render-kutu', d.renderKutu.join(','));
  if (d.olcekle) args.push('--olcekle');
  try { execFileSync('python3', args, { encoding: 'utf8' }); }
  catch (e) { if (e.status !== 1) throw e; }
  const r = JSON.parse(readFileSync(jsonYol, 'utf8'));
  altin[d.ad] = { ham: r.ham, yapisal: r.yapisal, boyut: r.boyut, bolge: r.bolgeler.length };
  console.log(`${d.ad.padEnd(9)} ham ${String(r.ham).padStart(8)} · yapısal ${String(r.yapisal).padStart(8)} · ${r.boyut.join('×')} · ${r.bolgeler.length} bölge`);
}
writeFileSync(join(FIX, 'altin.json'), JSON.stringify(altin, null, 2) + '\n');
console.log('\naltin.json yazıldı (kaynak: visual-diff.py)');
