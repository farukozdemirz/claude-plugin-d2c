/** d2c CLI — command dispatch. */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AdobeXdShare } from './source/adobe-xd/index.js';
import { enKotuSeviye, type Kontrol } from './source/adobe-xd/contract.js';
import { redactText } from './util/redact.js';
import { DesignSchema } from './contracts/design.js';
import { segment } from './sections/segment.js';
import { project, slugify } from './olcum/project.js';
import { OlcumSchema } from './contracts/olcum.js';
import { specMarkdown } from './report/spec.js';
import { dogrula, fontParite } from './verify/run.js';
import { gorselDiff } from './visual/run.js';
import { envanterCikar, envanterYaz } from './inventory/scan.js';
import { izlemeBaslat, izlemeJson, olc, rapor } from './util/trace.js';
import { xdSmoke, smokeYaz } from './source/adobe-xd/smoke.js';
import { robustDogrula, VARSAYILAN_GENISLIKLER } from './verify/robust.js';
import { fetchShare } from './source/adobe-xd/share.js';
import { fetchComponentJson, CONTENT_TYPES } from './source/adobe-xd/cdn.js';
import { flatten } from './source/adobe-xd/agc.js';
import { svgleriYaz, gorselleriIndir } from './source/adobe-xd/assets.js';
import { fileURLToPath } from 'node:url';

const HELP = `d2c — deterministik tasarım çıkarma ve doğrulama

KOMUTLAR
  doctor                          ortam ve önkoşul kontrolü
  xd inspect <url>                ekran listesi + sözleşme sağlık raporu
  xd extract <url> --screen <ad|id> [--no-pair] [-o dosya]
                                  ekranı design.json olarak çıkarır
  xd smoke <url>                  canlı sözleşme kontrolü (haftalık CI için)
                                  çıkış 0 = sağlam · 1 = sözleşme sorunlu
  xd assets <url> --screen <ad|id> --out-dir <dizin>
                                  vektörleri SVG, görselleri dosya olarak çıkarır
  sections --design <dosya> [--viewport desktop|mobil]
                                  bölüm haritası (probe/screenshot YOK)
  render verify --olcum <dosya> --url <url> [--viewport desktop|mobil] [-o <dosya>]
                                  render'ı ölç ve olcum.json hedefleriyle karşılaştır
  render robust --olcum <dosya> --url <url> [--widths 1920,1440,1280] [-o <dosya>]
                                  ÇOKLU genişlikte layout sağlamlığı: çakışma · taşma ·
                                  kapsayıcı dışına çıkma (tek çağrı, varsayılan 5 genişlik)
  visual diff --olcum <dosya> --xd-url <url> --screen <ad> --url <render url>
              --testid <id> --out-dir <dizin> [--kalibre "HEX:x,y,w,h"]
                                  referans + render + piksel karşılaştırma + hazır kırpmalar
  font parity --olcum <dosya> --url <url>
                                  POC-4: AGC font kutusu ↔ Chrome fontBoundingBox

  inventory [dizin]               mevcut bileşen envanteri (AST) — "bu zaten var mı?"

  spec --design <dosya> (--section <no|slug> | --kutu x,y,w,h) [--out-dir <dizin>] [--force]
                                  bölüm projeksiyonu → olcum.json + spec.md
                                  --kutu: dikey akmayan ekranlar (drawer/overlay) için

SEÇENEKLER
  --json                          makine okunur çıktı
  --verbose                       faz sürelerini stderr'e yaz (insan okunur)
  --trace <dosya>                 faz sürelerini JSON olarak dosyaya yaz
                                  (runs.jsonl'daki faz_sn alanı buradan gelir)
  -o, --output <dosya>            çıktıyı dosyaya yaz
  --screen <ad|id>                hedef ekran
  --no-pair                       desktop/mobil eşleştirmesini kapat
  --design <dosya>                design.json yolu (sections için)
  --viewport <desktop|mobil>      hangi artboard (vars. desktop)
  --section <no|slug>             hedef bölüm (spec için)
  --kutu x,y,w,h                  açık tasarım kutusu (bölüm yerine)
  --ad "<ad>"                     --kutu ile birlikte bölüm adı
  --out-dir <dizin>               olcum.json + spec.md yazılacak dizin
  --force                         testid'leri taşıma, sıfırdan yaz
  --olcum <dosya>                 olcum.json yolu (doğrulama için)
  --url <url>                     render edilmiş sayfanın adresi
  --cdp <url>                     çalışan tarayıcıya bağlan (Chrome kanalı yoksa)
  --headed                        tarayıcıyı görünür çalıştır
  --xd-url <url>                  XD paylaşım linki (görsel referans için)
  --testid <id>                   render'da kırpılacak eleman
  --kalibre "HEX:x,y,w,h"         çapa yolu (tam çözünürlük gerekirse — korunuyor)
  --motor ts|python               görsel diff motoru (vars. ts; --kalibre ile python)
  --tur <n>                       doğrulama tur numarası (telemetri)
  --bosluk <px>                   ayraç eşiği (vars. 40)
  --gutter <px>                   içerik sütunu kenarı (vars. 64)
  -h, --help
`;

interface Args {
  _: string[]; json: boolean; output?: string; screen?: string; pair: boolean; help: boolean;
  design?: string; viewport?: 'desktop' | 'mobil'; bosluk?: number; gutter?: number;
  section?: string; outDir?: string; force?: boolean; kutu?: string; ad?: string;
  olcum?: string; url?: string; cdp?: string; headed?: boolean; tur?: number;
  xdUrl?: string; testid?: string; kalibre?: string; motor?: 'ts' | 'python';
  widths?: number[];
  verbose?: boolean; trace?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { _: [], json: false, pair: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === '--json') a.json = true;
    else if (k === '--verbose') a.verbose = true;
    else if (k === '--trace') a.trace = argv[++i];
    else if (k === '--no-pair') a.pair = false;
    else if (k === '-h' || k === '--help') a.help = true;
    else if (k === '-o' || k === '--output') a.output = argv[++i];
    else if (k === '--screen') a.screen = argv[++i];
    else if (k === '--design') a.design = argv[++i];
    else if (k === '--viewport') {
      const v = argv[++i];
      if (v !== 'desktop' && v !== 'mobil') throw new Error(`--viewport desktop|mobil olmalı: ${v}`);
      a.viewport = v;
    }
    else if (k === '--bosluk') a.bosluk = Number(argv[++i]);
    else if (k === '--gutter') a.gutter = Number(argv[++i]);
    else if (k === '--section') a.section = argv[++i];
    else if (k === '--out-dir') a.outDir = argv[++i];
    else if (k === '--force') a.force = true;
    else if (k === '--kutu') a.kutu = argv[++i];
    else if (k === '--ad') a.ad = argv[++i];
    else if (k === '--olcum') a.olcum = argv[++i];
    else if (k === '--url') a.url = argv[++i];
    else if (k === '--cdp') a.cdp = argv[++i];
    else if (k === '--headed') a.headed = true;
    else if (k === '--tur') a.tur = Number(argv[++i]);
    else if (k === '--xd-url') a.xdUrl = argv[++i];
    else if (k === '--testid') a.testid = argv[++i];
    else if (k === '--motor') {
      const v = argv[++i];
      if (v !== 'ts' && v !== 'python') throw new Error(`--motor ts|python olmalı: ${v}`);
      a.motor = v;
    }
    else if (k === '--widths') {
      a.widths = String(argv[++i] ?? '').split(',').map((v) => Number(v.trim())).filter((v) => v > 0);
      if (!a.widths.length) throw new Error('--widths: virgülle ayrılmış pozitif sayı bekleniyor');
    }
    else if (k === '--kalibre') a.kalibre = argv[++i];
    else if (k.startsWith('-')) throw new Error(`bilinmeyen seçenek: ${k}`);
    else a._.push(k);
  }
  return a;
}

const SIM: Record<string, string> = { ok: '✓', uyari: '⚠', hata: '✗' };
function printChecks(k: Kontrol[]): void {
  for (const c of k) console.log(`  ${SIM[c.seviye]} ${c.ad.padEnd(18)} ${c.detay}`);
}

function emit(args: Args, data: unknown, human: () => void): void {
  if (args.json) {
    const s = JSON.stringify(data, null, 2);
    if (args.output) { mkdirSync(dirname(args.output), { recursive: true }); writeFileSync(args.output, s + '\n'); console.log(`yazıldı: ${args.output}`); }
    else console.log(s);
  } else if (args.output) {
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, JSON.stringify(data, null, 2) + '\n');
    console.log(`yazıldı: ${args.output}`);
    human();
  } else human();
}

async function cmdDoctor(args: Args): Promise<number> {
  const [maj] = process.versions.node.split('.').map(Number);
  const k: Kontrol[] = [
    { ad: 'node', seviye: (maj ?? 0) >= 18 ? 'ok' : 'hata', detay: `v${process.versions.node} (>=18 gerekli)` },
    { ad: 'fetch', seviye: typeof fetch === 'function' ? 'ok' : 'hata', detay: typeof fetch === 'function' ? 'yerleşik' : 'yok' },
  ];
  // playwright-core is OPTIONAL: the measurement path works without it, verification does not.
  let pw = false;
  try { await import('playwright-core'); pw = true; } catch { /* yok */ }
  k.push({
    ad: 'playwright-core',
    seviye: pw ? 'ok' : 'uyari',
    detay: pw ? 'kurulu — render doğrulama kullanılabilir'
              : 'yok — ölçüm çalışır, `render verify` çalışmaz (npm i -D playwright-core)',
  });
  emit(args, { kontroller: k }, () => { console.log('# d2c doctor\n'); printChecks(k); });
  return enKotuSeviye(k) === 'hata' ? 1 : 0;
}

async function cmdInspect(args: Args): Promise<number> {
  const url = args._[2];
  if (!url) { console.error('HATA: XD linki gerekli\n\n' + HELP); return 2; }
  const r = await new AdobeXdShare(url).inspect();
  emit(args, r, () => {
    console.log(`# ${r.belgeAdi}\n  kaynak: ${r.kaynakTipi} · ${r.ekranlar.length} ekran · ${r.sureMs} ms\n`);
    console.log('## sözleşme');
    printChecks(r.kontroller);
    console.log('\n## ekranlar');
    for (const e of r.ekranlar) {
      console.log(`  ${e.ad.padEnd(52)} ${String(e.boyut[0]).padStart(5)}×${String(e.boyut[1]).padEnd(6)} ${e.esId ? '↔ eşi var' : ''}`);
    }
  });
  return enKotuSeviye(r.kontroller) === 'hata' ? 1 : 0;
}

async function cmdExtract(args: Args): Promise<number> {
  const url = args._[2];
  if (!url) { console.error('HATA: XD linki gerekli\n\n' + HELP); return 2; }
  if (!args.screen) { console.error('HATA: --screen gerekli\n\n' + HELP); return 2; }
  const t0 = Date.now();
  const d = await olc('cikarma', () =>
    new AdobeXdShare(url).extractScreen(args.screen!, { pairMobile: args.pair }));
  const ms = Date.now() - t0;
  emit(args, d, () => {
    console.log(`# ${d.ekran.ad}  (${ms} ms)`);
    console.log(`  desktop : ${d.ekran.desktop ? `${d.ekran.desktop.ad} ${d.ekran.desktop.boyut.join('×')}` : '—'}`);
    console.log(`  mobil   : ${d.ekran.mobil ? `${d.ekran.mobil.ad} ${d.ekran.mobil.boyut.join('×')}` : '—'}`);
    console.log(`  eleman  : ${d.elemanlar.length} · palet ${d.palet.length} · stil ${d.stiller.length}`);
    if (d.kaynak.uyarilar.length) { console.log('\n  UYARILAR'); for (const u of d.kaynak.uyarilar) console.log(`    ⚠ ${u}`); }
  });
  return 0;
}

async function cmdSections(args: Args): Promise<number> {
  if (!args.design) { console.error('HATA: --design gerekli\n\n' + HELP); return 2; }
  const raw = readFileSync(args.design, 'utf8');
  const design = DesignSchema.parse(JSON.parse(raw));
  const t0 = Date.now();
  const map = await olc('bolumleme', () => segment(design, {
    viewport: args.viewport, bosluk: args.bosluk, gutter: args.gutter,
  }));
  const ms = Date.now() - t0;
  emit(args, map, () => {
    console.log(`# ${map.ekran} — ${map.viewport} ${map.tasarim.join('×')}  (${ms} ms)`);
    console.log(`  ${map.bantlar.length} bant · ${map.bolumler.length} bölüm\n`);
    console.log('  #   y aralığı            yükseklik  zemin     bant / bölüm');
    for (const b of map.bolumler) {
      const ad = b.ad ? `"${b.ad}"${b.baslik?.punto ? ` (${b.baslik.punto}px)` : ''}` : (b.bant ?? '');
      console.log(
        `  ${String(b.index).padStart(2)}  ${String(b.y).padStart(7)} – ${String(+(b.y + b.h).toFixed(1)).padEnd(8)} ` +
        `${String(b.h).padStart(8)}  ${(b.zemin ?? '—').padEnd(8)}  ${ad}`
      );
    }
  });
  return 0;
}

async function cmdSpec(args: Args): Promise<number> {
  if (!args.design) { console.error('HATA: --design gerekli\n\n' + HELP); return 2; }
  if (!args.section && !args.kutu) {
    console.error('HATA: --section veya --kutu gerekli\n\n' + HELP); return 2;
  }
  const design = DesignSchema.parse(JSON.parse(readFileSync(args.design, 'utf8')));
  const harita = segment(design, { viewport: args.viewport, bosluk: args.bosluk, gutter: args.gutter });

  let kutu: [number, number, number, number] | undefined;
  let bolum: (typeof harita.bolumler)[number] | null = null;

  if (args.kutu) {
    const v = args.kutu.split(',').map(Number);
    if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) {
      console.error(`HATA: --kutu "x,y,w,h" biçiminde olmalı: ${args.kutu}`); return 2;
    }
    kutu = v as [number, number, number, number];
    bolum = {
      index: 0, y: kutu[1], h: kutu[3],
      zemin: null, bant: null, ad: args.ad ?? null, baslik: null,
    };
  } else {
    const key = args.section!;
    bolum =
      harita.bolumler.find((b) => String(b.index) === key) ??
      harita.bolumler.find((b) => slugify(b.ad ?? '') === slugify(key)) ??
      null;
  }
  if (!bolum) {
    console.error(`HATA: bölüm bulunamadı: "${args.section}"\nMevcut bölümler:`);
    for (const b of harita.bolumler) {
      console.error(`  ${String(b.index).padStart(2)}  Y ${b.y}–${+(b.y + b.h).toFixed(1)}  ${b.ad ?? '(isimsiz)'}`);
    }
    return 2;
  }

  // testid merge: read the target file if it exists
  const dir = args.outDir ?? '.';
  const olcumYol = join(dir, 'olcum.json');
  let onceki = null;
  if (!args.force && existsSync(olcumYol)) {
    try { onceki = OlcumSchema.parse(JSON.parse(readFileSync(olcumYol, 'utf8'))); }
    catch { console.error(`UYARI: mevcut ${olcumYol} okunamadı, testid'ler taşınmayacak`); }
  }

  const t0 = Date.now();
  const olcum = project(design, harita, bolum, { onceki, force: args.force, kutu });
  const ms = Date.now() - t0;

  if (args.outDir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(olcumYol, JSON.stringify(olcum, null, 2) + '\n');
    writeFileSync(join(dir, 'spec.md'), specMarkdown(olcum));
    console.log(`yazıldı: ${olcumYol}`);
    console.log(`yazıldı: ${join(dir, 'spec.md')}`);
  }
  if (args.json && !args.outDir) { console.log(JSON.stringify(olcum, null, 2)); return 0; }

  const kb = (Buffer.byteLength(JSON.stringify(olcum)) / 1024).toFixed(1);
  console.log(`# bölüm ${olcum.bolum.index} — ${olcum.bolum.ad ?? '(isimsiz)'}  (${ms} ms)`);
  console.log(`  eleman ${olcum.elemanlar.length} · palet ${olcum.palet.length} · stil ${olcum.stiller.length} · ${kb} KB`);
  const tekrar = olcum.elemanlar.filter((e) => e.tekrar);
  if (tekrar.length) {
    console.log(`  sıkıştırılmış tekrar: ${tekrar.length} grup`);
    for (const t of tekrar.slice(0, 6)) {
      const r = t.tekrar!;
      const nasil = !r.duzenli
        ? 'düzensiz · konumlar listelendi'
        : r.eksen === 'izgara'
          ? `ızgara ${r.sutun}×${r.satir} · adım ${r.adimX}/${r.adimY}`
          : `${r.eksen} adım ${r.adim}`;
      console.log(`      ${String(t.ad).slice(0, 34).padEnd(36)} ×${r.adet} · ${nasil}`);
    }
  }
  if (olcum.cozulemedi.length) {
    console.log('  notlar:');
    for (const c of olcum.cozulemedi) console.log(`      · ${c}`);
  }
  return 0;
}

const SIM_DURUM: Record<string, string> = { gecti: '✓', kabul: '≈', uyari: '⚠', sapan: '✗' };

async function cmdRenderVerify(args: Args): Promise<number> {
  if (!args.olcum || !args.url) {
    console.error('HATA: --olcum ve --url gerekli\n\n' + HELP); return 2;
  }
  const v = await dogrula({
    olcumYolu: args.olcum, url: args.url, viewport: args.viewport,
    cdp: args.cdp, headed: args.headed, tur: args.tur,
  });
  emit(args, v, () => {
    if (v.durduruldu) { console.error(`DURDURULDU: ${v.durduruldu}`); return; }
    for (const vp of v.viewportlar) {
      console.log(`## ${vp.genislik}px  (emüle ${vp.emuleEdilen} · clientWidth ${vp.clientWidthDogrulandi ? '✓' : '✗'})`);
      const eksik = vp.fontlar.filter((f) => !f.yuklu).map((f) => f.aile);
      if (eksik.length) console.log(`   ⚠ font eksik: ${eksik.join(', ')} — metin kaynaklı ölçüler güvenilmez`);
      if (vp.yatayTasma) console.log('   ✗ yatay taşma var');
      console.log('');
      // Collapse repeats of the SAME finding in the human output — JSON keeps all of them.
      //
      // If a card repeats 8 times, every element INSIDE the card repeats 8 times too;
      // writing the "repeat count 8 → 4" finding separately for each gives 5 lines that
      // all describe the same single fact. The counterpart of Phase 3's "one step, one
      // finding" principle.
      const tekrarBulgusu = new Map<string, string[]>();
      for (const el of vp.elemanlar) {
        for (const f of el.farklar) {
          if (f.alan !== 'tekrar adedi' || f.durum === 'gecti') continue;
          const k = `${f.hedef}→${f.olculen}`;
          if (!tekrarBulgusu.has(k)) tekrarBulgusu.set(k, []);
          tekrarBulgusu.get(k)!.push(el.testid);
        }
      }
      const toplananTekrar = new Set(
        [...tekrarBulgusu.values()].filter((v) => v.length > 1).flatMap((v) => v.slice(1))
      );

      for (const el of vp.elemanlar) {
        const gorunen = el.farklar.filter(
          (f) => f.durum !== 'gecti' && !(f.alan === 'tekrar adedi' && toplananTekrar.has(el.testid))
        );
        const sapan = el.farklar.filter((f) => f.durum === 'sapan');
        const isaret = !el.bulundu ? '✗' : sapan.length ? '✗' : '✓';
        if (!gorunen.length && !sapan.length) { console.log(`   ${isaret} ${el.testid}${el.ad ? ` (${el.ad})` : ''}`); continue; }
        console.log(`   ${isaret} ${el.testid}${el.ad ? ` (${el.ad})` : ''}`);
        for (const f of gorunen) {
          const ek =
            f.alan === 'tekrar adedi' && (tekrarBulgusu.get(`${f.hedef}→${f.olculen}`)?.length ?? 0) > 1
              ? `  (aynı bulgu ${tekrarBulgusu.get(`${f.hedef}→${f.olculen}`)!.length} elemanda: ${tekrarBulgusu.get(`${f.hedef}→${f.olculen}`)!.join(', ')})`
              : '';
          console.log(
            `       ${SIM_DURUM[f.durum]} ${f.alan}: hedef ${f.hedef} · render ${f.olculen}` +
            (f.fark != null ? ` · fark ${f.fark}` : '') + (f.sebep ? `  — ${f.sebep}` : '') + ek
          );
        }
      }
    }
    const o = v.ozet;
    console.log(`\n   ${o.toplam} kontrol · ✓ ${o.gecen} · ≈ ${o.kabul} kabul · ⚠ ${o.uyari} · ✗ ${o.sapan} sapan   (${v.sureMs} ms)`);
  });
  return v.durduruldu ? 1 : v.ozet.sapan > 0 ? 1 : 0;
}

async function cmdFontParity(args: Args): Promise<number> {
  if (!args.olcum || !args.url) {
    console.error('HATA: --olcum ve --url gerekli\n\n' + HELP); return 2;
  }
  const p = await fontParite({ olcumYolu: args.olcum, url: args.url, viewport: args.viewport, cdp: args.cdp });
  emit(args, p, () => {
    console.log('# POC-4 — AGC font kutusu ↔ Chrome fontBoundingBox\n');
    console.log(`   ${'aile (→ render edilen)'.padEnd(38)} ${'punto'.padStart(5)} ${'AGC'.padStart(7)} ${'Chrome'.padStart(8)} ${'fark'.padStart(7)}  parite`);
    for (const r of p.satirlar) {
      const ad = r.cozulmusAile && r.cozulmusAile !== r.aile ? `${r.aile} → ${r.cozulmusAile}` : r.aile;
      console.log(
        `   ${ad.padEnd(38)} ${String(r.punto).padStart(5)} ${String(r.agc ?? '—').padStart(7)} ` +
        `${r.chrome.toFixed(2).padStart(8)} ${(r.fark == null ? '—' : r.fark.toFixed(2)).padStart(7)}  ` +
        (r.parite == null ? '—  (belirlenemedi)' : r.parite ? '✓' : '✗')
      );
    }
    console.log('\n   aile başına karar (fontKutusuKaynak):');
    for (const [aile, k] of Object.entries(p.kararlar)) {
      const yuklu = p.fontYuklu[aile];
      console.log(`      ${aile.padEnd(20)} → ${k}${yuklu === false ? '   (⚠ font projede YÜKLÜ DEĞİL)' : ''}`);
    }
    console.log('\n   `tarayici` olan ailelerde d2c-code §3 tarayıcı ölçümü KORUNUR.');
  });
  return 0;
}

async function cmdVisualDiff(args: Args): Promise<number> {
  const eksik = (['olcum', 'xdUrl', 'screen', 'url', 'testid', 'outDir'] as const)
    .filter((k) => !args[k]);
  if (eksik.length) {
    console.error(`HATA: eksik: --${eksik.join(' --')}\n\n` + HELP); return 2;
  }
  // fileURLToPath: `.pathname` percent-encodes the path. If the directory the plugin is
  // installed in contains a space or a non-ASCII character, python3 could not find the file.
  const scriptYolu = fileURLToPath(new URL('../../skills/d2c-code/scripts/visual-diff.py', import.meta.url));
  const v = await gorselDiff({
    olcumYolu: args.olcum!, xdUrl: args.xdUrl!, screen: args.screen!,
    renderUrl: args.url!, testid: args.testid!, outDir: args.outDir!,
    scriptYolu, viewport: args.viewport, kalibre: args.kalibre, cdp: args.cdp, tur: args.tur,
    motor: args.motor === 'python' ? 'python' : 'ts',
  });
  emit(args, v, () => {
    console.log(`# görsel karşılaştırma  (${(v.sureMs / 1000).toFixed(1)} sn)`);
    console.log(`  referans: ${v.referans.kaynak} · ölçek ${v.referans.olcek}× · ${v.referans.png}`);
    console.log(`  ham fark %${v.hamYuzde} · yapısal %${v.yapisalYuzde}  (motor: ${v.motor})`);
    console.log('  (yüzde GEÇME NOTU DEĞİL — taban %5-10; karar bölge incelemesine dayanır)\n');
    if (!v.bolgeler.length) { console.log('  sapan bölge yok'); }
    for (const b of v.bolgeler.slice(0, 4)) {
      console.log(`  · satır ${b.satir} sütun ${b.sutun} — %${b.yuzde}`);
      if (b.kirpma) console.log(`      BAK: ${b.kirpma}   (sol XD · sağ render)`);
    }
    if (v.bolgeler.length > 4) {
      console.log(`  · +${v.bolgeler.length - 4} bölge daha — kırpma üretilmedi (bütçe 4)`);
    }
    for (const n of v.notlar) console.log(`\n  ⚠ ${n}`);
    console.log(`\n  ısı haritası: ${v.isiHaritasi}`);
  });
  return 0;
}

async function cmdRenderRobust(args: Args): Promise<number> {
  const eksik = (['olcum', 'url'] as const).filter((k) => !args[k]);
  if (eksik.length) { console.error(`HATA: eksik: --${eksik.join(' --')}\n\n` + HELP); return 2; }
  const olcum = OlcumSchema.parse(JSON.parse(readFileSync(args.olcum!, 'utf8')));
  const testidler = [...new Set(olcum.elemanlar.map((e) => e.testid).filter((t): t is string => !!t))];
  if (!testidler.length) {
    console.error('HATA: olcum.json\'da testid yok — kod fazı eşlemeyi doldurmalı (d2c-code §3).');
    return 2;
  }
  // The design's own width is the reference: there the job is pixel-perfect parity,
  // the other widths are where robustness is judged.
  const ref = olcum.bolum.desktop?.[2] ?? null;
  const r = await robustDogrula({
    url: args.url!, testidler, referansGenislik: ref,
    genislikler: args.widths, cdp: args.cdp, headed: args.headed,
  });
  emit(args, r, () => {
    console.log(`# layout sağlamlığı  (${(r.sureMs / 1000).toFixed(1)} sn)`);
    console.log(`  ${testidler.length} eleman · ${r.genislikler.length} genişlik` +
      (ref ? ` · referans ${ref}px` : ''));
    console.log(`  ✗ ${r.ozet.hata} hata · ⚠ ${r.ozet.uyari} uyarı · ℹ ${r.ozet.bilgi} bilgi\n`);
    for (const g of r.genislikler) {
      if (g.atlandi) { console.log(`  ${g.genislik}px — ÖLÇÜLMEDİ: ${g.atlandi.split('\n')[0]}`); continue; }
      const h = g.bulgular.filter((b) => b.seviye === 'hata');
      const isaret = g.genislik === ref ? ' (referans)' : '';
      console.log(`  ${String(g.genislik).padStart(5)}px${isaret}  ${h.length ? `✗ ${h.length}` : '✓ temiz'}`);
      for (const b of h) console.log(`         ${b.detay}`);
    }
    if (r.ozet.hata === 0) {
      console.log('\n  Layout daralan genişliklerde tasarım ilişkilerini koruyor.');
    } else {
      console.log('\n  Sabit piksel konumlandırma en sık sebep — bkz. tailwind.md "Layout intent".');
    }
  });
  // Errors must break the caller: a header that overlaps is not a passing result.
  return r.ozet.hata ? 1 : 0;
}

async function cmdSmoke(args: Args): Promise<number> {
  const url = args._[2];
  if (!url) { console.error('HATA: XD linki gerekli\n\n' + HELP); return 2; }
  const s = await olc('smoke', () => xdSmoke(url));
  emit(args, s, () => process.stdout.write(smokeYaz(s)));
  // When the contract breaks, CI MUST FAIL — that is the smoke test's only job.
  return s.seviye === 'ok' ? 0 : 1;
}

async function cmdInventory(args: Args): Promise<number> {
  const kok = args._[1] ?? 'components';
  const env = await olc('envanter-tarama', () => envanterCikar(kok));
  emit(args, env, () => process.stdout.write(envanterYaz(env)));
  // If a file could not be parsed the inventory is INCOMPLETE — the exit code says so.
  return env.hatalar.length ? 1 : 0;
}

async function cmdAssets(args: Args): Promise<number> {
  const url = args._[2];
  if (!url) { console.error('HATA: XD linki gerekli\n\n' + HELP); return 2; }
  if (!args.screen) { console.error('HATA: --screen gerekli\n\n' + HELP); return 2; }
  if (!args.outDir) { console.error('HATA: --out-dir gerekli\n\n' + HELP); return 2; }

  const t0 = Date.now();
  const proto = await fetchShare(url);
  const ab =
    proto.manifest.artboards.find((a) => a.id === args.screen) ??
    proto.manifest.artboards.find((a) => a.name === args.screen);
  if (!ab) {
    console.error(`HATA: ekran bulunamadı: "${args.screen}"`);
    for (const a of proto.manifest.artboards) console.error(`  · ${a.name}`);
    return 2;
  }
  const cid = (ab.components ?? []).find((c) => c.rel === 'primary')?.id;
  if (!cid) { console.error(`HATA: "${ab.name}" için primary bileşen yok`); return 1; }
  const agc = await fetchComponentJson<Record<string, unknown>>(proto, cid, CONTENT_TYPES.agc);
  const { elemanlar } = flatten(agc);

  const svgSonuc = svgleriYaz(elemanlar, join(args.outDir, 'icon'));
  const uidler = elemanlar
    .filter((e): e is Extract<typeof e, { tip: 'gorsel' }> => e.tip === 'gorsel')
    .map((e) => e.uid).filter((u): u is string => !!u);
  const gorselSonuc = await gorselleriIndir(proto, uidler, join(args.outDir, 'image'));

  const sonuc = {
    svgler: svgSonuc.svgler,
    gorseller: gorselSonuc.gorseller,
    atlananlar: [...svgSonuc.atlananlar, ...gorselSonuc.atlananlar],
    sureMs: Date.now() - t0,
  };
  emit(args, sonuc, () => {
    console.log(`# varlık export'u — ${ab.name}  (${sonuc.sureMs} ms)\n`);
    console.log(`  ${sonuc.svgler.length} SVG · ${sonuc.gorseller.length} görsel`);
    for (const s of sonuc.svgler.slice(0, 8)) {
      const k = s.kullanim > 1 ? ` ×${s.kullanim}` : '';
      console.log(`    ${s.ad.slice(0, 26).padEnd(28)} ${String(s.kutu[2]).padStart(9)}×${String(s.kutu[3]).padEnd(9)} ${s.yolAdedi} yol${k}`);
    }
    if (sonuc.svgler.length > 8) console.log(`    … +${sonuc.svgler.length - 8} SVG`);
    for (const g of sonuc.gorseller.slice(0, 6)) {
      console.log(`    ${g.uid.slice(0, 12)}  ${(g.boyutBayt / 1024).toFixed(0)} KB  ${g.tip}  ${g.dosya}`);
    }
    if (sonuc.gorseller.length > 6) console.log(`    … +${sonuc.gorseller.length - 6} görsel`);
    if (sonuc.atlananlar.length) {
      console.log(`\n  ATLANANLAR (${sonuc.atlananlar.length}) — sessizce geçilmedi:`);
      const grup = new Map<string, number>();
      for (const a of sonuc.atlananlar) grup.set(a.sebep, (grup.get(a.sebep) ?? 0) + 1);
      for (const [sebep, n] of grup) console.log(`    ${String(n).padStart(3)}× ${sebep}`);
    }
  });
  return 0;
}

async function main(): Promise<void> {
  let args: Args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(`HATA: ${(e as Error).message}\n\n${HELP}`); process.exit(2); }

  if (args.help || args._.length === 0) { console.log(HELP); process.exit(args.help ? 0 : 2); }

  const [a, b] = args._;
  izlemeBaslat();
  try {
    let code = 2;
    if (a === 'doctor') code = await cmdDoctor(args);
    else if (a === 'xd' && b === 'inspect') code = await cmdInspect(args);
    else if (a === 'xd' && b === 'extract') code = await cmdExtract(args);
    else if (a === 'xd' && b === 'assets') code = await cmdAssets(args);
    else if (a === 'xd' && b === 'smoke') code = await cmdSmoke(args);
    else if (a === 'inventory') code = await cmdInventory(args);
    else if (a === 'sections') code = await cmdSections(args);
    else if (a === 'spec') code = await cmdSpec(args);
    else if (a === 'render' && b === 'verify') code = await cmdRenderVerify(args);
    else if (a === 'render' && b === 'robust') code = await cmdRenderRobust(args);
    else if (a === 'font' && b === 'parity') code = await cmdFontParity(args);
    else if (a === 'visual' && b === 'diff') code = await cmdVisualDiff(args);
    else { console.error(`HATA: bilinmeyen komut: ${args._.join(' ')}\n\n${HELP}`); code = 2; }
    izlemeYaz(args);
    process.exit(code);
  } catch (e) {
    // Durations are written on the error path too: they show WHERE it got stuck.
    izlemeYaz(args);
    // The error path is redacted as well — no token leaks to stderr (Rule 2).
    console.error(`HATA: ${redactText((e as Error).message)}`);
    process.exit(1);
  }
}

/**
 * Trace output. `--verbose` goes to stderr (so stdout stays machine readable),
 * `--trace` goes to a file — `runs.jsonl` consumes it directly.
 */
function izlemeYaz(args: Args): void {
  if (args.verbose) {
    const r = rapor();
    if (r) console.error(r);
  }
  if (args.trace) {
    // The trace carries durations only; no token or URL enters it (Rule 2).
    writeFileSync(args.trace, JSON.stringify(izlemeJson(), null, 2) + '\n');
  }
}

void main();
