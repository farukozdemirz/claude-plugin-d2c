#!/usr/bin/env python3
"""Mevcut bileşen envanterini çıkarır — kod üretmeden önce "bu zaten var mı?" için.

Her .tsx dosyasından: export edilen bileşenler, baştaki JSDoc bloğu (XD kaynağı),
data-testid'ler ve dosyada geçen belirgin ölçüler (w-[..] h-[..] rounded-*).

Kullanım:  python3 "$D2C_ROOT/skills/d2c-code/scripts/component-inventory.py" [dizin]
"""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "components")
if not root.exists():
    print(f"(dizin yok: {root})"); sys.exit(0)

files = sorted(root.rglob("*.tsx"))
if not files:
    print(f"(bileşen yok: {root})"); sys.exit(0)

for f in files:
    src = f.read_text(encoding="utf-8")
    exports = re.findall(r"export\s+(?:async\s+)?function\s+(\w+)", src)
    exports += re.findall(r"export\s+const\s+(\w+)\s*[:=]", src)
    doc = ""
    m = re.search(r"/\*\*(.*?)\*/", src, re.S)
    if m:
        doc = " ".join(l.strip().lstrip("*").strip() for l in m.group(1).splitlines()).strip()
    tids = sorted(set(re.findall(r'data-testid="([^"]+)"', src)))
    # belirgin olculer
    dims = sorted(set(re.findall(r'\b(?:lg:)?(?:w|h|min-h|max-w)-\[[^\]]+\]', src)))
    radii = sorted(set(re.findall(r'\b(?:lg:)?rounded(?:-\w+)?(?:-\[[^\]]+\])?', src)))
    hexes = sorted(set(re.findall(r'#[0-9A-Fa-f]{6}\b', src)))

    print(f"## {f}")
    print(f"   export : {', '.join(exports) if exports else '-'}")
    if doc:
        print(f"   kaynak : {doc[:300]}")
    print(f"   testid : {', '.join(tids) if tids else '-'}")
    if dims:  print(f"   ölçü   : {' '.join(dims)}")
    if radii: print(f"   radius : {' '.join(sorted(set(radii)))}")
    if hexes: print(f"   renk   : {' '.join(hexes)}")
    print()

# tekrar eden renkler -> token adayi
all_hex = {}
for f in files:
    for h in set(re.findall(r'#[0-9A-Fa-f]{6}\b', f.read_text(encoding="utf-8"))):
        all_hex.setdefault(h.upper(), []).append(f.name)
aday = {h: v for h, v in all_hex.items() if len(v) >= 3}
if aday:
    print("## Token adayları (3+ bileşende gömülü hex)")
    for h, v in sorted(aday.items(), key=lambda kv: -len(kv[1])):
        print(f"   {h}  ({len(v)} bileşen: {', '.join(sorted(set(v)))})")
