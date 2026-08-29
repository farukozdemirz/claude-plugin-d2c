# Ekran ayrıştırma

Artboard'ı bölümlere ayırmanın doğrulanmış yöntemi. İki ekranda test edildi:
"Desktop - Ekran A" (5/24) ve "Desktop - Ekran B" (6/24).

## Hızlı yol — `d2c sections` (1.5.0+)

`design.json` hazırsa bölüm haritası **tek komutla, tarayıcı olmadan** çıkar:

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" xd extract "<xd-link>" --screen "<ekran>" -o design.json
node "$D2C_ROOT/cli/dist/d2c.mjs" sections --design design.json --json -o bolum-haritasi.json
```

Aşağıdaki yöntemin **aynısını** uygular; farkı, iki sinyalin de scenegraph'tan gelmesi:
tam genişlik bantları probe yerine geometriden, boş satır analizi ekran görüntüsü yerine
eleman kutularından. Kalibrasyon gerekmez.

Doğrulama (ekran 5/24, gerçek koşunun bölüm haritasına karşı): **4 bandın 4'ü birebir**
(y, h, ad, renk), bölüm sayısı aynı (11), bant bölümlerinin sınırları birebir, boşluk
türevli sınırlar **≤ 5 px** sapıyor. Sapmanın sebebi: eski yöntem ekran görüntüsündeki
*mürekkebi*, yeni yöntem eleman *kutularını* kullanıyor; metin çerçevesi mürekkepten
biraz taşar.

Ekran 6/24'ün üç bandı da (@Y0 h69 · @Y69 h504 · @Y573 h2452.89 `#F9FAFB`) birebir çıkıyor.

> **Aşağıdaki probe yöntemi kaldırılmadı.** `extractorStrategy: "legacy"` ile hâlâ
> geçerlidir ve `d2c sections` bir tasarımda anlamlı sonuç vermezse başvurulacak yoldur.

---

## Legacy yol — XD probe + ekran görüntüsü

## Neden probe ile başlık avlanmıyor

İlk denenen yöntem, içerik sütununda aşağı doğru tıklayıp büyük puntolu `Text`
elemanlarını toplamaktı. **Çalışmadı:** 110px'lik adımla 56px yüksekliğindeki
"Bölüm Başlığı" başlığı iki probe'un arasına düşüp kaçtı. Adımı 40'a indirmek
190+ tıklama demek (~100 sn) ve hâlâ garanti değil.

Çalışan yöntem iki sinyali birleştiriyor:
1. **Tam genişlik zemin dikdörtgenleri** (XD probe) — otoriter bölüm sınırları
2. **Boş satır analizi** (tek ekran görüntüsü) — bantsız bölgeleri böler

## 1. Kalibrasyon — tasarım ↔ viewport

Zoom textbox'ı **%25'in altına inmiyor** (20/15/12 yazsan da 25'te kalıyor).
1440×3778'lik bir artboard %25'te 360×944.5 viewport px eder; tamamının görünmesi için
pencereyi yükselt (`resize_page` 1600×1400 → iç yükseklik ~1297) ve artboard üstü ~90'a
gelecek şekilde pan yap.

Ölçek zoom'dan bilinir (`s = zoom/100`); gereken tek şey **offset**. Artboard kenarını
ikili aramayla bul — içerideyken panel eleman verir, dışarıdayken "Screen Details":

```js
const ici = async (x, y) => (await probe(x, y)) !== null;
let lo = 0, hi = refY;
while (hi - lo > 1) { const m = (lo + hi) >> 1; if (await ici(refX, m)) hi = m; else lo = m; }
const ustV = hi;                       // design y=0 buraya düşer
// aynısı x için → solV
const dx = (x) => solV + x * s, dy = (y) => ustV + y * s;
```

~20 tıklama sürer, deterministiktir.

## 2. Tam genişlik bant taraması

Sol kenar şeridinde (tasarım x ≈ 8) aşağı doğru 90 px adımlarla tıkla; genişliği
artboard genişliğinin **%90'ından büyük** olan elemanları topla. Artboard'ın kendisini
ele (w == tasarım genişliği **ve** h == tasarım yüksekliği).

```js
for (let dy = 15; dy < DH; dy += 90) {
  const r = await probe(dx(8), dy(dy));
  if (r && r.w >= 0.9 * DW && !(r.w === DW && r.h === DH)) bantlar.push(r);
}
```

Doğrulanmış çıktı — ekran 5: `Rectangle B` 1440×34 @Y0 · `Rectangle C` 1440×96 @Y34 ·
`Path A` 1440×69 @Y179 · **`Rectangle A` 1440×730 @Y2923** (yorumlar bandı).
Ekran 6: `Rectangle D` @Y0 h69 · `Rectangle E` @Y69 h504 · **`Rectangle F` @Y573
h2452.89** (`#F9FAFB` bölüm zemini).

## 3. Boş satır analizi

Artboard'ın ekran görüntüsünü al, `$D2C_ROOT/skills/d2c/scripts/section-map.py`'a kalibrasyon kutusuyla
birlikte ver. Script içerik sütununda (gutter içeride) tek renkli satır koşularını
bulur; eşikten uzun her koşu ayraçtır.

```bash
python3 "$D2C_ROOT/skills/d2c/scripts/section-map.py" artboard.png \
  --kutu "427,92,360,944.5" --tasarim "1440,3778" \
  --bantlar '[{"y":2923,"h":730,"ad":"Rectangle A"}]'
```

**Bantlar otoriterdir:** bir bandın içindeki boşluk sınırları yok sayılır (bant tek
bölümdür), bant kenarları her zaman sınırdır. Bantsız verilirse yorumlar bandı üç
parçaya bölünüyordu (başlık / kartlar / oklar) — bant bilgisiyle tek bölüm oluyor.

## 4. İsimlendirme

Her bölümün **üst üçte birinde**, birkaç sütunda tıkla; en büyük puntolu `Text` kazanır.

- Sütunlar: sol gutter (x≈80), orta (x≈DW/2), sağ-orta (x≈0.55·DW).
  Üçüncü sütun şart: "sağ kolonda duran uzun başlık" sağ kolonda ve iki
  sütunla arandığında bulunamıyordu.
- Adım sayısı bölüm yüksekliğiyle orantılı, 2-6 arası.

Doğrulanmış: bölüm 10 → `"Bölüm Başlığı" (48px)`, bölüm 6 → `"uzun başlıklı bölüm" (64px)`, bölüm 8 → `"kısa başlıklı bölüm" (30px)`.

## 5. Bilinen sınırlar

- **Görselden ibaret bölümler isimsiz kalır** (ekran 5 bölüm 5, 9, 11). Harita yine
  doğru sınırları verir; kullanıcı Y aralığından seçer.
- **Yatay ayrıştırma yok.** Bir bölümün içindeki kolonlar ayrılmıyor; bölüm tek parça
  olarak `/d2c-code`'a gider ve orada ölçülür.
- Boş satır eşiği (`--bosluk`, vars. 40 tasarım px) tasarıma göre ayarlanabilir;
  sıkışık tasarımlarda düşür, ferah tasarımlarda yükselt.
- Yöntem **dikey akan sayfalar** içindir. Serbest yerleşimli artboard'larda (dashboard,
  harita) anlamlı sonuç vermez.
