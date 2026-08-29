# Üretilen bileşenin kalite çıtası

`design-diff` tablosu temiz olması **yeterli değil**. Ölçüm sayısal; gözle yanlış,
bakımı zor veya erişilemez bir bileşen de o tablodan geçer. Aşağıdakiler
`/code-review` çalıştırılmadan önce kendi kendine kontrol edilir, sonra review'a
bu liste verilir.

## 1. Ölçü kaynağı izlenebilir olmalı — **kodda değil, raporda**

Kodda görünen her sayının nereden geldiği anlaşılmalı. Ama bu **yorum satırlarıyla
yapılmaz**: izlenebilirlik `<bolum-slug>/code.md` raporunun işidir.

> **KOD YORUMSUZ ÜRETİLİR.** Açıklayıcı yorum, JSDoc bloğu, "kaynak: XD ekran 4/24"
> notu — hiçbiri bileşen dosyasına yazılmaz. Bunlar rapora gider.

- **Arbitrary değerler için yorum YOK.** `mt-[9px]`, `w-[316px]`, `pb-[26px]` çıplak
  yazılır. Nereden geldikleri `code.md`'deki ölçü tablosunda durur.
- **Bileşen başına JSDoc bloğu YOK.** Tekrar kullanım kontrolü artık `d2c inventory`
  ile AST üzerinden çalışıyor (export'lar, `data-testid`'ler, ölçü sınıfları);
  JSDoc'a ihtiyacı yok.
- **`code.md` şu üçünü taşımalı** — koddan çıkan bilgi buraya yazılır:
  1. eleman → sınıf → ölçü tablosu (okunan / hesaplanan ayrımıyla)
  2. **yarı-satır telafisi uygulanan her değer**, hangi elemandan türediğiyle.
     `mt-[4.5px]` gibi bir sayı raporda da açıklanmazsa sonraki geliştirici onu
     "yuvarlanmamış hata" sanıp düzeltir ve hizayı bozar — bu gerçekten yaşandı.
  3. varsayım yapılan yerler ve nedeni

### Tek istisna: ölçülmemiş değer

**Ölçülmemiş hiçbir değer sessiz kalmamalı.** Rapor bir değeri içermiyorsa ve kod onsuz
yazılamıyorsa, o satıra `{/* TODO: <ne ölçülmedi> */}` bırakılır ve raporda da yazılır.

Bu bir açıklama değil, **eksik veri işaretidir**: uydurulmuş bir sayıyı sessizce doğru
göstermek bu deponun en temel kuralını çiğner. Süslemek için yorum yazma; yalnız
gerçekten eksik olanı işaretle.

## 2. Semantik ve erişilebilirlik

- Doğru eleman: kart `<article>`, başlık `<h2>/<h3>`, tarih `<time>`, tıklanabilir
  `<button>`/`<a>`, form alanı `<label>` + `<input>/<textarea>` (id eşleşmeli).
  Her şeyi `<div>` yapma.
- Yalnız görsel olan SVG'lerde `aria-hidden`; anlam taşıyanlarda `aria-label`.
- Metinsiz ikon butonlarında `aria-label` zorunlu.
- Yıldız/puan gibi bileşenlerde değeri metin olarak da ver (`aria-label="5 yıldız"`).
- Toggle: `role="switch"` + `aria-checked`.
- Renk **tek başına** anlam taşımamalı.
- Başlık seviyeleri atlanmamalı (h2'den h4'e atlama).

## 3. Bileşen sözleşmesi

- Dışarıdan sınıf alan bileşende `twMerge` — yoksa çağıranın `p-4`'ü bileşenin
  `p-6`'sıyla çakışır ve kazananı CSS sırası belirler.
- Props tiplenmiş ve `export` edilmiş olmalı (tekrar kullanım kontrolü için).
- İçerik hard-coded olmamalı: metinler props'tan gelmeli. Tek istisna, tasarımda
  sabit olan etiketler ("Tümünü Gör", "Gönder").
- Sunum bileşeni veri çekmemeli, state tutmamalı.

## 4. Responsive

- Mobil base, desktop `lg:`. Tek artboard varsa responsive **uydurulmamalı**, TODO.
- İki artboard arasında sıra değişiyorsa DOM kopyalanmamalı — `order-*`.
- Sabit yükseklik yerine padding + içerikten türetme; zorunluysa `min-h-*`.
- Yatay taşma olmamalı: `document.scrollWidth === innerWidth` (design-diff ölçer).

## 5. Token disiplini

- Temada birebir karşılığı olan renk için token sınıfı; yoksa arbitrary **ve**
  rapora "eklenmesi önerilen token" satırı.
- `@theme` bloğu kendiliğinden değiştirilmez — paylaşılan bir yüzeydir, tek bir
  bileşen için değiştirmek başka ekranları etkiler.
- Aynı hex üç ayrı bileşende arbitrary olarak geçiyorsa bu artık bir token adayıdır —
  raporda **öne çıkar**, sessizce dördüncü kez yazma.

## 6. Ölü kod ve tutarlılık

- Kullanılmayan prop, import, `data-testid` bırakma.
- `data-testid` yalnız doğrulama için var; ürün kodunda davranış bağlama.
- Aynı ikon iki bileşende kopyalanmışsa ortak bir dosyaya çıkar.
- Dosya/dizin adlandırması projedeki mevcut düzene uymalı.
- **Koddaki her tanımlayıcı İNGİLİZCE.** Dosya adı, bileşen adı, prop, değişken,
  `data-testid`, CSS token adı — hepsi. Tasarım Türkçe olsa da kod İngilizce yazılır:
  `ProductCard.tsx` / `<ProductCard>` / `data-testid="product-card"`, `UrunKarti` değil.
  Türkçe **yalnız** kullanıcıya görünen metinlerde ve raporda kalır.
  Bu dosyaların Türkçe yazılmış olması seni yanıltmasın — kural üretilen KOD içindir.

## 7. Review'a ne verilir

`/code-review` çalıştırılırken bu dosya + o bölümün `code.md`'si bağlam olarak verilir.
Review'dan beklenen: yukarıdaki maddelerin ihlalleri **ve** genel doğruluk/basitlik
bulguları. Review bulguları uygulandıktan sonra `design-diff` **tekrar** çalıştırılır —
bir refactor hizayı bozmuş olabilir.
