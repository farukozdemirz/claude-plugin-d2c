# Sınırlar — aracın YAPAMADIKLARI

Bu liste kısaltılmaz. Bu araca güveni yaratan şey ne yaptığı değil, **ne
yapmadığının yazılı olması.** Bir sınırla karşılaşan geliştirici burada bulamazsa
araca güvenmeyi bırakır.

> **1.8.0 notu — bu listenin bir kısmı artık geçerli değil.** Ölçüm ağ tabanlı
> çıkarmaya (AGC scenegraph) geçtiği için aşağıdaki bazı maddeler çözüldü ya da
> çözülebilir hale geldi. **Hiçbiri silinmedi**; çözülenler `✅ ÇÖZÜLDÜ` ile
> işaretlendi ve gerekçesi yazıldı. Liste kısaltılmaz — bu araca güveni yaratan şey
> ne yapmadığının yazılı olması.

## Export edemedikleri  *(çoğu 1.10.0'da çözüldü)*

Hâlâ export edilemeyenler: **gradient dolgular** ve **maske/clipPath** birleştirmesi.
İkisi de sessizce atlanmıyor — `d2c xd assets` bunları `atlananlar[]` olarak
sebebiyle raporluyor (ölçüldü: bir ekranda 2 gradient düğümü).

- ~~**Boolean şekiller (`compound`).**~~ **✅ ÇÖZÜLDÜ (1.12.1)** — XD'de birleştirilmiş
  (union/exclude/subtract) şekiller `shape.type: "compound"` olarak geliyor ve
  ölçülmeden **sessizce düşüyordu**. İkinci bir gerçek tasarımda yakalandı:
  291 düğümün **10'u** compound, bilinmeyen tip oranı %3,44. `shape.path` boolean
  işlemin sonucunu taşıyor (doğrulandı: bbox'ı çocuklarının birleşimiyle birebir),
  yani normal bir yol gibi ölçülüyor. Oran **%0,00**'a, eleman sayısı 172 → **182**'ye çıktı.
  SVG export'unda `fill-rule="evenodd"` veriliyor — yoksa `exclude` ile açılan delik dolardı.


- ~~**Vektör ikonlar.**~~ **✅ ÇÖZÜLDÜ (1.10.0)** — `d2c xd assets` gerçek SVG
  üretiyor. AGC scenegraph yol verisini birebir taşıyor; yol artık *yaklaşık* değil.
  Doğrulandı: `user-icon` **18×19** olarak export edildi ve kaynak veriyle birebir
  tuttu. Özdeş ikonlar içerik bazlı tekilleştiriliyor (bir ekranda 73 → 43 dosya).
  **Referans düzeltmesi:** `limitations.md` eskiden hedefi **19×19** yazıyordu ve araç
  iki görsel diff turunda 18×19'a ulaşıp *"1px artık kaldı"* diye raporlamıştı.
  Kaynak veri **18×19** diyor — o "1px artık" yoktu, **elle yazılan referans yanlıştı.**
  *Eski durum:* XD viewer SVG vermiyor; ikonların kutusu ve rengi ölçülü, yolu
  yaklaşıktı. İlk çizimde mürekkep kutusu 15×17 kalmıştı (%20 dar). Üretilen ikonların **kutusu ve rengi
  ölçülmüştür, yolu yaklaşıktır.** Gerçek örnek: kullanıcı ikonu ilk çizimde mürekkep
  kutusu 15×17 kaldı (hedef 19×19, %20 dar); görsel diff yakaladı, iki turda 18×19'a
  çıktı, 1px artık kaldı. Birebir sonuç için tasarımcıdan SVG isteyin.
- ~~**Görseller.**~~ **✅ ÇÖZÜLDÜ (1.10.0)** — `d2c xd assets` görselleri indiriyor.
  Doğrulandı: bir ekranda **15 WebP** (8–247 KB) indi. Aynı görsel bir kez iner.
  `pattern.meta.ux.scaleBehavior` CSS `object-fit` karşılığını veriyor.
  *Eski durum:* ürün fotoğrafı, logo, illüstrasyon indirilemiyordu; doğru boyutta
  placeholder + `TODO` bırakılıyordu.

## Okumadıkları

- **Etkileşim ve state.** **⏳ M4'te çözülebilir** — `interactions.json` CDN'den
  erişilebilir durumda (trigger, action, duration, easing). Şu an **hiç okunmuyor.**
  Hover state'leri, drawer açılma animasyonu, toggle'ın açık hali, form gönderimi
  üretilmiyor. Bileşenler Default State'in salt görsel karşılığıdır.
- **Kırılma noktası.** XD breakpoint bilgisi vermiyor. *(değişmedi)* Artboard'lar 375 ve 1440 ise
  `lg: = 1024px` **varsayılıyor**. Tasarımcıdan teyit alın.
- **Yatay ayrıştırma.** Ekran ayrıştırma dikey çalışır; bir bölümün içindeki kolonlar
  ayrılmaz. Bölüm tek parça olarak ölçülür.
- **Serbest yerleşimli artboard'lar.** Ayrıştırma dikey akan sayfalar içindir.
  Dashboard, harita, kanvas tipi ekranlarda anlamlı bölüm haritası çıkarmaz.

## Üretmedikleri

- **Test yok.** Bileşen sonradan bozulursa haber veren bir şey yok. `/d2c-verify`
  elle çalıştırılır; CI'a bağlı değildir.
- **Tema token'ları otomatik eklenmiyor.** `@theme` bloğu paylaşılan bir yüzey;
  araç yalnız **öneri** yazar (3+ bileşende tekrar eden hex'leri öne çıkarır).
  Eklemeyi siz yaparsınız.
- **Veri katmanı yok.** Üretilen bileşenler sunum bileşenidir; props alır, veri çekmez.

## Ölçümün doğası gereği kapanmayanlar

- **`border-box` ile *Center Stroke* aynı şey değil.** XD'de 1px stroke geometri
  çizgisinin üzerinde durur ve padding geometri kenarından ölçülür; CSS'te border
  kutunun içine çizilir. 316 dış genişlik + 24 padding + 268 içerik CSS'te **aynı anda
  sağlanamaz** — biri 2px verir.
- **XD metin çerçevesi ≠ CSS satır kutusu.** Metin elemanlarının yüksekliği
  sistematik olarak farklı ölçülür (bkz. sorun-giderme). Yarı-satır telafisi konumu
  düzeltir, ama elemanın *kendi* yüksekliği XD'nin verdiği sayı olmaz.
- **Görsel diff yüzdesi bir geçme notu değil.** XD metni canvas'a, tarayıcı DOM'a
  çiziyor. Aynı font ve aynı ölçüyle bile metin ağırlıklı bir bölümde taban fark
  **%5-10**. Sayı göreli kullanılır; karar sapan bölgelerin görsel incelemesine dayanır.

- **Yapısal yüzde ALAN AĞIRLIKLI — küçük ama önemli farkı düşük puanlar.**
  1.12.0'da sentetik bir çiftle ölçüldü:

  | bozulma | ham | yapısal | sapan bölge |
  |---|---:|---:|---:|
  | 1px kayma (gürültü) | %15,44 | **%0,83** | **36** — sayfaya yayılmış |
  | ikon değişimi (gerçek hata) | %0,36 | **%0,79** | **6** — hepsi ikonun sütununda |

  Yani **yüzde ikisini sıralamıyor**: 24×24'lük bir ikon 240×160'lık sayfanın
  %1,5'i. Ayrım *bölge sayısı ve konumunda*: gürültü yayılır, gerçek hata kümelenir.
  Bu, "karar bölge incelemesine dayanır" kuralının somut kanıtı — kural bir üslup
  tercihi değil, ölçümün doğasından geliyor. (`cli/test/detection.test.mjs`)

## Çalışma biçiminden gelenler

- ~~**Aynı repoda paralel `/d2c` çalıştırılamaz.**~~ **✅ ÇÖZÜLDÜ (1.8.0)** — ağ
  yolunda paylaşımlı tarayıcı yok; doğrulama kendi Playwright oturumunu açıp kapatıyor.
  **Legacy modda hâlâ geçerli:** MCP tarayıcısı paylaşımlı ve tek.
- **Farklı oturumlar `--isolated` olmadan birbirini kilitler.** *(yalnız legacy mod)* chrome-devtools MCP
  argümansız kurulduğunda tüm sunucular aynı Chrome profilini kullanır ve profili ilk
  kapan kazanır; diğerleri `The browser is already running for .../chrome-profile`
  hatası alır. **Bu bir sınır değil, kurulum eksiğidir** — `--isolated` ile her oturum
  kendi geçici profilini alır ve paralel çalışabilirler (bkz. `installation.md`).
  Bu gerçekten yaşandı: paralel açılmış başka bir oturum profili tuttuğu için ölçüm
  hiç başlayamadı.
- ~~**Yavaş.**~~ **✅ ÇÖZÜLDÜ (1.6.0–1.8.0).** Ölçüm ~229 araç çağrısından **1**'e,
  render doğrulama 11 çağrı/184 sn'den **1 çağrı/1,3 sn**'ye, görsel karşılaştırma
  56 çağrı/960 sn'den **1 çağrı/2,7 sn**'ye indi. Kalan süre kod üretimi ve review —
  doğru yer. Ölçümler: `docs/benchmark.md`.
  *Eski durum:* bölüm başına 10-20 dakika beklemek normaldi.
- ~~**Görsel karşılaştırma Python + Pillow istiyor.**~~ **✅ ÇÖZÜLDÜ (1.11.0)** —
  piksel karşılaştırma TypeScript'e taşındı ve `cli/dist/d2c.mjs` içine gömüldü.
  Eşdeğerlik kanıtlandı: 8 durumda ham/yapısal fark **tam 0**, ısı haritası ve hazır
  kırpmalar **bayt bayt** aynı (2,7 MP'lik gerçek boyutta da 0).
  **Hâlâ Python isteyenler:** `extractorStrategy: "legacy"` (`section-map.py`, PIL) ·
  `visual diff --kalibre` çapa yolu (`visual-diff.py`, PIL) · `component-inventory.py`
  (PIL değil, yalnız stdlib — Faz 8'de ts-morph'a taşınacak).

- **`--kalibre` çapa mantığı TS'e taşınmadı.** Bilerek: thumbnail referansında ölçek
  tam biliniyor, çapa türetmeye gerek yok. Çapa gerektiren bir durumda motor
  **otomatik olarak Python'a düşüyor** ve bunu `visual.json`'daki `motor` alanına
  yazıyor — sessizce yaklaşık sonuç üretmiyor.

- **Tasarım hatalarını taklit etmez.** Elle yerleştirme sapmaları (ör. bir duyuru
  şeridi metninin merkezden 10px kayık olması) kodda düzeltilir ve **raporlanır** —
  gizlenmez, ama kopyalanmaz da. Kararı tasarımcı verir.
- **Referans değerler yanlış olabilir.** Elle yazılmış beklenen değerlerle ölçüm
  çelişirse **ölçüme uyulur** ve referans hatası raporlanır. Benchmark'ta iki referans
  değeri bu şekilde düzeltildi (bkz. `fixtures/benchmark.json` → `referans_duzeltmeleri`).
