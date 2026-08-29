/**
 * Viewport setup + VERIFICATION.
 *
 * Two traps recorded in `troubleshooting.md` are encoded here:
 *
 * 1. **The scrollbar narrows the layout.** If the page overflows vertically, the classic
 *    scrollbar takes ~15 px: in a 1440 window the layout width becomes 1425 and a 1312
 *    bar reads 1297. To compensate we emulate wider and **verify**.
 * 2. **If the verification fails, WE DO NOT MEASURE.** Silently measuring at the wrong
 *    viewport leads all the way to mistaking a mobile measurement for a desktop one.
 */
import type { Page } from 'playwright-core';

export interface ViewportSonuc {
  hedef: number;
  emuleEdilen: number;
  clientWidth: number;
  dogrulandi: boolean;
}

/** The width of Chrome's classic scrollbar (measured: ~15 px). */
const SCROLLBAR = 15;

export async function viewportAyarla(
  page: Page,
  hedefGenislik: number,
  yukseklik = 1000
): Promise<ViewportSonuc> {
  // Try the target width first; compensation is needed only if it overflows vertically.
  await page.setViewportSize({ width: hedefGenislik, height: yukseklik });
  await page.waitForTimeout(50);
  let cw = await page.evaluate(() => document.documentElement.clientWidth);
  let emule = hedefGenislik;

  if (cw !== hedefGenislik) {
    // The scrollbar ate into it: compensate.
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
