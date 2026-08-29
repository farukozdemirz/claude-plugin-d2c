# Kurulum

## Önkoşullar

### 0. Node 18+ (zorunlu)

Ölçüm artık `cli/dist/d2c.mjs` üzerinden, **tarayıcısız** yapılıyor. Bundle depoda
hazır; `npm install` gerekmez.

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" doctor
```

### 1. chrome-devtools MCP (doğrulama için zorunlu)

**Ölçüm için artık gerekmiyor.** Gerekli olduğu yerler:
- `design-diff` ve `visual-diff` doğrulama ajanları (M2/M3'te deterministik olacak)
- `extractorStrategy: "legacy"` ile çıkarma

> Not: XD viewer bir SPA ve artboard `<canvas>`'a çizilir — DOM'da içerik yoktur.
> Ama canvas'a çizilen verinin **kaynağı** düz HTTP ile alınabiliyor; ölçüm yolu
> bunu kullanıyor.

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated
```

> **`--isolated` neden şart:** argümansız kurulumda sunucu Chrome'u hep aynı sabit
> profille (`~/.cache/chrome-devtools-mcp/chrome-profile`) açar. Chrome bir profili
> tek seferde tek işleme verdiği için **ikinci bir Claude Code oturumu tarayıcıyı
> hiç açamaz** ve şu hatayı alır:
>
> ```
> The browser is already running for .../chrome-profile.
> Use --isolated to run multiple browser instances.
> ```
>
> `--isolated` her sunucuya kendi geçici profilini verir; oturumlar birbirini
> kilitlemez. XD *view* linkleri herkese açık olduğu için kalıcı profile
> (oturum açma, çerez) ihtiyaç yoktur.

```bash
```

Doğrula: yeni bir oturumda `mcp__chrome-devtools__list_pages` çağrılabiliyor olmalı.

### 2. Playwright (doğrulama için)

`render verify` ve `visual diff` sistemdeki Chrome'u kullanır — **binary indirmez**.

```bash
npm i -D playwright-core     # hedef projede
```

Yoksa ölçüm (`xd extract` / `sections` / `spec`) **yine çalışır**; yalnız doğrulama
komutları çalışmaz. `d2c doctor` durumu söyler.

### 3. Python — **artık zorunlu değil** (1.11.0)

**Pillow (PIL) normal akışta hiç gerekmiyor.** Görsel karşılaştırma 1.11.0'da
TypeScript'e taşındı ve piksel düzeyinde PIL ile eşdeğerliği kanıtlandı
(8 durumda ham/yapısal fark **tam 0**; ısı haritası ve kırpmalar bayt bayt aynı).
Kod `cli/dist/d2c.mjs` içine gömülü — kurulacak bir şey yok.

**1.12.0'dan beri normal akışta `python3` de hiç çağrılmıyor.** Bileşen envanteri
`d2c inventory`'ye (AST tabanlı, bundle'da) taşındı.

Kalan Python script'leri yalnız **isteğe bağlı yollarda**, ikisi de Pillow istiyor:

| Script | Ne zaman | PIL? |
|---|---|---|
| `section-map.py` | **yalnız** `extractorStrategy: "legacy"` | evet |
| `visual-diff.py` | **yalnız** `visual diff --motor python` / `--kalibre` | evet |
| `component-inventory.py` | artık çağrılmıyor — geri dönüş olarak duruyor | hayır (stdlib) |

Yani: Python'u yalnız *legacy yolu* ya da *çapa geri dönüşü* kullanacaksan kur.

```bash
pip install Pillow     # yalnız legacy / --kalibre için
```

### 4. Node + proje (zorunlu)

Doğrulama, üretilen kodu gerçek bir dev server'da render edip ölçüyor. Hedef proje
çalışır durumda olmalı (`npm run dev` açılabilmeli).

### 5. Tasarımın fontları (zorunlu değil ama şiddetle önerilir)

Fontlar projede yüklü değilse **metin ölçüleri kayar**. Araç bunu tespit edip uyarır
ama kutu ölçüleri dışındaki her şey güvenilmez olur. `next/font/local` ile bağlayın.

## Plugin kurulumu

Bu repo **hem plugin hem de kendi katalogu**. İçindeki
`.claude-plugin/marketplace.json` `d2c-marketplace` adlı katalogu tanımlıyor ve
`"source": "./"` ile "plugin bu reponun kökünde" diyor. Yani ayrı bir katalog reposu
gerekmiyor — repoyu kaydeden plugin'i de kurabilir.

### GitHub'dan (normal kullanım)

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

İlk komut katalogu makinene kaydeder (bir kez), ikincisi plugin'i kurar.

> **Repo private ise** `marketplace add` senin git kimliğinle klonlar; kuracak kişinin
> repoya erişimi olmalı (SSH anahtarı ya da `gh auth`). Erişimi yoksa komut klonlama
> hatası verir — plugin hatası değildir.

**Ekip halinde kullanıyorsanız** katalogu proje kapsamında tanımlayabilirsiniz:

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c --scope project
```

Bu, katalog kaydını projenin ayarlarına yazar; repoyu açan herkeste hazır gelir,
kimse elle `marketplace add` çalıştırmak zorunda kalmaz.

### Yerel dizinden (bu plugin'i geliştirirken)

```bash
claude plugin marketplace add /path/to/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

Kaynak dosyaları düzenleyip test etmek için. **Sürümü artırmayı unutma** —
`plugin update` içeriğe değil sürüm numarasına bakar (bkz. sorun giderme).

### Kurulumu doğrula

```bash
claude plugin validate /path/to/claude-plugin-d2c --strict
claude plugin list
```

> **Yeni kurulan plugin'in agent'ları bir sonraki oturumda kayda girer.** Kurduktan
> sonra Claude Code'u yeniden başlatın. "Dosya duruyor" kanıt değil — `/d2c` ilk adımda
> `design-diff` ve `visual-diff`'i gerçekten çağırarak smoke testi yapar.

## Proje konfigürasyonu

Her projede kök dizinde `.d2c.json`. Yoksa `/d2c` ilk çalıştırmada sorup oluşturur.

```jsonc
{
  "styling": { "tailwind": 4, "themeFile": "app/globals.css" },
  "componentsDir": "components",
  "previewDir": "app",
  "devCommand": "npm run dev",
  "devPort": 3005,
  "fonts": ["<tasarımın gövde fontu>", "<tasarımın başlık fontu>"],
  // XD spec panelinin gösterdiği aile adları — projede YÜKLÜ olmalı,
  // yoksa metin ölçüleri sessizce kayar (önkoşul #6 bunu yakalar).
  "reportDir": "docs/d2c",
  "writeAllowlist": ["components/**", "app/**", "docs/d2c/**"],
  "extractorStrategy": "auto"
}
```

`extractorStrategy`: **`auto`** (varsayılan) ağ yolunu kullanır, sözleşme bozuksa
teşhisle durur · **`network`** yalnız ağ · **`legacy`** 1.4.0 davranışı
(chrome-devtools MCP + playbook probe yöntemi). Legacy yol korunuyor.

Tailwind v3 kullanıyorsanız: `"styling": { "tailwind": 3, "config": "tailwind.config.js" }`

## İlk çalıştırma

```
/d2c https://xd.adobe.com/view/<id>/screen/<screen-id>/specs/
```

Ekranı bölümlere ayırır, haritayı gösterir, hangi bölümü üreteceğinizi sorar.

| Komut | Ne yapar |
|---|---|
| `/d2c <link> [bölüm\|hepsi]` | Uçtan uca: ayrıştır → ölç → üret → doğrula → review |
| `/d2c-spec <link> [bölüm]` | Yalnız ölçüm, kod üretmez |
| `/d2c-code <link\|rapor> <bölüm>` | Yalnız kod üretimi + doğrulama halkası |
| `/d2c-verify <bileşen\|rota>` | Mevcut kodu yeniden doğrular |

## Güncelleme

```bash
/plugin update d2c     # yeniden başlatma gerekir
```
