# d2c — Design to Code (Adobe XD)

Adobe XD tasarımlarını ölçüp **doğrulanmış** Tailwind + React koduna çevirir.

Fark şu: değerler gözle okunmuyor, **XD'nin kendi spec panelinden** alınıyor; üretilen
kod tarayıcıda render edilip **tekrar ölçülerek** tasarımla karşılaştırılıyor.

```
/d2c <xd-link>
   │
   ├─ önkoşul kontrolü (MCP · agent kaydı · PIL · .d2c.json · fontlar · kilit)
   ├─ ekran seç (desktop + mobil artboard)
   ├─ BÖLÜM HARİTASI (tam genişlik bant taraması + boş satır analizi)
   │
   └─ her bölüm için:
        ├─ ölç (spec paneli)               → spec.md
        ├─ bileşen envanteri ("zaten var mı?")
        ├─ Tailwind + React üret
        ├─ design-diff  → render edip ÖLÇ
        ├─ visual-diff  → render edip piksel karşılaştır
        ├─ /code-review → kalite çıtası
        └─ regresyon ölçümü               → code.md + runs.jsonl
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `/d2c <link> [bölüm\|hepsi]` | Uçtan uca |
| `/d2c-spec <link> [bölüm]` | Yalnız ölçüm |
| `/d2c-code <link\|rapor> <bölüm>` | Yalnız kod + doğrulama |
| `/d2c-verify <bileşen\|rota>` | Mevcut kodu yeniden doğrular |

## Kurulum

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

Sonra **Claude Code'u yeniden başlat** — agent'lar ve skill'ler oturum başında kayda giriyor.

Bu repo hem plugin hem kendi katalogu; ayrı bir marketplace reposu gerekmiyor.
Önkoşullar (chrome-devtools MCP, Python + PIL, `.d2c.json`, fontlar) ve
proje konfigürasyonu: [docs/installation.md](docs/installation.md)

## Bir şeyler ters gittiğinde

[docs/troubleshooting.md](docs/troubleshooting.md) — 14 madde, hepsi gerçekten yaşandı

## Aracın yapamadıkları

[docs/limitations.md](docs/limitations.md) — **kurmadan önce okuyun.** Vektör/görsel export
yok, etkileşim okunmuyor, kırılma noktası varsayım, test üretmiyor, paralel çalışmıyor.

## Kural dosyaları

Araç ne öğrendiyse buraya yazılı. Yeni bir tuzak bulunduğunda buraya eklenir ve
plugin sürümü artırılır — herkese yayılır.

| Dosya | İçerik |
|---|---|
| `skills/d2c-spec/references/playbook.md` | XD'yi tarayıcıda sürmenin 23 doğrulanmış maddesi |
| `skills/d2c-code/references/tailwind.md` | Kod üretim kuralları (yarı-satır telafisi, font kökü, scrollbar…) |
| `skills/d2c-code/references/quality.md` | Üretilen bileşenin geçmesi gereken çıta |
| `skills/d2c/references/segmentation.md` | Ekran ayrıştırma yöntemi |
| `fixtures/README.md` | Kabul testi fixture'ını kendi tasarımınla nasıl kurarsın |

## Sürümleme

- **Minor** — kural/referans eklendiğinde
- **Major** — komut adı veya `.d2c.json` şeması değiştiğinde
