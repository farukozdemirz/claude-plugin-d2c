/** `d2c render verify` ve `d2c font parity` akışları. */
import { readFileSync } from 'node:fs';
import { OlcumSchema, type Olcum } from '../contracts/olcum.js';
import { VERIFICATION_SCHEMA_VERSION, VerificationSchema, type Verification } from '../contracts/verification.js';
import { tarayiciAc } from './browser.js';
import { viewportAyarla, viewportHatasi } from './viewport.js';
import { sayfayiOlc, type OlcumIstek } from './measure.js';
import { baglamKur, elemaniKarsilastir, ozetle, type ElemanSonuc } from './compare.js';
import { pariteHesapla, type PariteSonuc } from './fontparity.js';
import { olc } from '../util/trace.js';

export interface DogrulaSecenek {
  olcumYolu: string;
  url: string;
  viewport?: 'desktop' | 'mobil';
  cdp?: string;
  headed?: boolean;
  tur?: number;
}

function istekKur(olcum: Olcum, vp: 'desktop' | 'mobil'): OlcumIstek {
  const testidler = [...new Set(olcum.elemanlar.map((e) => e.testid).filter((t): t is string => !!t))];
  const kok = olcum.elemanlar.find((e) => e.rol === 'bolum-zemini' && e.testid)?.testid ?? null;
  const aileler = [...new Set(olcum.stiller.map((s) => s.aile).filter((a): a is string => !!a))];
  // Her aile/punto çiftine, o stili KULLANAN bir elemanın testid'sini bağla —
  // font kutusu o elemanın computed ailesiyle ölçülecek (next/font ad değişikliği).
  const ciftler = new Map<string, { aile: string; punto: number; testid?: string | null; renk?: string | null }>();
  for (const s of olcum.stiller) {
    if (!s.aile || !s.punto) continue;
    const sahip = olcum.elemanlar.find(
      (e) => e.testid && e.font?.aile === s.aile && e.font?.punto === s.punto
    );
    ciftler.set(`${s.aile}|${s.punto}`, {
      aile: s.aile, punto: s.punto, testid: sahip?.testid ?? null, renk: s.renk ?? null,
    });
  }
  return { testidler, kokTestid: kok, aileler, fontCiftleri: [...ciftler.values()] };
}

export function agcKutuHaritasi(olcum: Olcum): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of olcum.stiller) {
    if (s.aile && s.punto && s.fontKutusuAgc != null) m.set(`${s.aile}|${s.punto}`, s.fontKutusuAgc);
  }
  return m;
}

export function olcumOku(yol: string): Olcum {
  return OlcumSchema.parse(JSON.parse(readFileSync(yol, 'utf8')));
}

/** `testid` doldurulmamışsa ÖLÇME — uydurma seçici sessizce yanlış sonuç üretir. */
export function testidKontrol(olcum: Olcum): string | null {
  const bos = olcum.elemanlar.filter((e) => e.testid === null);
  if (bos.length === olcum.elemanlar.length) {
    return (
      `olcum.json'daki HİÇBİR elemanda testid yok (${bos.length} eleman).\n` +
      '  Kod fazı eşlemeyi doldurmamış — ÖLÇÜM YAPILMADI.\n' +
      '  Uydurma seçiciyle ölçmek sessizce yanlış sonuç üretir.'
    );
  }
  return null;
}

export async function dogrula(sec: DogrulaSecenek): Promise<Verification> {
  const t0 = Date.now();
  const olcum = olcumOku(sec.olcumYolu);
  const vp = sec.viewport ?? 'desktop';
  const hedefGenislik = (vp === 'desktop' ? olcum.bolum.desktop?.[2] : olcum.bolum.mobil?.[2]) ?? 1440;

  const bos = testidKontrol(olcum);
  if (bos) {
    return VerificationSchema.parse({
      schemaVersion: VERIFICATION_SCHEMA_VERSION, tur: sec.tur ?? 1,
      tarih: new Date().toISOString(), url: sec.url, olcum: sec.olcumYolu,
      sureMs: Date.now() - t0, viewportlar: [],
      ozet: { toplam: 0, gecen: 0, kabul: 0, uyari: 0, sapan: 0 },
      durduruldu: bos,
    });
  }

  const oturum = await tarayiciAc({ cdp: sec.cdp, headed: sec.headed });
  try {
    await olc('sayfa-yukleme', () => oturum.page.goto(sec.url, { waitUntil: 'networkidle' }));
    const vpSonuc = await viewportAyarla(oturum.page, hedefGenislik);
    if (!vpSonuc.dogrulandi) throw new Error(viewportHatasi(vpSonuc));

    const istek = istekKur(olcum, vp);
    const olculen = await olc('olcum', () => sayfayiOlc(oturum.page, istek));

    // Doğru uygulamayı mı açtık? Hiçbir hedef eleman yoksa ÖLÇME.
    const bulunan = Object.values(olculen.elemanlar).filter((e) => e.bulundu).length;
    if (bulunan === 0) {
      throw new Error(
        `Beklenen elemanların hiçbiri bulunamadı (sayfa başlığı: "${olculen.baslik}").\n` +
          `  Aranan testid'ler: ${istek.testidler.join(', ')}\n` +
          '  Yanlış uygulama veya yanlış rota olabilir — ÖLÇÜM YAPILMADI.'
      );
    }

    const eksikFontlar = olculen.fontlar.filter((f) => !f.yuklu).map((f) => f.aile);
    const ctx = baglamKur(olcum, vp, eksikFontlar);
    const sonuclar: ElemanSonuc[] = [];
    for (const el of olcum.elemanlar) {
      if (!el.testid) continue;
      const o = olculen.elemanlar[el.testid];
      if (!o) continue;
      sonuclar.push(elemaniKarsilastir(el, o, ctx));
    }

    return VerificationSchema.parse({
      schemaVersion: VERIFICATION_SCHEMA_VERSION,
      tur: sec.tur ?? 1,
      tarih: new Date().toISOString(),
      url: sec.url,
      olcum: sec.olcumYolu,
      sureMs: Date.now() - t0,
      viewportlar: [{
        genislik: hedefGenislik,
        emuleEdilen: vpSonuc.emuleEdilen,
        clientWidthDogrulandi: vpSonuc.dogrulandi,
        yatayTasma: olculen.yatayTasma,
        fontlar: olculen.fontlar.map((f) => ({ aile: f.aile, yuklu: f.yuklu })),
        elemanlar: sonuclar,
      }],
      ozet: ozetle(sonuclar),
      durduruldu: null,
    });
  } finally {
    await oturum.kapat();
  }
}

export async function fontParite(sec: DogrulaSecenek): Promise<PariteSonuc> {
  const olcum = olcumOku(sec.olcumYolu);
  const oturum = await tarayiciAc({ cdp: sec.cdp, headed: sec.headed });
  try {
    await olc('sayfa-yukleme', () => oturum.page.goto(sec.url, { waitUntil: 'networkidle' }));
    const olculen = await olc('olcum', () => sayfayiOlc(oturum.page, istekKur(olcum, sec.viewport ?? 'desktop')));
    return pariteHesapla(olculen, agcKutuHaritasi(olcum));
  } finally {
    await oturum.kapat();
  }
}
