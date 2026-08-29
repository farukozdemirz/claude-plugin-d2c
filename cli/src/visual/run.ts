/** `d2c visual diff` akışı. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OlcumSchema, type Olcum } from '../contracts/olcum.js';
import { VISUAL_SCHEMA_VERSION, VisualSchema, type Visual } from '../contracts/visual.js';
import { readFileSync } from 'node:fs';
import { tarayiciAc } from '../verify/browser.js';
import { viewportAyarla, viewportHatasi } from '../verify/viewport.js';
import { referansIndir, renderYakala } from './capture.js';
import { gorselKarsilastir, type Motor } from './diff.js';
import { olc } from '../util/trace.js';

export interface GorselSecenek {
  olcumYolu: string;
  xdUrl: string;
  screen: string;
  renderUrl: string;
  testid: string;
  outDir: string;
  scriptYolu: string;
  viewport?: 'desktop' | 'mobil';
  kalibre?: string;
  cdp?: string;
  tur?: number;
  motor?: Motor;
}

export async function gorselDiff(sec: GorselSecenek): Promise<Visual> {
  const t0 = Date.now();
  const olcum: Olcum = OlcumSchema.parse(JSON.parse(readFileSync(sec.olcumYolu, 'utf8')));
  const vp = sec.viewport ?? 'desktop';
  const bolumKutu = vp === 'desktop' ? olcum.bolum.desktop : olcum.bolum.mobil;
  if (!bolumKutu) throw new Error(`olcum.json'da "${vp}" bölüm kutusu yok`);
  mkdirSync(sec.outDir, { recursive: true });
  const notlar: string[] = [];

  // 1) Referans — thumbnail (tarayıcı YOK, ölçek tam biliniyor)
  const ref = await olc('referans-indirme', () => referansIndir(sec.xdUrl, sec.screen, join(sec.outDir, `xd-${vp}.png`)));
  if (ref.olcek < 0.9) {
    notlar.push(
      `referans ${ref.olcek}× çözünürlükte (manifest thumbnail'ı). Ham yüzde metinde ` +
      `detay kaybeder; yapısal fark ve bölge incelemesi geçerlidir. Tam çözünürlük ` +
      `gerekirse --kalibre yolu korunuyor.`
    );
  }

  // 2) Render — Faz 4'ün tarayıcı katmanı
  const oturum = await tarayiciAc({ cdp: sec.cdp });
  let render: { png: string; kirpma: [number, number, number, number] };
  try {
    await olc('sayfa-yukleme', () => oturum.page.goto(sec.renderUrl, { waitUntil: 'networkidle' }));
    const v = await viewportAyarla(oturum.page, bolumKutu[2]);
    if (!v.dogrulandi) throw new Error(viewportHatasi(v));
    render = await olc('render-yakalama', () =>
      renderYakala(oturum.page, sec.testid, join(sec.outDir, `render-${vp}.png`)));
  } finally {
    await oturum.kapat();
  }

  // 3) Karşılaştır + hazır kırpmalar
  const d = await olc('piksel-karsilastirma', () => gorselKarsilastir({
    xdPng: ref.png,
    renderPng: render.png,
    outDir: sec.outDir,
    tasarimKutu: bolumKutu,
    olcek: ref.olcek,
    renderKutu: render.kirpma,
    kalibre: sec.kalibre,
    scriptYolu: sec.scriptYolu,
    motor: sec.motor,
  }));

  if (sec.motor === 'ts' && d.motor === 'python') {
    notlar.push('--kalibre verildiği için Python motoru kullanıldı; çapa mantığı TS\'e taşınmadı.');
  }

  const visual: Visual = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    tur: sec.tur ?? 1,
    tarih: new Date().toISOString(),
    referans: { kaynak: ref.kaynak, png: ref.png, olcek: ref.olcek, kirpma: bolumKutu },
    render: { png: render.png, kirpma: render.kirpma },
    hamYuzde: d.ham,
    yapisalYuzde: d.yapisal,
    bolgeler: d.bolgeler,
    isiHaritasi: d.isiHaritasi,
    sureMs: Date.now() - t0,
    motor: d.motor,
    notlar,
  };
  const yol = join(sec.outDir, 'visual.json');
  writeFileSync(yol, JSON.stringify(visual, null, 2) + '\n');
  return VisualSchema.parse(visual);
}
