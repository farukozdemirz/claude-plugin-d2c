#!/usr/bin/env python3
"""Artboard ekran görüntüsünden bölüm sınırlarını çıkarır.

Neden probe ile değil: bölüm başlıklarını tıklayarak avlamak hem yavaş (yüzlerce
tıklama) hem güvenilmez — 56px'lik bir başlık 110px'lik adımın arasına düşüp
kaçabiliyor. Boş satır analizi tek ekran görüntüsüyle, deterministik çalışıyor.

Yöntem: içerik sütununda tamamen zemin renginde olan satır koşuları bölüm ayracıdır.
Eşikten uzun her koşu bir sınır sayılır; aradaki bloklar bölümdür.

Kullanım:
  section-map.py EKRAN.png --kutu x,y,w,h --tasarim W,H [--bosluk 40] [--gutter 64]

--kutu      Artboard'ın ekran görüntüsündeki piksel kutusu (kalibrasyondan).
--tasarim   Artboard'ın tasarım boyutu (ör. 1440,3778).
--bosluk    Ayraç sayılacak en küçük boş koşu (TASARIM px, vars. 40).
--gutter    İçerik sütunu kenar boşluğu (tasarım px, vars. 64) — kenardaki dekoratif
            şeritler bölüm sanılmasın diye analiz bu sütunda yapılır.
--bantlar   Tam genişlik zemin dikdörtgenlerinin JSON listesi: [{"y":..,"h":..,"ad":..}].
            XD probe taramasından gelir ve OTORİTERDİR: bir bandın içindeki boşluk
            sınırları yok sayılır (bant tek bölümdür), bant kenarları her zaman sınırdır.
            Boşluk analizi yalnız bantsız bölgeleri böler.

Çıktı: JSON — her bölüm için tasarım Y aralığı ve baskın zemin rengi.
"""
import argparse, json, sys
from collections import Counter
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("png")
ap.add_argument("--kutu", required=True)
ap.add_argument("--tasarim", required=True)
ap.add_argument("--bosluk", type=float, default=40)
ap.add_argument("--gutter", type=float, default=64)
ap.add_argument("--tol", type=int, default=18)
ap.add_argument("--bantlar", default=None)
ap.add_argument("--min-yukseklik", dest="min_yukseklik", type=float, default=24,
                help="Bu tasarım px yüksekliğinden kısa bloklar gürültü sayılır (vars. 24).")
a = ap.parse_args()

bx, by, bw, bh = [float(v) for v in a.kutu.split(",")]
DW, DH = [float(v) for v in a.tasarim.split(",")]
im = Image.open(a.png).convert("RGB").crop((round(bx), round(by), round(bx + bw), round(by + bh)))
W, H = im.size
px = im.load()
sx, sy = W / DW, H / DH          # piksel / tasarim px

x0 = max(0, round(a.gutter * sx))
x1 = min(W, round((DW - a.gutter) * sx))
if x1 - x0 < 4:
    sys.exit("HATA: içerik sütunu çok dar — --gutter değerini küçült")

def satir_zemini(y):
    c = Counter(px[x, y] for x in range(x0, x1))
    return c.most_common(1)[0]

def bos_mu(y):
    """Satır tek renkse (baskın renk %98+) boştur."""
    renk, adet = satir_zemini(y)
    return adet >= 0.98 * (x1 - x0), renk

bos, renkler = [], []
for y in range(H):
    b, r = bos_mu(y)
    bos.append(b); renkler.append(r)

# bos kosulari
kosular = []
y = 0
while y < H:
    if bos[y]:
        s = y
        while y < H and bos[y]: y += 1
        kosular.append((s, y))
    else:
        y += 1

min_kosu = a.bosluk * sy
ayraclar = [(s, e) for s, e in kosular if (e - s) >= min_kosu]

# Bantlar otoriter: kenarlari her zaman sinir, iclerindeki bosluk sinirlari dusuyor.
bantlar = []
if a.bantlar:
    for b in json.loads(a.bantlar):
        y_s, y_e = float(b["y"]) * sy, (float(b["y"]) + float(b["h"])) * sy
        if y_e - y_s >= 8 * sy:
            bantlar.append({"s": y_s, "e": y_e, "ad": b.get("ad", "")})
    bantlar.sort(key=lambda b: b["s"])

def bant_ici(y):
    return next((b for b in bantlar if b["s"] + 1 < y < b["e"] - 1), None)

sinirlar = [0]
for s, e in ayraclar:
    orta = (s + e) / 2
    if orta <= 2 or orta >= H - 2: continue
    if bant_ici(orta): continue          # bandin ici bolunmez
    sinirlar.append(orta)
for b in bantlar:                        # bant kenarlari her zaman sinir
    sinirlar += [b["s"], b["e"]]
sinirlar.append(H)
sinirlar = sorted(set(round(v, 2) for v in sinirlar if 0 <= v <= H))

bolumler = []
for i in range(len(sinirlar) - 1):
    y_s, y_e = sinirlar[i], sinirlar[i + 1]
    if (y_e - y_s) < a.min_yukseklik * sy:      # cok kisa blok = gurultu, atla
        continue
    ic = [renkler[int(y)] for y in range(int(y_s), int(min(y_e, H))) if bos[int(y)]]
    zemin = Counter(ic).most_common(1)[0][0] if ic else None
    b = bant_ici((y_s + y_e) / 2) if a.bantlar else None
    bolumler.append({
        "index": len(bolumler) + 1,
        "y": round(y_s / sy, 1),
        "h": round((y_e - y_s) / sy, 1),
        "zemin": "#%02X%02X%02X" % zemin if zemin else None,
        "bant": b["ad"] if b else None,
    })

print(json.dumps({"tasarim": [DW, DH], "bolum_sayisi": len(bolumler), "bolumler": bolumler},
                 ensure_ascii=False, indent=2))
