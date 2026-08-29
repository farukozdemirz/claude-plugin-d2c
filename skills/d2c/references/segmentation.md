# Screen segmentation

The verified method for splitting an artboard into sections. Tested on two screens:
"Desktop - Screen A" (5/24) and "Desktop - Screen B" (6/24).

## Fast path — `d2c sections` (1.5.0+)

When `design.json` is ready, the section map comes out in **one command, with no browser**:

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" xd extract "<xd-link>" --screen "<screen>" -o design.json
node "$D2C_ROOT/cli/dist/d2c.mjs" sections --design design.json --json -o bolum-haritasi.json
```

It applies **the same** method described below; the difference is that both signals come
from the scenegraph: full-width bands from geometry instead of probes, and blank-row
analysis from element boxes instead of a screenshot. No calibration is needed.

Verification (screen 5/24, against the section map of a real run): **4 of 4 bands match
exactly** (y, h, name, colour), the section count is the same (11), band section boundaries
match exactly, and gap-derived boundaries differ by **≤ 5 px**. The reason for the
deviation: the old method uses the *ink* in a screenshot, the new one uses element *boxes*;
a text frame extends slightly beyond the ink.

All three bands of screen 6/24 (@Y0 h69 · @Y69 h504 · @Y573 h2452.89 `#F9FAFB`) come out
exactly.

> **The probe method below was not removed.** It is still valid with
> `extractorStrategy: "legacy"`, and it is the fallback when `d2c sections` produces a
> meaningless result for a design.

---

## Legacy path — XD probe + screenshot

## Why headings are not hunted with probes

The first method tried was clicking downward through the content column and collecting
large-point `Text` elements. **It did not work:** with a 110px step, the 56px-tall
"Section Title" heading fell between two probes and was missed. Dropping the step to 40
means 190+ clicks (~100 s) and still guarantees nothing.

The method that works combines two signals:
1. **Full-width background rectangles** (XD probe) — authoritative section boundaries
2. **Blank-row analysis** (a single screenshot) — splits the regions with no band

## 1. Calibration — design ↔ viewport

The zoom textbox **will not go below 25%** (type 20/15/12 and it stays at 25).
A 1440×3778 artboard at 25% is 360×944.5 viewport px; to see all of it, make the window
taller (`resize_page` 1600×1400 → inner height ~1297) and pan so the top of the artboard
lands at ~90.

The scale is known from the zoom (`s = zoom/100`); the only thing needed is the **offset**.
Find the artboard edge with a binary search — inside, the panel returns an element;
outside, it says "Screen Details":

```js
const ici = async (x, y) => (await probe(x, y)) !== null;
let lo = 0, hi = refY;
while (hi - lo > 1) { const m = (lo + hi) >> 1; if (await ici(refX, m)) hi = m; else lo = m; }
const ustV = hi;                       // design y=0 lands here
// the same for x → solV
const dx = (x) => solV + x * s, dy = (y) => ustV + y * s;
```

It takes ~20 clicks and is deterministic.

## 2. Full-width band scan

Click downward in the left edge strip (design x ≈ 8) in 90 px steps; collect elements whose
width is greater than **90% of the artboard width**. Exclude the artboard itself
(w == design width **and** h == design height).

```js
for (let dy = 15; dy < DH; dy += 90) {
  const r = await probe(dx(8), dy(dy));
  if (r && r.w >= 0.9 * DW && !(r.w === DW && r.h === DH)) bantlar.push(r);
}
```

Verified output — screen 5: `Rectangle B` 1440×34 @Y0 · `Rectangle C` 1440×96 @Y34 ·
`Path A` 1440×69 @Y179 · **`Rectangle A` 1440×730 @Y2923** (the reviews band).
Screen 6: `Rectangle D` @Y0 h69 · `Rectangle E` @Y69 h504 · **`Rectangle F` @Y573
h2452.89** (`#F9FAFB` section background).

## 3. Blank-row analysis

Take a screenshot of the artboard and pass it to
`$D2C_ROOT/skills/d2c/scripts/section-map.py` together with the calibration box. The
script finds runs of single-colour rows inside the content column (gutters excluded); every
run longer than the threshold is a separator.

```bash
python3 "$D2C_ROOT/skills/d2c/scripts/section-map.py" artboard.png \
  --kutu "427,92,360,944.5" --tasarim "1440,3778" \
  --bantlar '[{"y":2923,"h":730,"ad":"Rectangle A"}]'
```

**Bands are authoritative:** gap boundaries inside a band are ignored (a band is a single
section), and band edges are always boundaries. Without band information the reviews band
was split into three pieces (heading / cards / arrows) — with it, it becomes one section.

## 4. Naming

In the **top third** of each section, click across a few columns; the largest-point `Text`
wins.

- Columns: left gutter (x≈80), middle (x≈DW/2), right-of-middle (x≈0.55·DW).
  The third column is essential: a "long heading sitting in the right column" was in the
  right column and could not be found when searching only two columns.
- The number of steps is proportional to the section height, between 2 and 6.

Verified: section 10 → `"Section Title" (48px)`, section 6 → `"section with a long
heading" (64px)`, section 8 → `"section with a short heading" (30px)`.

## 5. Known limits

- **Sections that are nothing but an image stay unnamed** (screen 5, sections 5, 9, 11).
  The map still gives the correct boundaries; the user picks by Y range.
- **No horizontal segmentation.** Columns inside a section are not separated; the section
  goes to `/d2c-code` as one piece and is measured there.
- The blank-row threshold (`--bosluk`, default 40 design px) can be tuned per design; lower
  it for dense designs, raise it for airy ones.
- The method is for **vertically flowing pages**. On freely laid out artboards (dashboards,
  maps) it does not give a meaningful result.
