/**
 * Render ölçümü — `design-diff` ajanının tarayıcı işinin tamamı.
 *
 * Ajanın §2 ve §3 adımları buraya taşındı; davranış birebir korunuyor:
 *   · `getBoundingClientRect` + `getComputedStyle`
 *   · renkler BÜYÜK HARF hex'e çevrilir
 *   · tekrar eden elemanlarda aradaki boşluk + adet
 *   · font yüklü mü — **canvas genişlik karşılaştırması**, `fonts.check` DEĞİL
 */
import type { Page } from 'playwright-core';

export interface ElemanOlcum {
  bulundu: boolean;
  adet: number;
  x: number; y: number; w: number; h: number;
  /** Bölüm köküne göre y — mutlak konum karşılaştırılmaz (design-diff notu). */
  yRel: number | null;
  padding: string; gap: string; rowGap: string; columnGap: string;
  radius: string; border: string;
  font: string; fontSize: string; lineHeight: string; fontWeight: string;
  fontFamily: string; letterSpacing: string;
  color: string; background: string;
  /** Tekrar eden elemanlarda ilk ikisi arasındaki boşluk. */
  aralikYatay: number | null;
  aralikDikey: number | null;
}

export interface SayfaOlcum {
  baslik: string;
  innerWidth: number;
  yatayTasma: boolean;
  fontlar: Array<{ aile: string; cozulmusAile: string; yuklu: boolean; api: boolean }>;
  /**
   * Font kutuları — ELEMANIN COMPUTED ailesiyle ölçülür.
   *
   * `next/font/local` üretilen aile adını değiştiriyor (`Bw Modelica` → `bwModelica`);
   * XD'deki adla ölçmek Arial'ın metriklerini verir (troubleshooting.md'de kayıtlı).
   * `cozulmusAile` gerçekte render edilen ailedir.
   */
  fontKutulari: Array<{
    aile: string; cozulmusAile: string; punto: number;
    kutu: number; oran: number; testid: string | null;
  }>;
  elemanlar: Record<string, ElemanOlcum>;
}

export interface OlcumIstek {
  testidler: string[];
  /** Göreli y için kök eleman (genelde bölümün kendisi). */
  kokTestid?: string | null;
  aileler: string[];
  /**
   * POC-4 girdisi. `testid` verilirse o elemanın COMPUTED font ailesiyle ölçülür —
   * `next/font/local` ad değişikliği bu şekilde aşılır.
   */
  fontCiftleri: Array<{ aile: string; punto: number; testid?: string | null; renk?: string | null }>;
}

/**
 * Sayfayı ölçer — TEK `page.evaluate`.
 *
 * Tek çağrı olması önemli: eski akışta ayrı `navigate` + `emulate` + `evaluate`
 * üç araç çağrısı ≈ 45 sn demekti. Burada tek round-trip.
 */
export async function sayfayiOlc(page: Page, istek: OlcumIstek): Promise<SayfaOlcum> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  return page.evaluate((arg: OlcumIstek) => {
    const hex = (c: string): string => {
      const m = c.match(/[\d.]+/g);
      if (!m) return c;
      if (m.length > 3 && parseFloat(m[3]!) === 0) return 'transparent';
      return (
        '#' +
        m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase()
      );
    };

    /**
     * Font gerçekten yüklü mü?
     *
     * `document.fonts.check()` KULLANILMAZ — fallback varken de `true` döner
     * (troubleshooting.md'de kayıtlı: Bw Modelica ve Helvetica Neue için yanlış
     * pozitif verdi). Bunun yerine metin genişliği bilinen fallback'lerle
     * karşılaştırılır: aile gerçekten yüklüyse genişlikler farklı çıkar.
     */
    const fontYuklu = (aile: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const w = (f: string) => { ctx.font = `48px ${f}`; return ctx.measureText(s).width; };
      const yuklu = ['monospace', 'serif'].some((fb) => w(`"${aile}",${fb}`) !== w(fb));
      return { aile, yuklu, api: document.fonts.check(`16px "${aile}"`) };
    };

    const ilkAile = (el: Element) =>
      getComputedStyle(el).fontFamily.split(',')[0]!.replace(/['"]/g, '').trim();

    const hexOf = (el: Element) => hex(getComputedStyle(el).color);

    /**
     * XD aile adını, sayfada GERÇEKTE render edilen aileye çözer.
     *
     * `next/font/local` üretilen adı değiştiriyor (`Bw Modelica` → `bwModelica`);
     * XD adıyla ölçmek fallback'in (Arial) metriklerini verir — troubleshooting.md'de
     * kayıtlı tuzak. Eşleme iki yoldan denenir:
     *   1. `testid` verildiyse o eleman (en güvenilir)
     *   2. punto + renk eşleşen ilk eleman — ikisi birlikte güçlü ayırt edici
     * Hiçbiri tutmazsa XD adı olduğu gibi kullanılır ve bu ÇÖZÜLEMEDİ demektir.
     */
    const cozumleAile = (
      testid: string | null | undefined,
      dusen: string,
      punto?: number,
      renk?: string | null
    ): string => {
      if (testid) {
        const el = document.querySelector(`[data-testid="${testid}"]`);
        if (el) return ilkAile(el) || dusen;
      }
      if (punto) {
        const hedefPx = `${punto}px`;
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.fontSize !== hedefPx) continue;
          if (renk && hexOf(el) !== renk.toUpperCase()) continue;
          if (!el.textContent?.trim()) continue;
          const ff = ilkAile(el);
          if (ff) return ff;
        }
      }
      return dusen;
    };

    const fontKutusu = (aile: string, punto: number, testid?: string | null, renk?: string | null) => {
      const cozulmus = cozumleAile(testid, aile, punto, renk);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${punto}px "${cozulmus}"`;
      const m = ctx.measureText('Hxg');
      const kutu = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
      return {
        aile, cozulmusAile: cozulmus, punto,
        kutu: +kutu.toFixed(3), oran: +(kutu / punto).toFixed(4),
        testid: testid ?? null,
      };
    };

    const kok = arg.kokTestid
      ? document.querySelector(`[data-testid="${arg.kokTestid}"]`)
      : null;
    const kokRect = kok ? kok.getBoundingClientRect() : null;

    const olc = (tid: string): ElemanOlcum => {
      const els = [...document.querySelectorAll(`[data-testid="${tid}"]`)];
      if (!els.length) {
        return {
          bulundu: false, adet: 0, x: 0, y: 0, w: 0, h: 0, yRel: null,
          padding: '', gap: '', rowGap: '', columnGap: '', radius: '', border: '',
          font: '', fontSize: '', lineHeight: '', fontWeight: '', fontFamily: '',
          letterSpacing: '', color: '', background: '',
          aralikYatay: null, aralikDikey: null,
        };
      }
      const el = els[0]!;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      let ay: number | null = null;
      let ad: number | null = null;
      if (els.length > 1) {
        const a = els[0]!.getBoundingClientRect();
        const b = els[1]!.getBoundingClientRect();
        ay = +(b.x - a.right).toFixed(2);
        ad = +(b.y - a.bottom).toFixed(2);
      }
      return {
        bulundu: true, adet: els.length,
        x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2),
        yRel: kokRect ? +(r.y - kokRect.y).toFixed(2) : null,
        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' '),
        gap: s.gap, rowGap: s.rowGap, columnGap: s.columnGap,
        radius: s.borderRadius,
        border: `${s.borderTopWidth} ${s.borderTopStyle} ${hex(s.borderTopColor)}`,
        font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0]!.replace(/['"]/g, '')}`,
        fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.split(',')[0]!.replace(/['"]/g, ''),
        letterSpacing: s.letterSpacing,
        color: hex(s.color), background: hex(s.backgroundColor),
        aralikYatay: ay, aralikDikey: ad,
      };
    };

    const elemanlar: Record<string, ElemanOlcum> = {};
    for (const t of arg.testidler) elemanlar[t] = olc(t);

    return {
      baslik: document.title,
      innerWidth: window.innerWidth,
      yatayTasma: document.documentElement.scrollWidth > window.innerWidth,
      // Font yüklülük kontrolü de ÇÖZÜLMÜŞ adla yapılır (aynı sebep).
      fontlar: arg.aileler.map((a) => {
        const cift = arg.fontCiftleri.find((c) => c.aile === a);
        const cozulmus = cozumleAile(cift?.testid, a, cift?.punto, cift?.renk);
        return { ...fontYuklu(cozulmus), aile: a, cozulmusAile: cozulmus };
      }),
      fontKutulari: arg.fontCiftleri.map((c) => fontKutusu(c.aile, c.punto, c.testid, c.renk)),
      elemanlar,
    };
  }, istek);
}

/** Doğru uygulamayı mı açtık? Beklenen seçici yoksa ÖLÇME. */
export async function uygulamaTeyit(page: Page, beklenenTestid: string): Promise<{ ok: boolean; baslik: string }> {
  return page.evaluate((tid: string) => ({
    ok: !!document.querySelector(`[data-testid="${tid}"]`),
    baslik: document.title,
  }), beklenenTestid);
}
