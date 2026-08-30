# Limits — what the tool CANNOT do

This list is never shortened. What makes this tool trustworthy is not what it does, but
**that what it does not do is written down.** A developer who hits a limit and cannot find
it here stops trusting the tool.

> **1.8.0 note — part of this list no longer applies.** Because measurement moved to
> network-based extraction (the AGC scenegraph), some of the entries below were solved or
> became solvable. **None were deleted**; solved items are marked `✅ ÇÖZÜLDÜ` (solved)
> with the reasoning. The list is never shortened — what makes this tool trustworthy is
> that its limits are written down.

## What it cannot export  *(most of this was solved in 1.10.0)*

Still not exportable: **gradient fills** and **mask/clipPath** compositing. Neither is
skipped silently — `d2c xd assets` reports them in `atlananlar[]` with a reason (measured:
2 gradient nodes on one screen).

- ~~**Boolean shapes (`compound`).**~~ **✅ ÇÖZÜLDÜ (1.12.1)** — shapes combined in XD
  (union/exclude/subtract) arrive as `shape.type: "compound"` and were **dropped
  silently** without being measured. Caught on a second real design: **10** of 291 nodes
  were compound, an unknown-type rate of 3.44%. `shape.path` carries the result of the
  boolean operation (verified: its bbox matches the union of its children exactly), so it
  is measured like a normal path. The rate went to **0.00%** and the element count from
  172 to **182**. The SVG export emits `fill-rule="evenodd"` — without it the hole opened
  by `exclude` would be filled in.

- ~~**Vector icons.**~~ **✅ ÇÖZÜLDÜ (1.10.0)** — `d2c xd assets` produces real SVG. The
  AGC scenegraph carries the path data verbatim; the path is no longer *approximate*.
  Verified: `user-icon` was exported as **18×19** and matched the source data exactly.
  Identical icons are deduplicated by content (73 → 43 files on one screen).
  **Reference correction:** `limitations.md` used to record the target as **19×19**, and
  the tool reached 18×19 across two visual diff rounds and reported *"1px residual"*.
  The source data says **18×19** — that "1px residual" never existed, **the hand-written
  reference was wrong.**
  *Previously:* the XD viewer did not provide SVG; an icon's box and colour were measured
  but its path was approximate. On the first attempt the ink box came out 15×17 (20% too
  narrow); the visual diff caught it and it reached 18×19 in two rounds. For an exact
  result, ask the designer for the SVG.
- ~~**Images.**~~ **✅ ÇÖZÜLDÜ (1.10.0)** — `d2c xd assets` downloads the images.
  Verified: **15 WebP** files (8–247 KB) downloaded from one screen. The same image is
  downloaded once. `pattern.meta.ux.scaleBehavior` gives the CSS `object-fit` equivalent.
  *Previously:* product photos, logos and illustrations could not be downloaded; a
  correctly sized placeholder plus a `TODO` was left instead.

## What it does not read

- **Interaction and state.** 🔸 **PARTLY SOLVED (1.14.0)** — the tool now **detects** the
  pattern from visual evidence (arrows + dots → carousel; chevron → accordion; a row of
  labels with one active → tabs) and builds markup that can carry the behaviour. What it
  still does not do is read `interactions.json` (trigger, action, duration, easing), which
  is reachable from the CDN. So durations, easing and the exact transitions are still not
  generated, and hover/pressed states are still absent — the design only shows the Default
  State. Detection is written into `d2c-code` SKILL.md §3a3; **no dependency is installed
  without the user's approval** (§3a4).

- ~~**Fixed-pixel layout breaks below the design's width.**~~ **✅ SOLVED (1.14.0)** — the
  measured failure: a header from a 1920 design, written out as absolute pixels, was
  pixel-perfect at 1920 and put the Search button on top of the input on a laptop.
  Two things changed: `tailwind.md` gained a "Layout intent" section (coordinates ≠ CSS
  positioning; slack gap vs real gap; which element absorbs the remainder), and
  `d2c render robust` now measures **five widths in one call** (1920/1440/1366/1280/1024),
  reporting overlap, horizontal overflow and container escapes as errors while treating
  text reflow as information.
  Verified on a fixture pair: at 1920 both versions reproduce the design exactly
  (`search 620–1540`); at 1440-1024 the fixed-pixel one overlaps by 256 px while the
  intent-based one stays clean.
  *Still a limit:* the tool preserves the design's relationships but will not invent a
  **structural** change (stacking, a hamburger). With a single artboard that decision is
  put to the user.
- **Breakpoints.** XD does not provide breakpoint information. *(unchanged)* When the
  artboards are 375 and 1440, `lg: = 1024px` is **assumed**. Confirm with the designer.
- **Horizontal segmentation.** Screen segmentation works vertically; columns inside a
  section are not separated. The section is measured as one piece.
- **Freely laid out artboards.** Segmentation is for vertically flowing pages. On
  dashboards, maps and canvas-style screens it does not produce a meaningful section map.

## Consequences of how it works — the composition and placement gaps

- ~~**`all` produced preview routes but never composed the page.**~~ **✅ SOLVED (1.14.1)**
  — `/d2c <link> all` ran every section and left five `*-preview` routes behind, with no
  page rendering the screen. The preview route is `d2c-code`'s verification scaffolding,
  and nothing turned the finished sections into a deliverable. `/d2c` SKILL.md §3d now
  requires composing them, in the section map's order, and verifying the composed route —
  sections that are each clean can still collide once stacked, and that is the only place
  it shows up.

- ~~**Components were dumped flat into one directory.**~~ **✅ SOLVED (1.14.1)** — ten
  components (carousels, cards, icons, a hook, a header) landed side by side in
  `components/proshop/`. The rule said "place it into the project's existing structure",
  which is not something you can act on. `d2c inventory` now **measures** the convention —
  groups, depth, loose files at the root, barrel, naming style — and flags a flat pile
  explicitly. A written rule in `CLAUDE.md` wins over anything inferred; with no
  convention, components are grouped by responsibility and a hook is not filed as a
  component.

## What it does not produce

- **No tests.** Nothing tells you if the component breaks later. `/d2c-verify` is run by
  hand; it is not wired into CI.
- **Theme tokens are not added automatically.** The `@theme` block is a shared surface;
  the tool only writes a **suggestion** (surfacing hex values that repeat across 3+
  components). You add them yourself.
- **No data layer.** The generated components are presentational; they take props and do
  not fetch data.

## What cannot be closed, by the nature of the measurement

- **`border-box` and *Center Stroke* are not the same thing.** In XD a 1px stroke sits on
  the geometry line and padding is measured from the geometry edge; in CSS the border is
  drawn inside the box. 316 outer width + 24 padding + 268 content **cannot all hold at
  once** in CSS — one of them will be off by 2px.
- **XD text frame ≠ CSS line box.** The height of text elements is systematically measured
  differently (see troubleshooting). Half-line compensation fixes the position, but the
  element's *own* height will not be the number XD reports.
- **The visual diff percentage is not a pass mark.** XD draws text to a canvas, the browser
  draws the DOM. Even with the same font and the same size, the floor in a text-heavy
  section is **5-10%**. The number is used relatively; the decision rests on visually
  inspecting the deviating regions.

- **The structural percentage is AREA WEIGHTED — it under-scores a small but important
  difference.** Measured in 1.12.0 with a synthetic pair:

  | corruption | raw | structural | deviating regions |
  |---|---:|---:|---:|
  | 1px shift (noise) | 15.44% | **0.83%** | **36** — spread across the page |
  | icon change (a real error) | 0.36% | **0.79%** | **6** — all in the icon's column |

  So **the percentage does not rank them**: a 24×24 icon is 1.5% of a 240×160 page. The
  discriminator is *the number and position of the regions*: noise spreads, a real error
  clusters. This is concrete evidence for the "the decision rests on region inspection"
  rule — the rule is not a stylistic preference, it follows from the nature of the
  measurement. (`cli/test/detection.test.mjs`)

## Consequences of how it works

- ~~**Parallel `/d2c` runs in the same repo are impossible.**~~ **✅ ÇÖZÜLDÜ (1.8.0)** —
  there is no shared browser on the network path; verification opens and closes its own
  Playwright session. **Still applies in legacy mode:** the MCP browser is shared and
  single.
- **Different sessions lock each other out without `--isolated`.** *(legacy mode only)*
  When chrome-devtools MCP is installed without arguments, every server uses the same
  Chrome profile and whoever grabs it first wins; the others get
  `The browser is already running for .../chrome-profile`. **This is not a limit, it is a
  setup gap** — with `--isolated` each session gets its own temporary profile and they can
  run in parallel (see `installation.md`).
  This actually happened: another session opened in parallel held the profile, so the
  measurement could never start.
- ~~**Slow.**~~ **✅ ÇÖZÜLDÜ (1.6.0–1.8.0).** Measurement went from ~229 tool calls to
  **1**, render verification from 11 calls/184 s to **1 call/1.3 s**, and visual
  comparison from 56 calls/960 s to **1 call/2.7 s**. The remaining time is code
  generation and review — the right place for it. Measurements: `docs/benchmark.md`.
  *Previously:* waiting 10-20 minutes per section was normal.
- ~~**The visual comparison needs Python + Pillow.**~~ **✅ ÇÖZÜLDÜ (1.11.0)** — the pixel
  comparison moved to TypeScript and is bundled inside `cli/dist/d2c.mjs`. Equivalence was
  proven: across 8 cases the raw/structural difference is **exactly 0**, and the heat map
  and ready-made crops are **byte for byte** identical (also 0 at a real 2.7 MP size).
  **What still needs Python:** `extractorStrategy: "legacy"` (`section-map.py`, PIL) ·
  the `visual diff --kalibre` anchor path (`visual-diff.py`, PIL). `component-inventory.py`
  is no longer called (1.12.0 replaced it with `d2c inventory`) and never needed PIL.

- **The `--kalibre` anchor logic was not ported to TS.** Deliberately: with a thumbnail
  reference the scale is known exactly, so there is no need to derive an anchor. In a
  situation that does require an anchor, the engine **falls back to Python automatically**
  and records that in the `motor` field of `visual.json` — it does not silently produce an
  approximate result.

- **It does not reproduce design mistakes.** Manual placement deviations (e.g. an
  announcement strip's text sitting 10px off centre) are corrected in the code and
  **reported** — not hidden, but not copied either. The designer makes the call.
- **Reference values can be wrong.** When a hand-written expected value contradicts the
  measurement, **the measurement wins** and the reference error is reported. Two reference
  values in the benchmark were corrected this way (see `fixtures/benchmark.json` →
  `referans_duzeltmeleri`).
