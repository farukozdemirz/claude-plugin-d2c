# fixtures

Kabul testi burada yaşar: **paketlemede bir şeyin kaybolmadığını** kanıtlayan,
gerçek bir tasarım üzerinde uçtan uca koşan bir senaryo.

İki dosyadan oluşur ve **bu repoda yoktur** (`.gitignore`):

| Dosya | Ne |
|---|---|
| `benchmark.json` | Ekranların bilinen-doğru değerleri: kutu, renk, tipografi, radius, ızgara; kabul edilen sapmalar; referans düzeltmeleri |
| `acceptance-test.md` | Adım adım senaryo: smoke → ekranları üret → karşılaştır → tuzak kontrolü |

## Neden repoda değil

Fixture bir XD **paylaşım linkine** ve o dosyanın ekran id'lerine bağlı. Link herkese
açık bir *view* linkidir; public bir repoda yayınlamak tasarım dosyasının tamamını
yayınlamak demektir. Bu yüzden fixture dosyaları diskte tutulur, versiyon kontrolüne
girmez.

## Kendi fixture'ını nasıl kurarsın

1. Ölçtüğün ekranlardan **üç tanesini** seç: biri ızgara/kart ağırlıklı, biri ters
   sıralı responsive davranışı olan, biri form. Kapsamı bu üçü belirler.
2. Her ekranı bir kez `/d2c` ile üret ve çıkan `spec.md` değerlerini `benchmark.json`'a
   **beklenen** olarak yaz. Şema:

```jsonc
{
  "kaynak": "<xd-view-link>",
  "olcum_toleransi": { "konum_boyut_px": 3, "renk": "birebir", "font_size": "birebir" },
  "ekranlar": [
    {
      "id": "a",
      "ad": "<bölümün adı>",
      "desktop": { "screen": "<screen-id>", "sayac": "5 of 24", "artboard": [1440, 3778] },
      "mobil":   { "screen": "<screen-id>", "sayac": "13 of 24", "artboard": [375, 4164] },
      "beklenen": { /* ölçülen kutular, renkler, tipografi, radius, ızgara */ },
      "sonuc": "sapan yok (2 tur)",
      "cozulemedi": []
    }
  ],
  "referans_duzeltmeleri": [ /* elle yazılan referansın YANLIŞ çıktığı noktalar */ ],
  "tum_ekranlarda_kabul_edilen_sapmalar": [ /* border-box, metin çerçevesi, ikonlar… */ ]
}
```

3. **`referans_duzeltmeleri` en değerli kısım.** Elle yazdığın beklenen değerle ölçüm
   çeliştiğinde ölçüme uyulur ve referans hatası buraya kanıtıyla yazılır. Bu alan
   dolmaya başladığında fixture gerçekten işe yarıyor demektir.

4. `cozulemedi` listesini **birebir** tut: kabul testinin en sıkı ölçütü, aracın aynı
   kalemleri ne eksik ne fazla raporlaması. Bir kalem çözülürse fixture düzeltilir.
