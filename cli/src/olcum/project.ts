/**
 * design.json → olcum.json section projection.
 *
 * Because `olcum.json` is Claude's ONLY input, two things have to hold at once:
 *   1. **Self-contained** — every value needed to write code is inline
 *   2. **Compact** — the full scenegraph must not enter Claude's context
 *
 * These look contradictory but are not: measured, a section's raw projection is
 * 131 elements / 56 KB and most of them are COPIES of each other (8 identical cards,
 * 45 stars). What Claude needs is "there are 8 cards, one looks like this, 16 px
 * apart" — not 8 copies.
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
   * An explicit design box `[x, y, w, h]` — a SPECIFIC region instead of a section.
   *
   * Needed for screens that do not flow vertically: drawer/overlay panels (e.g.
   * x=940, y=0–1080) do not fit the horizontal band map. The practical answer to
   * the "freely laid out artboard" limit recorded in `limitations.md` — the
   * equivalent of the old flow's `bolum_kutu` field.
   */
  kutu?: [number, number, number, number];
  /** The existing olcum.json (for merging testids). */
  onceki?: Olcum | null;
  /** true → `testid`s are not carried over, they are written from scratch. */
  force?: boolean;
  /** Repeat compression threshold (fewer repeats than this are not compressed). */
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
 * Does the element belong to the section?
 *
 * The rule: when the box's **vertical midpoint** falls inside the section range. This
 * makes it deterministic which section an element sitting on a boundary belongs to —
 * it cannot land in two sections at once.
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

/** Element signature for repeat detection — same signature = "the same thing". */
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

/** Is the step between sorted values regular? If so, returns the average step. */
function duzenliAdim(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const adimlar: number[] = [];
  for (let k = 1; k < vals.length; k++) adimlar.push(vals[k]! - vals[k - 1]!);
  const ort = adimlar.reduce((a, b) => a + b, 0) / adimlar.length;
  if (ort <= 0) return null;
  return adimlar.every((d) => Math.abs(d - ort) <= Math.max(0.5, ort * 0.02)) ? +ort.toFixed(2) : null;
}

/**
 * Compresses elements with the same signature into regular series.
 *
 * Compression happens only when the **step is regular**: if consecutive differences
 * deviate from each other by more than 2%, the series is irregular and is **not
 * compressed** — saying "8 cards, 332 px apart" is only correct when it really is
 * so. Nothing is invented.
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

  // 1) Regular 1-D series — the other axis is constant
  for (const eksen of ['x', 'y'] as const) {
    const i = eksen === 'x' ? 0 : 1;
    const digerTek = eksen === 'x' ? ys : xs;
    if (digerTek.length !== 1) continue;
    const sirali = [...grup].sort((a, b) => kutu(a)[i]! - kutu(b)[i]!);
    const adim = duzenliAdim(sirali.map((e) => kutu(e)[i]!));
    if (adim == null) continue;
    return { temsilci: sirali[0]!, adet: sirali.length, duzenli: true, eksen, adim };
  }

  // 2) Regular grid — a regular step on both axes, no holes
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

  // 3) Irregular — style/size once, positions kept as a full list (NO INFORMATION LOST)
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
      // M1 RULE: the AGC font box is not consumed; the code phase measures it in the browser (POC-4 → M2).
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
  // The reported box: the explicit one if given, otherwise the section at full width.
  const kutu: [number, number, number, number] =
    sec.kutu ?? [0, bolum.y, harita.tasarim[0], bolum.h];

  //
  // The SELECTION box can differ from the reported box.
  //
  // For boxes coming from the section map, selection is VERTICAL ONLY. The reason was
  // measured: the review carousel has 8 cards but 4 of them overflow to the right of
  // the artboard (x 1391…2387). Applying a horizontal constraint drops those 4 cards
  // and the "8 cards" information is lost — yet the fact that the carousel has 8 cards
  // is real design information.
  //
  // With an explicit `--kutu` the horizontal constraint is REQUIRED: a drawer panel
  // (x 940…1440) must take only its own content.
  const secimKutu: [number, number, number, number] = sec.kutu
    ? kutu
    : [-1e9, bolum.y, 2e9, bolum.h];

  let icinde = design.elemanlar.filter((e) => bolumdeMi(e, vpAna, secimKutu));

  //
  // OVERLAY FILTER — discard elements left behind it.
  //
  // A panel such as a drawer or modal sits on top of the page. The content underneath
  // stays inside the box but is INVISIBLE; geometry cannot tell them apart, paint order
  // can.
  //
  // Verified (the review drawer): the panel `Rectangle 7931` has sira=153; the order
  // summary behind it ("Genel Toplam", "Ödeme Bilgileri") has sira 107–149; the drawer's
  // own content has sira 154–186. Without the filter the background bleeds into the
  // drawer's measurement and the left padding came out as 7 instead of 32.
  //
  // Applied ONLY when an explicit `--kutu` is given. It is not applied to boxes coming
  // from the section map: measured — the section band (`Rectangle 6645`) is painted
  // AFTER part of its own content, and the filter dropped 4 of the 8 cards. Inside
  // sections the layer order is already resolved by band authority; the overlay filter
  // does not belong there.
  const panel = sec.kutu ? icinde.find((e) => {
    const k = e[vpAna]?.kutu;
    if (!k) return false;
    return (
      Math.abs(k[0] - kutu[0]) < 1 && Math.abs(k[1] - kutu[1]) < 1 &&
      Math.abs(k[2] - kutu[2]) < 1 && Math.abs(k[3] - kutu[3]) < 1
    );
  }) : undefined;
  if (panel) icinde = icinde.filter((e) => e.sira >= panel.sira);

  // Role labels — only the ones that can be derived safely.
  const bantAdi = bolum.bant;
  const baslikMetin = bolum.baslik?.metin ?? null;
  const rolOf = (e: Eleman): string | null => {
    if (bantAdi && e.ad === bantAdi) return 'bolum-zemini';
    if (baslikMetin && e.tip === 'metin' && (e.metin ?? '').trim() === baslikMetin) return 'baslik';
    return null;
  };

  // Repeat compression
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

  // ── computed gaps (playbook §14: from the difference of neighbouring boxes) ──
  const hesaplanan: Olcum['hesaplanan'] = [];
  /**
   * The section's left padding — the CONTENT element closest to the box's left edge.
   * playbook §14: `padding = content.x − box.x`.
   *
   * Elements as wide as the box (backgrounds/panels) do not define padding and are
   * filtered out. Elements left behind have already been dropped by the overlay filter.
   */
  const paddingOf = (vp: 'desktop' | 'mobil') => {
    if (vp !== vpAna) return null;
    const adaylar = elemanlar
      .map((e) => ({ ad: e.ad, k: e[vp]?.kutu }))
      .filter((a): a is { ad: string | null; k: [number, number, number, number] } => !!a.k)
      .filter((a) => a.k[2] < kutu[2] * 0.98);
    if (!adaylar.length) return null;
    const enSol = adaylar.reduce((m, a) => (a.k[0] < m.k[0] ? a : m));
    // The most common alignment — glyph ink and design alignment can diverge (playbook §18).
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
    // The measured value is reported as is. The alignment distribution is added as
    // EVIDENCE, but "the design intent is X" is NOT claimed: which one is right varies
    // by section (measured — in the card grid the leftmost is right, in the drawer the
    // most common alignment is right). That is a judgement, and the judgement belongs to
    // Claude; the extractor does not guess.
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
  // Gap derivation — ONE PER STEP.
  //
  // If a card repeats with a 332 px step, every element INSIDE the card repeats with the
  // same 332 step. Writing a "gap" for all of them is noise and misleading:
  // `gap between user-icon 314` is technically true but no such gap exists in the design.
  // What is meaningful is the gap of the element that PRODUCES that step (the largest one).
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

  // ── testid merge ────────────────────────────────────────────────────────────
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

  // The palette and styles that occur in this section
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
