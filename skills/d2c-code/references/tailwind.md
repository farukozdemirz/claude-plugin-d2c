# Tailwind kod üretim kuralları

Tahminle yazılan Tailwind tasarımı tutturmaz. Aşağıdakiler bunun neden olduğunu ve nasıl
önleneceğini anlatıyor.

## Kaynak disiplini

- **Asla screenshot'tan tahmin etme.** Sadece raporda **P** (panelden okunan) ve
  **hesaplanan** (kutu farkından türetilen) değerler kullanılır.
- Rapor bir değeri içermiyorsa **uydurma** — `{/* TODO: <ne eksik> ölçülmedi */}` bırak
  ve rapordaki TODO listesine yaz.
- Gözle "8" okunan bir radius ölçümde 12 çıktı. Tahmin sessizce yanlış kod üretir;
  yanlış kod doğrulamadan geçmez ama tur harcatır.

## Renk

- Tema token'ı hex'in **birebir** karşılığıysa token sınıfını kullan (`bg-blue-4`).
- Değilse arbitrary: `text-[#FFC700]`. "Yakın" token kullanma — renkte tolerans yok.
- **Config'i kendiliğinden değiştirme.** Tailwind v4'te tema `app/globals.css` içindeki
  `@theme` bloğudur ve paylaşılan bir yüzeydir; tek bir bileşen için değiştirmek başka
  ekranları etkiler. Rapora "eklenmesi önerilen token" listesi yaz:
  ```css
  @theme {
    --color-marka-lacivert: #0C2380;   /* -> bg-marka-lacivert, text-marka-lacivert */
  }
  ```

## Spacing

- 4px ızgarasına **≤2px** uzaklıktaysa ızgara sınıfı: 24 → `p-6`, 16 → `gap-4`.
- Değilse arbitrary: 9 → `mt-[9px]`, 26 → `pb-[26px]`.
- **Yuvarlama yaptıysan raporda belirt** — 26'yı `pb-6`(24) yapmak 2px sapma demektir ve
  bu tolerans içinde kalır ama tasarım öyle demiyor.

## Tipografi

Tailwind'in varsayılan line-height'ları XD ile **çoğu zaman tutmaz**:

| Sınıf | Tailwind | XD isteyebilir |
|---|---|---|
| `text-lg` | 18px / 28px | 18 / 22 |
| `text-sm` | 14px / 20px | 14 / 17 |
| `text-xs` | 12px / 16px | 12 / 14 |

font-size sınıfını kullan ama **line-height'ı her zaman açıkça yaz**:
`text-lg leading-[22px]`. Tek istisna: XD'nin line-height'ı Tailwind'inkiyle birebir
aynıysa bile açıkça yazmak zararsız — yaz.

- letter-spacing panelde `-0.2px` gibi çıkarsa `tracking-[-0.2px]`. `0px` ise yazma.
- font-weight: XD "Bold" → `font-bold` (700), "Medium" → `font-medium` (500),
  "Regular" → `font-normal` (400), "Light" → `font-light` (300).

## Yükseklik

- Kart/panel gibi sabit yüksekliği `h-[204px]` ile sabitleme — içerik değişince taşar.
  Mümkünse **padding + içerikten türet**.
- Sabit gerekiyorsa `min-h-[204px]` tercih et.
- Doğrulamada yükseklik tutmuyorsa sebebi genelde satır kutusudur, `h-*` eksikliği değil.

## Responsive

- **Mobil base, desktop `lg:`.** `lg:` varsayılan 1024px; tasarımın kırılma noktası
  farklıysa `@theme` içinde `--breakpoint-*` önerisi yaz (sen ekleme).
- İki artboard arasında eleman **sırası** değişiyorsa DOM'u kopyalama —
  flex + `order-*` kullan. İki ayrı DOM ağacı iki kat bakım ve erişilebilirlik sorunu.
- Tek artboard varsa responsive davranışı **uydurma**; base yaz, TODO bırak.

## className prop'u

Dışarıdan sınıf alan bileşenlerde `twMerge` kullan — yoksa `className="p-4"` ile gelen
sınıf, bileşenin kendi `p-6`'sıyla çakışır ve hangisinin kazanacağı CSS sırasına kalır:

```tsx
import { twMerge } from 'tailwind-merge'
export function Kart({ className, ...props }: Props) {
  return <div className={twMerge('rounded-xl border p-6', className)} {...props} />
}
```

`tailwind-merge` kurulu değilse kur (`npm i tailwind-merge`) ve raporda belirt.

## Container / gutter

Tasarım 1440'ta 64px gutter kullanıyorsa ve projenin `container`'ı 16px padding
veriyorsa farkı kapat: `lg:px-16`. Gutter'ı raporda **hesaplanan** olarak göster
(ör. `sol gutter 63.5 = ilk kart.x`).

## Font yüklü değilse ölçüm kayar

Doğrulamadan **önce** tasarımdaki font ailesinin projede yüklü olduğunu kontrol et:

```js
document.fonts.check('16px "Bw Modelica"')
```

- Yüklü değilse tarayıcı fallback kullanır; metin **genişlikleri** ve **satır kutusu
  yükseklikleri** kayar — kutu ölçüleri (padding, radius, border, renk) yine geçerlidir.
- Bu durumda fark tablosunu yine ver ama raporda **"font eksik"** uyarısı koy ve metin
  kaynaklı satırları `⚠` ile işaretle. Ticari font (Bw Modelica gibi) çoğu projede
  yoktur — bu geçerli bir sonuçtur, gizlenecek bir hata değil.
- Fallback seçerken metriği yakın bir aile kullan ve `font-family` zincirini raporda yaz.

## Görseller

XD viewer'dan asset **indirilemez**. Placeholder (boyutu doğru bir `div` veya
`next/image` + geçici kaynak) + `{/* TODO: görsel XD'den export edilmeli */}` bırak.

## Birikimli sapma

XD metin kutusu yüksekliği ile CSS satır kutusu aynı şey değildir; dikey konumlar
aşağı doğru **~2-3px kayabilir** ve bu kayma birikir.

- Kontrolü **ilk elemandan başlat**, aşağı doğru ilerle.
- Sapma aşağı indikçe **büyüyorsa** kaynağı o elemanın kendisi değil, **üstündeki
  boşluktur** — oradaki `margin`/`leading` değerini düzelt.
- Sapma sabit kalıyorsa tek seferlik bir offset vardır (genelde ilk elemanın
  `leading`'i veya konteynerin `padding-top`'u).

---

## Yarı-satır boşluğu (half-leading) — en sık yapılan hata

**XD'nin metin kutusu yüksekliği ile CSS'in satır kutusu yüksekliği aynı şey değildir.**

- XD, otomatik yükseklikli metin çerçevesi için `(n−1) × line-height + fontKutusu` verir.
- CSS ise `n × line-height` render eder.
- Fark `line-height − fontKutusu` kadardır ve **yarısı üstte, yarısı altta** durur.

Bw Modelica'da `fontKutusu ≈ 1.25 × font-size` (doğrulanmış: 12→15, 16→20; büyük
puntolarda aşağı yuvarlıyor: 18→22, 24→29, 32→38).

**Sonucu iki yerde görürsün:**

1. **Metin elemanının yüksekliği** XD'den büyük çıkar (ör. 18/28 tek satır: XD 22, CSS 28).
   Bu bir hata değil — iki farklı ölçü. `design-diff` prompt'una "metin yüksekliği
   satırlarını `✓ (metin çerçevesi)` say" diye yaz.
2. **Alttaki her şey kayar ve kayma birikir.** Kart yüksekliği XD'yi tutmaz.

**Telafi:** `line-height > fontKutusu` olan metnin **üstündeki ve altındaki boşluğu**
yarı-satır kadar kıs:

```
yarıSatır = (lineHeight − fontKutusu) / 2
üstBoşluk_css = üstBoşluk_xd − yarıSatır      (bir üstteki elemanın da yarı-satırı varsa onu da düş)
altBoşluk_css = altBoşluk_xd − yarıSatır
```

Doğrulanmış örnek — 16/27 gövde metni (fontKutusu 20, yarıSatır 3.5):
`mt-[4.5px]` (XD 8) ve altındaki satıra `mt-[12.5px]` (XD 16) → kart yüksekliği
**248.88** çıktı, XD **248.89**. Telafisiz hali 256 idi.

`line-height = fontKutusu` olan metinlerde (18/22, 14/17, 20/24, 16/20) telafi
**gerekmez** — boşlukları XD'deki gibi bırak.

## Font ailesini bölüm kökünde kur

`globals.css` `body`'ye bir fallback aile veriyor olabilir (`Arial, Helvetica, sans-serif`).
Bileşen ailesini sadece alt bileşenlerde kurarsan, **bölümün kendi metinleri sessizce
fallback'e düşer** — font-size/line-height/renk doğru görünür, sadece aile yanlıştır ve
bunu gözle fark etmezsin. Aileyi bölümün kök elemanına yaz:

```
"[font-family:var(--font-modelica),ui-sans-serif,system-ui,sans-serif]"
```

Sonra `design-diff`'e her elemanın computed `fontFamily`'sini raporlat.

## Blok genişliği ≠ XD metin çerçevesi genişliği

XD bir başlık için `W 319px` diyorsa bu **metnin** genişliğidir. CSS'te `<h2>` blok
elemandır ve kabı doldurur (1312 çıkar). Görsel olarak fark etmez ama ölçüm tutmaz ve
daha kötüsü: **metnin nerede sardığını kaybedersin.**

- Tek satırlık başlık → `w-fit`
- Saran paragraf → XD'nin çerçeve genişliği `max-w-[725px]` (sarma noktası budur)

## `overflow-x-auto` mobilde altındaki her şeyi kaydırır

Yatay kaydırmalı şeritte (carousel) klasik kaydırma çubuğu **15px** yer kaplar ve
şeridin altındaki elemanları aşağı iter — ölçümde "24 olması gereken boşluk 39 çıktı"
şeklinde görünür. Tasarımda çubuk yoktur; gizle:

```
"overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```

