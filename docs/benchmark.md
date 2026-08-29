# Benchmark — temel ölçüm ve karşılaştırma

Bu dosya, deterministik mimariye geçişin kazancını **kanıtlanabilir** kılmak için var.
Depo bu hatayı bir kez yaptı: 1.2.0'ın hız kazancı, `sure_sn` boş bırakıldığı için
ölçülemedi. Buradaki sayılar o hatanın tekrarlanmaması içindir.

> **Kural:** Elle yazılmış beklenen değerlerle ölçüm çelişirse **ölçüme uyulur** ve
> referans hatası raporlanır. Bu dosya ölçümün kaydıdır.

---

## 1. Asıl metrik: araç çağrısı sayısı

Bu boru hattında **süre ≈ araç çağrısı × model gecikmesi**. Darboğaz tarayıcı değil,
çağrı başına gecikme. Dolayısıyla iyileştirmenin ölçüsü süre değil, **çağrı sayısıdır**:

- Süre gürültülüdür (model gecikmesi, ağ, makine yükü).
- Çağrı sayısı deterministik adımların sayımıdır — tekrarlanabilir.

Çağrı sayısı **transcript'ten** ölçülür, modele saydırılmaz:

```bash
node cli/test/bench/count-tool-calls.mjs --project <hedef-proje>
node cli/test/bench/count-tool-calls.mjs --project <proje> --since <ISO> --until <ISO> --json
```

Ayrıntı: [`cli/test/bench/README.md`](../cli/test/bench/README.md)

---

## 2. Temel ölçüm — 1.4.0 öncesi legacy davranış

**Kaynak:** Kabul testinin üç ekranı (a/b/c), 2026-08-25 tarihli gerçek koşular.
Transcript'lerden geriye dönük ölçüldü; yeni koşu yapılmadı.
Pencereler, gözlemlenebilir olaylara çapalandı: `/d2c-spec` komutundan başlar, o bölümün
**son doğrulama ajanının bitişinde** biter.

| Bölüm | Pencere (UTC) | Ana döngü | Ajan çağrısı | **Toplam** | Süre |
|---|---|---:|---:|---:|---:|
| a — Ürün Yorumları | 18:36:15 – 19:44:27 | 107 | 83 | **190** | 68,2 dk |
| b — Yorum listesi | 19:44:27 – 20:42:11 | 52 | 70 | **122** | 57,7 dk |
| c — Değerlendir drawer | 20:42:11 – 21:37:13 | 69 | 70 | **139** | 55,0 dk |
| **Ortanca** | | **69** | **70** | **139** | **57,7 dk** |
| **Toplam (3 bölüm)** | | 228 | 223 | **451** | 180,9 dk |

### Doğrulama ajanları — tur başına maliyet

| Ajan | Tur | Çağrı (tur başına) | Süre (tur başına) |
|---|---|---|---|
| `design-diff` | 5 | 14 · 11 · 14 · 10 · 7 → **ortanca 11** | 208 · 140 · 228 · 184 · 124 sn → **ortanca 184 sn** |
| `visual-diff` | 3 | 58 · 56 · 53 → **ortanca 56** | 1166 · 960 · 612 sn → **ortanca 960 sn** |

`visual-diff` üç turda **2738 saniye** (45,6 dk) yedi — üç bölümün toplam süresinin
**%25'i**, tek bir doğrulama adımı için.

### Yöntem doğrulaması

Ölçüm yöntemi, kural dosyalarında **bağımsız olarak kayıtlı** iki değeri birebir
üretti (`playbook.md` §20'nin "kontrol elemanıyla doğrula" disiplini):

| `skills/d2c/SKILL.md` §3b'de yazan | Transcript'ten ölçülen |
|---|---|
| `visual-diff` 612 sn / 53 çağrı | "Visual diff drawer c" → **612 sn / 53 çağrı** ✓ |
| `design-diff` 124 sn / 7 çağrı | "round 2 regression c" → **124 sn / 7 çağrı** ✓ |

Sayım güvenilir.

### Referans düzeltmesi — ana döngü çağrı sayısı

Mimari plan, ana döngü çağrısını deponun kendi formülüyle **türetmişti**:
`57,3 dk ÷ 15 sn ≈ 229 çağrı`. Doğrudan ölçüm bunu doğrulamıyor:

| | Değer |
|---|---|
| Türetilmiş (formülle) | ~229 çağrı / bölüm |
| **Ölçülen** | **52 – 107 çağrı / bölüm** (ortanca 69) |

**Sebep:** `~15 sn/çağrı` ortalaması alt ajanlar için iyi çalışıyor (kısa, tek amaçlı
çağrılar) ama ana döngüde uzun `Bash`, büyük `evaluate_script` ve aradaki düşünme
süresi formülü şişiriyor.

**Sonuç:** Hedef değişmiyor — çıkarma + bölüm haritası tek çağrıya inecek. Ama kazanç
iddiası artık ölçülen tabana dayanıyor. Mimari plandaki türetilmiş sayı, bu dosya
tarafından **düzeltilmiştir**.

---

## 3. Tarihsel kayıtlar (dokümanlardaki ölçümler)

Ana planın dayandığı, kural dosyalarında kayıtlı diğer ölçümler:

| Kaynak | Ölçüm |
|---|---|
| `skills/d2c/SKILL.md` §3c | Tek bölüm koşusu **106 dk**: ana döngü 57,3 dk (%54) · `visual-diff` ×3 35 dk (%33) · `design-diff` ×4 13,2 dk (%13) |
| `skills/d2c-code/SKILL.md` §4b | Kalibrasyon çapası hazır verilince görsel diff **19 dk → 10 dk** |
| `skills/d2c/SKILL.md` §4 | `olcum.json` yokluğu bölüm başına **~15 çağrı ≈ 4 dk** |
| `skills/d2c-spec/references/playbook.md` §24 | Tek çağrılık kalibrasyon, deneme-yanılmadaki **10-15 çağrının** yerine geçer |
| `docs/limitations.md` | Ölçüm ~30 tıklama · görsel diff tur başına ~50 çağrı · bölüm başına 10-20 dk "normal" |

§3c'deki 106 dk'lık koşu, §2'deki üç koşudan **farklı** bir koşudur (o bölümde
`design-diff` 4, `visual-diff` 3 tur çalışmış). §2'nin üç koşusu 55-68 dk aralığında.

---

## 4. Hedefler

Mimari plandan; "ne zaman" sütunu milestone'u gösterir.

| Metrik | Ölçülen (temel) | Hedef | Milestone |
|---|---|---|---|
| XD çıkarma + bölüm haritası — Claude çağrısı | ana döngünün büyük kısmı | **1** | M1 |
| XD çıkarma süresi | — | **< 5 sn** | M1 |
| `design-diff` — tur başına çağrı | ortanca 11 | **1** | M2 |
| `visual-diff` — tur başına çağrı | ortanca 56 | **3** | M3 |
| Bölüm başına toplam çağrı | ortanca **139** | — | — |
| Bölüm başına süre | ortanca **57,7 dk** | < 20 dk | M3 |

**M1'in tek sayısal kabul ölçütü:** bir bölümün `olcum.json`'ı üretilene kadar harcanan
Claude araç çağrısı sayısı → **1**. M1'de kod üretimi, doğrulama ve review süreleri
değişmeyecek ve bu başarısızlık sayılmayacak.

---

## 5. Karşılaştırma yöntemi

- Aynı üç fixture ekranı, aynı hedef proje, aynı fontlar yüklü.
- Her koşu `<reportDir>/runs.jsonl`'a bir satır; `surum` ve `sure_sn` **boş geçilemez**.
- Çağrı sayısı bench aracıyla ölçülür ve satıra `arac_cagrisi` olarak yazılır.
- **Ortanca** raporlanır, ortalama değil (n küçük, uç değerler yanıltır).
- Sürüm bazlı karşılaştırma (`skills/d2c/SKILL.md` §6'daki parçacık):

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

---

## 6. Ham veri

- Instrümanlı telemetri: `<hedef-proje>/docs/d2c-kabul/runs.jsonl`
  (`olcum_kaynak: "transcript-geri-donuk"` işaretli; yedek: `runs.jsonl.yedek-faz0`)
- Transcript'ler: `~/.claude/projects/<kodlanmış-proje-yolu>/`
- Ölçüm aracı: `cli/test/bench/count-tool-calls.mjs`
