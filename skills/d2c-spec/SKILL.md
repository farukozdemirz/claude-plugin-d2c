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
   claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
   ```
2. **Aç ve hazırla.** Linki aç, diyalogları kapat, geniş viewport ayarla (playbook §2-4).
3. **Snapshot.** `take_snapshot` ile ekran kimliği + renk paleti + character styles çıkar (§5).
4. **Görev tarifi YOKSA:** genel rapor üret — ekran listesi (§12) + palet + tipografi +
   düşük zoom'da (%22-25) ekran görüntüsünden bölüm listesi — ve kullanıcıya hangi bölümü
   ölçmek istediğini sor.
5. **Görev tarifi VARSA:** bölgeye zoom/pan yap (§6-7), elemanları tıklayıp panelden oku
   (§8-11), boşlukları kutu koordinatlarından hesapla (§14).
6. **Raporla.** `docs/d2c/<bolum-slug>/spec.md`'ye yaz + terminalde özetle.
   (Tek başına çağrıldıysa ve bölüm belli değilse `docs/d2c/spec.md`.)
   Repo köküne rapor yazma.

## Rapor formatı

- **Ekran:** ad, "N of M", viewport/design size
- **Renk paleti** (hex — snapshot'tan, screenshot'tan DEĞİL)
- **Character styles:** aile / ağırlık / px / renk
- **Ölçülen elemanlar tablosu:** eleman | x | y | w×h | radius | renk/border | font
- **Hesaplanan boşluklar**, hangi iki kutudan türetildiğiyle:
  ör. `kart sol padding 24 = metin.x(87.5) − kart.x(63.5)`
- Panelden **OKUNAN** ile **HESAPLANAN** değerleri ayrı işaretle.
