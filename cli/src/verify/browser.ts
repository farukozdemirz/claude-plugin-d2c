/**
 * Playwright lifecycle.
 *
 * `playwright-core` + `channel:"chrome"` — the system's Chrome is used, **no binary
 * download**. If the channel cannot be found, we connect to a running browser via
 * `--cdp <url>`.
 *
 * The browser is closed on every run. The old flow's shared-single-browser problem (the
 * lock file, an agent taking over the page) does not exist here: the process is ours.
 */
import type { Browser, Page } from 'playwright-core';
import { olc } from '../util/trace.js';

export interface TarayiciSecenek {
  cdp?: string;
  headed?: boolean;
  timeoutMs?: number;
}

export interface Oturum {
  page: Page;
  kapat: () => Promise<void>;
}

/**
 * `playwright-core` is an OPTIONAL runtime dependency.
 *
 * It is not bundled (it has dynamic requires) and is not needed for the measurement path
 * — only for verification. When it is missing, clear install instructions are given.
 */
async function playwrightYukle(): Promise<typeof import('playwright-core')> {
  try {
    return await import('playwright-core');
  } catch {
    throw new Error(
      'playwright-core bulunamadı — render doğrulama için gerekli.\n' +
        '  Kurulum:  npm i -D playwright-core\n' +
        '  (Tarayıcı binary indirmez; sistemdeki Chrome kullanılır.)\n' +
        '  Ölçüm yolu (xd extract / sections / spec) bu paket olmadan da çalışır.'
    );
  }
}

export async function tarayiciAc(sec: TarayiciSecenek = {}): Promise<Oturum> {
  const { chromium } = await olc('playwright-yukleme', () => playwrightYukle());
  let browser: Browser;
  if (sec.cdp) {
    browser = await chromium.connectOverCDP(sec.cdp);
  } else {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: !sec.headed });
    } catch (e) {
      throw new Error(
        `Chrome başlatılamadı: ${(e as Error).message}\n` +
          '  · Sistemde Google Chrome kurulu olmalı (playwright-core binary indirmez)\n' +
          '  · Alternatif: çalışan bir tarayıcıya --cdp http://localhost:9222 ile bağlan'
      );
    }
  }
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(sec.timeoutMs ?? 30_000);
  return {
    page,
    kapat: async () => {
      await ctx.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
