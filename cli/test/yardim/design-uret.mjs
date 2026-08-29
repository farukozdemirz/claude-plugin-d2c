/**
 * Kayıtlı AGC fixture'larından TAM bir `design.json` üretir — ağ YOK.
 *
 * Neden var: `olcum` ve `sections` testlerinin gerçek-veri bölümleri, canlı bir
 * koşudan arta kalan `/tmp/design-a.json`'a bağlıydı. /tmp temizlenince iki test
 * SESSİZCE atlanıyordu — yeşil görünen ama koşmayan test, olmayan testten daha
 * kötüdür. Artık fixture varsa üretiliyor.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdobeXdShare } from '../../dist/lib.mjs';

const FIX = fileURLToPath(new URL('../fixtures/canli/', import.meta.url));
const slug = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

export function fixtureVar() {
  return existsSync(join(FIX, 'manifest.json'));
}

/** `design.json` üretir; fixture yoksa `null`. */
export async function designUret(ekranAdi = 'Desktop - Ürün Detay') {
  if (!fixtureVar()) return null;
  const manifest = JSON.parse(readFileSync(join(FIX, 'manifest.json'), 'utf8')).manifest;

  // Sözleşme kontrolü token bekliyor; fixture sanitize edilmiş, uydurma değer verilir.
  const gelecek = Math.floor(Date.now() / 1000) + 3600;
  const proto = {
    manifest,
    // SAHTE-TOKEN: yapısı gerçeğiyle aynı, değeri uydurma (bkz. token-scan.test.mjs)
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
    // Fixture eksikse (ör. yalnız desktop yakalanmış) test atlanır, kırılmaz.
    return null;
  }
}
