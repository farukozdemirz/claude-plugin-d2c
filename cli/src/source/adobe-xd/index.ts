/** Adobe XD paylaşım linki adaptörü. */
import { DesignSchema, SCHEMA_VERSION, type Design, type Eleman, type ArtboardOlcu } from '../../contracts/design.js';
import type { DesignSource, EkranOzeti, Inspection } from '../types.js';
import { fetchShare, normalizeShareUrl, type Artboard, type PrototypeData } from './share.js';
import { CONTENT_TYPES, fetchComponentJson } from './cdn.js';
import { checkAgc, checkPrototype, type Kontrol } from './contract.js';
import { flatten, toArtboardBox, type DuzEleman } from './agc.js';
import { redactedError } from '../../util/redact.js';

/** "Desktop - Ürün Detay" ↔ "Mobil - Ürün Detay" eşleştirmesi için ad normalizasyonu. */
export function normalizeScreenName(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/\b(desktop|mobil|mobile|app|web)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type Platform = 'desktop' | 'mobil' | 'app' | 'bilinmiyor';

/**
 * `app` AYRI bir platformdur — `mobil` ile birleştirilmez.
 *
 * POC-2'de bulundu: birleştirildiğinde bir desktop artboard'ı, gerçek mobil eşi
 * dururken App varyantıyla eşleşebiliyordu (doğrulanmış: "Desktop Yorumlar - Sipariş
 * Seç" ↔ "App-Mobil - Yorumlar – Sipariş Seç", oysa "Mobil - Yorumlar - Form - Sipariş
 * Seç" eşsiz kalıyordu). Yanlış artboard eşlemek, playbook §19'un önlemeye çalıştığı
 * hatanın ta kendisi.
 *
 * `app` önce sınanır: "App-Mobil - …" gibi iki jetonu birden taşıyan adlar app sayılır.
 */
export function platformOf(name: string): Platform {
  const n = name.toLocaleLowerCase('tr');
  if (/\bapp\b/.test(n) || /^app[-\s]/.test(n)) return 'app';
  if (/\bdesktop\b/.test(n)) return 'desktop';
  if (/\b(mobil|mobile)\b/.test(n)) return 'mobil';
  return 'bilinmiyor';
}

/** Dar viewport'lar (`mobil` ve `app`) `mobil` yuvasına yazılır. */
function darMi(p: Platform): boolean {
  return p === 'mobil' || p === 'app';
}

/** Ekran adı veya id'siyle artboard bulur. */
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
 * Sondaki sürüm/varyant ekini atar: "… sayfası – 1" → "… sayfası".
 * Yalnız GEVŞEK eşleşmede kullanılır (aşağıya bak).
 */
function stripVariant(normalized: string): string {
  return normalized.replace(/\s+(?:versiyon|version)?\s*\d+$/u, '').trim();
}

/**
 * Aynı ekranın karşı platformdaki eşini bulur.
 *
 * İki geçiş: önce tam ad eşleşmesi. Bulunamazsa sürüm eki atılmış gevşek eşleşme —
 * ama YALNIZ tek aday varsa. Birden çok aday varsa eşleştirme YAPILMAZ: yanlış
 * artboard'ı eşlemek, playbook §19'un ("bir artboard'ın değerini diğerine taşıma")
 * önlemeye çalıştığı hatanın ta kendisi olurdu.
 */
function findPair(proto: PrototypeData, ab: Artboard): Artboard | null {
  const key = normalizeScreenName(ab.name);
  const plat = platformOf(ab.name);
  if (plat === 'bilinmiyor') return null;
  // Eşleştirme yalnız desktop ↔ mobil arasında. `app` kendi platformu; otomatik
  // eşlenmez (kullanıcı ekranı açıkça verebilir).
  const hedef: Platform = plat === 'desktop' ? 'mobil' : 'desktop';
  if (plat === 'app') return null;
  const adaylar = proto.manifest.artboards.filter(
    (a) => a.id !== ab.id && platformOf(a.name) === hedef
  );

  // TAM eşleşmede de BENZERSİZLİK aranır — birden çok aday varsa eşleştirme yapılmaz.
  // (POC-2: "Fiyat Bilgisi - Desktop" için hem "… - Mobil" hem "… - App" tam eşleşiyordu
  // ve dizi sırasına göre sessizce biri seçiliyordu.)
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

/** Düz elemanı artboard ölçüsüne çevirir. */
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
 * Desktop ve mobil elemanlarını eşleştirir.
 *
 * playbook §19: "Bir artboard'da ölçtüğün değeri diğerine taşıma." Eşleştirme yalnız
 * KİMLİK içindir — ölçüler her artboard'dan AYRI okunur, asla türetilmez.
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
 * Ağ yerine hazır veri verme noktası.
 *
 * Yalnız test/çevrimdışı içindir ve davranışı değiştirmez: verilmezse her şey
 * eskisi gibi ağdan gelir. Var olma sebebi, kayıtlı AGC fixture'larıyla TAM bir
 * `design.json` üretilebilmesi — bu seam olmadan iki test canlı bir koşudan
 * arta kalan `/tmp` dosyasına bağlıydı ve dosya silinince SESSİZCE atlanıyordu.
 */
export interface KaynakSecenek {
  proto?: PrototypeData;
  agcYukle?: (proto: PrototypeData, componentId: string) => Promise<Record<string, any>>;
}

export class AdobeXdShare implements DesignSource {
  private proto: PrototypeData | null = null;
  constructor(private readonly url: string, private readonly sec: KaynakSecenek = {}) {}

  private async proto_(): Promise<PrototypeData> {
    // Token ASLA saklanmaz — her AdobeXdShare örneği shell'i taze çeker.
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
    // Dar viewport'lar (mobil + app) `mobil` yuvasına; diğerleri `desktop` yuvasına.
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

    // Palet ve stiller — bu ekranda GEÇENLER (tüm belgenin değil).
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
