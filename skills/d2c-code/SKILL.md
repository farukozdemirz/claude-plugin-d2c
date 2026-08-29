---
name: d2c-code
description: "XD ölçümünü Tailwind + React bileşenine çevirir; üretilen kodu tarayıcıda render edip design-diff ile ölçerek tasarımla karşılaştırır ve sapmaları kapatır."
argument-hint: <xd-link|rapor-yolu> [hedef bölüm]
---

# d2c-code

**Argüman:** ilk kelime XD linki **veya** mevcut bir rapor dosyasının yolu, kalanı hedef
bölüm tarifi. Örnek: `/d2c-code <reportDir>/<bolum>/spec.md "kart"`

## İlk iş

`references/tailwind.md` ve `references/quality.md`'yi oku. Oradaki kurallar tahminle yazılan Tailwind'in tasarımı
neden tutturmadığını ve nasıl önleneceğini anlatıyor.


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
    [ -f "$c/cli/dist/d2c.mjs" ] && D2C_ROOT="${c%/}" && break
  done
fi
[ -z "$D2C_ROOT" ] && echo "HATA: plugin kökü bulunamadı" && exit 1
echo "D2C_ROOT=$D2C_ROOT"
```

Bundan sonra tüm script çağrıları `"$D2C_ROOT/skills/.../scripts/..."` biçiminde.
**Repo-göreli yol yazma** — plugin başka bir projede çalışacak.

## Akış

### 1. Girdi

**Tek girdin `olcum.json`.** Bölüm kapsamlı ve kendi içinde yeterli: kutu · spacing ·
radius · renk · kontur · tipografi · metin · eleman ilişkileri (`ebeveyn`/`sira`) ·
`tekrar` (sıkıştırılmış diziler) · `hesaplanan` boşluklar.

> **`design.json`'ı AÇMA.** Tam scenegraph, yüzlerce KB; bağlama sokmak ölçüm
> maliyetini token'a taşır. İhtiyacın olan her değer `olcum.json`'da.

- Argüman **XD linkiyse**: `d2c-spec` skill'ini çağır; o `olcum.json` + `spec.md` üretir.
- Argüman **`olcum.json` / rapor yoluysa**: doğrudan oku.
- `olcum.json` yoksa (eski rapor): `d2c-spec` legacy yolunu uygula.

`tekrar` alanını doğru oku: `adet: 8, eksen: "x", adim: 332` demek **8 özdeş eleman,
332 px arayla** demek — `hesaplanan`'daki gap (332 − 316 = 16) aradaki boşluktur.
`duzenli: false` ise `konumlar` listesindeki her konum gerçektir.

### 2. Mobil + desktop

Aynı sayfanın iki artboard'ı olabilir (ör. "Desktop - Ekran A" ve "Mobil - Ekran A").
Ekran listesini gez (`xd-viewer-notlari.md` §12) ve **ikisini de ölç**:

- **Mobil değerler base**, **desktop `lg:` prefix'i**.
- Tek artboard varsa bunu raporda ve kodda açıkça belirt — responsive davranış
  uydurma, TODO bırak.
- İki artboard arasında eleman **sırası** değişiyorsa DOM'u kopyalama, `order-*` kullan.

### 3a. Bu bileşen zaten var mı?

**Kod üretmeden önce** mevcut envanteri çıkar:

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" inventory components
```

Çıktı her bileşenin XD kaynağını, ölçülerini, `data-testid`'lerini ve 3+ bileşende
tekrar eden gömülü hex'leri (token adayları) verir.

> **1.12.0: envanter AST tabanlı.** Eski regex script yalnız `export function` ve
> `export const` görüyordu; sentetik bir dosyada **5 export biçiminden 1'ini**
> buluyordu. `export default function Kart`, `export { Kart as UrunKart }`,
> `export * from` ve sınıf bileşenleri **görünmüyordu** — yani "bu bileşen yok"
> deyip var olanı yeniden yazma riski vardı.
>
> Parse edilemeyen dosya **sessizce atlanmaz**, `⚠ PARSE EDİLEMEDİ` olarak
> raporlanır ve çıkış kodu 1 olur; envanterin eksik olduğunu bilerek karar ver.
>
> Regex script `skills/d2c-code/scripts/component-inventory.py`'de **duruyor**
> (geri dönüş). Ölçtüğün spec ile karşılaştır:

- **Aynı XD elemanı** (aynı ekran + aynı `Rectangle`/`Path` adı) → yeni yazma, mevcut
  bileşeni kullan.
- **Aynı işi gören farklı varyant** (ör. iki ayrı yorum kartı) → yeni bileşen yazmadan
  önce mevcut olanı prop ile genişletmeyi değerlendir; genişletmiyorsan **neden
  ayrı olduğunu** raporda yaz.
- **Yeni** → devam et.

Token adayı çıktıysa raporun "önerilen token" bölümünde öne çıkar.

### 3a2. Varlıkları çıkar (ikon + görsel)

Bölümde vektör ikon veya görsel varsa (`olcum.json`'da `tip: "gorsel"` ya da
`gorselUid` dolu elemanlar), kod yazmadan önce tek komutla çıkar:

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" xd assets "<xd link>" --screen "<ekran>" \
  --out-dir public/d2c
```

Gerçek SVG ve gerçek görsel dosyası gelir — placeholder ve yaklaşık ikon çizme
gereği kalkar. `atlananlar` listesindeki her kalem için `{/* TODO */}` bırak.

### 3. Kod üret

**Önce font kutularını ÖLÇ.** `references/tailwind.md` → "fontKutusu'nu VARSAYMA".
Tek `evaluate_script` ile kullanacağın her aile/punto için `fontBoundingBox` topla ve
yarı-satırı gerçek sayıdan hesapla. `1.25 × punto` varsayımı Bw Modelica'da doğru,
**Tobias'ta 1.375** — varsaymak iki ayrı ekranda başlığı 4px kaydırdı ve her defasında
bir görsel diff turu harcattı. Bu tek çağrı o turu geri kazandırır.

Sonra `references/tailwind.md` kurallarına göre yaz. Bileşeni projenin mevcut yapısına
yerleştir (App Router; `componentsDir` yoksa oluştur). Doğrulanabilmesi için bileşeni
render eden bir sayfa rotası da lazım — yoksa `<previewDir>/<ad>-preview/page.tsx` aç.

Ölçülecek elemanlara **stabil `data-testid`** ver (`data-testid="yorum-karti"`).
`design-diff` bunları seçici olarak kullanacak; sınıf adlarına dayanmak kırılgan.

**`testid`'leri `olcum.json`'a geri yaz.** Ölçüm fazı elemanları XD adıyla biliyor
(`Rectangle 7931`), sen onlara `testid` verdin. İkisini eşleştirip `elemanlar[]`
dizisindeki ilgili kayda `"testid"` alanını ekle. `design-diff` hedef tablosunu bu
dosyadan okuyacak — eşleme olmazsa okuyamaz (§4).

### 4. Doğrula

**Önce ölçümü kendin çalıştır — tek komut:**

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" render verify \
  --olcum "<reportDir>/<bolum-slug>/olcum.json" --url "<render url>" \
  --json -o "<reportDir>/<bolum-slug>/verification.json"
```

Viewport + scrollbar telafisi, doğru-uygulama teyidi, font kontrolü, rect +
computedStyle, tolerans — hepsi içinde. **~1,3 sn.** Çıktı makine okunur.

`sapan` yoksa ajanı hiç çağırma. Sapan varsa `design-diff` ajanına
`verification.json` yolunu ver — o **sebebi** yorumlar.

> `testid`'ler `olcum.json`'da `null` ise komut **ölçmez** ve söyler. §3'te
> doldurulmuş olmalı.

`playwright-core` yoksa (`d2c doctor` söyler) legacy yola düş: `design-diff` ajanını
MCP'li haliyle çağır — o yol **korunuyor**.

#### Legacy: ajanla elle ölçüm

`design-diff` subagent'ını çağır. **Hedef tablosunu prompt'a ELLE YAZMA** —
`olcum.json`'un yolunu ver, ajan `Read` ile kendisi okusun. Elle transkripsiyon hem
prompt'u şişiriyor (ekran başına 30+ satır) hem de sessiz hata kaynağı: yanlış
yazarsan ajan yanlış şeyi doğrular ve kimse fark etmez.

Prompt'una şunları ver:
- **`<reportDir>/<bolum-slug>/olcum.json` yolu** — hedefler, `testid` eşlemesi,
  artboard genişlikleri hepsi orada
- sayfa URL'i (dev server çalışıyorsa "zaten çalışıyor" de, yeniden başlatmasın)
- ölçülecek viewport'lar
- **kabul edilen sapmalar** (border-box, metin çerçevesi, yaklaşık ikonlar, eksik
  fontlar) — bunlar `olcum.json`'da yok, prompt'ta olmalı

Font ailesi hedefleri `elemanlar[].font.aile` alanından gelir; **"bu tasarımın fontu X"
gibi genel bir cümle yazma.** Ajan bunu "her eleman X olmalı" diye okuyup, tasarımın
bilerek başka aile kullandığı elemanlar için **yanlış ✗** üretiyor. Projede yüklü
olmayan aileler için (`Helvetica Neue` gibi) prompt'ta "⚠ say, ✗ sayma" de.

**Tarayıcı çakışması:** `design-diff` ile aynı chrome-devtools MCP tarayıcısını
paylaşıyorsun. Subagent'ı **arka planda başlatıp** sen de XD ölçmeye devam edersen
sayfayı birbirinizin altından çekersiniz. Ya doğrulamayı `run_in_background: false` ile
çalıştır, ya da subagent çalışırken tarayıcıya hiç dokunma (dosya/rapor işi yap).

Dönen tabloda sapan varsa **kodu düzelt ve subagent'ı tekrar çağır**.

**Düzeltmeden sonra kendi ön kontrolünü TEK çağrıda yap.** Ayrı `navigate` + ayrı
`emulate` + ayrı `evaluate_script` üç araç çağrısı ≈ 45 sn demek; hepsi tek
`evaluate_script`'e sığar:

```js
async () => {
  location.reload();                    // ya da zaten yüklüyse atla
  await new Promise(r => setTimeout(r, 1200));
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 500));
  const k = document.querySelector('[data-testid="bolum"]').getBoundingClientRect();
  const g = (id) => { const e = document.querySelector(`[data-testid="${id}"]`);
    if (!e) return null; const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(2), y_rel: +(r.y - k.y).toFixed(2),
             w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  return { viewport: window.innerWidth,
           tasma: document.documentElement.scrollWidth > window.innerWidth,
           olculen: Object.fromEntries(['id1','id2','id3'].map(i => [i, g(i)])) };
}
```

Ön kontrol tuttuysa `design-diff`'i çağır; tutmadıysa **çağırma**, önce düzelt —
her ajan turu ~2-4 dk.

- En fazla **4 tur**.
- 4 turda kapanmayan sapmalar raporda **"çözülemedi"** olarak, sebebiyle birlikte
  yazılır. **Gizleme, tolerans gevşetme, hedef değeri değiştirme yok.**
- `⚠ font eksik` notu gelirse bu bir başarısızlık değil — raporda uyarı olarak geçir.

### 4b. Görsel doğrula

Sayısal tablo kutuları doğrular, **içlerini doğrulamaz.** Doğrulanmış: üç ekran da sayısal
olarak temiz çıktı; ilk görsel karşılaştırma `line-clamp-3`'ün eklediği `…` karakterini
hemen yakaladı.

1. **Karşılaştırmayı kendin çalıştır — tek komut:**

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" visual diff \
  --olcum "<reportDir>/<bolum-slug>/olcum.json" \
  --xd-url "<xd link>" --screen "<ekran adı>" \
  --url "<render url>" --testid "<bölüm testid>" \
  --out-dir "<reportDir>/<bolum-slug>/gorsel"
```

Referans indirme (HTTP, XD viewer açılmaz), render yakalama, piksel karşılaştırma ve
**hazır kırpmalar** — hepsi içinde, **~2,7 sn**. Çıktı `visual.json`.

Sapan bölge yoksa ajanı **hiç çağırma**. Varsa `visual-diff` ajanına `visual.json`
yolunu ver — o kırpmalara **bakıp** ne gördüğünü söyler.

#### Legacy: ajanla elle yakalama

2. `visual-diff` subagent'ını çağır ve **hazır kırpma kutusunu ver**, çapayı
   türettirme. Prompt'a: `olcum.json`'daki `referans.png` yolu + `referans.kirpma` +
   `referans.esleme`, render URL'i + seçici + viewport, ve **bilinen/kabul edilen
   farklar** (export edilemeyen görseller, yaklaşık ikonlar, eksik fontlar).
   *Ölçülen fark:* çapayı ajana türettirmek görsel diff'i **19 dk**'ya çıkarıyor;
   hazır kutu verildiğinde **10 dk**.
3. Dönen tabloda "aksiyon gerektiren" varsa **düzelt**, sonra aşağıdaki kurala göre
   ne çalıştıracağına karar ver.

Yüzde bir geçme notu değil — ajanın "ne gördüm" satırlarına bak.

#### Görsel tur bütçesi — EN FAZLA 2

`design-diff`'in 4 turu var; **`visual-diff`'in 2 turu var.** Sebebi maliyet: bir görsel
tur 8-17 dk, bir ölçüm turu 3 dk. Ölçülen gerçek koşu: 3 görsel tur **35 dakika**
yedi ve toplam süreyi 106 dakikaya çıkardı.

**Düzeltmeden sonra tam bir görsel tur ÇALIŞTIRMA — önce hedefli doğrula.**
Bulguların çoğu tek bir sayıyla doğrulanabilir (kutu 50 oldu mu, ürün adı x=160'a
oturdu mu, `resize` kapandı mı). Bunu §4'teki tek çağrılık ön kontrolle yap.

İkinci görsel turu **yalnızca** şu ikisinden biri varsa çalıştır:

- Düzeltme **yeni piksel üretiyorsa** (eleman eklendi/çıkarıldı, ikon değişti, sarma
  noktası kaydı) — hedefli ölçüm bunu göremez.
- Ön kontrol bulgunun kapandığını **doğrulayamıyorsa**.

Salt konum/boyut düzeltmeleri için ikinci tur **gereksiz**: `design-diff` zaten ölçüyor.

**2 turda kapanmayan görsel bulgular `code.md`'ye "çözülemedi" olarak yazılır** —
sebebiyle birlikte. Gizleme yok, ama üçüncü tur da yok.

#### Düzeltme sonrası hangi ajan?

| Ne düzelttin | Çalıştır |
|---|---|
| Konum / boyut / renk / font | `design-diff` (tek başına) |
| Eleman eklendi-çıkarıldı, ikon, sarma noktası | `design-diff` **+** `visual-diff` |
| Yalnız erişilebilirlik / semantik | hiçbiri — ön kontrol yeter |

Her ikisini birden çalıştırmak refleks olmasın: ölçülen koşuda 3 görsel tur otomatik
olarak 3 ölçüm turu daha getirdi ve maliyet çarpımsal büyüdü.

### 4c. Kod incele

Ölçüm ve görsel kapandıktan sonra:

1. `references/quality.md`'deki listeyi kendi kodunda gözden geçir.
2. `/code-review` çalıştır; bağlam olarak `quality.md` + o bölümün `code.md`'si ver.
3. Bulguları uygula.
4. **`design-diff`'i tekrar çalıştır** — refactor hizayı bozmuş olabilir.

Uygulanmayan bulgular raporda gerekçesiyle yazılır.

### 5. Çıktı

`docs/d2c/<bolum-slug>/code.md` (repo köküne yazma):
- Karşılaştırma tablosu (`design-diff`in son turu, viewport başına)
- Kullanılan token'lar / arbitrary değerler
- **Config'e eklenmesi önerilen token'lar** (Tailwind v4: `app/globals.css` içindeki
  `@theme` bloğuna) — sen ekleme, öner
- **Görsel diff sonucu** — aksiyon gerektiren farklar ve neden kapatılamadıysa sebebi
- **Review sonucu** — uygulanan / uygulanmayan bulgular
- TODO'lar (indirilemeyen görseller, eksik fontlar, tek artboard'dan dolayı bilinmeyen
  responsive davranış, çözülemeyen sapmalar)

Üretilen dosyaların yollarını terminalde özetle.

### 6. Öğrendiğini kaydet

Ölçüm sırasında yeni bir tuzak bulduysan plugin'in kural dosyasına ekle
(`playbook.md` / `tailwind.md` / `quality.md`) — bir sonraki sürümle herkese gider.

Projenin kendi karar günlüğü varsa oraya da satır ekle; **yoksa atla.**
