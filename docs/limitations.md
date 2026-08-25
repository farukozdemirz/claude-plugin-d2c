# Sınırlar — aracın YAPAMADIKLARI

Bu liste kısaltılmaz. Bu araca güveni yaratan şey ne yaptığı değil, **ne
yapmadığının yazılı olması.** Bir sınırla karşılaşan geliştirici burada bulamazsa
araca güvenmeyi bırakır.

## Export edemedikleri

- **Vektör ikonlar.** XD viewer SVG vermiyor. Üretilen ikonların **kutusu ve rengi
  ölçülmüştür, yolu yaklaşıktır.** Gerçek örnek: kullanıcı ikonu ilk çizimde mürekkep
  kutusu 15×17 kaldı (hedef 19×19, %20 dar); görsel diff yakaladı, iki turda 18×19'a
  çıktı, 1px artık kaldı. Birebir sonuç için tasarımcıdan SVG isteyin.
- **Görseller.** Ürün fotoğrafı, logo, illüstrasyon indirilemiyor. Doğru boyutta
  placeholder + `TODO` bırakılır.

## Okumadıkları

- **Etkileşim ve state.** XD spec panelinde `Interactions` bölümü var (Trigger: Tap,
  Action: Transition, Destination: Toggle State, Duration 0.3s) — **hiç okunmuyor.**
  Hover state'leri, drawer açılma animasyonu, toggle'ın açık hali, form gönderimi
  üretilmiyor. Bileşenler Default State'in salt görsel karşılığıdır.
- **Kırılma noktası.** XD breakpoint bilgisi vermiyor. Artboard'lar 375 ve 1440 ise
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

## Çalışma biçiminden gelenler

- **Aynı repoda paralel `/d2c` çalıştırılamaz.** Kilit dosyası ikinciyi durdurur —
  iki çalıştırma birbirinin tarayıcı sayfasını devralır.
- **Farklı oturumlar `--isolated` olmadan birbirini kilitler.** chrome-devtools MCP
  argümansız kurulduğunda tüm sunucular aynı Chrome profilini kullanır ve profili ilk
  kapan kazanır; diğerleri `The browser is already running for .../chrome-profile`
  hatası alır. **Bu bir sınır değil, kurulum eksiğidir** — `--isolated` ile her oturum
  kendi geçici profilini alır ve paralel çalışabilirler (bkz. `installation.md`).
  Bu gerçekten yaşandı: paralel açılmış başka bir oturum profili tuttuğu için ölçüm
  hiç başlayamadı.
- **Yavaş.** Bir bölüm için tipik akış: ölçüm (~30 tıklama) + kod + 1-3 doğrulama turu
  + görsel diff (tur başına ~50 araç çağrısı) + review. Bölüm başına 10-20 dakika
  beklemek normaldir.
- **Tasarım hatalarını taklit etmez.** Elle yerleştirme sapmaları (ör. bir duyuru
  şeridi metninin merkezden 10px kayık olması) kodda düzeltilir ve **raporlanır** —
  gizlenmez, ama kopyalanmaz da. Kararı tasarımcı verir.
- **Referans değerler yanlış olabilir.** Elle yazılmış beklenen değerlerle ölçüm
  çelişirse **ölçüme uyulur** ve referans hatası raporlanır. Benchmark'ta iki referans
  değeri bu şekilde düzeltildi (bkz. `fixtures/benchmark.json` → `referans_duzeltmeleri`).
