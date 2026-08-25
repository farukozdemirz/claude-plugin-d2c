# XD spec playbook

Gerçek bir oturumda doğrulanmış, çalışan yöntemler. Alternatiflerini deneme.

1. **WebFetch/curl asla çalışmaz.** XD viewer bir SPA; artboard canvas'a çizilir, DOM'da
   içerik yoktur. Tek yol chrome-devtools MCP.
2. **Aç:** `new_page` ile linki aç (timeout 60-90 sn). Spec paneli için URL `.../specs/`
   ile bitmeli; değilse sonuna `specs/` ekle. `/screen/<id>` yoksa ilk ekran açılır.
3. **Geniş viewport:** `emulate`/`resize_page` ile ~1600×1000 — sağ panel tam görünsün.
4. **Diyaloglar:** "Grid View" tanıtım kutusu çıkarsa metni "OK" olan butonu tıkla.
   Alttaki mavi hotspot/pan toast'ı zararsız. **"Sign in" ve "Home screen" butonlarına
   tıklama** — Home bazı linklerde Adobe auth'a redirect eder; olursa `navigate_page` ile
   specs URL'ine geri dön. Parola formu görürsen kullanıcıdan parolayı iste.
5. **Önce snapshot:** `take_snapshot` sağ paneli metin verir: breadcrumb'da ekran adı,
   "N of M" sayacı, Viewport/Design size, TÜM renklerin hex listesi, Character Styles
   (aile, ağırlık, px, renk). Renk/tipografiyi buradan al.
6. **Zoom:** header'daki zoom textbox'ını (snapshot'ta value "50%" olan) `fill` + Enter.
   ~%22-25 uzun mobil artboard'ı komple gösterir; %50 genel bakış; %75-100 okunur detay.
7. **Pan:** klavye ve scroll ÇALIŞMAZ. Canvas'a wheel dispatch et (ctrl'süz — ctrl+wheel
   zoom yapar). deltaY dikey, deltaX yatay:
   ```js
   const el = document.elementFromPoint(500, 500); // canvas
   for (let i = 0; i < 8; i++)
     el.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, deltaX: 0,
       bubbles: true, cancelable: true, clientX: 500, clientY: 500 }));
   ```
8. **Eleman seçme:** MCP `click` aracı canvas içini seçemez (uid yok). Koordinata sentetik
   pointer+mouse dizisi gönder, sonra ~600ms bekle:
   ```js
   const clickAt = (x, y) => {
     const el = document.elementFromPoint(x, y);
     const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
       buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
     ['pointermove','pointerdown','pointerup'].forEach(t =>
       el.dispatchEvent(new PointerEvent(t, { ...o, buttons: t === 'pointerup' ? 0 : 1 })));
     ['mousemove','mousedown','mouseup','click'].forEach(t =>
       el.dispatchEvent(new MouseEvent(t, { ...o,
         buttons: (t === 'mousemove' || t === 'mousedown') ? 1 : 0 })));
   };
   ```
9. **Spec panelini oku** (tıklamadan sonra):
   ```js
   const readPanel = () => {
     const all = [...document.querySelectorAll('div,aside,section')];
     const c = all.filter(e => e.offsetWidth > 280 && e.offsetWidth < 420 &&
       e.offsetHeight > 300 && /px/.test(e.innerText || ''));
     if (!c.length) return 'panel yok';
     c.sort((a, b) => a.innerText.length - b.innerText.length);
     return c[c.length - 1].innerText.replace(/\n{2,}/g, '\n');
   };
   ```
   Panel şunları verir: eleman tipi+adı (Text/Rectangle/Path/Group/Component), W/H/X/Y
   (TASARIM pikseli), radius ("8px8px8px8px"), dolgu, border (renk+kalınlık+Inner/Center
   stroke), tipografi ve hazır CSS bloğu (`/* Layout Properties */`, `/* UI Properties */`).
   Tipografi satırı kalıbı: `Size14pxAlignmentLeft-0.2px170` → 14px boyut, -0.2px
   letter-spacing, **sondaki sayı line-height** (17.0 → panelde 170 görünür).
10. **Toplu ölçüm:** birden çok noktayı TEK `evaluate_script` içinde tıkla-bekle-oku
    (aralarda 550-650ms sleep), her nokta için `readPanel()` sonucunu döndür.
11. **Doğrulama döngüsü:** tıklanan noktada beklenen eleman çıkmayabilir (üst Group
    seçilir). Panel başlığındaki eleman adını kontrol et; yanlışsa birkaç px kaydırıp
    tekrar tıkla. Akış: screenshot (jpeg, quality 80-88) → görsel konum → tıkla →
    panel adıyla doğrula.
12. **Ekran gezinme:** alt barda aria-label "Previous screen"/"Next screen" butonları;
    sayaç `document.body.innerText.match(/(\d+) of (\d+)/)`. Tüm ekranları listelemek
    için Next ile döngü; her adımda breadcrumb'daki adı + Design size'ı topla.
13. **Koordinat ölçekleri:** paneldeki X/Y/W/H tasarım pikselidir (zoom'dan bağımsız);
    tıklama koordinatları viewport pikselidir. İkisini karıştırma.
14. **Boşluk hesabı:** padding/gap panelde YOKTUR; komşu kutuların X/Y/W/H farkından
    hesapla (sol padding = içerik.x − kutu.x; gap = kutu2.x − (kutu1.x + kutu1.w)).
15. **Screenshot:** her zaman jpeg + quality 80-88; fullPage nadiren gerekir.

---

## Ek: doğrulama oturumunda bulunanlar

16. **Path elemanlarında radius YOK.** Panel `radius` satırını yalnız **Rectangle** için
    verir. Kart/kutu bir `Path` ise (tipik: XD'de köşesi yuvarlatılmış vektör), panelde ne
    `radius` satırı ne de CSS bloğunda `border-radius` çıkar — §9'daki alan listesine
    güvenip "radius 0" deme. Bu durumda radius'u **pikselden ölç**:
    - `emulate` ile `<w>x<h>x3` (deviceScaleFactor 3) + zoom %200 → tasarım pikseli başına
      6 cihaz pikseli. (Zoom textbox'ı %200'de tavan yapar; canvas WebGL olduğu için
      `getImageData` çalışmaz — `take_screenshot` + `filePath` ile PNG'ye al, Python/PIL
      ile oku.)
    - Kenar rengini (ör. `#D7DFE9`) filtreleyip uzun dikey/yatay şerit koşularını bul;
      şerit merkezleri kutunun **geometri kenarları**dır. Panel W/H ile doğrula — birebir
      tutmalı (tutmuyorsa ölçekleme yanlış, düzeltmeden devam etme).
    - Köşede, düz kenardan sapmayı ölç: `sapma(k) = r − √(r² − (r−k)²)`, k = köşeden
      uzaklık. r'yi en küçük kareler ile çöz. **Köşe yayına düz kenar parçası karıştırıp
      çember fit'i yapma** — R'yi şişirir; sapma profili yöntemi güvenli.
17. **Alt eleman seçilemiyorsa üst Group gelir ve ısrar etmek işe yaramaz.** Aynı bölgeye
    tekrar tıklamak hiyerarşide yukarı çıkar. Ölçüyü pikselden almak (§16) çoğu zaman
    tıklamayı zorlamaktan hızlıdır — özellikle tekrar eden ızgara elemanlarının
    aralarındaki boşluk için.

    **Ama önce birkaç piksel DIŞARI kay.** Küçük bir glifin üstüne tıklamak glifi verir;
    aradığın kutu çoğu zaman glifin *çevresindeki halkada* seçilebiliyordur. Doğrulanmış
    örnek: kapatma butonu — glif `Path C` 10×10, çember `Rectangle H` **47.2×47.2**,
    yani glifin çevresinde ~18 tasarım px'lik tıklanabilir halka var. Glifin üstüne
    tıklandığında hep `Path C` geliyor; köşeye doğru 6 px kaydırıldığında çember
    geliyor (üç bağımsız noktadan doğrulandı). Bir kutuyu "ölçülemedi" diye raporlamadan
    önce elemanın **kenarını** dene.
18. **Metin kutusu ≠ mürekkep.** İkon/glif elemanlarının panel genişliği yan boşlukları
    (side bearing) içerir; pikselden ölçülen mürekkep kutusu ~1px dar çıkar. Konum
    karşılaştırırken ikisini karıştırma.
19. **Bir artboard'da ölçtüğün değeri diğerine taşıma.** Aynı işi gören, aynı adı taşıyan
    iki eleman iki artboard'da farklı olabilir. Doğrulanmış örnek: "Bölüm Başlığı"
    özet barı desktop'ta radius **12**, mobilde radius **8**; üstelik desktop'taki bir
    `Path`, mobildeki bir `Rectangle`. Her artboard'ı ayrı ölç — "mobilde 8'di, desktop
    da 8'dir" çıkarımı yanlış kod üretir.
20. **Piksel ölçümünü kontrol elemanıyla doğrula.** §16'daki radius ölçümünü yaparken,
    aynı ekranda panelin radius verdiği bir `Rectangle` varsa **onu da ölç**. Bilinen
    değeri tutturuyorsan yöntem güvenilir; tutturamıyorsan ölçek veya kenar tespiti
    yanlıştır ve Path ölçümüne de güvenme. (Doğrulanmış: panel 8 diyen mobil bar
    pikselden 7.01 çıktı — r=8 RMS 0.633, r=12 RMS 2.072. Yöntem 8'i 8 okuyor.)
21. **Stroke'lu iki kutu arasındaki boşluk üç farklı sayı verir.** *Center Stroke*'ta
    geometri kenarı ile görsel kenar yarım stroke kayar: 2px stroke'lu iki 48×48
    butonda panel geometrisinden **17**, görsel dıştan **15** çıkar. Hangisini
    raporladığını yaz; CSS `border` kutunun içine çizdiği için koddaki `gap` geometri
    değerine değil görsel değere yakın durur.
22. **Seçilemeyen elemanı Character Styles listesinden eleme ile tanımla.** Bazı metinler
    XD grubunun içinden seçilemiyor — kaç kez tıklarsan tıkla panel üst `Group`'u
    veriyor (§17). Böyle bir durumda: seçimi kaldır (artboard dışına tıkla), panelin
    **Character Styles** listesini oku ve elemanın görünen özelliklerine (punto, renk)
    uyan tek stili bul. Aile + ağırlık + punto + renk buradan gelir; **line-height
    gelmez** — onu ölçemediğini raporda belirt.
    ```js
    // secimi kaldirdiktan sonra: aile -> stil eslesmeleri
    const t = document.body.innerText, i = t.indexOf('Character Styles');
    const L = t.slice(i, i + 4000).split('\n').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (let k = 0; k < L.length - 1; k++)
      if (/px,\s*#/.test(L[k+1]) && /,/.test(L[k])) out.push(L[k] + ' -> ' + L[k+1]);
    ```
    Bu bir çıkarımdır, panel okuması değil — raporda `P*` gibi ayrı işaretle.
23. **Görsel karşılaştırma için referans yakalama.** Bölümü kırpılmamış ve tasarım
    çözünürlüğünde yakalamak gerekiyor:
    - **Ölçek:** `emulate` ile dpr **2** + zoom **%50** → 1 tasarım pikseli = 1 cihaz
      pikseli. (dpr 3 + %200 ölçüm için; referans için gereksiz büyük.)
    - **Kadraj:** bölümün tamamı kanvas alanına sığmalı. Sağdaki spec paneli ~380 CSS
      px yer kaplıyor; 1440'lık artboard %50'de 720 CSS px, rahat sığar.
    - `take_screenshot` + `filePath` ile PNG'ye al.
    - **Kırpma çapası:** bölüm zeminini kullanma — XD'nin kendi kanvas zemini de
      `#FAFAFA` ve ayırt edilemiyor. Bunun yerine bölüm içindeki **benzersiz renkli,
      dolu ve geniş** bir elemanı (lacivert bar gibi) kalibrasyon çapası seç ve tasarım
      kutusunu da ver. `visual-diff.py --kalibre "#0C2380:64,3133,1312,72"` bu çapanın
      en büyük dolu bloğunu bulup ölçek+offset türetir.
    - Çapanın **geniş kenarı ne kadar uzunsa ölçek o kadar hassastır**: 72px'lik bir
      kenarda 1px kenar yumuşatma hatası %1.4 ölçek hatası, bu da 730px'lik kırpmada
      10px kayma demek. Script bu yüzden ölçeği geniş kenardan türetiyor.

