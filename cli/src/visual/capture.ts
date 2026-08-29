/**
 * Reference and render capture.
 *
 * REFERENCE — the POC-3 result: the `thumbnail` component from the manifest is used.
 *
 *   · downloaded over HTTP, **no browser needed**
 *   · the scale is **exactly 0.5** (measured: 1440×3778 → 720×1889, 375×4164 → 188×2082)
 *   · the mapping is known exactly → **no calibration anchor is derived**
 *
 * The old flow captured this step from the browser at dpr2 + zoom 50% and derived the
 * anchor with `--kalibre`; the measured cost was 19 min when the anchor was derived and
 * 10 min when it was provided. Here neither is needed.
 *
 * THE PRICE: half resolution. In POC-3 the known finding class (an ellipsis) was still
 * localised to the correct cell at half scale. If full resolution is required, the
 * `--kalibre` path is **preserved** in `visual-diff.py`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Page } from 'playwright-core';
import { fetchShare, type PrototypeData, type Artboard } from '../source/adobe-xd/share.js';
import { componentUrl } from '../source/adobe-xd/cdn.js';
import { redactUrl, redactedError } from '../util/redact.js';

export interface ReferansSonuc {
  kaynak: 'thumbnail' | 'tarayici';
  png: string;
  olcek: number;
  /** The artboard's design size. */
  tasarim: [number, number];
}

function artboardBul(proto: PrototypeData, key: string): Artboard {
  const ab =
    proto.manifest.artboards.find((a) => a.id === key) ??
    proto.manifest.artboards.find((a) => a.name === key);
  if (!ab) throw redactedError(`artboard bulunamadı: "${key}"`);
  return ab;
}

/** Downloads the artboard thumbnail and VERIFIES the scale. */
export async function referansIndir(
  url: string,
  screenKey: string,
  hedefPng: string
): Promise<ReferansSonuc> {
  const proto = await fetchShare(url);
  const ab = artboardBul(proto, screenKey);
  const th = (ab.components ?? []).find((c) => c.rel === 'thumbnail');
  if (!th) {
    throw redactedError(
      `artboard "${ab.name}" için thumbnail bileşeni yok.\n` +
        '  Referans tarayıcıyla yakalanmalı (playbook §23) veya --kalibre yolu kullanılmalı.'
    );
  }
  const u = componentUrl(proto, th.id);
  const res = await fetch(u);
  if (!res.ok) throw redactedError(`thumbnail ${res.status} döndü: ${redactUrl(u)}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('image/png')) throw redactedError(`thumbnail PNG değil: "${ct}"`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(hedefPng), { recursive: true });
  writeFileSync(hedefPng, buf);

  const boyut = pngBoyutu(buf);
  if (!boyut) throw redactedError('thumbnail PNG başlığı okunamadı');
  const sx = boyut.w / ab.bounds.width;
  const sy = boyut.h / ab.bounds.height;
  // The scale must be the SAME on both axes; otherwise the mapping is unreliable and we do not measure.
  if (Math.abs(sx - sy) > 0.005) {
    throw redactedError(
      `thumbnail ölçeği eksenler arasında tutarsız: x ${sx.toFixed(4)} · y ${sy.toFixed(4)}.\n` +
        '  Eşleme güvenilmez — ÖLÇÜM YAPILMADI.'
    );
  }
  return {
    kaynak: 'thumbnail',
    png: hedefPng,
    olcek: +((sx + sy) / 2).toFixed(6),
    tasarim: [ab.bounds.width, ab.bounds.height],
  };
}

/** Width/height from the PNG IHDR — without an extra dependency. */
export function pngBoyutu(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Captures the render — the selector's box becomes the crop box. */
export async function renderYakala(
  page: Page,
  testid: string,
  hedefPng: string
): Promise<{ png: string; kirpma: [number, number, number, number] }> {
  const el = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await el.count())) {
    throw redactedError(`render'da "${testid}" bulunamadı — yanlış rota veya eksik testid.`);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const kutu = await el.boundingBox();
  if (!kutu) throw redactedError(`"${testid}" görünür değil (boundingBox yok).`);
  mkdirSync(dirname(hedefPng), { recursive: true });
  // `fullPage` is NOT USED — it re-lays out the page (troubleshooting.md).
  await el.screenshot({ path: hedefPng });
  return {
    png: hedefPng,
    kirpma: [
      +kutu.x.toFixed(2), +kutu.y.toFixed(2), +kutu.width.toFixed(2), +kutu.height.toFixed(2),
    ],
  };
}
