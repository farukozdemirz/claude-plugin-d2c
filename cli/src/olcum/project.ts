/**
 * design.json → olcum.json bölüm projeksiyonu.
 *
 * `olcum.json` Claude'un TEK girdisi olduğu için iki şey aynı anda doğru olmalı:
 *   1. **Kendi içinde yeterli** — kod yazmak için gereken her değer inline
 *   2. **Compact** — tam scenegraph Claude'un bağlamına girmemeli
 *
 * İkisi çelişiyor gibi görünür ama çelişmiyor: ölçüldü, bir bölümün ham projeksiyonu
 * 131 eleman / 56 KB ve çoğu birbirinin KOPYASI (8 özdeş kart, 45 yıldız). Claude'un
 * ihtiyacı "8 kart var, biri şöyle, aralarında 16 px" — 8 kopya değil.
 */
import type { Design, Eleman } from '../contracts/design.js';
import type { SectionMap, Bolum } from '../contracts/sections.js';
import {
  OLCUM_SCHEMA_VERSION,
  OlcumSchema,
  type Olcum,
  type OlcumEleman,
} from '../contracts/olcum.js';

export interface ProjeSecenek {
  /**
   * Açık tasarım kutusu `[x, y, w, h]` — bölüm yerine BELİRLİ bir bölge.
   *
   * Dikey akmayan ekranlar için gerekli: drawer/overlay panelleri (ör. x=940,
   * y=0–1080) yatay bant haritasına oturmaz. `limitations.md`'de kayıtlı
   * "serbest yerleşimli artboard" sınırının pratik çözümü — eski akıştaki
   * `bolum_kutu` alanının karşılığı.
   */
  kutu?: [number, number, number, number];
  /** Mevcut olcum.json (testid birleştirme için). */
  onceki?: Olcum | null;
  /** true → `testid`'ler taşınmaz, sıfırdan yazılır. */
  force?: boolean;
  /** Tekrar sıkıştırma eşiği (bu sayıdan az tekrar sıkıştırılmaz). */
  tekrarEsigi?: number;
}

export function slugify(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Eleman bölüme ait mi?
 *
 * Kural: kutunun **dikey orta noktası** bölüm aralığındaysa. Sınırda duran elemanın
 * hangi bölüme sayılacağı böylece deterministik — iki bölüme birden düşmez.
 */
function bolumdeMi(
  el: Eleman,
  vp: 'desktop' | 'mobil',
  kutu: [number, number, number, number]
): boolean {
  const o = el[vp];
  if (!o) return false;
  const [x, y, w, h] = o.kutu;
  const [bx, by, bw, bh] = kutu;
  const ox = x + w / 2;
  const oy = y + h / 2;
  return ox >= bx - 0.5 && ox <= bx + bw + 0.5 && oy >= by - 0.5 && oy <= by + bh + 0.5;
}

/** Tekrar tespiti için eleman imzası — aynı imza = "aynı şey". */
function imza(el: Eleman, vp: 'desktop' | 'mobil'): string {
  const o = el[vp];
  if (!o) return '';
  const [, , w, h] = o.kutu;
  const r = (n: number) => Math.round(n * 10) / 10;
  return [
    el.ad ?? '',
    el.tip,
    r(w), r(h),
    o.dolgu ?? '',
    (o.radius ?? []).join(','),
    o.kontur ? `${o.kontur.genislik}|${o.kontur.renk}|${o.kontur.hiza}` : '',
    el.metin ?? '',
    el.font ? `${el.font.aile}|${el.font.punto}|${el.font.renk}` : '',
  ].join('§');
}

interface TekrarSonuc {
  temsilci: Eleman;
  adet: number;
  duzenli: boolean;
  eksen?: 'x' | 'y' | 'izgara';
  adim?: number;
  adimX?: number;
  adimY?: number;
  sutun?: number;
  satir?: number;
  konumlar?: Array<[number, number]>;
}

/** Sıralı değerlerin adımı düzenli mi? Düzenliyse ortalama adımı döndürür. */
function duzenliAdim(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const adimlar: number[] = [];
  for (let k = 1; k < vals.length; k++) adimlar.push(vals[k]! - vals[k - 1]!);
  const ort = adimlar.reduce((a, b) => a + b, 0) / adimlar.length;
  if (ort <= 0) return null;
  return adimlar.every((d) => Math.abs(d - ort) <= Math.max(0.5, ort * 0.02)) ? +ort.toFixed(2) : null;
}

/**
 * Aynı imzalı elemanları düzenli dizilere sıkıştırır.
 *
 * Sıkıştırma yalnız **düzenli adım** varsa yapılır: ardışık farklar birbirinden
 * %2'den fazla sapıyorsa dizi düzensizdir ve **sıkıştırılmaz** — "8 kart var, 332 px
 * arayla" demek yalnız gerçekten öyleyse doğru. Uydurma yok.
 */
export function tekrarBul(
  grup: Eleman[],
  vp: 'desktop' | 'mobil',
  esik: number
): TekrarSonuc | null {
  if (grup.length < esik) return null;
  const kutu = (e: Eleman) => e[vp]!.kutu;
  const tek = (vals: number[]) => [...new Set(vals.map((v) => +v.toFixed(1)))].sort((a, b) => a - b);
  const xs = tek(grup.map((e) => kutu(e)[0]!));
  const ys = tek(grup.map((e) => kutu(e)[1]!));

  // 1) Düzenli 1B dizi — diğer eksen sabit
  for (const eksen of ['x', 'y'] as const) {
    const i = eksen === 'x' ? 0 : 1;
    const digerTek = eksen === 'x' ? ys : xs;
    if (digerTek.length !== 1) continue;
    const sirali = [...grup].sort((a, b) => kutu(a)[i]! - kutu(b)[i]!);
    const adim = duzenliAdim(sirali.map((e) => kutu(e)[i]!));
    if (adim == null) continue;
    return { temsilci: sirali[0]!, adet: sirali.length, duzenli: true, eksen, adim };
  }

  // 2) Düzenli ızgara — her iki eksende düzenli adım, delik yok
  if (xs.length > 1 && ys.length > 1 && xs.length * ys.length === grup.length) {
    const ax = duzenliAdim(xs);
    const ay = duzenliAdim(ys);
    if (ax != null && ay != null) {
      const temsilci = [...grup].sort(
        (a, b) => kutu(a)[1]! - kutu(b)[1]! || kutu(a)[0]! - kutu(b)[0]!
      )[0]!;
      return {
        temsilci, adet: grup.length, duzenli: true, eksen: 'izgara',
        adimX: ax, adimY: ay, sutun: xs.length, satir: ys.length,
      };
    }
  }

  // 3) Düzensiz — stil/boyut bir kez, konumlar tam listeyle korunur (BİLGİ KAYBI YOK)
  const sirali = [...grup].sort((a, b) => kutu(a)[1]! - kutu(b)[1]! || kutu(a)[0]! - kutu(b)[0]!);
  return {
    temsilci: sirali[0]!,
    adet: sirali.length,
    duzenli: false,
    konumlar: sirali.map((e) => [+kutu(e)[0]!.toFixed(2), +kutu(e)[1]!.toFixed(2)] as [number, number]),
  };
}

function toOlcumEleman(el: Eleman, rol: string | null): OlcumEleman {
  const o: OlcumEleman = {
    id: el.id, ad: el.ad, tip: el.tip, rol, testid: null,
    ebeveyn: el.ebeveyn, sira: el.sira,
  };
  if (el.metin !== undefined) o.metin = el.metin;
  if (el.font) {
    o.font = {
      ...el.font,
      // M1 KURALI: AGC font kutusu tüketilmez; kod fazı tarayıcıda ölçer (POC-4 → M2).
      fontKutusuKaynak: 'tarayici',
      yariSatir: null,
    };
  }
  if (el.gorselUid !== undefined) o.gorselUid = el.gorselUid;
  if (el.desktop) o.desktop = el.desktop;
  if (el.mobil) o.mobil = el.mobil;
  return o;
}

export function project(
  design: Design,
  harita: SectionMap,
  bolum: Bolum,
  sec: ProjeSecenek = {}
): Olcum {
  const esik = sec.tekrarEsigi ?? 3;
  const vpAna = harita.viewport;
  // Raporlanan kutu: açık verilmişse o, yoksa bölüm tam genişlik.
  const kutu: [number, number, number, number] =
    sec.kutu ?? [0, bolum.y, harita.tasarim[0], bolum.h];

  //
  // SEÇİM kutusu, raporlanan kutudan farklı olabilir.
  //
  // Bölüm haritasından gelen kutularda seçim YALNIZ DİKEY yapılır. Sebep ölçüldü:
  // yorum carousel'inde 8 kart var ama 4'ü artboard'ın sağına taşıyor (x 1391…2387).
  // Yatay kısıt uygulanırsa bu 4 kart düşüyor ve "8 kart" bilgisi kayboluyor —
  // oysa carousel'in 8 kartı olduğu gerçek tasarım bilgisi.
  //
  // Açık `--kutu`'da yatay kısıt ŞART: drawer paneli (x 940…1440) yalnız kendi
  // içeriğini almalı.
  const secimKutu: [number, number, number, number] = sec.kutu
    ? kutu
    : [-1e9, bolum.y, 2e9, bolum.h];

  let icinde = design.elemanlar.filter((e) => bolumdeMi(e, vpAna, secimKutu));

  //
  // OVERLAY FİLTRESİ — arkada kalan elemanları ele.
  //
  // Drawer/modal gibi bir panel, sayfanın üstüne biner. Altındaki içerik kutunun
  // içinde kalır ama GÖRÜNMEZ; geometriyle ayırt edilemez, boyama sırasıyla edilir.
  //
  // Doğrulanmış (değerlendir drawer'ı): panel `Rectangle 7931` sira=153; arkadaki
  // sipariş özeti ("Genel Toplam", "Ödeme Bilgileri") sira 107–149; drawer'ın kendi
  // içeriği sira 154–186. Filtre olmadan arka plan drawer'ın ölçümüne karışıyor ve
  // sol padding 32 yerine 7 çıkıyordu.
  //
  // YALNIZ açık `--kutu` verildiğinde uygulanır. Bölüm haritasından gelen kutulara
  // uygulanmaz: ölçüldü — bölüm bandı (`Rectangle 6645`) kendi içeriğinin bir kısmından
  // SONRA boyanıyor ve filtre 8 karttan 4'ünü eliyordu. Bölümlerde katman düzenini
  // zaten bant otoritesi çözüyor; overlay filtresi oraya ait değil.
  const panel = sec.kutu ? icinde.find((e) => {
    const k = e[vpAna]?.kutu;
    if (!k) return false;
    return (
      Math.abs(k[0] - kutu[0]) < 1 && Math.abs(k[1] - kutu[1]) < 1 &&
      Math.abs(k[2] - kutu[2]) < 1 && Math.abs(k[3] - kutu[3]) < 1
    );
  }) : undefined;
  if (panel) icinde = icinde.filter((e) => e.sira >= panel.sira);

  // Rol etiketleri — yalnız güvenle türetilebilenler.
  const bantAdi = bolum.bant;
  const baslikMetin = bolum.baslik?.metin ?? null;
  const rolOf = (e: Eleman): string | null => {
    if (bantAdi && e.ad === bantAdi) return 'bolum-zemini';
    if (baslikMetin && e.tip === 'metin' && (e.metin ?? '').trim() === baslikMetin) return 'baslik';
    return null;
  };

  // Tekrar sıkıştırma
  const gruplar = new Map<string, Eleman[]>();
  for (const e of icinde) {
    const k = imza(e, vpAna);
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k)!.push(e);
  }

  const elemanlar: OlcumEleman[] = [];
  const cozulemedi: string[] = [];
  for (const grup of gruplar.values()) {
    const t = tekrarBul(grup, vpAna, esik);
    if (t) {
      const o = toOlcumEleman(t.temsilci, rolOf(t.temsilci));
      o.tekrar = {
        adet: t.adet, duzenli: t.duzenli,
        ...(t.eksen ? { eksen: t.eksen } : {}),
        ...(t.adim != null ? { adim: t.adim } : {}),
        ...(t.adimX != null ? { adimX: t.adimX, adimY: t.adimY, sutun: t.sutun, satir: t.satir } : {}),
        ...(t.konumlar ? { konumlar: t.konumlar } : {}),
      };
      elemanlar.push(o);
      if (!t.duzenli) {
        cozulemedi.push(
          `"${grup[0]!.ad}" ${t.adet} kez tekrar ediyor ama dizilim düzenli değil — ` +
          `stil bir kez, konumlar tam listeyle verildi`
        );
      }
    } else {
      for (const e of grup) elemanlar.push(toOlcumEleman(e, rolOf(e)));
    }
  }
  elemanlar.sort((a, b) => a.sira - b.sira);

  // ── hesaplanan boşluklar (playbook §14: komşu kutuların farkından) ───────────
  const hesaplanan: Olcum['hesaplanan'] = [];
  /**
   * Bölüm sol padding'i — kutunun sol kenarına en yakın İÇERİK elemanı.
   * playbook §14: `padding = içerik.x − kutu.x`.
   *
   * Kutu genişliğindeki elemanlar (zemin/panel) padding tanımlamaz ve elenir.
   * Arkada kalan elemanlar overlay filtresiyle zaten düşmüştür.
   */
  const paddingOf = (vp: 'desktop' | 'mobil') => {
    if (vp !== vpAna) return null;
    const adaylar = elemanlar
      .map((e) => ({ ad: e.ad, k: e[vp]?.kutu }))
      .filter((a): a is { ad: string | null; k: [number, number, number, number] } => !!a.k)
      .filter((a) => a.k[2] < kutu[2] * 0.98);
    if (!adaylar.length) return null;
    const enSol = adaylar.reduce((m, a) => (a.k[0] < m.k[0] ? a : m));
    // En sık hizalanma — glif mürekkebi ile tasarım hizası ayrışabilir (playbook §18).
    const sayac = new Map<number, number>();
    for (const a of adaylar) {
      const x = +a.k[0].toFixed(1);
      sayac.set(x, (sayac.get(x) ?? 0) + 1);
    }
    const [enSikX, adet] = [...sayac.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0]!;
    return {
      deger: +(enSol.k[0] - kutu[0]).toFixed(2),
      ad: enSol.ad,
      x: +enSol.k[0].toFixed(2),
      enSik: +(enSikX - kutu[0]).toFixed(2),
      enSikAdet: adet,
    };
  };
  const pd = paddingOf('desktop');
  const pm = paddingOf('mobil');
  const pAny = pd ?? pm;
  if (pAny) {
    // Ölçülen değer olduğu gibi verilir. Hizalanma dağılımı KANIT olarak eklenir ama
    // "tasarım niyeti şudur" DENMEZ: hangisinin doğru olduğu bölüme göre değişiyor
    // (ölçüldü — kart ızgarasında en soldaki doğru, drawer'da en sık hizalanma doğru).
    // Bu bir yargı ve yargı Claude'a ait; extractor tahmin etmez.
    const fark = Math.abs(pAny.deger - pAny.enSik) > 0.01;
    hesaplanan.push({
      ne: 'bölüm sol padding',
      desktop: pd?.deger ?? null,
      mobil: pm?.deger ?? null,
      nasil:
        `ilkIcerik.x(${pAny.x} «${pAny.ad}») − kutu.x(${kutu[0]})` +
        (fark
          ? ` · ayrıca en sık sol hizalanma ${pAny.enSik} (${pAny.enSikAdet} eleman) — ` +
            `iç içe eleman veya glif mürekkebi farkı olabilir (playbook §18); hangisinin ` +
            `padding olduğuna bölümün yapısına bakarak karar ver`
          : ''),
    });
  }
  //
  // Gap türetme — ADIM BAŞINA BİR TANE.
  //
  // Bir kart 332 px adımla tekrar ediyorsa kartın İÇİNDEKİ her eleman da 332 adımla
  // tekrar eder. Hepsi için "boşluk" yazmak gürültü ve yanıltıcı olur:
  // `user-icon arası boşluk 314` teknik olarak doğru ama tasarımda böyle bir boşluk yok.
  // Anlamlı olan, o adımı ÜRETEN elemanın (en büyüğünün) boşluğudur.
  const adimAdaylari = new Map<string, { ad: string | null; adet: number; boyut: number; adim: number; eksen: 'x' | 'y' }>();
  for (const e of elemanlar) {
    const t = e.tekrar;
    if (!t?.duzenli || (t.eksen !== 'x' && t.eksen !== 'y')) continue;
    const adim = t.adim;
    if (adim == null || adim <= 0) continue;
    const k = e[vpAna]?.kutu;
    if (!k) continue;
    const boyut = t.eksen === 'x' ? k[2] : k[3];
    const anahtar = `${t.eksen}:${adim.toFixed(1)}`;
    const mevcut = adimAdaylari.get(anahtar);
    if (!mevcut || boyut > mevcut.boyut) {
      adimAdaylari.set(anahtar, { ad: e.ad, adet: t.adet, boyut, adim, eksen: t.eksen });
    }
  }
  for (const a of adimAdaylari.values()) {
    const gap = +(a.adim - a.boyut).toFixed(2);
    hesaplanan.push({
      ne: `"${a.ad}" arası boşluk (${a.adet}×)`,
      desktop: vpAna === 'desktop' ? gap : null,
      mobil: vpAna === 'mobil' ? gap : null,
      nasil: `adim(${a.adim}) − ${a.eksen === 'x' ? 'genislik' : 'yukseklik'}(${+a.boyut.toFixed(2)})`,
    });
  }

  // ── testid birleştirme ──────────────────────────────────────────────────────
  if (!sec.force && sec.onceki) {
    const eski = new Map(
      sec.onceki.elemanlar.filter((e) => e.id && e.testid).map((e) => [e.id!, e.testid!])
    );
    let tasinan = 0;
    for (const e of elemanlar) {
      if (e.id && eski.has(e.id)) { e.testid = eski.get(e.id)!; tasinan++; eski.delete(e.id); }
    }
    for (const [id, tid] of eski) {
      cozulemedi.push(`testid "${tid}" taşınamadı — eleman artık yok (id ${id.slice(0, 8)}…)`);
    }
    if (tasinan) cozulemedi.push(`bilgi: ${tasinan} testid önceki dosyadan taşındı`);
  }

  // Bölümde geçen palet ve stiller
  const paletSayac = new Map<string, number>();
  for (const e of elemanlar) {
    for (const vp of ['desktop', 'mobil'] as const) {
      const o = e[vp];
      if (o?.dolgu) paletSayac.set(o.dolgu, (paletSayac.get(o.dolgu) ?? 0) + 1);
      if (o?.kontur?.renk) paletSayac.set(o.kontur.renk, (paletSayac.get(o.kontur.renk) ?? 0) + 1);
    }
    if (e.font?.renk) paletSayac.set(e.font.renk, (paletSayac.get(e.font.renk) ?? 0) + 1);
  }
  const stilSayac = new Map<string, { s: NonNullable<OlcumEleman['font']>; n: number }>();
  for (const e of elemanlar) {
    if (!e.font) continue;
    const k = `${e.font.aile}|${e.font.agirlik}|${e.font.punto}|${e.font.satir}|${e.font.renk}`;
    const v = stilSayac.get(k);
    if (v) v.n += e.tekrar?.adet ?? 1;
    else stilSayac.set(k, { s: e.font, n: e.tekrar?.adet ?? 1 });
  }

  const olcum: Olcum = {
    schemaVersion: OLCUM_SCHEMA_VERSION,
    kaynak: {
      design: '../design.json',
      ekran: design.ekran.ad,
      modifiedDate: design.kaynak.modifiedDate,
      uretilme: new Date().toISOString(),
    },
    bolum: {
      index: bolum.index,
      slug: slugify(bolum.ad ?? `bolum-${bolum.index}`),
      ad: bolum.ad,
      desktop: vpAna === 'desktop' ? kutu : null,
      mobil: vpAna === 'mobil' ? kutu : null,
      zemin: bolum.zemin,
    },
    palet: [...paletSayac.entries()].sort((a, b) => b[1] - a[1]).map(([hex, adet]) => ({ hex, adet })),
    stiller: [...stilSayac.values()].sort((a, b) => b.n - a.n).map(({ s, n }) => ({ ...s, adet: n })),
    elemanlar,
    hesaplanan,
    referans: sec.onceki?.referans ?? {},
    kabulEdilenSapmalar: sec.onceki?.kabulEdilenSapmalar ?? [
      'border-box', 'metin-cercevesi', 'yaklasik-ikon',
    ],
    cozulemedi,
  };
  return OlcumSchema.parse(olcum);
}
