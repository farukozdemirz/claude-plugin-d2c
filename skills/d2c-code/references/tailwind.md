# Tailwind code generation rules

Tailwind written from guesswork does not match the design. What follows explains why that
happens and how to avoid it.

## Source discipline

- **Never guess from a screenshot.** Only values marked **P** (read from the panel) and
  **computed** (derived from box differences) in the report may be used.
- If the report does not contain a value, **do not invent it** — leave
  `{/* TODO: <what is missing> was not measured */}` and add it to the report's TODO list.
- A radius that looked like "8" by eye measured 12. Guessing silently produces wrong code;
  wrong code does not pass verification, but it burns a round.

## Layout intent — XD coordinates are NOT CSS positioning

**This is the single most consequential rule in this file.** A design is drawn at one
width; the code has to work at all of them.

```
XD measurements = source of truth for visual geometry
XD coordinates != CSS positioning
```

A measured real failure: a header from a 1920 design was written out as absolute pixels.
At 1920 it was pixel-perfect. On a laptop the Search button sat on top of the input and
`Login / Wishlist / Cart` collapsed into each other.

### Read the relationships before writing a single class

`olcum.json` gives you the raw material: `ebeveyn` (hierarchy), `sira` (paint order),
`hesaplanan` (gaps, with `nasil` saying which two boxes each came from), `tekrar`
(repeated series). Before converting anything, answer:

- Which elements share a container?
- Which must stay on one line?
- **Which one absorbs the leftover space?** (usually exactly one)
- Which have a fixed or minimum width?
- Which gaps are real, and which are just slack?
- Does the container have a `max-width`, or is it full-bleed?

### The two kinds of gap — the distinction that decides the layout

Not every gap in a design means the same thing. In the header above:

| gap | value | what it really is |
|---|---|---|
| logo → search | 416 px | **slack** — the room left over at 1920 |
| search → actions | 60 px | **a real gap** — the designer's spacing |

Writing both as fixed pixels is what breaks the layout. The slack must collapse first as
the window narrows; the real gap must not.

### Worked example — the same design, both ways

The design: logo 140 · search 920 · actions 256 · page padding 64 · gaps 416 and 60.

```html
<!-- WRONG — coordinates copied out. Correct at 1920, broken below it. -->
<header class="relative h-[72px]">
  <div class="absolute left-[64px]  top-[20px] w-[140px]">…</div>
  <div class="absolute left-[620px] top-[16px] w-[920px]">…</div>
  <div class="absolute right-[64px] top-[20px] w-[256px]">…</div>
</header>
```

```html
<!-- RIGHT — the same design as relationships. -->
<header class="flex h-[72px] items-center px-16">
  <div class="shrink-0 basis-[140px]">…</div>       <!-- logo: fixed        -->
  <div class="min-w-0 flex-1"></div>                 <!-- slack: collapses first -->
  <div class="mr-[60px] min-w-[180px] shrink basis-[920px]">…</div>  <!-- search -->
  <div class="shrink-0 basis-[256px]">…</div>        <!-- actions: fixed    -->
</header>
```

Measured, both fixtures (`cli/test/fixtures/page/header-*.html`):

| width | fixed px | intent |
|---|---|---|
| **1920** | search `620–1540` · actions `1600–1856` | **identical** — the design is reproduced exactly |
| 1440 | actions overlap the search by **256 px** | clean, the slack collapsed |
| 1280 | overlap **256 px** + horizontal overflow | clean, the search shrank |
| 1024 | overlap + overflow | clean |

Pixel-perfect at the design width and robust below it are not in conflict — the second
version delivers both.

### The conversion table

| XD says | usually means | not |
|---|---|---|
| `width: 920` on the widest flexible element | `flex-1` + `max-w-[920px]` | `w-[920px]` |
| `left: 620` inside a flow container | the result of order + gaps | `absolute left-[620px]` |
| A large gap that only exists at the design width | slack (a `flex-1` spacer, or `justify-between`) | a fixed `gap` |
| A small consistent gap | `gap-*` | slack |
| An element that must never shrink (logo, icon, avatar) | `shrink-0` + `basis-*` | `w-*` alone |
| Page-edge padding | `px-*` on the container | `left-*` on each child |
| A repeated series (`tekrar`) | `grid` + `gap`, or flex + `gap` | absolutely positioned copies |
| A width that fills the remainder | `flex-1` / `minmax(0,1fr)` | a hard-coded number |

**`absolute` is for overlay relationships** — a badge on an avatar, a close button in a
corner, an icon inside an input. It is not how a row of elements is laid out.

### Verify it — do not eyeball it

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" render robust \
  --olcum "<reportDir>/<section-slug>/olcum.json" --url "<render url>"
```

One call, five widths (1920 · 1440 · 1366 · 1280 · 1024). It reports overlap, horizontal
overflow and children escaping their container as **errors**, and text reflow as
**information** — narrowing is supposed to make text wrap.

Exit code 1 when there is an error. Details in `d2c-code` SKILL.md §4a.

## Colour

- If a theme token is an **exact** match for the hex, use the token class (`bg-blue-4`).
- Otherwise use an arbitrary value: `text-[#FFC700]`. Do not use a "close" token — there
  is no tolerance on colour.
- **Do not change the config on your own initiative.** In Tailwind v4 the theme is the
  `@theme` block inside `app/globals.css` and it is a shared surface; changing it for a
  single component affects other screens. Write a "tokens worth adding" list into the
  report instead:
  ```css
  @theme {
    --color-brand-navy: #0C2380;   /* -> bg-brand-navy, text-brand-navy */
  }
  ```

## Spacing

- If it is within **≤2px** of the 4px grid, use a grid class: 24 → `p-6`, 16 → `gap-4`.
- Otherwise use an arbitrary value: 9 → `mt-[9px]`, 26 → `pb-[26px]`.
- **If you rounded, say so in the report** — turning 26 into `pb-6` (24) is a 2px
  deviation; it stays inside tolerance, but that is not what the design says.

## Typography

Tailwind's default line-heights **usually do not match** XD:

| Class | Tailwind | XD may want |
|---|---|---|
| `text-lg` | 18px / 28px | 18 / 22 |
| `text-sm` | 14px / 20px | 14 / 17 |
| `text-xs` | 12px / 16px | 12 / 14 |

Use the font-size class but **always write the line-height explicitly**:
`text-lg leading-[22px]`. The one exception: even when XD's line-height happens to match
Tailwind's exactly, writing it explicitly is harmless — write it.

- If letter-spacing shows as something like `-0.2px` in the panel, use
  `tracking-[-0.2px]`. If it is `0px`, omit it.
- font-weight: XD "Bold" → `font-bold` (700), "Medium" → `font-medium` (500),
  "Regular" → `font-normal` (400), "Light" → `font-light` (300).

## Height

- Do not pin a card/panel height with `h-[204px]` — it overflows when the content changes.
  Where possible, **derive it from padding + content**.
- If a fixed value is required, prefer `min-h-[204px]`.
- When the height does not match during verification, the cause is usually the line box,
  not a missing `h-*`.

## Responsive

- **Mobile is the base, desktop is `lg:`.** `lg:` defaults to 1024px; if the design's
  breakpoint differs, suggest a `--breakpoint-*` entry inside `@theme` (do not add it
  yourself).
- If element **order** changes between the two artboards, do not duplicate the DOM — use
  flex + `order-*`. Two separate DOM trees mean double maintenance and an accessibility
  problem.

### Preserving relationships ≠ inventing a design

This distinction matters because getting it wrong caused a real bug. The old rule said
"with one artboard, do not invent responsive behaviour, leave a TODO" — and that was read
as "write fixed pixels", which is exactly what breaks on a laptop.

Fixed pixels are not the neutral choice. They are a **claim that the layout never
adapts**, and that claim is almost always false.

| What | Do you do it? | Why |
|---|---|---|
| Keep the design's relationships as the window narrows — the search flexes, the logo does not, the real gap holds | **Yes, without asking** | This is the design's own structure, not a new decision |
| Change the structure — stack the row, hide elements, a hamburger, change the column count, add a breakpoint | **Ask first** | This is a design decision and it is the designer's to make |

So with a single artboard: build the layout with intent (the first row), and for anything
in the second row ask the user. Do not silently invent a breakpoint, and do not silently
write a layout that only works at one width.

**What to ask when there is no responsive artboard:**

> The design only has the <width>px artboard. I built the layout so it keeps its
> relationships as the window narrows — verified clean at 1920/1440/1366/1280/1024.
> Below roughly <N>px the row no longer fits and a structural decision is needed
> (stacking, or a hamburger for the actions). Three options:
>   1. I add the breakpoint myself with a reasonable default — fastest, but it is a
>      design decision I would be making.
>   2. You get the mobile/tablet artboard from the designer and I measure it — most
>      faithful.
>   3. We leave it: it stays correct down to <N>px, below that it is out of scope.
> Which do you prefer?

Never pick option 1 on your own initiative.

## The className prop

Use `twMerge` in components that accept an external class — otherwise a class arriving via
`className="p-4"` collides with the component's own `p-6` and CSS order decides the winner:

```tsx
import { twMerge } from 'tailwind-merge'
export function Card({ className, ...props }: Props) {
  return <div className={twMerge('rounded-xl border p-6', className)} {...props} />
}
```

If `tailwind-merge` is not installed, install it (`npm i tailwind-merge`) and note it in
the report.

## Container / gutter

If the design uses a 64px gutter at 1440 and the project's `container` gives 16px padding,
close the gap: `lg:px-16`. Show the gutter in the report as **computed**
(e.g. `left gutter 63.5 = first card.x`).

## If the font is not loaded, the measurement drifts

**Before** verifying, check that the design's font family is actually loaded in the
project:

```js
document.fonts.check('16px "Bw Modelica"')
```

- If it is not loaded, the browser uses a fallback; text **widths** and **line box
  heights** drift — box measurements (padding, radius, border, colour) remain valid.
- In that case still produce the difference table, but put a **"font eksik"** warning in
  the report and mark text-derived rows with `⚠`. A commercial font is missing in most
  projects — that is a valid outcome, not an error to hide.
- When choosing a fallback, use a family with close metrics and write the `font-family`
  chain into the report.

## Images and icons — these are exported now

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" xd assets "<xd link>" --screen "<screen>" \
  --out-dir public/d2c
```

- **Icons** come out as real SVG (`public/d2c/icon/`). The path data is verbatim from the
  source; **no approximate drawing**. Identical icons collapse into one file.
- **Images** land under `public/d2c/image/` (usually WebP).
  `olcekDavranisi: "fill"` → `object-fit: cover`.
- **Skipped items are reported**: gradient fills and clipPath masks still cannot be
  converted. Leave a `{/* TODO */}` for each item in the report — do not pass over them
  silently.

If the export was not run, the old behaviour applies: a placeholder at the correct size
plus `{/* TODO: image must be exported from XD */}`.

## Cumulative drift

The XD text box height and the CSS line box are not the same thing; vertical positions can
drift **~2-3px downward**, and that drift accumulates.

- **Start checking from the first element** and work downward.
- If the deviation **grows** as you go down, the source is not that element but the **space
  above it** — fix the `margin`/`leading` there.
- If the deviation stays constant, there is a one-off offset (usually the first element's
  `leading` or the container's `padding-top`).

---

## Half-leading — the most common mistake

**The XD text box height and the CSS line box height are not the same thing.**

- For an auto-height text frame XD reports `(n−1) × line-height + fontBox`.
- CSS renders `n × line-height`.
- The difference is `line-height − fontBox`, and **half sits above, half below**.

### Do NOT assume fontBox — MEASURE it in the browser

`fontBox ≈ 1.25 × font-size` **is not true for every family.** It holds for Bw Modelica
(12→15, 16→20, 18→22, 24→29, 32→38) but came out at **1.375 for Tobias**: at 48px the
browser's `fontBoundingBox` sum was **66px**. Assuming that difference shifted the heading
**4px down**, and `design-diff` could not see it (the box was right, the glyph was wrong) —
only the visual diff caught it, meaning **a round was burned**. The same mistake repeated
on two separate screens.

**Before** writing code, measure every family/size pair you will use in a single call:

```js
async () => {
  await document.fonts.ready;
  const c = document.createElement('canvas').getContext('2d');
  // The family/size pairs you will use — the GENERATED name, not XD's
  const cift = [['tobias', 48], ['tobias', 28], ['bwModelica', 18], ['bwModelica', 16]];
  return cift.map(([aile, px]) => {
    c.font = `${px}px "${aile}"`;
    const m = c.measureText('Hxg');
    const kutu = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    return { aile, px, fontKutusu: +kutu.toFixed(2), oran: +(kutu / px).toFixed(3) };
  });
}
```

Compute the half-line from the returned `fontKutusu`. **If `oran` deviates noticeably from
1.25, write it into `spec.md`** — the rule is different for that family.

**You see the effect in two places:**

1. **The text element's height** comes out larger than XD's (e.g. 18/28 on a single line:
   XD says 22, CSS says 28). This is not an error — they are two different measurements.
   Tell the `design-diff` prompt to "count text height rows as `✓ (metin çerçevesi)`".
2. **Everything below it shifts, and the shift accumulates.** The card height will not
   match XD.

**Compensation:** shrink the space **above and below** text whose
`line-height > fontBox` by the half-line:

```
halfLine   = (lineHeight − fontBox) / 2
spaceAbove_css = spaceAbove_xd − halfLine   (also subtract the element above's half-line, if it has one)
spaceBelow_css = spaceBelow_xd − halfLine
```

A verified example — 16/27 body text (fontBox 20, halfLine 3.5):
`mt-[4.5px]` (XD 8) and `mt-[12.5px]` (XD 16) on the line below produced a card height of
**248.88**, against XD's **248.89**. Without compensation it was 256.

For text where `line-height = fontBox` (18/22, 14/17, 20/24, 16/20) compensation is **not
needed** — leave the spacing exactly as XD has it.

## Set the font family on the section root

`globals.css` may be giving `body` a fallback family (`Arial, Helvetica, sans-serif`). If
you set the component family only on child components, **the section's own text silently
falls back** — font-size, line-height and colour all look right, only the family is wrong,
and you will not notice by eye. Put the family on the section's root element:

```
"[font-family:var(--font-modelica),ui-sans-serif,system-ui,sans-serif]"
```

Then have `design-diff` report each element's computed `fontFamily`.

## Block width ≠ XD text frame width

When XD says `W 319px` for a heading, that is the width of the **text**. In CSS an `<h2>`
is a block element and fills its container (you get 1312). Visually it makes no difference,
but the measurement will not match — and worse: **you lose where the text wraps.**

- Single-line heading → `w-fit`
- Wrapping paragraph → XD's frame width as `max-w-[725px]` (that is the wrap point)

## `overflow-x-auto` pushes everything below it down on mobile

On a horizontally scrolling strip (a carousel) the classic scrollbar takes **15px** and
pushes the elements below the strip downward — in the measurement this shows up as "the gap
that should be 24 came out 39". There is no scrollbar in the design; hide it:

```
"overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```


---

# Translating an XD measurement into CSS — judgement rules

These were **promoted** from the old `playbook.md` (§14, §18, §19, §21). Measurement is
automatic now; but these four points are still **your call** and still a source of errors.

## Spacing is derived from boxes  *(§14)*

`padding` and `gap` **do not exist** as separate fields in the design data; they come out
of the difference between neighbouring boxes:

```
left padding = content.x − box.x
gap          = box2.x − (box1.x + box1.w)
```

The `hesaplanan` field in `olcum.json` does this for you, and each record's `nasil` field
says which two boxes it was derived from. **Do not recompute it yourself**; but do read
`nasil` — the right interpretation depends on the section's structure.

## Text box ≠ ink box  *(§18)*

The box of an icon/glyph element includes its side bearings; the visible ink is ~1px
narrower. Do not conflate the two when comparing positions.

The practical consequence is visible in `olcum.json`: if a section's "leftmost content" is
a glyph, the padding comes out smaller than it really is. The `nasil` field in `hesaplanan`
gives you both the element it came from and the most common alignment — **the decision is
yours**.

## Do NOT carry one artboard's value to the other  *(§19)*

Two elements doing the same job and carrying the same name can differ between artboards.
Verified: a summary bar had radius **12** on desktop and **8** on mobile; on top of that
the desktop one was a `Path` and the mobile one a `Rectangle`.

This is why `olcum.json` carries the `desktop` and `mobil` measurements **separately**, and
neither is derived from the other. Concluding "it was 8 on mobile, so desktop is 8 too"
produces wrong code.

## Stroke: geometry edge ≠ visual edge  *(§21)*

With *Center Stroke* the geometry edge and the visual edge differ by half a stroke: between
two 48×48 buttons with a 2px stroke you measure **17** from the geometry and **15** from the
visual outside edge.

`olcum.json` gives you the `kontur.hiza` field (`inside` / `outside` / `center`). Because a
CSS `border` is drawn **inside** the box, the `gap` in the code ends up closer to the visual
value than to the geometry one. **Write in the report** which one you used.
