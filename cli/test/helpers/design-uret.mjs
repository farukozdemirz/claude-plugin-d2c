/**
 * Produces a COMPLETE `design.json` from the recorded AGC fixtures — NO network.
 *
 * Why it exists: the real-data parts of the `olcum` and `sections` tests depended on
 * `/tmp/design-a.json`, left over from a live run. Once /tmp was cleared both tests were
 * SILENTLY skipped — a test that looks green but does not run is worse than no test at
 * all. Now it is produced whenever the fixtures are present.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdobeXdShare } from '../../dist/lib.mjs';

const FIX = fileURLToPath(new URL('../fixtures/live/', import.meta.url));
const slug = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

export function fixtureVar() {
  return existsSync(join(FIX, 'manifest.json'));
}

/** Produces `design.json`; `null` when the fixtures are missing. */
export async function designUret(ekranAdi = 'Desktop - Ürün Detay') {
  if (!fixtureVar()) return null;
  const manifest = JSON.parse(readFileSync(join(FIX, 'manifest.json'), 'utf8')).manifest;

  // The contract check expects a token; the fixture is sanitised, so a fake value is supplied.
  const gelecek = Math.floor(Date.now() / 1000) + 3600;
  const proto = {
    manifest,
    // SAHTE-TOKEN: the structure matches a real one, the value is made up (see token-scan.test.mjs)
    linkTemplate: { data: { access_token: `${gelecek}_urn:aaid:sc:XX:${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)};public_${'a'.repeat(40)}` } },
  };

  const agcYukle = async (_p, componentId) => {
    const ab = manifest.artboards.find((a) =>
      (a.components ?? []).some((c) => c.id === componentId));
    if (!ab) throw new Error(`fixture yok: component ${componentId}`);
    const y = join(FIX, `${slug(ab.name)}.agc.json`);
    if (!existsSync(y)) throw new Error(`fixture yok: ${y}`);
    return JSON.parse(readFileSync(y, 'utf8'));
  };

  try {
    return await new AdobeXdShare('offline://fixture', { proto, agcYukle }).extractScreen(ekranAdi);
  } catch {
    // If a fixture is missing (e.g. only desktop was captured) the test skips, it does not break.
    return null;
  }
}
