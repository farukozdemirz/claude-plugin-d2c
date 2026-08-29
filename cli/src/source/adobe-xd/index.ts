/** Adobe XD share link adapter. */
import { DesignSchema, SCHEMA_VERSION, type Design, type Eleman, type ArtboardOlcu } from '../../contracts/design.js';
import type { DesignSource, EkranOzeti, Inspection } from '../types.js';
import { fetchShare, normalizeShareUrl, type Artboard, type PrototypeData } from './share.js';
import { CONTENT_TYPES, fetchComponentJson } from './cdn.js';
import { checkAgc, checkPrototype, type Kontrol } from './contract.js';
import { flatten, toArtboardBox, type DuzEleman } from './agc.js';
import { redactedError } from '../../util/redact.js';

/** Name normalisation for matching "Desktop - Product Detail" ↔ "Mobile - Product Detail". */
export function normalizeScreenName(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/\b(desktop|mobil|mobile|app|web)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type Platform = 'desktop' | 'mobil' | 'app' | 'bilinmiyor';

/**
 * `app` is a SEPARATE platform — it is not merged with `mobil`.
 *
 * Found in POC-2: when merged, a desktop artboard could match an App variant while its
 * real mobile counterpart sat unpaired (verified: "Desktop Yorumlar - Sipariş Seç" ↔
 * "App-Mobil - Yorumlar – Sipariş Seç", while "Mobil - Yorumlar - Form - Sipariş Seç"
 * was left unmatched). Pairing the wrong artboard is exactly the error playbook §19
 * tries to prevent.
 *
 * `app` is tested first: names carrying both tokens, like "App-Mobil - …", count as app.
 */
export function platformOf(name: string): Platform {
  const n = name.toLocaleLowerCase('tr');
  if (/\bapp\b/.test(n) || /^app[-\s]/.test(n)) return 'app';
  if (/\bdesktop\b/.test(n)) return 'desktop';
  if (/\b(mobil|mobile)\b/.test(n)) return 'mobil';
  return 'bilinmiyor';
}

/** Narrow viewports (`mobil` and `app`) are written into the `mobil` slot. */
function darMi(p: Platform): boolean {
  return p === 'mobil' || p === 'app';
}

/** Finds an artboard by screen name or id. */
function findArtboard(proto: PrototypeData, key: string): Artboard | null {
  const abs = proto.manifest.artboards;
  return (
    abs.find((a) => a.id === key) ??
    abs.find((a) => a.name === key) ??
    abs.find((a) => a.name.toLocaleLowerCase('tr') === key.toLocaleLowerCase('tr')) ??
    abs.find((a) => normalizeScreenName(a.name) === normalizeScreenName(key)) ??
    null
  );
}

/**
 * Drops a trailing version/variant suffix: "… page – 1" → "… page".
 * Used ONLY in LOOSE matching (see below).
 */
function stripVariant(normalized: string): string {
  return normalized.replace(/\s+(?:versiyon|version)?\s*\d+$/u, '').trim();
}

/**
 * Finds the same screen's counterpart on the other platform.
 *
 * Two passes: an exact name match first. If that fails, a loose match with the version
 * suffix dropped — but ONLY when there is a single candidate. With more than one
 * candidate NO pairing is made: matching the wrong artboard would be exactly the error
 * playbook §19 ("do not carry one artboard's value to the other") tries to prevent.
 */
function findPair(proto: PrototypeData, ab: Artboard): Artboard | null {
  const key = normalizeScreenName(ab.name);
  const plat = platformOf(ab.name);
  if (plat === 'bilinmiyor') return null;
  // Pairing happens only between desktop ↔ mobile. `app` is its own platform; it is
  // not paired automatically (the user can name the screen explicitly).
  const hedef: Platform = plat === 'desktop' ? 'mobil' : 'desktop';
  if (plat === 'app') return null;
  const adaylar = proto.manifest.artboards.filter(
    (a) => a.id !== ab.id && platformOf(a.name) === hedef
  );

  // UNIQUENESS is required for the exact match too — with more than one candidate no
  // pairing is made. (POC-2: for "Fiyat Bilgisi - Desktop" both "… - Mobil" and
  // "… - App" matched exactly, and one was silently picked by array order.)
  const tam = adaylar.filter((a) => normalizeScreenName(a.name) === key);
  if (tam.length === 1) return tam[0]!;
  if (tam.length > 1) return null;

  const gevsekKey = stripVariant(key);
  const gevsek = adaylar.filter((a) => stripVariant(normalizeScreenName(a.name)) === gevsekKey);
  return gevsek.length === 1 ? gevsek[0]! : null;
}

function primaryComponentId(ab: Artboard): string {
  const c = (ab.components ?? []).find((x) => x.rel === 'primary');
  if (!c) throw redactedError(`artboard "${ab.name}" için primary graphicContent bileşeni yok`);
  return c.id;
}

/** Converts a flattened element into an artboard-relative measurement. */
function toOlcu(el: DuzEleman, origin: { x: number; y: number }): ArtboardOlcu | null {
  const kutu = toArtboardBox(el, origin);
  if (!kutu) return null;
  const o: ArtboardOlcu = { kutu: [kutu.x, kutu.y, kutu.w, kutu.h] };
  if (el.tip === 'sekil' || el.tip === 'gorsel') {
    const m = el.olcu;
    if (m?.radius) o.radius = m.radius;
    if (m) o.radiusKaynak = m.radiusKaynak;
  }
  if (el.tip === 'metin') {
    o.metinGenisligi = el.olcu.metinGenisligi;
    o.satirSayisi = el.olcu.satirSayisi;
  }
  if (el.dolgu) o.dolgu = el.dolgu;
  if (el.kontur) o.kontur = el.kontur;
  return o;
}

function elemanTipi(el: DuzEleman): Eleman['tip'] {
  if (el.tip === 'metin') return 'metin';
  if (el.tip === 'gorsel') return 'gorsel';
  const t = el.sekilTipi;
  return t === 'rect' || t === 'path' || t === 'circle' || t === 'line' ? t : 'sekil';
}

/**
 * Pairs desktop and mobile elements.
 *
 * playbook §19: "do not carry a value measured on one artboard to the other." The
 * pairing is for IDENTITY only — measurements are read SEPARATELY from each artboard,
 * never derived.
 */
function pairElements(d: DuzEleman[], m: DuzEleman[]): Array<{ d?: DuzEleman; m?: DuzEleman }> {
  const out: Array<{ d?: DuzEleman; m?: DuzEleman }> = [];
  const kullanildi = new Set<number>();
  const anahtar = (e: DuzEleman) => (e.tip === 'metin' ? `t:${e.olcu.metin}` : `n:${e.ad ?? ''}`);
  const mobilIdx = new Map<string, number[]>();
  m.forEach((e, i) => {
    const k = anahtar(e);
    if (!mobilIdx.has(k)) mobilIdx.set(k, []);
    mobilIdx.get(k)!.push(i);
  });
  for (const de of d) {
    const havuz = mobilIdx.get(anahtar(de)) ?? [];
    const i = havuz.find((x) => !kullanildi.has(x));
    if (i !== undefined) { kullanildi.add(i); out.push({ d: de, m: m[i] }); }
    else out.push({ d: de });
  }
  m.forEach((e, i) => { if (!kullanildi.has(i)) out.push({ m: e }); });
  return out;
}

/**
 * The injection point for supplying data instead of going to the network.
 *
 * For tests/offline only, and it does not change behaviour: when it is not provided,
 * everything comes from the network as before. It exists so that a COMPLETE
 * `design.json` can be produced from the recorded AGC fixtures — without this seam two
 * tests depended on a `/tmp` file left over from a live run, and were SILENTLY skipped
 * once that file was deleted.
 */
export interface KaynakSecenek {
  proto?: PrototypeData;
  agcYukle?: (proto: PrototypeData, componentId: string) => Promise<Record<string, any>>;
}

export class AdobeXdShare implements DesignSource {
  private proto: PrototypeData | null = null;
  constructor(private readonly url: string, private readonly sec: KaynakSecenek = {}) {}

  private async proto_(): Promise<PrototypeData> {
    // The token is NEVER stored — every AdobeXdShare instance fetches the shell fresh.
    if (this.sec.proto) return this.sec.proto;
    if (!this.proto) this.proto = await fetchShare(this.url);
    return this.proto;
  }

  async inspect(): Promise<Inspection> {
    const t0 = Date.now();
    const proto = await this.proto_();
    const ekranlar: EkranOzeti[] = proto.manifest.artboards.map((a) => ({
      id: a.id,
      ad: a.name,
      boyut: [a.bounds.width, a.bounds.height],
      esId: findPair(proto, a)?.id ?? null,
    }));
    return {
      kaynakTipi: 'adobe-xd-share',
      belgeAdi: proto.manifest.name,
      ekranlar,
      kontroller: checkPrototype(proto),
      sureMs: Date.now() - t0,
    };
  }

  async extractScreen(key: string, opts: { pairMobile?: boolean } = {}): Promise<Design> {
    const proto = await this.proto_();
    const kontroller: Kontrol[] = checkPrototype(proto);
    const hata = kontroller.find((k) => k.seviye === 'hata');
    if (hata) throw redactedError(`sözleşme kontrolü başarısız — ${hata.ad}: ${hata.detay}`);

    const ab = findArtboard(proto, key);
    if (!ab) {
      const liste = proto.manifest.artboards.map((a) => `  · ${a.name}`).join('\n');
      throw redactedError(`ekran bulunamadı: "${key}"\nMevcut ekranlar:\n${liste}`);
    }
    const es = opts.pairMobile === false ? null : findPair(proto, ab);
    const plat = platformOf(ab.name);
    // Narrow viewports (mobile + app) go into the `mobil` slot; the rest into `desktop`.
    const desktopAb = darMi(plat) ? es : ab;
    const mobilAb = darMi(plat) ? ab : es;

    const yukle = async (a: Artboard | null) => {
      if (!a) return null;
      const agc = this.sec.agcYukle
        ? await this.sec.agcYukle(proto, primaryComponentId(a))
        : await fetchComponentJson<Record<string, any>>(proto, primaryComponentId(a), CONTENT_TYPES.agc);
      const flat = flatten(agc);
      kontroller.push(...checkAgc(agc, flat.bilinmeyenTipler, flat.toplamDugum));
      return { a, agc, flat };
    };
    const [D, M] = await Promise.all([yukle(desktopAb), yukle(mobilAb)]);
    if (!D && !M) throw redactedError('hiçbir artboard yüklenemedi');

    const org = (a: Artboard) => ({ x: a.bounds.x, y: a.bounds.y });
    const ciftler = pairElements(D?.flat.elemanlar ?? [], M?.flat.elemanlar ?? []);

    const elemanlar: Eleman[] = ciftler.map((c, i) => {
      const ref = c.d ?? c.m!;
      const e: Eleman = {
        id: ref.id,
        ad: ref.ad,
        tip: elemanTipi(ref),
        ebeveyn: ref.ebeveyn,
        derinlik: ref.derinlik,
        sira: i,
      };
      if (ref.tip === 'metin') { e.metin = ref.olcu.metin; e.font = ref.olcu.font; }
      if (ref.tip === 'gorsel') { e.gorselUid = ref.uid; e.olcekDavranisi = ref.olcekDavranisi; }
      if (c.d && D) { const o = toOlcu(c.d, org(D.a)); if (o) e.desktop = o; }
      if (c.m && M) { const o = toOlcu(c.m, org(M.a)); if (o) e.mobil = o; }
      return e;
    });

    // Palette and styles — the ones that OCCUR on this screen (not the whole document).
    const paletSayac = new Map<string, number>();
    for (const e of elemanlar) {
      for (const o of [e.desktop, e.mobil]) {
        if (o?.dolgu) paletSayac.set(o.dolgu, (paletSayac.get(o.dolgu) ?? 0) + 1);
        if (o?.kontur?.renk) paletSayac.set(o.kontur.renk, (paletSayac.get(o.kontur.renk) ?? 0) + 1);
      }
      if (e.font?.renk) paletSayac.set(e.font.renk, (paletSayac.get(e.font.renk) ?? 0) + 1);
    }
    const stilSayac = new Map<string, { s: any; n: number }>();
    for (const e of elemanlar) {
      if (!e.font) continue;
      const k = `${e.font.aile}|${e.font.agirlik}|${e.font.punto}|${e.font.satir}|${e.font.renk}`;
      const v = stilSayac.get(k);
      if (v) v.n++;
      else stilSayac.set(k, { s: e.font, n: 1 });
    }

    const design: Design = {
      schemaVersion: SCHEMA_VERSION,
      kaynak: {
        tip: 'adobe-xd-share',
        url: normalizeShareUrl(this.url),
        docId: proto.manifest.docId ?? null,
        modifiedDate: proto.modifiedDate ?? null,
        agcVersion: (D?.agc.version ?? M?.agc.version ?? null) as string | null,
        cikarilma: new Date().toISOString(),
        uyarilar: kontroller.filter((k) => k.seviye === 'uyari').map((k) => `${k.ad}: ${k.detay}`),
      },
      ekran: {
        ad: normalizeScreenName(ab.name) || ab.name,
        desktop: D ? { artboardId: D.a.id, ad: D.a.name, boyut: [D.a.bounds.width, D.a.bounds.height], koken: [D.a.bounds.x, D.a.bounds.y] } : null,
        mobil: M ? { artboardId: M.a.id, ad: M.a.name, boyut: [M.a.bounds.width, M.a.bounds.height], koken: [M.a.bounds.x, M.a.bounds.y] } : null,
      },
      palet: [...paletSayac.entries()].sort((a, b) => b[1] - a[1]).map(([hex, adet]) => ({ hex, adet })),
      stiller: [...stilSayac.values()].sort((a, b) => b.n - a.n).map(({ s, n }) => ({
        aile: s.aile, agirlik: s.agirlik, punto: s.punto, satir: s.satir,
        fontKutusuAgc: s.fontKutusuAgc, renk: s.renk, adet: n,
      })),
      elemanlar,
    };
    return DesignSchema.parse(design);
  }
}
