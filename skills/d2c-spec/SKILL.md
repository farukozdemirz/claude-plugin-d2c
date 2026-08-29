---
name: d2c-spec
description: "Adobe XD view/specs linkinden ekran ve bölüm ölçümlerini çıkarır; olcum.json + spec.md üretir. Varsayılan yol tarayıcısızdır (ağ tabanlı); legacy yol chrome-devtools MCP ile çalışmaya devam eder."
argument-hint: <xd-link> [ne ölçüleceği]
---

# d2c-spec

XD paylaşım linkinden ölçüm çıkarır. **Argüman:** ilk kelime XD linki, kalanı serbest
görev tarifi (opsiyonel).

## Hangi yol

`.d2c.json` içindeki `extractorStrategy` belirler (varsayılan `auto`):

| Değer | Davranış |
|---|---|
| `auto` (varsayılan) | Ağ yolu. Sözleşme bozuksa **teşhisle durur** ve legacy'ye geçmeyi önerir |
| `network` | Yalnız ağ yolu |
| `legacy` | 1.4.0 davranışı: chrome-devtools MCP + `$D2C_ROOT/docs/xd-viewer-notlari.md` |

---

## Ağ yolu (varsayılan) — tarayıcı YOK

Üç komut. Ölçüm için XD viewer açılmaz, tıklama yapılmaz, kalibrasyon gerekmez.

```bash
D2C="$D2C_ROOT/cli/dist/d2c.mjs"          # kök çözümü için aşağıya bak
R="<reportDir>"                            # .d2c.json'dan

# 1) ekranı çıkar (desktop + mobil birlikte, ~1 sn)
node "$D2C" xd extract "<xd-link>" --screen "<ekran adı|id>" -o "$R/design.json"

# 2) bölüm haritası
node "$D2C" sections --design "$R/design.json" --json -o "$R/bolum-haritasi.json"

# 3) seçilen bölümün ölçümü → olcum.json + spec.md
node "$D2C" spec --design "$R/design.json" --section <no|slug> --out-dir "$R/<bolum-slug>"
```

Ekran adını bilmiyorsan önce listele: `node "$D2C" xd inspect "<xd-link>"`

### Çıktılar ve **kim neyi okur**

| Dosya | Kim okur |
|---|---|
| `design.json` | **Yalnız araçlar.** Tam scenegraph, ekran başına yüzlerce KB. **Claude bunu AÇMAZ.** |
| `olcum.json` | **Claude.** Bölüm kapsamlı, kendi içinde yeterli: kutu · spacing · radius · renk · kontur · tipografi · metin · eleman ilişkileri |
| `spec.md` | İnsan |

Bu sınır değişmez. `design.json`'ı bağlama sokmak, ölçüm maliyetini araç çağrısından
token'a taşımak olur — sorunu çözmek değil, yer değiştirmek.

### `olcum.json` hakkında bilinmesi gerekenler

- **`testid` başta `null`.** Kod fazı doldurur (`d2c-code` §3). Doldurulmadan
  doğrulama ajanı bu dosyayı kullanamaz.
- **`d2c spec` yeniden çalıştırılırsa `testid`'ler korunur** — eleman `id`'sine göre
  taşınır. Sıfırlamak için `--force`. Taşınamayan varsa `cozulemedi`'ye yazılır.
- **`tekrar` alanı sıkıştırılmış diziyi anlatır:** `adet` · düzenliyse `eksen`+`adim`
  (veya ızgarada `sutun`/`satir`/`adimX`/`adimY`), düzensizse `duzenli:false` +
  `konumlar` (tüm konumlar korunur, bilgi kaybı yok). 8 özdeş kart tek kayıt olur.
- **`hesaplanan`** boşlukları **adım başına bir kez** verir ve her kayıt `nasil`
  alanıyla kaynağını söyler.
- **`font.fontKutusuAgc` HAM AGC değeridir ve KULLANILMAZ.** `fontKutusuKaynak`
  `"tarayici"` gelir, `yariSatir` `null`'dur: yarı-satır telafisi için font kutusu
  **kod fazında tarayıcıda ölçülür** (`d2c-code` §3). Ölçüldü — AGC değeri Bw Modelica'da
  Chrome ile birebir tutuyor ama Tobias TRIAL 48px'te 10px sapıyor ve yarı-satırın
  işaretini değiştiriyor.
- Radius kaynağı `rect` veya `yol` ise kaynak veriden birebir gelmiştir (`P` sayılır).
  `bilinmiyor` ise **çıkarılamamıştır** — uydurulmamıştır, raporda öyle geçer.

### Sözleşme bozulursa

`xd inspect` / `xd extract` teşhisle durur. İki durum ayrıdır:

- **"XD linki geçersiz veya erişilemiyor"** → link yazım hatası, kaldırılmış paylaşım
  veya public olmayan link. Kullanıcıya sor.
- **"XD paylaşım sözleşmesi değişmiş olabilir"** → Adobe tarafı değişmiş.
  `extractorStrategy: "legacy"` ile aşağıdaki yola geç ve durumu bildir.

---

## Legacy yol — chrome-devtools MCP  *(korunuyor)*

`extractorStrategy: "legacy"` ise veya ağ yolu sözleşme hatası verdiyse kullanılır.

**İlk iş:** `$D2C_ROOT/docs/xd-viewer-notlari.md`'yi oku. Oradaki 25 madde gerçek bir oturumda
doğrulanmıştır — alternatiflerini deneme (özellikle MCP `click`, klavye/scroll pan).

1. **Önkoşul.** `mcp__chrome-devtools__*` yoksa dur ve söyle:
   `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated`
2. **Aç ve hazırla** (`xd-viewer-notlari.md` §2-4) → **snapshot** (§5) → **kalibrasyon** (§24, tek çağrı)
3. **Ölç** — elemanları tıklayıp panelden oku (§8-11), boşlukları kutu farkından
   hesapla (§14), probe'ları **toplu** yap (§10)
4. **Referansı burada yakala** (§23): dpr 2 + zoom %50, **seçimi kaldır**, PNG'ye al
5. **Raporla** — aynı iki dosya: `olcum.json` + `spec.md`

> Legacy yolda `olcum.json` elle doldurulur; şeması ağ yolununkiyle aynıdır
> (`cli/src/contracts/olcum.ts`). `kalibrasyon` ve `referans` alanları bu yolda
> anlamlıdır ve doldurulmalıdır.

---

## Görsel referans

**Ağ yolunda burada bir şey yapman gerekmiyor.** `d2c visual diff` referansı
manifest'teki artboard thumbnail'ından **HTTP ile** indiriyor; ölçek tam 0,5 olduğu
için kalibrasyon çapası türetilmiyor ve XD viewer açılmıyor.

Legacy yolda referans hâlâ elle yakalanır (`xd-viewer-notlari.md` §23: dpr 2 +
zoom %50, seçimi kaldır) ve `olcum.json`'daki `referans` alanına yazılır.

## Script yolları

```bash
D2C_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$D2C_ROOT" ]; then
  for c in $(ls -d "$HOME"/.claude/plugins/cache/*/d2c/*/ 2>/dev/null | sort -Vr) \
           "$HOME"/.claude/plugins/*/d2c "$HOME"/.claude/skills/d2c ./.claude; do
    [ -f "$c/cli/dist/d2c.mjs" ] && D2C_ROOT="${c%/}" && break
  done
fi
[ -z "$D2C_ROOT" ] && echo "HATA: plugin kökü bulunamadı" && exit 1
```

## Rapor formatı (`spec.md`)

Ağ yolunda otomatik üretilir. Legacy yolda elle yazılır; içerik aynı olmalı:
ekran · renk paleti · character styles · ölçülen elemanlar tablosu · hesaplanan
boşluklar (hangi iki kutudan türediğiyle) · kabul edilen sapmalar · çözülemedi.
**Okunan ile hesaplanan ayrı işaretlenir.**
