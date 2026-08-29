# bench — araç çağrısı ölçümü

`count-tool-calls.mjs`, Claude Code transcript'lerinden **araç çağrısı sayısını**
deterministik olarak çıkarır.

## Neden bu araç var

d2c boru hattında darboğaz tarayıcı değil, çağrı başına model gecikmesi. Dolayısıyla
iyileştirmenin ölçüsü **süre değil çağrı sayısıdır**: süre gürültülü (model gecikmesi,
makine yükü), çağrı sayısı ise deterministik adımların sayımı.

Modele "kaç çağrı yaptın" diye sormak kırılgan ve doğrulanamaz — hata payı tam da
ölçmek istediğimiz büyüklükte. Transcript zaten diskte ve **geriye dönük** okunabiliyor.

## Kullanım

```bash
# Bir projenin tüm oturumları
node count-tool-calls.mjs --project <hedef-proje>

# Tek oturum
node count-tool-calls.mjs --session ~/.claude/projects/<proje>/<oturum>.jsonl

# Zaman penceresi (bir bölümün koşusunu izole etmek için)
node count-tool-calls.mjs --project <proje> \
  --since 2026-08-25T18:36:15Z --until 2026-08-25T19:44:27Z

# Makine okunur
node count-tool-calls.mjs --project <proje> --json
```

`--project` hem gerçek proje yolunu (`~/repos/x/y`) hem de doğrudan transcript dizinini
kabul eder; gerçek yol verilirse Claude Code'un kodlanmış dizin adına kendisi çevirir.

## Ne ölçer

| Katman | Kaynak |
|---|---|
| **Ana döngü** | `<oturum>.jsonl` içindeki `tool_use` blokları (`isSidechain` olanlar hariç) |
| **Alt ajanlar** | `<oturum>/subagents/agent-*.jsonl` |
| **Ajan tipi** | `agent-*.meta.json` → `agentType` (`d2c:design-diff`, `d2c:gorsel-diff` …) |
| **Tur süresi** | Alt ajanın ilk ve son kaydı arasındaki fark |
| **Koşu sınırı** | Kullanıcı mesajlarındaki `/d2c`, `/d2c-spec`, `/d2c-code`, `/d2c-verify` |

## Yorumlama notları

- **Alt ajan sayıları kesindir** — her tur kendi dosyasında, sınırı net.
- **Ana döngü atfı yaklaşıktır** — tek bir transcript birden çok koşuyu ve arada başka
  işi kapsayabilir. Bölüm bazında ölçmek için `--since`/`--until` ile pencere verin ve
  pencereyi **gözlemlenebilir bir olaya çapalayın** (bir `/d2c-spec` komutu, bir ajanın
  bitişi). `docs/benchmark.md` §2 bunun uygulanmış örneği.
- Smoke ve kontrol testleri de alt ajan olarak görünür (1-2 çağrılık turlar). Gerçek
  ölçüm turlarını ayırmadan ortalama almayın — ortalamayı aşağı çeker.
- Bozuk JSON satırları atlanır ve **sayısı raporlanır**; sessizce yutulmaz.

## Doğrulama

Araç iki şekilde doğrulandı:

1. **Sentetik fixture** — `__fixtures__/sentetik/`: bilinen sayıda `tool_use`, bilerek
   bozulmuş bir satır, meta'sı olan ve olmayan alt ajanlar, sidechain kullanıcı mesajı.
   Beklenen: ana 4, alt 4, genel 8, atlanan 1, bir `/d2c` komutu.
2. **Bilinen gerçek değer** — kural dosyalarında bağımsız olarak kayıtlı iki ölçüm
   birebir üretildi: `visual-diff` 612 sn / 53 çağrı ve `design-diff` 124 sn / 7 çağrı
   (`skills/d2c/SKILL.md` §3b).

```bash
# sentetik testi tekrar koş
node count-tool-calls.mjs --project __fixtures__/sentetik
```

## Sınırlar

- Transcript formatı Claude Code sürümüne bağlı. Araç savunmacı yazıldı (bilinmeyen
  satır atlanır) ama format kökten değişirse sayım sıfıra düşebilir — çıktıdaki
  "atlanan bozuk satır" ve toplam 0 uyarısına bakın.
- Token kullanımı ölçülmez; yalnız çağrı sayısı ve süre.
