# XD spec playbook → taşındı

Bu dosyanın içeriği **`docs/xd-viewer-notlari.md`**'ye taşındı.

**Neden:** normal akış artık XD viewer'ı hiç açmıyor — çıkarma HTTP + AGC scenegraph
ile, görsel referans manifest thumbnail'ı ile yapılıyor. 247 satırlık tarayıcı sürme
talimatını her ölçümde skill bağlamına yüklemek gereksiz maliyetti.

**İçerik silinmedi.** 25 maddenin tamamı orada; hangisinin nereye gittiği
(kural / koda gömüldü / kaynak veriden geliyor / arşiv) dosyanın başındaki tabloda.

## Ne zaman okunur

`.d2c.json` içinde `extractorStrategy: "legacy"` ise **veya** ağ yolu sözleşme hatası
verdiyse. O durumda ölçüm hâlâ oradaki yöntemle yapılır:

```
$D2C_ROOT/docs/xd-viewer-notlari.md
```
