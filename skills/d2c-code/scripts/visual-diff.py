#!/usr/bin/env python3
"""XD referans görüntüsü ile render'ı piksel düzeyinde karşılaştırır.

Sayısal ölçüm (design-diff) kutuları doğrular; bu araç KUTULARIN İÇİNİ doğrular:
yanlış ikon, placeholder görsel, eksik gölge, yanlış hizalanmış glif.

Kullanım:
  visual-diff.py XD.png RENDER.png --out fark.png [--anchor "#FAFAFA"] [--tol 28]

--anchor  Her iki görüntüyü de bu rengin sınır kutusuna kırpar (bölüm zemini gibi
          ortak bir çapa). XD'nin kanvas zemini de #FAFAFA olduğu için bölüm zemini
          çapa olarak İŞE YARAMAYABİLİR — o durumda --kalibre kullan.
--kalibre "HEX:x,y,w,h"  XD görüntüsünde bu rengin sınır kutusunu bulur, verilen
          TASARIM kutusuyla eşleyip ölçek+offset türetir. Sonra --tasarim-kutu ile
          istenen tasarım bölgesini kırpar. Çapası benzersiz renkli bir eleman seç
          (ör. lacivert bar "#0C2380:64,3133,1312,72").
--tasarim-kutu "x,y,w,h"  --kalibre ile birlikte: XD'den kırpılacak tasarım kutusu.
--render-kutu "x,y,w,h"   Render görüntüsünden kırpılacak piksel kutusu
          (elemanın getBoundingClientRect() değeri).
--tol     Bir pikselin "farklı" sayılması için kanal farkı eşiği (0-255, vars. 28).

Çıktı: özet metrikler + 8×8 ızgarada en kötü hücreler + yan yana/ısı haritası PNG.
"""
import argparse
import math, sys
from PIL import Image, ImageChops

def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def bbox_of_color(im, rgb, tol=40):
    px = im.load(); W, H = im.size
    xs, ys = [], []
    step = max(1, min(W, H) // 400)
    for y in range(0, H, step):
        for x in range(0, W, step):
            p = px[x, y]
            if abs(p[0]-rgb[0]) + abs(p[1]-rgb[1]) + abs(p[2]-rgb[2]) < tol:
                xs.append(x); ys.append(y)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)

def bbox_of_solid_block(im, rgb, tol=60, hedef_oran=None, aday_sayisi=14):
    """Rengin DOLU dikdörtgen bloğunu bulur.

    Global sınır kutusu işe yaramaz: aynı renk metinde de kullanılıyorsa kutu
    tüm sayfaya yayılır. Bu fonksiyon satır satır en uzun kesintisiz koşuları
    toplar, her adayı dikeyde büyütür ve aralarından seçim yapar.

    `hedef_oran` (tasarım kutusunun en/boy oranı) verilirse aday **orana en yakın**
    olana göre seçilir; verilmezse en büyük alanlı aday seçilir.

    Neden: "en uzun koşu" tek başına GÜVENİLİR DEĞİL. Ekranda çapaya yakın başka bir
    renk varsa (gerçek örnek: kampanya banner'ı #06205E, #0C2380'e tol=60'ta eşleşiyor)
    ve o blok daha uzunsa çapa oraya kayar; script hata vermez, sessizce yanlış
    hizalanmış bir diff üretir. Oran eşleşmesi bunu eliyor: sahte adaylar 1-2 satır
    yüksekliğinde olduğu için oranları hedeften kat kat uzak düşer.
    """
    px = im.load(); W, H = im.size
    def esle(p): return abs(p[0]-rgb[0]) + abs(p[1]-rgb[1]) + abs(p[2]-rgb[2]) < tol

    ham = []
    for y in range(0, H, 2):
        run = best = 0; bx0 = x0 = None
        for x in range(W):
            if esle(px[x, y]):
                if run == 0: x0 = x
                run += 1
                if run > best: best, bx0 = run, x0
            else:
                run = 0
        if best > 0: ham.append((best, bx0, y))
    if not ham: return None
    ham.sort(reverse=True)

    def buyut(x0, y0, x1):
        def dolu(y):
            # Blok içinde metin/buton olabilir; %90 doluluk aramak bloğu 1-2 satıra indirir.
            # %35 eşiği hem içi dolu barları hem içeriği olan panelleri yakalıyor.
            if not (0 <= y < H): return False
            n = sum(1 for x in range(x0, x1) if esle(px[x, y]))
            return n > 0.35 * (x1 - x0)
        ust = y0
        while dolu(ust - 1): ust -= 1
        alt = y0
        while dolu(alt + 1): alt += 1
        return (x0, ust, x1, alt + 1)

    adaylar = []
    for best, bx0, y in ham:
        if len(adaylar) >= aday_sayisi: break
        # Aynı bloğun başka bir satırı mı? (x aralığı örtüşüyor ve y kutunun içinde)
        if any(b[0] <= bx0 < b[2] and b[1] <= y < b[3] for b in adaylar): continue
        adaylar.append(buyut(bx0, y, bx0 + best))
    if not adaylar: return None

    if hedef_oran and hedef_oran > 0:
        # Oran tek başına yeterli değil: 7×1'lik bir leke de "doğru orana" sahip olabilir.
        # Önce anlamsız küçüklükteki adayları ele (en geniş adayın %20'sinden dar olanlar).
        en_genis = max(b[2] - b[0] for b in adaylar)
        buyukler = [b for b in adaylar if (b[2] - b[0]) >= 0.2 * en_genis]
        if buyukler: adaylar = buyukler

        def puan(b):
            w, h = b[2] - b[0], b[3] - b[1]
            if h <= 0: return float("inf")
            return abs(math.log((w / h) / hedef_oran))
        adaylar.sort(key=puan)
        if len(adaylar) > 1 and puan(adaylar[1]) < 0.35:
            # İki aday da orana yakın — sessiz kalma, kullanıcıya söyle.
            print(f"UYARI: çapa için {len(adaylar)} aday var ve en az ikisi hedef orana yakın. "
                  f"Seçilen {adaylar[0]}, ikinci {adaylar[1]}. Çapa benzersiz bir renk mi?")
    else:
        adaylar.sort(key=lambda b: -((b[2]-b[0]) * (b[3]-b[1])))
    return adaylar[0]

def trim_uniform(im):
    bg = im.getpixel((0, 0))
    bgim = Image.new(im.mode, im.size, bg)
    diff = ImageChops.difference(im, bgim).convert("L")
    bb = diff.getbbox()
    return im.crop(bb) if bb else im

ap = argparse.ArgumentParser()
ap.add_argument("xd"); ap.add_argument("render")
ap.add_argument("--out", default="fark.png")
ap.add_argument("--anchor", default=None)
ap.add_argument("--kalibre", default=None)
ap.add_argument("--tasarim-kutu", dest="tasarim_kutu", default=None)
ap.add_argument("--render-kutu", dest="render_kutu", default=None)
ap.add_argument("--tol", type=int, default=28)
ap.add_argument("--kalibre-tol", dest="kalibre_tol", type=int, default=60,
                help="Kalibrasyon ÇAPASI için renk eşiği (vars. 60). Ekranda çapaya yakın "
                     "başka bir renk varsa düşürün (ör. 12). --tol ile karıştırmayın: o "
                     "fark eşiğidir.")
ap.add_argument("--grid", type=int, default=8)
ap.add_argument("--esik-yapisal", dest="esik_yapisal", type=float, default=8.0,
                help="Çıkış kodunu 1 yapan yapısal fark yüzdesi (vars. 8).")
ap.add_argument("--olcekle", action="store_true",
                help="Render'ı XD boyutuna ÖLÇEKLE. Varsayılan: ölçekleme yok, ikisi de ortak "
                     "en küçük boyuta kırpılır (sol-üst hizalı). Ölçeklemek birikimli kaymayı "
                     "gizler ama tüm metni bulanıklaştırır.")
ap.add_argument("--yapisal", type=int, default=4,
                help="Yapısal karşılaştırma için küçültme katsayısı (vars. 4). Metin kenar "
                     "yumuşatma gürültüsünü siler, yapısal farkı bırakır.")
a = ap.parse_args()

A = Image.open(a.xd).convert("RGB")
B = Image.open(a.render).convert("RGB")

def dort(s):
    v = [float(x) for x in s.split(",")]
    if len(v) != 4: raise SystemExit(f"HATA: 4 sayı bekleniyor: {s}")
    return v

if a.kalibre:
    hexk, kutu = a.kalibre.split(":")
    kx, ky, kw, kh = dort(kutu)
    bb = bbox_of_solid_block(A, hex2rgb(hexk), tol=a.kalibre_tol,
                             hedef_oran=(kw / kh if kh else None))
    if bb is None:
        raise SystemExit(f"HATA: kalibrasyon rengi {hexk} XD görüntüsünde bulunamadı")
    olcek_x = (bb[2] - bb[0]) / kw
    olcek_y = (bb[3] - bb[1]) / kh
    # Zoom tek düze olduğu için x ve y ölçeği aynıdır. Küçük kenardan türetilen ölçek
    # 1px kenar yumuşatma hatasını büyütür (72px'lik bir kenarda 1px = %1.4, bu da
    # 730px'lik kırpmada 10px kayma demek). Bu yüzden BÜYÜK kenardan türetilen
    # ölçeği iki eksende de kullan.
    olcek = olcek_x if kw >= kh else olcek_y
    print(f"kalibrasyon {hexk}: piksel kutusu {bb} · ölçek x {olcek_x:.4f} / y {olcek_y:.4f}"
          f" → {'genişlikten' if kw >= kh else 'yükseklikten'} {olcek:.4f} kullanılıyor")
    if abs(olcek_x - olcek_y) > 0.05:
        print("   ⚠ x/y ölçekleri çok ayrık — kalibrasyon elemanı yanlış seçilmiş olabilir")
    olcek_x = olcek_y = olcek
    ox = bb[0] - kx * olcek_x
    oy = bb[1] - ky * olcek_y
    if not a.tasarim_kutu:
        raise SystemExit("HATA: --kalibre ile birlikte --tasarim-kutu gerekli")
    tx, ty, tw, th = dort(a.tasarim_kutu)
    A = A.crop((round(ox + tx * olcek_x), round(oy + ty * olcek_y),
                round(ox + (tx + tw) * olcek_x), round(oy + (ty + th) * olcek_y)))

if a.render_kutu:
    rx, ry, rw, rh = dort(a.render_kutu)
    B = B.crop((round(rx), round(ry), round(rx + rw), round(ry + rh)))

if a.anchor:
    rgb = hex2rgb(a.anchor)
    for name in ("XD", "render"):
        im = A if name == "XD" else B
        bb = bbox_of_color(im, rgb)
        if bb is None:
            print(f"HATA: çapa rengi {a.anchor} {name} görüntüsünde bulunamadı"); sys.exit(2)
        if name == "XD": A = A.crop(bb)
        else: B = B.crop(bb)
elif not a.kalibre and not a.render_kutu:
    A, B = trim_uniform(A), trim_uniform(B)

print(f"XD     : {A.size[0]}×{A.size[1]}")
print(f"render : {B.size[0]}×{B.size[1]}")
oran = (B.size[0] / A.size[0], B.size[1] / A.size[1])
print(f"ölçek farkı: {oran[0]:.4f} × {oran[1]:.4f}"
      + ("   ⚠ en/boy oranı uyuşmuyor" if abs(oran[0] - oran[1]) > 0.02 else ""))

if a.olcekle:
    B = B.resize(A.size, Image.LANCZOS)
    print("→ render XD boyutuna ölçeklendi")
else:
    W0, H0 = min(A.size[0], B.size[0]), min(A.size[1], B.size[1])
    if A.size != (W0, H0) or B.size != (W0, H0):
        print(f"→ ölçekleme yok; ikisi de {W0}×{H0} boyutuna kırpıldı (sol-üst hizalı). "
              f"Birikimli kayma varsa altta fark olarak görünür.")
    A = A.crop((0, 0, W0, H0)); B = B.crop((0, 0, W0, H0))
diff = ImageChops.difference(A, B)
W, H = A.size
dpx = diff.load()
total = W * H
farkli = 0
grid = [[0] * a.grid for _ in range(a.grid)]
gw, gh = max(1, W // a.grid), max(1, H // a.grid)
toplam_fark = 0
for y in range(H):
    for x in range(W):
        d = dpx[x, y]
        m = max(d)
        toplam_fark += m
        if m > a.tol:
            farkli += 1
            gy, gx = min(a.grid - 1, y // gh), min(a.grid - 1, x // gw)
            grid[gy][gx] += 1

oran_farkli = 100.0 * farkli / total
print()
print(f"ortalama fark : {toplam_fark / total:.2f} / 255")
print(f"ham farklı piksel : {farkli} / {total}  =  {oran_farkli:.2f}%   (eşik {a.tol})")

# YAPISAL: kucultup karsilastir. Metin kenar yumusatmasi ve yarim piksel kaymalar
# ortalamada erir; eksik gorsel, yanlis ikon, fazladan ellipsis gibi yapisal farklar kalir.
k = max(1, a.yapisal)
sA = A.resize((max(1, W // k), max(1, H // k)), Image.LANCZOS)
sB = B.resize(sA.size, Image.LANCZOS)
sd = ImageChops.difference(sA, sB).load()
sw, sh = sA.size
syapisal = sum(1 for yy in range(sh) for xx in range(sw) if max(sd[xx, yy]) > a.tol)
oran_yapisal = 100.0 * syapisal / (sw * sh)
print(f"YAPISAL farklı    : {syapisal} / {sw*sh}  =  {oran_yapisal:.2f}%   "
      f"({k}× küçültülmüş {sw}×{sh})")
print("""
  NOT: Bu yüzde bir geçme notu DEĞİL. XD metni kendi rasterizerıyla canvas'a çiziyor,
  tarayıcı DOM metnini kendi hinting'iyle çiziyor — aynı font ve aynı ölçüyle bile
  metin ağırlıklı bir bölümde taban %5-10 civarındadır. Sayıyı MUTLAK değil GÖRECELİ
  kullan: bir düzeltmeden sonra düşüyorsa iyi. Asıl çıktı aşağıdaki sapan bölgeler ve
  görsel dosyadır — onlara BAKILMADAN karar verilmez.""")

hucre = gw * gh
kotu = sorted(((grid[r][c] / hucre * 100, r, c) for r in range(a.grid) for c in range(a.grid)),
              reverse=True)
print(f"\nen çok sapan bölgeler ({a.grid}×{a.grid} ızgara, satır/sütun 0-tabanlı):")
for pct, r, c in kotu[:6]:
    if pct < 0.5: break
    print(f"   satır {r} sütun {c}: %{pct:.1f}  (piksel kutusu x {c*gw}-{(c+1)*gw}, y {r*gh}-{(r+1)*gh})")

# gorsel cikti: XD | render | isi haritasi
heat = diff.convert("L").point(lambda v: 255 if v > a.tol else v * 2)
out = Image.new("RGB", (W * 3 + 24, H), (255, 255, 255))
out.paste(A, (0, 0)); out.paste(B, (W + 12, 0)); out.paste(heat.convert("RGB"), (W * 2 + 24, 0))
out.save(a.out)
print(f"\ngörsel çıktı: {a.out}  (sol: XD · orta: render · sağ: fark ısı haritası)")

# cikis kodu: %2'den fazla fark -> 1
sys.exit(1 if oran_yapisal > a.esik_yapisal else 0)
