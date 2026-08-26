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
    [ -f "$c/skills/d2c-code/scripts/component-inventory.py" ] && D2C_ROOT="${c%/}" && break
  done
fi
[ -z "$D2C_ROOT" ] && echo "HATA: plugin kökü bulunamadı" && exit 1
echo "D2C_ROOT=$D2C_ROOT"
```

Bundan sonra tüm script çağrıları `"$D2C_ROOT/skills/.../scripts/..."` biçiminde.
**Repo-göreli yol yazma** — plugin başka bir projede çalışacak.

## Akış

### 1. Girdi

- Argüman **XD linkiyse**: `d2c-spec` skill'ini çağır (Skill aracı) ve akışını uygula;
  playbook `$D2C_ROOT/skills/d2c-spec/references/playbook.md`. `<reportDir>/<bolum-slug>/spec.md`
  üret. Sonra 2. adıma geç.
- Argüman **rapor dosyası yoluysa**: dosyayı oku. Yanında `olcum.json` varsa
  **onu da oku** — kalibrasyon, referans PNG ve kırpma kutusu oradadır.
- Rapor hedef bölümü içermiyorsa ölçümü tamamla (playbook §6-11), rapora ekle.

### 2. Mobil + desktop

Aynı sayfanın iki artboard'ı olabilir (ör. "Desktop - Ekran A" ve "Mobil - Ekran A").
Ekran listesini gez (playbook §12) ve **ikisini de ölç**:

- **Mobil değerler base**, **desktop `lg:` prefix'i**.
- Tek artboard varsa bunu raporda ve kodda açıkça belirt — responsive davranış
  uydurma, TODO bırak.
- İki artboard arasında eleman **sırası** değişiyorsa DOM'u kopyalama, `order-*` kullan.

### 3a. Bu bileşen zaten var mı?

**Kod üretmeden önce** mevcut envanteri çıkar:

```bash
python3 "$D2C_ROOT/skills/d2c-code/scripts/component-inventory.py"
```

Çıktı her bileşenin XD kaynağını, ölçülerini, `data-testid`'lerini ve 3+ bileşende
tekrar eden gömülü hex'leri (token adayları) verir. Ölçtüğün spec ile karşılaştır:

- **Aynı XD elemanı** (aynı ekran + aynı `Rectangle`/`Path` adı) → yeni yazma, mevcut
  bileşeni kullan.
- **Aynı işi gören farklı varyant** (ör. iki ayrı yorum kartı) → yeni bileşen yazmadan
  önce mevcut olanı prop ile genişletmeyi değerlendir; genişletmiyorsan **neden
  ayrı olduğunu** raporda yaz.
- **Yeni** → devam et.

Token adayı çıktıysa raporun "önerilen token" bölümünde öne çıkar.

### 3. Kod üret

`references/tailwind.md` kurallarına göre. Bileşeni projenin mevcut yapısına yerleştir
(App Router; `components/` yoksa oluştur). Doğrulanabilmesi için bileşeni render eden
bir sayfa rotası da lazım — yoksa `app/<ad>-preview/page.tsx` aç.

Ölçülecek elemanlara **stabil `data-testid`** ver (`data-testid="yorum-karti"`).
`design-diff` bunları seçici olarak kullanacak; sınıf adlarına dayanmak kırılgan.

### 4. Doğrula

`design-diff` subagent'ını çağır. Prompt'una şunları ver:
- sayfa URL'i (veya "dev server'ı sen başlat" — 3000 dolu olabilir, boş port seçmeli)
- ölçülecek `data-testid` seçicileri
- her seçici için **XD hedef değerleri** (rapordan, P ve hesaplanan olanlar)
- ölçülecek viewport'lar (mobil + desktop artboard genişlikleri)
- **her eleman için beklenen font ailesi ayrı ayrı** — "bu tasarımın fontu X" gibi genel
  bir cümle yazma. Agent bunu "her eleman X olmalı" diye okuyup, tasarımın bilerek başka
  aile kullandığı elemanlar için **yanlış ✗** üretiyor. Hedefi elemanla birlikte ver:
  `başlık: Tobias Light`, `tarih: Helvetica Neue (projede yok, fallback normal)`.

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

1. **`<reportDir>/<bolum-slug>/olcum.json`'u oku — XD'ye GERİ DÖNME.** Referans PNG,
   kalibrasyon ve kırpma kutusu ölçüm fazında zaten hazırlandı. Dosya yoksa (eski bir
   rapor ya da elle verilmiş spec) playbook §23 ile yakala; **varsa yakalama.**
2. `visual-diff` subagent'ını çağır ve **hazır kırpma kutusunu ver**, çapayı
   türettirme. Prompt'a: `olcum.json`'daki `referans.png` yolu + `referans.kirpma` +
   `referans.esleme`, render URL'i + seçici + viewport, ve **bilinen/kabul edilen
   farklar** (export edilemeyen görseller, yaklaşık ikonlar, eksik fontlar).
   *Ölçülen fark:* çapayı ajana türettirmek görsel diff'i **19 dk**'ya çıkarıyor;
   hazır kutu verildiğinde **10 dk**.
3. Dönen tabloda "aksiyon gerektiren" varsa düzelt ve **hem `design-diff`'i hem
   `visual-diff`'i** tekrar çalıştır (görsel düzeltme ölçüyü bozmuş olabilir).

Yüzde bir geçme notu değil — ajanın "ne gördüm" satırlarına bak.

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
