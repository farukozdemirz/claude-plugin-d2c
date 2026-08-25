# Sorun giderme

Buradaki her madde bu aracı geliştirirken **gerçekten yaşandı**. Tahmini senaryo yok.

---

## Agent kayda giriyor ama chrome-devtools araçları YOK (0 araç)

**Belirti:** `design-diff` / `visual-diff` çağrılıyor, cevap veriyor — ama
`mcp__chrome-devtools__list_pages` çağrısı `No such tool available` diyor.
Ölçüm ve render yakalama imkânsız. Ajanın araç listesi yalnız `Bash, Read`.

**Sebep — belgelenmiş kısıt:** *Plugin* alt ajanları `mcpServers:` alanını
**desteklemiyor**; alan sessizce yok sayılıyor:

> "For security reasons, plugin subagents don't support the `hooks`, `mcpServers`,
> or `permissionMode` frontmatter fields. These fields are ignored when loading
> agents from a plugin."
> — code.claude.com/docs/en/sub-agents

Alan düştüğünde geriye kısıtlayıcı `tools:` listesi kalır → sıfır MCP aracı.

**Tuzak:** Aynı dosya `.claude/agents/` altındayken `mcpServers:` **çalışır**.
Proje kopyası duruyorsa smoke testi yanlışlıkla **geçer** — çalışan proje
kopyasıdır, plugin kopyası değil. Bu gerçekten yaşandı: byte-eş iki dosya,
proje kopyası 29 araç, plugin kopyası 0. Ajanı **`d2c:` önekiyle** çağırıp ayırt edin:

```
Agent(subagent_type: "d2c:design-diff")   # plugin kopyası
Agent(subagent_type: "design-diff")       # proje kopyası (varsa)
```

**Çözüm:** MCP erişimini `tools:` içinde sunucu deseniyle verin — `mcpServers:` yok:

```yaml
tools: Bash, Read, Glob, Grep, mcp__chrome-devtools__*
```

`mcp__<sunucu>__*` deseni o sunucunun **tüm** araçlarını verir (29 chrome-devtools
aracı). Tek tek araç adı yazmak da geçerlidir ama gereksiz ve kırılgandır.

**Dikkat:** "`tools:` MCP adlarını kabul etmiyor, `mcpServers:` kullanın" tavsiyesini
bir yerde görürsen o gözlem **proje ajanında** yapılmıştır; plugin ajanında geçerli değil.

**Not:** Agent kayıt defteri **oturum başında** yükleniyor. Frontmatter'ı
düzelttikten sonra Claude Code'u yeniden başlatın, yoksa eski kayıt sürer.

---

## `The browser is already running for .../chrome-profile`

**Belirti:** Herhangi bir `mcp__chrome-devtools__*` çağrısı şu hatayı veriyor:

```
The browser is already running for ~/.cache/chrome-devtools-mcp/chrome-profile.
Use --isolated to run multiple browser instances.
```

**Sebep:** MCP sunucusu **argümansız** kurulmuş. O zaman Chrome hep aynı sabit profille
açılıyor; Chrome bir profili tek seferde tek işleme veriyor. Birden çok Claude Code
oturumu varsa profili ilk kapan kazanır, diğerleri hiç tarayıcı açamaz.

**Çözüm — kalıcı:**
```bash
claude mcp remove chrome-devtools
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated
```
**Çalışan bir MCP sunucusunun argümanları değişmez** — yeni ayar ancak Claude Code
yeniden başlatılınca geçerli olur.

**Çözüm — anlık:** profili tutan Chrome'u bul ve kapat. Sahibini şöyle izleyin:

```bash
ls -l ~/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock   # -> ...-<chrome_pid>
ps -o ppid=,args= -p <chrome_pid>                                 # -> hangi MCP sunucusu
```
Başkasının oturumunu kapatmadan önce **sorun** — o oturum ölçüm yapıyor olabilir.

---

## `fullPage` ekran görüntüsü sayfayı yeniden diziyor

**Belirti:** `emulate({viewport:"1455x1000x1"})` yapıp `clientWidth === 1440`
doğruladınız, ama `fullPage: true` ile alınan görüntüde ölçüler 1455 düzenine ait
çıkıyor (1312'lik bar 1327 görünüyor).

**Sebep:** Chrome tam sayfa yakalarken kaydırma çubuğunu kaldırıp sayfayı **yeniden
diziyor**; 15px telafisi bu sırada layout'a geri dönüyor.

**Çözüm:** Sayfanın dikeyde sığdığı bir yükseklik emüle edin (ör. `1440x1300`) ve
**normal viewport** görüntüsü alın; `fullPage` kullanmayın. Yakaladıktan sonra
görüntüdeki bilinen bir elemanın genişliğini doğrulayın.

---

## Görsel diff kalibrasyonu yanlış elemana kilitleniyor

**Belirti:** `--kalibre "#0C2380:64,701.16,1312,72"` verdiniz ama kırpma tamamen kaymış;
ölçek 1.0 yerine tuhaf bir sayı çıkıyor.

**Sebep:** `visual-diff.py`'daki `bbox_of_solid_block` renk eşleşmesini **`tol=60`** ile
yapıyor. Ekranda çapaya yakın başka bir lacivert varsa (gerçek örnek: kampanya banner'ı
`#06205E`, `#0C2380`'e bu toleransta eşleşiyor) ve o blok **daha uzunsa**, script çapayı
onun üstüne kuruyor.

**Çözüm:** Çapa olarak bölüm içindeki **benzersiz** bir rengi seçin; aynı ekranda ikinci
bir yakın renk varsa referansı kendiniz dar toleransla (`tol≈12`) kırpıp script'e hazır
kırpılmış görüntüleri verin.

**Script bunu şöyle çözüyor:**
- `--kalibre-tol` bayrağı geldi (vars. 60) — çapa eşiği artık ayarlanabilir.
  `--tol` ile karıştırmayın: o fark eşiğidir (vars. 28).
- Blok seçimi artık "en uzun koşu" değil, **`--kalibre`'de verdiğiniz tasarım
  kutusunun en/boy oranına en yakın aday**. Sahte adaylar (banner gibi) 1-2 satır
  yüksekliğinde olduğu için oranları hedeften kat kat uzak düşüyor ve eleniyorlar.
  Ayrıca en geniş adayın %20'sinden dar olanlar atılıyor (7×1'lik bir leke de
  "doğru orana" sahip olabilir).
- İki aday da hedef orana yakınsa script artık **UYARI basıyor** — sessiz kalmıyor.

Doğrulama (üç gerçek referans, çapa `#0C2380`):

| Ekran | Eski (en uzun koşu) | Yeni (oran eşleşmesi) |
|---|---|---|
| (a) ürün yorumları | 1311×71 ✓ | 1311×71 ✓ |
| (b) yorum listesi | **1438×453 ✗ (banner)** | **1312×71 ✓ (ürün barı)** |
| (c) değerlendir drawer | 436×63 ✓ | 436×63 ✓ |

---

## Ölçüler doğru ama font yanlış — kimse fark etmiyor

**Belirti:** `design-diff` tablosu tertemiz; font-size, line-height, renk hepsi tutuyor.
Ama metin gözle yanlış görünüyor.

**Sebep:** `document.fonts.check('16px "Bw Modelica"')` **fallback varken de `true`
döner.** Aile yüklü olmasa bile tarayıcı "kullanılabilir" sayıyor. Testte hem
`Bw Modelica` hem `Helvetica Neue` için yanlış pozitif verdi.

**Çözüm:** Canvas genişlik karşılaştırması:
```js
const c = document.createElement('canvas').getContext('2d');
const s = 'ABCDEFGHIJ...0123456789';
const w = f => { c.font = `48px ${f}`; return c.measureText(s).width; };
const yuklu = ['monospace','serif'].some(fb => w(`"${aile}",${fb}`) !== w(fb));
```

**İlgili:** `next/font/local` üretilen aile adını değiştirir (`Bw Modelica` →
`bwModelica`). Kontrolü **üretilen** adla yapın.

---

## Bölüm kökünde font Arial'a düşüyor

**Belirti:** Kart doğru fontta, bölümün kendi metinleri (başlık, alt başlık, buton)
`Arial, Helvetica, sans-serif`.

**Sebep:** `globals.css`'te `body { font-family: Arial, ... }` var. Bileşen ailesini
yalnız alt bileşenlerde kurmuşsunuz; bölümün kendi metinleri body'nin fallback'ini
alıyor. Ölçüler doğru göründüğü için gözden kaçıyor.

**Çözüm:** Aileyi **bölümün kök elemanına** yaz. `design-diff`'e her elemanın computed
`fontFamily`'sini raporlatın.

---

## Port 3000 dolu / yanlış uygulamayı ölçtüm

**Belirti:** Ölçümler tuhaf; sayfa beklenen seçiciyi içermiyor.

**Sebep:** 3000'de başka bir proje çalışıyor.

**Çözüm:** `.d2c.json`'da `devPort` verin, ya da boş port seçin:
```bash
PORT=$(python3 -c "import socket;s=socket.socket();s.bind(('',0));print(s.getsockname()[1]);s.close()")
```
Açtıktan sonra **doğru uygulama olduğunu** `document.title` + beklenen seçiciyle teyit
edin. Seçici yoksa **ölçmeyin**.

---

## 1440'ta ölçtüm ama değerler 1425 çıkıyor

**Sebep:** Sayfa dikeyde taşıyorsa Chrome'un klasik kaydırma çubuğu ~15px yer kaplar;
1440'lık pencerede layout genişliği **1425** olur. 1312'lik bar 1297, 640'lık kart 632.5
çıkar.

**Çözüm:** Pencereyi 15px geniş emüle edin ve **doğrulayın**:
```
emulate({ viewport: "1455x1000x1" })  →  document.documentElement.clientWidth === 1440
```
Olmuyorsa ölçmeyin.

---

## Mobil viewport 375'e inmiyor

**Sebep:** `resize_page` Chrome'un minimum pencere genişliğine (~500px) takılıyor ve
sessizce daha geniş kalıyor — mobil ölçümü desktop ölçümüne çevirir.

**Çözüm:** `emulate({ viewport: "375x800x1" })`, sonra `window.innerWidth`'i doğrulayın.

---

## Panel radius vermiyor

**Belirti:** Kartın köşesi yuvarlak ama spec panelinde `radius` satırı yok.

**Sebep:** XD paneli radius'u **yalnız `Rectangle` için** veriyor. Eleman `Path` ise
ne `radius` satırı ne CSS bloğunda `border-radius` çıkar. "Radius 0" **deme**.

**Çözüm:** Pikselden ölç — `dpr 3` + zoom %200 (tasarım px başına 6 cihaz px), kenar
rengini izole et, köşede düz kenardan sapma profilini `r − √(r² − (r−k)²)` ile çöz.
**Aynı ekranda panelin radius verdiği bir Rectangle varsa onu da ölçüp yöntemi
doğrulayın.**

Doğrulanmış örnek: referans "radius 8" diyordu; ölçüm 12 verdi. Kontrol elemanı
(panel radius 8 diyen mobil bar) pikselden 7.01 çıktı → yöntem 8'i 8 okuyor, desktop'un
12'si gerçek.

---

## Kart yüksekliği tutmuyor, sapma aşağı indikçe büyüyor

**Sebep:** **XD metin çerçevesi ≠ CSS satır kutusu.** XD otomatik yükseklikli çerçeve
için `(n−1)×line-height + fontKutusu` verir; CSS `n×line-height` render eder. Fark
`line-height − fontKutusu` kadar ve **yarısı üstte, yarısı altta** durur. Birikir.

Bw Modelica'da `fontKutusu ≈ 1.25 × font-size`.

**Çözüm:** `line-height > fontKutusu` olan metnin üst ve alt boşluğunu yarı-satır kadar
kıs. Doğrulanmış: 16/27 gövde (yarıSatır 3.5) → `mt-[4.5px]` (XD 8) ve altına
`mt-[12.5px]` (XD 16) → kart 248.88, XD 248.89. Telafisiz hali 256 idi.

---

## Eleman tıklayınca hep üst Group seçiliyor

**Sebep:** XD bazı metinleri grubun içinden seçtirmiyor; kaç kez tıklarsanız tıklayın
panel `Group`'u veriyor.

**Çözüm:** Israr etmeyin. Seçimi kaldırın (artboard dışına tıklayın), panelin
**Character Styles** listesini okuyun ve elemanın görünen özelliklerine (punto, renk)
uyan tek stili bulun. Aile + ağırlık + punto + renk buradan gelir; **line-height
gelmez** — ölçemediğinizi raporlayın.

---

## Ölçüm yarıda kesildi / sayfa altımdan çekildi

**Sebep:** chrome-devtools MCP tarayıcısı **paylaşımlı ve tek**. Arka planda çalışan
bir doğrulama ajanı ana ölçümün sayfasını devraldı.

**Çözüm:** Doğrulama ajanlarını `run_in_background: false` ile çağırın. `/d2c`
çalışırken tarayıcıya dokunmayın. Kilit dosyası (`<reportDir>/.d2c.lock`) ikinci
çalıştırmayı durdurur; süreç ölmüşse elle silin.

---

## `line-clamp` ellipsis ekliyor, XD eklemiyor

**Sebep:** Tailwind v4 **standart** `line-clamp` üretiyor (`-webkit-box` değil). Orada
üç nokta `text-overflow` ile değil `block-ellipsis` ile yönetiliyor ve Chrome bunu
sunmuyor — `[text-overflow:clip]` **etkisiz**.

**Çözüm:** Kırpma mekanizmasını değiştirin: dış kutu sabit yükseklik + iç kutu
`max-h` + `overflow-hidden`.

---

## Yatay kaydırmalı şerit altındaki her şeyi aşağı itiyor

**Sebep:** `overflow-x-auto` klasik kaydırma çubuğu için 15px ayırıyor. Ölçümde
"24 olması gereken boşluk 39 çıktı" diye görünür.

**Çözüm:** `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`

---

## Zoom %25'in altına inmiyor

**Sebep:** XD viewer'ın zoom kutusu 25'te tabanlıyor (20/15/12 yazsanız da).

**Çözüm:** Uzun artboard'ın tamamını görmek için **pencereyi yükseltin**
(`resize_page` 1600×1400 → iç yükseklik ~1297; 3778px'lik artboard %25'te 944.5 px).

---

## Plugin script'ini bulamıyor

**Belirti:** `HATA: plugin kökü bulunamadı` ya da script çalışmıyor.

**Sebep:** `CLAUDE_PLUGIN_ROOT` boş ve yedek zincir yanlış yeri arıyor.

**Gerçek kurulum yolu sürüm alt dizini içerir:**
```
~/.claude/plugins/cache/<marketplace>/<plugin>/<sürüm>/
```
Örnek: `~/.claude/plugins/cache/d2c-marketplace/d2c/1.1.0/`

`~/.claude/plugins/<plugin>` gibi düz bir yol **yoktur**. Ayrıca güncellemeden sonra
eski sürüm dizinleri kalır — düz glob alfabetik sıralar ve `1.0.10`'u `1.0.9`'dan önce
verir. Yedek zincir `sort -Vr` ile en yeniyi seçmelidir.

---

## Kaynağı değiştirdim ama kurulu plugin eski kaldı

**Belirti:** Dosyayı düzelttiniz, `claude plugin update` çalıştırdınız,
`✔ d2c is already at the latest version` diyor ve eski davranış sürüyor.

**Sebep:** `plugin update` **sürüm numarasını** karşılaştırır, dosya içeriğini değil.
`plugin.json`'daki sürüm aynı kaldıysa cache hiç yenilenmez. Bir commit'i `--amend`
ettiyseniz veya sürüm artırmadan düzeltme yaptıysanız kurulu kopya bayat kalır.

**Çözüm:** Her içerik değişikliğinde **sürümü artırın**. Bayat olup olmadığını
doğrudan cache'e bakarak anlarsınız:

```bash
grep -rn "aradiginiz-degisiklik" ~/.claude/plugins/cache/*/d2c/<sürüm>/
```

---

## `claude plugin update d2c` → "Plugin not found"

**Sebep:** Güncelleme komutu **tam kimlik** istiyor.

```bash
claude plugin update d2c@d2c-marketplace     # doğru
claude plugin update d2c                     # "not found"
```

Güncelleme sonrası **yeniden başlatma** gerekir.

---

## Aynı isimli agent hem projede hem plugin'de

**Belirti:** Plugin kuruldu ama agent'ın eski davranışı sürüyor.

**Sebep:** Proje `.claude/agents/design-diff.md` ile plugin'in `agents/design-diff.md`'si
aynı adı taşıyor.

**Çözüm:** Plugin'e geçtikten sonra projedeki kopyaları silin — tek kaynak plugin olsun.
Kural dosyaları (playbook, tailwind, kalite, ayristirma) plugin içinde kaldığı sürece
eklenen her kural herkese yayılır; proje kopyası bunu bozar.
