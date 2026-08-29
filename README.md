# d2c — Design to Code (Adobe XD)

Adobe XD tasarımlarını ölçüp **doğrulanmış** Tailwind + React koduna çevirir.

Fark şu: değerler gözle okunmuyor, **XD'nin kendi spec panelinden** alınıyor; üretilen
kod tarayıcıda render edilip **tekrar ölçülerek** tasarımla karşılaştırılıyor.

```
/d2c <xd-link>
   │
   ├─ önkoşul (Node · .d2c.json · fontlar)        ← MCP artık GEREKMİYOR
   ├─ xd extract   → design.json   (HTTP + AGC scenegraph, ~1 sn, tarayıcı yok)
   ├─ sections     → bölüm haritası (probe/kalibrasyon/screenshot yok, ~1 ms)
   │
   └─ her bölüm için:
        ├─ spec          → olcum.json + spec.md   (Claude'un TEK girdisi)
        ├─ bileşen envanteri ("zaten var mı?")
        ├─ Tailwind + React üret
        ├─ render verify → verification.json      (Playwright, ~1,3 sn)
        ├─ visual diff   → visual.json + hazır kırpmalar (~2,7 sn)
        ├─ /code-review  → kalite çıtası
        └─ regresyon                              → code.md + runs.jsonl
```

Ölçüm artık XD viewer'ı hiç açmıyor: paylaşım linkinin kendi verdiği scenegraph
düz HTTP ile okunuyor. Ölçülen kazanç ve yöntem: [docs/benchmark.md](docs/benchmark.md).

## Komutlar

| Komut | Ne yapar |
|---|---|
| `/d2c <link> [bölüm\|hepsi]` | Uçtan uca |
| `/d2c-spec <link> [bölüm]` | Yalnız ölçüm |
| `/d2c-code <link\|rapor> <bölüm>` | Yalnız kod + doğrulama |
| `/d2c-verify <bileşen\|rota>` | Mevcut kodu yeniden doğrular |

Skill'lerin altında çalışan CLI doğrudan da kullanılabilir
(`node "$D2C_ROOT/cli/dist/d2c.mjs" --help`):

| Komut | Ne yapar |
|---|---|
| `doctor` | önkoşul kontrolü |
| `xd inspect <link>` | ekran listesi + sözleşme sağlığı |
| `xd smoke <link>` | canlı sözleşme kontrolü — bozulduğunda çıkış kodu 1 (haftalık CI) |
| `inventory [dizin]` | mevcut bileşen envanteri (AST) — "bu zaten var mı?" |

Her komut `--verbose` (süre özeti) ve `--trace <dosya>` (JSON) kabul eder.

## Kurulum

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

Sonra **Claude Code'u yeniden başlat** — agent'lar ve skill'ler oturum başında kayda giriyor.

Bu repo hem plugin hem kendi katalogu; ayrı bir marketplace reposu gerekmiyor.
Önkoşullar (Node, opsiyonel Playwright, `.d2c.json`, fontlar) ve
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
| `docs/xd-viewer-notlari.md` | XD'yi tarayıcıda sürmenin 23 doğrulanmış maddesi |
| `skills/d2c-code/references/tailwind.md` | Kod üretim kuralları (yarı-satır telafisi, font kökü, scrollbar…) |
| `skills/d2c-code/references/quality.md` | Üretilen bileşenin geçmesi gereken çıta |
| `skills/d2c/references/segmentation.md` | Ekran ayrıştırma yöntemi |
| `fixtures/README.md` | Kabul testi fixture'ını kendi tasarımınla nasıl kurarsın |

## Sürümleme

- **Minor** — kural/referans eklendiğinde
- **Major** — komut adı veya `.d2c.json` şeması değiştiğinde
