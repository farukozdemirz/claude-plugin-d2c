/**
 * `visual-diff.py`'ın TypeScript karşılığı.
 *
 * Python dosyası SİLİNMİYOR: `--kalibre` çapa mantığı (renk bloğu arama + oran
 * eşleştirme) bilerek taşınmadı — thumbnail referansında ölçek tam bilindiği için
 * çapa türetmeye gerek kalmadı. Çapa gerektiren bir durum çıkarsa Python yolu
 * `--motor python` ile hâlâ orada.
 *
 * Taşınan her adım Python'daki sırayı ve **yuvarlama davranışını** izliyor;
 * `test/parity.test.mjs` ikisini aynı girdilerde çalıştırıp karşılaştırıyor.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bosImg, doldur, kirp, luma, nearest, olcekle as resize, pngOku, pngYaz, yapistir,
  type Img,
} from './pixel.js';

export interface MotorSecenek {
  xdPng: string;
  renderPng: string;
  out: string;
  xdKutu?: [number, number, number, number];
  renderKutu?: [number, number, number, number];
  anchor?: string;
  tol?: number;
  grid?: number;
  esikYapisal?: number;
  yapisal?: number;
  olcekle?: boolean;
  kirpmaDizin?: string;
  kirpmaAdet?: number;
}

export interface MotorSonuc {
  ham: number;
  yapisal: number;
  esik: number;
  esikYapisal: number;
  boyut: [number, number];
  izgara: number;
  bolgeler: Array<{
    satir: number; sutun: number; yuzde: number;
    kutu: [number, number, number, number]; kirpma: string | null;
  }>;
  isiHaritasi: string;
  stdout: string;
}

/**
 * Python'un `round()`'u — bankacı yuvarlaması (yarımlar ÇİFTE gider).
 * `Math.round` yarımları yukarı atar; kırpma sınırlarında 1px kayma yaratırdı.
 */
export function pyRound(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const yuvarla = (v: number, n: number): number => {
  const p = 10 ** n;
  return Math.round(v * p) / p;
};

function hex2rgb(h: string): [number, number, number] {
  const s = h.replace(/^#/, '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/** Python `bbox_of_color`. */
function renkKutusu(im: Img, rgb: [number, number, number], tol = 40) {
  const adim = Math.max(1, Math.floor(Math.min(im.w, im.h) / 400));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let bulundu = false;
  for (let y = 0; y < im.h; y += adim) {
    for (let x = 0; x < im.w; x += adim) {
      const p = (y * im.w + x) * 3;
      const d =
        Math.abs(im.data[p]! - rgb[0]) +
        Math.abs(im.data[p + 1]! - rgb[1]) +
        Math.abs(im.data[p + 2]! - rgb[2]);
      if (d < tol) {
        bulundu = true;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return bulundu ? ([x0, y0, x1 + 1, y1 + 1] as const) : null;
}

/**
 * Python `trim_uniform` — köşe pikselinden farklı olan bölgeye kırpar.
 * Luma üzerinden çalışıyor; çok küçük mavi farkları PIL'de de eriyor, burada da.
 */
function tekDuzeKirp(im: Img): Img {
  const br = im.data[0]!, bg = im.data[1]!, bb = im.data[2]!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let bulundu = false;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const p = (y * im.w + x) * 3;
      const l = luma(
        Math.abs(im.data[p]! - br),
        Math.abs(im.data[p + 1]! - bg),
        Math.abs(im.data[p + 2]! - bb)
      );
      if (l !== 0) {
        bulundu = true;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return bulundu ? kirp(im, x0, y0, x1 + 1, y1 + 1) : im;
}

export function motorCalistir(sec: MotorSecenek): MotorSonuc {
  const tol = sec.tol ?? 28;
  const izgara = sec.grid ?? 8;
  const esikYapisal = sec.esikYapisal ?? 8.0;
  const yapisalK = Math.max(1, sec.yapisal ?? 4);
  const satirlar: string[] = [];
  const yaz = (s: string) => satirlar.push(s);

  let A = pngOku(sec.xdPng);
  let B = pngOku(sec.renderPng);

  if (sec.xdKutu) {
    const [ax, ay, aw, ah] = sec.xdKutu;
    A = kirp(A, pyRound(ax), pyRound(ay), pyRound(ax + aw), pyRound(ay + ah));
    yaz(`XD kırpması (bilinen ölçek): ${ax},${ay},${aw},${ah}`);
  }
  if (sec.renderKutu) {
    const [rx, ry, rw, rh] = sec.renderKutu;
    B = kirp(B, pyRound(rx), pyRound(ry), pyRound(rx + rw), pyRound(ry + rh));
  }
  if (sec.anchor) {
    const rgb = hex2rgb(sec.anchor);
    for (const ad of ['XD', 'render'] as const) {
      const im = ad === 'XD' ? A : B;
      const bb = renkKutusu(im, rgb);
      if (!bb) throw new Error(`çapa rengi ${sec.anchor} ${ad} görüntüsünde bulunamadı`);
      if (ad === 'XD') A = kirp(A, bb[0], bb[1], bb[2], bb[3]);
      else B = kirp(B, bb[0], bb[1], bb[2], bb[3]);
    }
  } else if (!sec.renderKutu && !sec.xdKutu) {
    A = tekDuzeKirp(A);
    B = tekDuzeKirp(B);
  }

  yaz(`XD     : ${A.w}×${A.h}`);
  yaz(`render : ${B.w}×${B.h}`);
  const oranX = B.w / A.w, oranY = B.h / A.h;
  yaz(
    `ölçek farkı: ${oranX.toFixed(4)} × ${oranY.toFixed(4)}` +
      (Math.abs(oranX - oranY) > 0.02 ? '   ⚠ en/boy oranı uyuşmuyor' : '')
  );

  if (sec.olcekle) {
    B = resize(B, A.w, A.h);
    yaz('→ render XD boyutuna ölçeklendi');
  } else {
    const W0 = Math.min(A.w, B.w), H0 = Math.min(A.h, B.h);
    if (A.w !== W0 || A.h !== H0 || B.w !== W0 || B.h !== H0) {
      yaz(
        `→ ölçekleme yok; ikisi de ${W0}×${H0} boyutuna kırpıldı (sol-üst hizalı). ` +
          `Birikimli kayma varsa altta fark olarak görünür.`
      );
    }
    A = kirp(A, 0, 0, W0, H0);
    B = kirp(B, 0, 0, W0, H0);
  }

  const W = A.w, H = A.h;
  const toplam = W * H;
  const gw = Math.max(1, Math.floor(W / izgara));
  const gh = Math.max(1, Math.floor(H / izgara));
  const hucreler = new Int32Array(izgara * izgara);
  let farkli = 0;
  let toplamFark = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      const d0 = Math.abs(A.data[p]! - B.data[p]!);
      const d1 = Math.abs(A.data[p + 1]! - B.data[p + 1]!);
      const d2 = Math.abs(A.data[p + 2]! - B.data[p + 2]!);
      const m = d0 > d1 ? (d0 > d2 ? d0 : d2) : d1 > d2 ? d1 : d2;
      toplamFark += m;
      if (m > tol) {
        farkli++;
        const gy = Math.min(izgara - 1, Math.floor(y / gh));
        const gx = Math.min(izgara - 1, Math.floor(x / gw));
        hucreler[gy * izgara + gx]!++;
      }
    }
  }

  const oranFarkli = (100 * farkli) / toplam;
  yaz('');
  yaz(`ortalama fark : ${(toplamFark / toplam).toFixed(2)} / 255`);
  yaz(`ham farklı piksel : ${farkli} / ${toplam}  =  ${oranFarkli.toFixed(2)}%   (eşik ${tol})`);

  // YAPISAL: küçültüp karşılaştır. Metin kenar yumuşatması ve yarım piksel kaymalar
  // ortalamada erir; eksik görsel, yanlış ikon, fazladan ellipsis gibi farklar kalır.
  const sw = Math.max(1, Math.floor(W / yapisalK));
  const sh = Math.max(1, Math.floor(H / yapisalK));
  const sA = resize(A, sw, sh);
  const sB = resize(B, sw, sh);
  let sYapisal = 0;
  for (let i = 0; i < sw * sh; i++) {
    const p = i * 3;
    const d0 = Math.abs(sA.data[p]! - sB.data[p]!);
    const d1 = Math.abs(sA.data[p + 1]! - sB.data[p + 1]!);
    const d2 = Math.abs(sA.data[p + 2]! - sB.data[p + 2]!);
    const m = d0 > d1 ? (d0 > d2 ? d0 : d2) : d1 > d2 ? d1 : d2;
    if (m > tol) sYapisal++;
  }
  const oranYapisal = (100 * sYapisal) / (sw * sh);
  yaz(
    `YAPISAL farklı    : ${sYapisal} / ${sw * sh}  =  ${oranYapisal.toFixed(2)}%   ` +
      `(${yapisalK}× küçültülmüş ${sw}×${sh})`
  );
  yaz(`
  NOT: Bu yüzde bir geçme notu DEĞİL. XD metni kendi rasterizerıyla canvas'a çiziyor,
  tarayıcı DOM metnini kendi hinting'iyle çiziyor — aynı font ve aynı ölçüyle bile
  metin ağırlıklı bir bölümde taban %5-10 civarındadır. Sayıyı MUTLAK değil GÖRECELİ
  kullan: bir düzeltmeden sonra düşüyorsa iyi. Asıl çıktı aşağıdaki sapan bölgeler ve
  görsel dosyadır — onlara BAKILMADAN karar verilmez.`);

  // Python `sorted(..., reverse=True)` demetleri sözlüksel sıralar: eşit yüzdede
  // önce büyük satır, sonra büyük sütun gelir. Bölge sırası aynı kalsın diye aynen.
  const hucre = gw * gh;
  const kotu: Array<[number, number, number]> = [];
  for (let r = 0; r < izgara; r++) {
    for (let c = 0; c < izgara; c++) {
      kotu.push([(hucreler[r * izgara + c]! / hucre) * 100, r, c]);
    }
  }
  kotu.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);

  yaz('');
  yaz(`en çok sapan bölgeler (${izgara}×${izgara} ızgara, satır/sütun 0-tabanlı):`);
  for (const [pct, r, c] of kotu.slice(0, 6)) {
    if (pct < 0.5) break;
    yaz(
      `   satır ${r} sütun ${c}: %${pct.toFixed(1)}  ` +
        `(piksel kutusu x ${c * gw}-${(c + 1) * gw}, y ${r * gh}-${(r + 1) * gh})`
    );
  }

  const bolgeler: MotorSonuc['bolgeler'] = [];
  for (const [pct, r, c] of kotu) {
    if (pct < 0.5) break;
    bolgeler.push({
      satir: r, sutun: c, yuzde: yuvarla(pct, 2),
      kutu: [c * gw, r * gh, Math.min(gw, W - c * gw), Math.min(gh, H - r * gh)],
      kirpma: null,
    });
  }

  if (sec.kirpmaDizin) {
    mkdirSync(sec.kirpmaDizin, { recursive: true });
    const adet = sec.kirpmaAdet ?? 4;
    bolgeler.slice(0, adet).forEach((b, i) => {
      const [x, y, bw, bh] = b.kutu.map((v) => Math.trunc(v)) as [number, number, number, number];
      const pad = 6;
      const x0 = Math.max(0, x - pad), y0 = Math.max(0, y - pad);
      const x1 = Math.min(W, x + bw + pad), y1 = Math.min(H, y + bh + pad);
      const ca = kirp(A, x0, y0, x1, y1);
      const cb = kirp(B, x0, y0, x1, y1);
      const panel = bosImg(ca.w * 2 + 8, ca.h);
      doldur(panel, 255, 255, 255);
      yapistir(panel, ca, 0, 0);
      yapistir(panel, cb, ca.w + 8, 0);
      const k = Math.max(2, Math.min(6, Math.floor(240 / Math.max(1, ca.h))));
      const yol = join(sec.kirpmaDizin!, `bolge-${i + 1}-s${b.satir}c${b.sutun}.png`);
      pngYaz(yol, nearest(panel, panel.w * k, panel.h * k));
      b.kirpma = yol;
    });
    yaz('');
    yaz(
      `hazir kirpmalar: ${sec.kirpmaDizin}  (sol: XD · sag: render, ` +
        `${Math.min(bolgeler.length, adet)} bolge)`
    );
  }

  // görsel çıktı: XD | render | ısı haritası
  // PIL: `diff.convert("L").point(...)` — luma, MAX KANAL DEĞİL. İkisi farklı
  // gri tonlar üretir; ısı haritası da parite kapsamında olduğu için luma.
  const heat = bosImg(W, H);
  for (let i = 0; i < toplam; i++) {
    const p = i * 3;
    const v = luma(
      Math.abs(A.data[p]! - B.data[p]!),
      Math.abs(A.data[p + 1]! - B.data[p + 1]!),
      Math.abs(A.data[p + 2]! - B.data[p + 2]!)
    );
    const g = v > tol ? 255 : Math.min(255, v * 2);
    heat.data[p] = g;
    heat.data[p + 1] = g;
    heat.data[p + 2] = g;
  }
  const out = bosImg(W * 3 + 24, H);
  doldur(out, 255, 255, 255);
  yapistir(out, A, 0, 0);
  yapistir(out, B, W + 12, 0);
  yapistir(out, heat, W * 2 + 24, 0);
  pngYaz(sec.out, out);
  yaz('');
  yaz(`görsel çıktı: ${sec.out}  (sol: XD · orta: render · sağ: fark ısı haritası)`);

  return {
    ham: yuvarla(oranFarkli, 4),
    yapisal: yuvarla(oranYapisal, 4),
    esik: tol,
    esikYapisal,
    boyut: [W, H],
    izgara,
    bolgeler,
    isiHaritasi: sec.out,
    stdout: satirlar.join('\n') + '\n',
  };
}
