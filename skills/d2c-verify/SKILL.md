---
name: d2c-verify
description: "Mevcut bir bileşeni XD tasarımına karşı yeniden doğrular: design-diff ile ölçer, visual-diff ile piksel karşılaştırır. Kod üretmez."
argument-hint: <bileşen|rota> [xd-link]
---

# d2c-verify

Var olan kodu **yeniden doğrular**. Kod üretmez, düzeltmez — `/d2c-code`'un doğrulama
halkasını tek başına çalıştırır.

Ne zaman: bileşen elle değiştirildikten sonra, tasarım güncellendiğinde, ya da bir
refactor'ın hizayı bozup bozmadığını görmek için.

## Girdi

- **Bileşen adı veya rota** — `yorum-karti` ya da `/yorum-karti-preview`
- **XD linki** (isteğe bağlı) — verilmezse `<reportDir>/<slug>/spec.md`'deki ölçümler
  ve yanındaki **`olcum.json`** (kalibrasyon + hazır referans PNG + kırpma kutusu)
  hedef değer olarak kullanılır. Verilirse önce yeniden ölçülür (tasarım değişmiş olabilir).

## Akış

1. **`.d2c.json`'ı oku.** Yoksa dur — `/d2c` çalıştırılıp oluşturulmalı.
2. **Hedef değerleri bul.** `<reportDir>/<slug>/spec.md` yoksa ve XD linki de
   verilmediyse **dur**: neye karşı doğrulayacağını bilmiyorsun.
3. **`design-diff`** subagent'ını çağır (`run_in_background: false`).
   Prompt'a **her elemanın beklenen font ailesini ayrı ayrı** yaz — "bu tasarımın fontu X"
   gibi genel bir cümle agent'a yanlış hedef uydurtuyor.
4. **`visual-diff`** subagent'ını çağır. XD referans görüntüsü `<reportDir>/<slug>/`
   altında yoksa `d2c-spec` playbook §23 ile yeniden yakala.
5. **Raporla** — `<reportDir>/<slug>/verify-<tarih>.md`. Kodu **değiştirme**;
   sapma varsa listele ve `/d2c-code` ile düzeltilmesini öner.
6. `<reportDir>/runs.jsonl`'a satır ekle (`"sonuc":"dogrulama"`).

## Bilinen ve kabul edilmiş sapmalar

Bunları ✗ sayma — her doğrulamada tekrar çıkar:

- **`border-box`**: 1px border'lı kutularda iç ölçüler 2px kısılır (XD *Center Stroke*
  geometri kenarında durur, CSS border kutunun içine çizilir).
- **XD metin çerçevesi ≠ CSS satır kutusu**: XD tek satır için ≈1.25×font-size verir,
  CSS `line-height` verir. Metin **yüksekliği** satırları `✓ (metin çerçevesi)`.
- **Vektör ikonlar yaklaşık** — XD viewer export etmiyor; kutu ve renk ölçülü, yol değil.
- **Görsel diff yüzdesi taban ~%5-10** — XD canvas'a, tarayıcı DOM'a çiziyor.
  Yüzde geçme notu değil; sapan bölgelere bakılır.
