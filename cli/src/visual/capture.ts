/**
 * Referans ve render yakalama.
 *
 * REFERANS — POC-3 sonucu: manifest'teki `thumbnail` bileşeni kullanılıyor.
 *
 *   · HTTP ile iner, **tarayıcı gerekmez**
 *   · Ölçek **tam 0,5** (ölçüldü: 1440×3778 → 720×1889, 375×4164 → 188×2082)
 *   · Eşleme kesin biliniyor → **kalibrasyon çapası türetilmiyor**
 *
 * Eski akış bu adımı dpr2 + zoom %50 ile tarayıcıdan yakalıyor ve çapayı
 * `--kalibre` ile türetiyordu; ölçülen maliyet çapa türetildiğinde 19 dk,
 * hazır verildiğinde 10 dk. Burada ikisi de gerekmiyor.
 *
 * BEDELİ: yarı çözünürlük. POC-3'te bilinen bulgu sınıfı (ellipsis) yarı ölçekte
 * doğru hücrede lokalize edildi. Tam çözünürlük gerekirse `--kalibre` yolu
 * `visual-diff.py`'da **korunuyor**.
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
  /** Artboard'ın tasarım boyutu. */
  tasarim: [number, number];
}

function artboardBul(proto: PrototypeData, key: string): Artboard {
  const ab =
    proto.manifest.artboards.find((a) => a.id === key) ??
    proto.manifest.artboards.find((a) => a.name === key);
  if (!ab) throw redactedError(`artboard bulunamadı: "${key}"`);
  return ab;
}

/** Artboard thumbnail'ını indirir ve ölçeği DOĞRULAR. */
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
  // Ölçek iki eksende AYNI olmalı; değilse eşleme güvenilmez ve ölçmeyiz.
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

/** PNG IHDR'den genişlik/yükseklik — ek bağımlılık olmadan. */
export function pngBoyutu(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Render'ı yakalar — seçicinin kutusu kırpma kutusu olur. */
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
  // `fullPage` KULLANILMAZ — sayfayı yeniden diziyor (troubleshooting.md).
  await el.screenshot({ path: hedefPng });
  return {
    png: hedefPng,
    kirpma: [
      +kutu.x.toFixed(2), +kutu.y.toFixed(2), +kutu.width.toFixed(2), +kutu.height.toFixed(2),
    ],
  };
}
