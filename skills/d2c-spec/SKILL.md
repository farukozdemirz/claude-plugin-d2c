---
name: d2c-spec
description: "Adobe XD view/specs linkini chrome-devtools MCP ile tarayıcıda açar; ekran/renk/tipografi çıkarır, istenen elemanları tıklayıp spec panelinden ölçer."
argument-hint: <xd-link> [ne ölçüleceği]
---

# d2c-spec

Adobe XD paylaşım linkini gerçek tarayıcıda açıp tasarımı ölçer.

**Argüman:** ilk kelime XD linki, kalanı serbest görev tarifi (opsiyonel).
Örnek: `/d2c-spec https://xd.adobe.com/view/.../specs/ "yorum kartının padding değerleri"`

## İlk iş

`references/playbook.md`'yi oku. Oradaki yöntemler gerçek bir oturumda doğrulanmıştır —
alternatiflerini deneme (özellikle WebFetch/curl, MCP `click`, klavye/scroll pan).

## Akış

1. **Önkoşul.** chrome-devtools MCP araçları (`mcp__chrome-devtools__*`) yoksa kullanıcıya
   şu komutu söyle ve **dur**:
   ```
   claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated
   ```
2. **Aç ve hazırla.** Linki aç, diyalogları kapat, geniş viewport ayarla (playbook §2-4).
3. **Snapshot.** `take_snapshot` ile ekran kimliği + renk paleti + character styles çıkar (§5).
4. **Görev tarifi YOKSA:** genel rapor üret — ekran listesi (§12) + palet + tipografi +
   düşük zoom'da (%22-25) ekran görüntüsünden bölüm listesi — ve kullanıcıya hangi bölümü
   ölçmek istediğini sor.
5. **Görev tarifi VARSA — kalibre et.** Bölgeye pan/zoom yapmak için **deneme-yanılma
   ETME**: playbook **§24**'teki tek çağrılık kalibrasyon rutinini kullan. Zoom'u ayarlar,
   hedefi bulur, kenarları ikili aramayla çözer, eşlemeyi döndürür. Eşlemeyi hemen ikinci
   bir elemanla doğrula.
6. **Ölç.** Elemanları tıklayıp panelden oku (§8-11), boşlukları kutu koordinatlarından
   hesapla (§14). Probe'ları **toplu** yap — tek `evaluate_script` içinde çok nokta
   (§10); her araç çağrısı ~15 sn model gecikmesi demek.
7. **Referansı BURADA yakala.** Tarayıcı zaten doğru artboard'da ve doğru zoom'da.
   Playbook §23'e göre dpr 2 + zoom %50 ayarla, **seçimi kaldır** (artboard dışına tıkla —
   XD seçili elemanı magenta ana hatla çiziyor ve köşe ölçümünü bozuyor), PNG'ye al:
   `<reportDir>/<bolum-slug>/xd-<viewport>.png`. Kod fazı bunu yeniden yakalamayacak.
8. **Raporla — iki dosya.** Repo köküne yazma.
   - `<reportDir>/<bolum-slug>/spec.md` — insan için (aşağıdaki format)
   - `<reportDir>/<bolum-slug>/olcum.json` — **sonraki fazlar için** (aşağıdaki şema)

   Tek başına çağrıldıysa ve bölüm belli değilse `<reportDir>/spec.md`.

## `olcum.json` — fazlar arası durum sözleşmesi

**Bu dosya olmadan sonraki fazlar aynı işi baştan yapar.** `/d2c-code` §4b XD'ye geri
dönüp konumlandırma yapar, `visual-diff` çapayı yeniden türetir; ölçülen maliyet
bölüm başına **~15 araç çağrısı ≈ 4 dakika**.

```jsonc
{
  "ekran":    { "ad": "…", "sayac": "8 of 24", "screen_id": "…", "mobil_screen_id": "…" },
  "artboard": { "desktop": [1440, 1494], "mobil": [375, 1064] },
  "kalibrasyon": {                        // playbook §24'ün döndürdüğü değerler
    "desktop": { "zoom": 50, "solV": 267, "ustV": 314, "olcek": 0.5, "hedef": "artboard" },
    "mobil":   { "zoom": 75, "solV": 467, "ustV": 297, "olcek": 0.75, "hedef": "artboard" }
  },
  "bolum_kutu": { "desktop": [940, 0, 500, 1080], "mobil": [0, 0, 375, 1080] },
  "referans": {
    "desktop": {
      "png": "xd-desktop.png",            // <reportDir>/<slug>/ altında
      "dpr": 2, "zoom": 50,
      "esleme": { "dx": 534, "dy": 628 }, // cihaz_px = (dx + tasarim_x, dy + tasarim_y)
      "kirpma": [1474, 628, 500, 1080]    // bölümün referans PNG içindeki kutusu
    }
  },
  "capa": { "hex": "#0C2380", "tasarim_kutu": [972, 939.13, 436, 64] }
}
```

- `esleme` **1 tasarım px = 1 cihaz px** olduğu yakalamada geçerlidir (dpr 2 + zoom %50).
  Yakalamadan sonra bilinen bir elemanın PNG içindeki kutusunu ölçüp **doğrula** ve
  doğrulamayı `spec.md`'ye yaz.
- `capa`: bölüm içindeki **benzersiz renkli, dolu, geniş** eleman. Ekranda ona yakın
  başka bir renk varsa (kampanya banner'ı gibi) `kirpma` zaten hazır olduğu için
  `visual-diff` çapayı hiç türetmeyecek — sorun çıkmaz.

## Rapor formatı

- **Ekran:** ad, "N of M", viewport/design size
- **Renk paleti** (hex — snapshot'tan, screenshot'tan DEĞİL)
- **Character styles:** aile / ağırlık / px / renk
- **Ölçülen elemanlar tablosu:** eleman | x | y | w×h | radius | renk/border | font
- **Hesaplanan boşluklar**, hangi iki kutudan türetildiğiyle:
  ör. `kart sol padding 24 = metin.x(87.5) − kart.x(63.5)`
- Panelden **OKUNAN** ile **HESAPLANAN** değerleri ayrı işaretle.
