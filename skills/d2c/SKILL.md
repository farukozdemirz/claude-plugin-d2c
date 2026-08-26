---
name: d2c
description: "XD linkinden tek komutla çalışır: ekranı bölümlere ayırır, seçilen bölümleri sırayla ölçüp Tailwind + React koduna çevirir, ölçüm + görsel + review halkasından geçirir."
argument-hint: <xd-link> [ekran no|bölüm no|"hepsi"]
---

# d2c

Tek giriş noktası. `/d2c-spec` ve `/d2c-code`'u sen çağırmazsın — bu komut sırayla
yürütür.

**Argüman:** XD linki. İsteğe bağlı ikinci argüman: ekran numarası, bölüm numarası
veya `hepsi`. Verilmezse bölüm haritasını gösterip sorar.

## İlk iş

`references/segmentation.md`'yi oku. Ayrıştırma yöntemi iki ekranda doğrulanmış —
alternatifini (probe ile başlık avlama) deneme, çalışmıyor.


## Script yolları

Script çağırmadan önce plugin kökünü çöz. `CLAUDE_PLUGIN_ROOT` plugin bağlamında
ortam değişkeni olarak gelir; gelmezse (repo içi geliştirme kurulumu) yedek zincir
devreye girer:

```bash
D2C_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$D2C_ROOT" ]; then
  # Kurulu plugin: ~/.claude/plugins/cache/<marketplace>/<plugin>/<sürüm>/
  # (sürüm alt dizini VAR — doğrulandı, ilk yazımda atlanmıştı)
  # Birden çok sürüm kurulu kalabilir; sürüm sırasına göre EN YENİSİ seçilmeli
  # (düz glob alfabetik sıralar ve 1.0.10'u 1.0.9'dan önce verir).
  for c in $(ls -d "$HOME"/.claude/plugins/cache/*/d2c/*/ 2>/dev/null | sort -Vr) \
           "$HOME"/.claude/plugins/*/d2c \
           "$HOME"/.claude/skills/d2c \
           ./.claude; do
    [ -f "$c/skills/d2c-code/scripts/component-inventory.py" ] && D2C_ROOT="${c%/}" && break
  done
fi
[ -z "$D2C_ROOT" ] && echo "HATA: plugin kökü bulunamadı" && exit 1
echo "D2C_ROOT=$D2C_ROOT"
```

Bundan sonra tüm script çağrıları `"$D2C_ROOT/skills/.../scripts/..."` biçiminde.
**Repo-göreli yol yazma** — plugin başka bir projede çalışacak.

## 0. Önkoşul kontrolü — eksikse DUR

Sessiz başarısızlık en pahalı hata. Sırayla kontrol et, ilk eksikte dur ve söyle.

| # | Kontrol | Nasıl | Eksikse |
|---|---|---|---|
| 1 | chrome-devtools MCP | `mcp__chrome-devtools__*` araçları var mı **ve gerçekten çağrılabiliyor mu** | `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated` — **`--isolated` şart**, yoksa ikinci oturum profili açamaz (bkz. sorun-giderme) |
| 2 | `design-diff` agent | Agent aracıyla **gerçekten çağır** ve `mcp__chrome-devtools__list_pages`'i **çağırt** | Cevap dönmesi kanıt değil — araç sayısı 0 olabilir. Plugin ajanında MCP erişimi `tools:` içindeki `mcp__chrome-devtools__*` deseniyle verilir; `mcpServers:` **plugin ajanlarında yok sayılır**. Proje kopyası varsa `d2c:` önekiyle çağır, yoksa yanlış kopyayı test edersin. Yeni kurulan plugin bir sonraki oturumda kayda girer. |
| 3 | `visual-diff` agent | aynı | aynı |
| 4 | Python + PIL | `python3 -c "import PIL"` | `visual-diff.py` ve `section-map.py` bunsuz çalışmaz |
| 5 | `.d2c.json` | Repo kökünde var mı | Yoksa **sor ve oluştur** (aşağıya bak) |
| 6 | Fontlar | `.d2c.json`'daki her aile projede yüklü mü — canvas genişlik testi (`document.fonts.check` YALAN SÖYLER, bkz. `design-diff` §3) | **Dur ve söyle.** Doğrulanmış: 5 eleman sessizce Arial'a düştü, ölçüler doğru görünüp aile yanlış kaldı. |
| 7 | Kilit | `<reportDir>/.d2c.lock` var mı | Varsa **dur** — bkz. §5 |

## 0b. `.d2c.json`

Repo kökünde aranır. **Yoksa kullanıcıya sorup oluştur; okumadan kod üretimine başlama.**

```jsonc
{
  "styling": { "tailwind": 4, "themeFile": "app/globals.css" },
  // Tailwind v3 ise: { "tailwind": 3, "config": "tailwind.config.js" }
  "componentsDir": "components",
  "previewDir": "app",              // doğrulama sayfalarının yazılacağı yer
  "devCommand": "npm run dev",
  "devPort": 3005,                  // 3000 dolu olabilir
  "fonts": ["Bw Modelica", "Tobias"],
  "reportDir": "docs/d2c",
  "writeAllowlist": ["components/**", "app/**", "docs/d2c/**"]
}
```

| Alan | Kullanımı |
|---|---|
| `styling.tailwind` | **4**: tema `themeFile` içinde `@theme` bloğu, `tailwind.config.js` YOK. **3**: `config` dosyası okunur. Token önerileri buna göre biçimlenir. |
| `componentsDir` | Üretilen bileşenler + envanter taraması burada |
| `previewDir` | `<previewDir>/<slug>-preview/page.tsx` doğrulama sayfaları |
| `devCommand` / `devPort` | Doğrulama ajanları bunu kullanır. Port doluysa boş port seç ve **açtığın sayfanın doğru uygulama olduğunu** `document.title` + beklenen seçiciyle teyit et. |
| `fonts` | Önkoşul kontrolü #6 |
| `reportDir` | Tüm rapor çıktısı. Repo kökünü kirletme. |
| `writeAllowlist` | **Bu kalıpların dışına YAZMA.** Kalıp dışı bir dosya değiştirmen gerekiyorsa dur ve sor. |

## 1. Ekranı seç

Linki aç (playbook §2-4). `/screen/<id>` varsa o ekran; yoksa ekran listesini çıkar
(playbook §12) ve kullanıcıya sor.

Aynı sayfanın **mobil karşılığını** da bul — ekran adları eşleşir
("Desktop - Ekran A" ↔ "Mobil - Ekran A"). İkisi de ölçülecek.

## 2. Bölüm haritası

`references/segmentation.md`'deki dört adımı uygula: kalibrasyon → bant taraması →
boş satır analizi → isimlendirme. Çıktıyı tabloya dök:

```
#   Y aralığı        yükseklik  zemin     bölüm
10  2923 – 3653      730        #FAFAFA   "Bölüm Başlığı" (48px)
```

Haritayı `<reportDir>/bolum-haritasi-<ekran>.json` olarak kaydet — sonraki
çalıştırmalar ayrıştırmayı tekrar yapmasın. **Kalibrasyonu da bu dosyaya yaz**
(`{"kalibrasyon": {"desktop": {...}, "mobil": {...}}}`): aynı ekranın sonraki bölümleri
XD'yi yeniden konumlandırmasın. Beş bölümlü bir ekranda bu tek başına dört kalibrasyon
turu tasarrufu demek.

Argümanda bölüm belirtilmediyse haritayı göster ve **hangi bölüm(ler)** diye sor.
`hepsi` denirse sırayla hepsini üret.

## 3. Her bölüm için: `/d2c-code`

Seçilen her bölüm için `d2c-code` skill'ini çağır (Skill aracı). Bölüm
tarifini haritadan üret: bölüm adı + tasarım kutusu (`Y..H`, tam genişlik).

`/d2c-code` kendi içinde şunları yapıyor, tekrar etme:
3a envanter → 3 kod → 4 `design-diff` → 4b `visual-diff` → 4c `/code-review` + regresyon.

Bölümler arasında **durma**; biri başarısız olursa kaydet ve sıradakine geç, sonda
topluca raporla.

## 3b. Hız bütçesi — araç çağrısı say

Bu boru hattında **süre ≈ araç çağrısı sayısı × ~15 sn**. Darboğaz tarayıcı değil,
çağrı başına model gecikmesi. Ölçüldü: `design-diff` 124 sn / 7 çağrı, `visual-diff`
612 sn / 53 çağrı. Bekleme sürelerini kısaltmak toplamda 1 dakika bile kazandırmaz;
**tek kaldıraç çağrı sayısıdır.**

Tek bölüm için hedef bütçe:

| Faz | Çağrı |
|---|---|
| Kurulum + kilit + envanter | 3 |
| Kalibrasyon (playbook §24, **tek çağrı**) | 1-2 |
| Ölçüm probe'ları (**toplu** — §10) | 4-6 |
| Referans yakalama (ölçüm fazında) | 2-3 |
| Kod + önizleme sayfası | 3-4 |
| Düzeltme + ön kontrol (her tur **tek** çağrı) | 2-4 |
| Rapor + telemetri | 2 |
| **Skill toplamı** | **~18** |
| `design-diff` ×2 · `visual-diff` ×1 | (ajanlar) |

**En sık israf edilen yerler:**
1. Pan/zoom deneme-yanılma → playbook **§24** rutinini kullan, improvize etme.
2. Kod fazında XD'ye geri dönmek → `olcum.json` zaten hazır (§4).
3. Düzeltme sonrası ayrı `navigate` + `emulate` + `evaluate` → **tek** `evaluate_script`.
4. Ajanı erken çağırmak → önce kendi ön kontrolünü yap; her ajan turu 2-4 dk.
5. **Refleksle iki ajanı birden çalıştırmak** → `d2c-code` §4b'deki "hangi ajan"
   tablosuna bak; salt konum düzeltmesi görsel tur gerektirmez.

## 3c. Zaman tavanı — 25 dakika

Ölçülen gerçek bir koşu **106 dakika** sürdü. Dağılımı, neyin patladığını gösteriyor:

| | Süre | Pay |
|---|---|---|
| Ana döngü (ölçüm + kod + rapor) | 57,3 dk | %54 |
| `visual-diff` **3 tur** | 35 dk | %33 |
| `design-diff` **4 tur** | 13,2 dk | %13 |

İki ders:
- **Ana döngü ajanlardan büyük.** Neredeyse tamamı pan/zoom deneme-yanılması ve
  tekrar eden konumlandırma — §24 ve `olcum.json` bunun içindir.
- **Maliyeti tur sayısı belirliyor**, tur başına maliyet değil. `design-diff` 4 turun
  tamamına dayanmış, `visual-diff`'in ise o zaman hiç sınırı yoktu.

**Bir bölüm 25 dakikayı aşarsa dur.** Kullanıcıya nerede olduğunu ve sürenin nereye
gittiğini söyle (kaç ölçüm turu, kaç görsel tur, hangi bulgu kapanmıyor). Devam edip
etmemeye o karar versin. **Sessizce bir saat harcama.**

## 4. Rapor

Her şey `<reportDir>` altına (varsayılan `docs/d2c/`) — repo kökünü kirletme:

```
docs/d2c/
  bolum-haritasi-<ekran>.json
  <bolum-slug>/spec.md        ← /d2c-spec çıktısı (insan için)
  <bolum-slug>/olcum.json     ← /d2c-spec çıktısı (SONRAKİ FAZLAR için)
  <bolum-slug>/xd-<vp>.png    ← görsel diff referansı, ölçüm fazında yakalandı
  <bolum-slug>/code.md        ← /d2c-code çıktısı
  ozet.md                     ← tüm bölümlerin tek tablosu
```

`ozet.md`: bölüm | ölçüm turu | sapma | görsel diff | review bulgusu | sonuç.

**`olcum.json` boş geçilemez.** Kalibrasyon, referans PNG yolu ve kırpma kutusu orada
tutulur; yoksa kod fazı XD'ye geri döner ve `visual-diff` çapayı yeniden türetir —
bölüm başına **~15 araç çağrısı ≈ 4 dakika** kayıp. Şeması `d2c-spec` SKILL.md'de.

## 5. Eşzamanlılık — kilit

chrome-devtools MCP tarayıcısı **paylaşımlı ve tek**. Aynı anda ikinci bir `/d2c`
çalıştırılamaz; ikisi birbirinin sayfasını devralır. Bu gerçekten yaşandı: arka planda
çalışan bir doğrulama ajanı ana ölçümün sayfasını devraldı ve ölçüm yarıda kesildi.

Başlarken:

```bash
LOCK="$REPORT_DIR/.d2c.lock"
if [ -f "$LOCK" ]; then
  echo "KİLİT VAR — başka bir /d2c çalışıyor olabilir:"; cat "$LOCK"
  echo "Süreç ölmüşse kilidi elle sil: rm $LOCK"
  exit 1
fi
mkdir -p "$REPORT_DIR"
printf '{"pid":%d,"baslangic":"%s","ekran":"%s"}\n' "$$" "$(date -Iseconds)" "$EKRAN" > "$LOCK"
```

Bitince (**hata durumunda da**) sil: `rm -f "$LOCK"`.

Doğrulama ajanlarını **`run_in_background: false`** ile çağır — arka planda çalıştırmak
tarayıcıyı senin altından çeker.

## 6. Telemetri

Her çalıştırma `<reportDir>/runs.jsonl`'a **bir satır** ekler (bölüm başına bir satır).

**Bölüme başlarken zaman damgasını al** — sonda hesaplayamazsın:

```bash
BASLANGIC=$(date +%s)
```

Bölüm bitince satırı yaz:

```bash
printf '%s\n' "{\"tarih\":\"$(date -Iseconds)\",\"surum\":\"$(python3 -c "
import json;print(json.load(open('$D2C_ROOT/.claude-plugin/plugin.json'))['version'])")\",...,\"sure_sn\":$(( $(date +%s) - BASLANGIC ))}" >> "$REPORT_DIR/runs.jsonl"
```

Tam şema:

```json
{"tarih":"2026-08-26T14:02:11+03:00","surum":"1.3.0","ekran":"Desktop - Ekran A","bolum":10,"bolum_ad":"Bölüm Başlığı","artboardlar":["1440x3778","375x4164"],"olcum_turu":2,"sapma":0,"gorsel_diff":{"ham":7.81,"yapisal":10.03,"aksiyon":0},"review_bulgu":10,"review_uygulanan":6,"cozulemedi":1,"sonuc":"tamam","sure_sn":842}
```

`sonuc`: `tamam` · `sapmayla-bitti` · `basarisiz` · `atlandi-zaten-var`

**`sure_sn` ve `surum` boş geçilemez.** Aracın isabet oranı *ve hızı* bu dosyadan çıkar;
`surum` olmadan bir iyileştirmenin işe yarayıp yaramadığı karşılaştırılamaz. Bu alanlar
`null` bırakıldığı için 1.2.0'ın hız kazancı ölçülemedi — tekrarlama.

Karşılaştırma:

```bash
python3 - <<'EOF'
import json, collections
d = collections.defaultdict(list)
for l in open("docs/d2c/runs.jsonl"):
    r = json.loads(l)
    if r.get("sure_sn"): d[r.get("surum","?")].append(r["sure_sn"])
for v, s in sorted(d.items()):
    print(f"{v}: n={len(s)} ortanca={sorted(s)[len(s)//2]}sn ort={sum(s)//len(s)}sn")
EOF
```

## 7. Öğrendiğini kaydet

Yeni bir tuzak ya da kalıcı bir karar çıktıysa **plugin'in kural dosyasına** yaz —
`playbook.md` (ölçüm), `tailwind.md` (kod üretimi), `quality.md` (çıta). Bunlar
plugin'in içinde; eklenen madde bir sonraki sürümle tüm kullanıcılara gider.
Aracın zamanla iyileşmesi buna bağlı.

Projenin kendi karar günlüğü / ilerleme dosyası varsa (`CLAUDE.md` böyle bir kural
tanımlıyorsa) oraya da satır ekle. **Yoksa bu adımı atla** — dosya uydurma.
