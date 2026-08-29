/**
 * Viewport ayarı + DOĞRULAMA.
 *
 * `troubleshooting.md`'nin iki kayıtlı tuzağı burada kodlanıyor:
 *
 * 1. **Kaydırma çubuğu layout'u daraltır.** Sayfa dikeyde taşıyorsa klasik kaydırma
 *    çubuğu ~15 px yer kaplar: 1440'lık pencerede layout genişliği 1425 olur ve
 *    1312'lik bar 1297 çıkar. Telafi için geniş emüle edilir ve **doğrulanır**.
 * 2. **Doğrulama tutmazsa ÖLÇÜLMEZ.** Sessizce yanlış viewport'ta ölçmek, mobil
 *    ölçümü desktop ölçümü sanmaya kadar gider.
 */
import type { Page } from 'playwright-core';

export interface ViewportSonuc {
  hedef: number;
  emuleEdilen: number;
  clientWidth: number;
  dogrulandi: boolean;
}

/** Chrome'un klasik kaydırma çubuğu genişliği (ölçülen: ~15 px). */
const SCROLLBAR = 15;

export async function viewportAyarla(
  page: Page,
  hedefGenislik: number,
  yukseklik = 1000
): Promise<ViewportSonuc> {
  // Önce hedef genişlikte dene; dikey taşma varsa telafi gerekir.
  await page.setViewportSize({ width: hedefGenislik, height: yukseklik });
  await page.waitForTimeout(50);
  let cw = await page.evaluate(() => document.documentElement.clientWidth);
  let emule = hedefGenislik;

  if (cw !== hedefGenislik) {
    // Kaydırma çubuğu yemiş: telafi et.
    emule = hedefGenislik + SCROLLBAR;
    await page.setViewportSize({ width: emule, height: yukseklik });
    await page.waitForTimeout(50);
    cw = await page.evaluate(() => document.documentElement.clientWidth);
  }
  return { hedef: hedefGenislik, emuleEdilen: emule, clientWidth: cw, dogrulandi: cw === hedefGenislik };
}

export function viewportHatasi(v: ViewportSonuc): string {
  return (
    `viewport doğrulanamadı: hedef ${v.hedef}, clientWidth ${v.clientWidth} ` +
    `(${v.emuleEdilen} emüle edildi).\n` +
    '  ÖLÇÜM YAPILMADI — yanlış viewport\'ta ölçmek sessizce yanlış sonuç üretir.'
  );
}
