/**
 * Live contract check — runs weekly.
 *
 * The XD viewer is a private implementation. If Adobe silently changes something,
 * finding out during a user's run is the most expensive way; the point of the weekly
 * smoke test is that **we find out first**.
 *
 * The evaluation is SEPARATE from the network: `degerlendir()` is a pure function and
 * can be tested with fixtures. We may not always have a valid live link; that the test
 * has no live dependency is exactly why this matters.
 */
import { fetchShare, type PrototypeData } from './share.js';
import { fetchComponentJson, CONTENT_TYPES } from './cdn.js';
import { flatten } from './agc.js';
import { checkAgc, checkPrototype, enKotuSeviye, type Kontrol, type Seviye } from './contract.js';
import { redactDeep } from '../../util/redact.js';

export interface SmokeSonuc {
  seviye: Seviye;
  tarih: string;
  artboardSayisi: number;
  denenenArtboard: string | null;
  kontroller: Kontrol[];
  /** A one-line summary — this is what the CI notification uses. */
  ozet: string;
}

/** Pure evaluation — no network. Tested with fixtures. */
export function degerlendir(
  proto: PrototypeData,
  agc: Record<string, any> | null,
  agcHatasi: string | null,
  denenen: string | null
): SmokeSonuc {
  const kontroller: Kontrol[] = [...checkPrototype(proto)];

  if (agcHatasi) {
    kontroller.push({ ad: 'agc indirme', seviye: 'hata', detay: agcHatasi });
  } else if (agc) {
    kontroller.push({ ad: 'agc indirme', seviye: 'ok', detay: `content-type ${CONTENT_TYPES.agc}` });
    const d = flatten(agc);
    kontroller.push(...checkAgc(agc, d.bilinmeyenTipler, d.toplamDugum));
    kontroller.push({
      ad: 'düzleştirme',
      seviye: d.elemanlar.length ? 'ok' : 'hata',
      detay: `${d.elemanlar.length} eleman / ${d.toplamDugum} düğüm`,
    });
  }

  const seviye = enKotuSeviye(kontroller);
  const kotu = kontroller.filter((k) => k.seviye !== 'ok');
  const ozet =
    seviye === 'ok'
      ? `sözleşme sağlam — ${kontroller.length} kontrol, hepsi ok`
      : `${kotu.length}/${kontroller.length} kontrol sorunlu: ` +
        kotu.map((k) => `${k.ad} (${k.seviye})`).join(', ');

  // Rule 2: the result will be written somewhere (CI log, notification, artifact) — NO token passes.
  return redactDeep({
    seviye,
    tarih: new Date().toISOString(),
    artboardSayisi: proto.manifest?.artboards?.length ?? 0,
    denenenArtboard: denenen,
    kontroller,
    ozet,
  }) as SmokeSonuc;
}

/** Live run: fetch the shell + one AGC, then evaluate the contract. */
export async function xdSmoke(url: string): Promise<SmokeSonuc> {
  const proto = await fetchShare(url);
  const ab = proto.manifest?.artboards ?? [];
  // A representative artboard is enough; the goal is the contract, not coverage.
  const hedef = ab.find((a) => (a.components ?? []).some((c) => c.rel === 'primary')) ?? null;

  let agc: Record<string, any> | null = null;
  let hata: string | null = null;
  if (!hedef) {
    hata = 'primary bileşeni olan artboard yok — AGC denenemedi';
  } else {
    const id = (hedef.components ?? []).find((c) => c.rel === 'primary')!.id;
    try {
      agc = await fetchComponentJson<Record<string, any>>(proto, id, CONTENT_TYPES.agc);
    } catch (e) {
      hata = e instanceof Error ? e.message : String(e);
    }
  }
  return degerlendir(proto, agc, hata, hedef?.name ?? null);
}

/** Human-readable report. */
export function smokeYaz(s: SmokeSonuc): string {
  const isaret = { ok: '✓', uyari: '⚠', hata: '✗' } as const;
  const satirlar = [
    `# xd smoke — ${s.seviye.toUpperCase()}`,
    `  ${s.tarih} · ${s.artboardSayisi} artboard` +
      (s.denenenArtboard ? ` · denenen: ${s.denenenArtboard}` : ''),
    '',
  ];
  for (const k of s.kontroller) satirlar.push(`  ${isaret[k.seviye]} ${k.ad.padEnd(18)} ${k.detay}`);
  satirlar.push('', `  ${s.ozet}`);
  return satirlar.join('\n') + '\n';
}
