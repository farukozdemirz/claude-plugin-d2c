---
name: d2c-code
description: "Turns an XD measurement into a Tailwind + React component; renders the generated code in a browser, measures it with design-diff against the design, and closes the deviations."
argument-hint: <xd-link|report-path> [target section]
---

# d2c-code

**Argument:** the first word is an XD link **or** the path to an existing report file, the
rest describes the target section. Example:
`/d2c-code <reportDir>/<section>/spec.md "card"`

## First thing

Read `references/tailwind.md` and `references/quality.md`. The rules there explain why
Tailwind written from guesswork misses the design, and how to avoid it.


## Script paths

Resolve the plugin root before calling any script. `CLAUDE_PLUGIN_ROOT` is provided as an
environment variable in plugin context; when it is missing (in-repo development install)
the fallback chain kicks in:

```bash
D2C_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$D2C_ROOT" ]; then
  # Installed plugin: ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
  # (the version subdirectory EXISTS — verified, it was missed in the first draft)
  # Several versions may stay installed; the NEWEST must win by version order
  # (a plain glob sorts alphabetically and puts 1.0.10 before 1.0.9).
  for c in $(ls -d "$HOME"/.claude/plugins/cache/*/d2c/*/ 2>/dev/null | sort -Vr) \
           "$HOME"/.claude/plugins/*/d2c \
           "$HOME"/.claude/skills/d2c \
           ./.claude; do
    [ -f "$c/cli/dist/d2c.mjs" ] && D2C_ROOT="${c%/}" && break
  done
fi
[ -z "$D2C_ROOT" ] && echo "ERROR: plugin root not found" && exit 1
echo "D2C_ROOT=$D2C_ROOT"
```

From here on every script call is written as `"$D2C_ROOT/skills/.../scripts/..."`.
**Never write repo-relative paths** — the plugin runs inside someone else's project.

## Flow

### 1. Input

**Your only input is `olcum.json`.** It is section-scoped and self-contained: box ·
spacing · radius · colour · stroke · typography · text · element relationships
(`ebeveyn`/`sira`) · `tekrar` (compressed series) · `hesaplanan` gaps.

> **Do NOT open `design.json`.** It is the full scenegraph, hundreds of KB; pulling it
> into context moves the cost of measurement into tokens. Every value you need is in
> `olcum.json`.

- If the argument is an **XD link**: call the `d2c-spec` skill; it produces
  `olcum.json` + `spec.md`.
- If the argument is an **`olcum.json` / report path**: read it directly.
- If there is no `olcum.json` (an old report): follow the `d2c-spec` legacy path.

Read the `tekrar` field correctly: `adet: 8, eksen: "x", adim: 332` means **8 identical
elements, 332 px apart** — the gap in `hesaplanan` (332 − 316 = 16) is the space between
them. When `duzenli: false`, every position in the `konumlar` list is real.

### 2. Mobile + desktop

The same page may have two artboards (e.g. "Desktop - Screen A" and "Mobile - Screen A").
Walk the screen list (`xd-viewer-notes.md` §12) and **measure both**:

- **Mobile values are the base**, **desktop gets the `lg:` prefix**.
- If there is only one artboard, say so explicitly in the report and in the code — do not
  invent responsive behaviour, leave a TODO.
- If element **order** changes between the two artboards, do not duplicate the DOM; use
  `order-*`.

### 3a. Does this component already exist?

**Before generating code**, produce the current inventory:

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" inventory components
```

The output lists each component's exports, sizes, `data-testid`s, and the embedded hex
values that repeat across 3+ components (token candidates). Match on **`data-testid` and
sizes**: since code is generated without comments there is no XD source recorded in JSDoc
(see `references/quality.md` §1). The section's XD source lives in the `code.md` report.

> **1.12.0: the inventory is AST based.** The old regex script only saw `export function`
> and `export const`; on a synthetic file it found **1 of 5 export forms**.
> `export default function Card`, `export { Card as ProductCard }`, `export * from` and
> class components were **invisible** — which risked concluding "this component does not
> exist" and rewriting one that did.
>
> A file that cannot be parsed is **not skipped silently**; it is reported as
> `⚠ PARSE EDİLEMEDİ` and the exit code becomes 1, so you decide knowing the inventory is
> incomplete.
>
> The regex script is **still there** at
> `skills/d2c-code/scripts/component-inventory.py` (fallback).

Compare against the spec you measured:

- **The same XD element** (same screen + same `Rectangle`/`Path` name) → do not write a new
  one, use the existing component.
- **A different variant doing the same job** (e.g. two different review cards) → before
  writing a new component, consider extending the existing one with a prop; if you do not
  extend it, write **why they are separate** in the report.
- **New** → carry on.

**Reuse is not only about XD identity.** Before writing any new UI, look for these in the
project by name and by shape — a second implementation of the same pattern is a cost that
never goes away:

```
Header · Navigation · Search · Button · IconButton
ProductCard · Carousel/Slider · Container · Section · Modal · Tabs
```

If an existing component can be adapted to the design (a prop, a variant, a `className`),
adapt it. If you decide to write a new one anyway, say **why the existing one did not
fit** in the report.

If a token candidate came up, surface it in the report's "suggested tokens" section.

### 3a2. Export the assets (icons + images)

If the section has vector icons or images (elements with `tip: "gorsel"` or a populated
`gorselUid` in `olcum.json`), export them with one command before writing code:

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" xd assets "<xd link>" --screen "<screen>" \
  --out-dir public/d2c
```

You get real SVG and real image files — no need for placeholders or approximate icons.
Leave a `{/* TODO */}` for every item in the `atlananlar` list.

### 3a3. Is this component interactive?

**Do not copy only the static appearance.** A design cannot show behaviour, but it leaves
visual evidence of it. Read that evidence before writing the markup — retrofitting
interaction later usually means rewriting the DOM.

| What you see in the design | What it almost certainly is |
|---|---|
| Left/right arrows · dots, one of them active · repeated cards that run past the edge | **carousel / slider** |
| Dots alone, no arrows | carousel, or **pagination** |
| A row of labels with one underlined/filled | **tabs** |
| A repeated row with a chevron on the right | **accordion** |
| A field with a chevron, or a list floating over the page | **dropdown / select** |
| A panel with a dimmed backdrop behind it, or a close ✕ in a corner | **modal / drawer** |
| "See all", "Show more" next to truncated content | **expandable** |

Two real examples from one screen: the hero carried `‹ ● ○ ○ ›` — arrows plus three dots
with the first one active. Below it "Featured Categories" carried `● ○ ○ ○`. Both were
originally generated as static markup; both are carousels.

**What to do with a finding:**

- Build the markup so the behaviour can exist: a track element, items as siblings,
  the dots/arrows as real `<button>`s with `aria-label`, `aria-current` on the active dot.
- If you implement the behaviour, do it **as §3a4 requires**.
- If you do not, leave `{/* TODO: carousel behaviour — the design shows arrows + dots */}`
  and write it in the report. Do not silently ship a static strip as if it were finished.
- The design shows only the **default state**. Hover, focus, open/closed and transitions
  are not in it — do not invent them, note them.

### 3a4. A slider was detected — check the project first

**Do not install a dependency on your own initiative.** In order:

1. **Is there a carousel package in the project?** Look at `package.json` for
   `swiper`, `embla-carousel-react`, `keen-slider`, `splide`, `react-slick`,
   `@radix-ui/*`, or whatever is already there. **Use what is already installed.**
2. **Is there a shared component?** `d2c inventory` (§3a) lists them — a `Carousel`,
   `Slider` or `Swiper` component in the project is reused, not rewritten.
3. **Neither exists?** Then **ask, do not install**:

   > The design shows a slider/carousel (arrows + dots), but the project has no usable
   > slider package or component. Shall I install `<suggested-package>`? Alternatively I
   > can leave the markup static with a TODO.

   Wait for the answer. Adding a dependency is the user's decision, not yours.
4. **A simple case may not need a library at all** — a horizontally scrolling strip with
   `overflow-x-auto` + `scroll-snap` covers many designs with no dependency. Suggest this
   when it fits.

### 3. Generate the code

**Measure the font boxes FIRST.** `references/tailwind.md` → "do NOT ASSUME fontKutusu".
With a single `evaluate_script`, collect `fontBoundingBox` for every family/size pair you
will use and compute the half-line from the real number. The `1.25 × size` assumption
holds for one family but is **1.375 for another** — assuming it shifted the heading by 4px
on two separate screens and cost a visual diff round each time. This one call buys that
round back.

Then write the code following the rules in `references/tailwind.md`. Place the component
into the project's existing structure (App Router; create `componentsDir` if it does not
exist). To make it verifiable you also need a page route that renders the component — if
there is none, create `<previewDir>/<name>-preview/page.tsx`.

Give the elements to be measured a **stable `data-testid`** — English, kebab-case:
`data-testid="review-card"`. (Even when the design is in another language, identifiers are
English; see `references/quality.md` §6.)
`design-diff` will use these as selectors; relying on class names is fragile.

**Write the `testid`s back into `olcum.json`.** The measurement phase knows the elements by
their XD names (`Rectangle 7931`); you gave them `testid`s. Match the two and add the
`"testid"` field to the matching record in the `elemanlar[]` array. `design-diff` reads its
target table from this file — without the mapping it cannot (§4).

### 4. Verify

**Run the measurement yourself first — one command:**

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" render verify \
  --olcum "<reportDir>/<section-slug>/olcum.json" --url "<render url>" \
  --json -o "<reportDir>/<section-slug>/verification.json"
```

Viewport + scrollbar compensation, right-app confirmation, font check, rect +
computedStyle, tolerance — all inside. **~1.3 s.** The output is machine readable.

If there is no `sapan`, do not call the agent at all. If there is, give the `design-diff`
agent the path to `verification.json` — it interprets **why**.

> If the `testid`s in `olcum.json` are `null`, the command **does not measure** and says
> so. They should have been filled in during §3.

If `playwright-core` is unavailable (`d2c doctor` will say so), fall back to the legacy
path: call the `design-diff` agent in its MCP form — that path is **preserved**.

#### Legacy: measuring by hand with the agent

Call the `design-diff` subagent. **Do NOT hand-write the target table into the prompt** —
give it the path to `olcum.json` and let the agent `Read` it. Manual transcription both
bloats the prompt (30+ lines per screen) and is a source of silent errors: if you get it
wrong, the agent verifies the wrong thing and nobody notices.

Give the prompt:
- **the path to `<reportDir>/<section-slug>/olcum.json`** — targets, `testid` mapping and
  artboard widths are all in there
- the page URL (if the dev server is running, say "already running" so it is not restarted)
- the viewports to measure
- the **accepted deviations** (border-box, text frame, approximate icons, missing fonts) —
  these are not in `olcum.json`, they have to be in the prompt

Font family targets come from the `elemanlar[].font.aile` field; **do not write a blanket
sentence like "this design's font is X".** The agent reads that as "every element must be
X" and produces **false ✗** for elements where the design deliberately uses another family.
For families not installed in the project (such as `Helvetica Neue`), say in the prompt:
"count as ⚠, not ✗".

**Browser contention:** you share the same chrome-devtools MCP browser with `design-diff`.
If you start the subagent **in the background** and keep measuring XD yourself, you will
pull the page out from under each other. Either run the verification with
`run_in_background: false`, or do not touch the browser at all while the subagent runs (do
file/report work instead).

If the returned table has deviations, **fix the code and call the subagent again**.

**After a fix, do your own pre-check in ONE call.** A separate `navigate` + separate
`emulate` + separate `evaluate_script` is three tool calls ≈ 45 s; all of it fits into a
single `evaluate_script`:

```js
async () => {
  location.reload();                    // or skip if it is already loaded
  await new Promise(r => setTimeout(r, 1200));
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 500));
  const k = document.querySelector('[data-testid="section"]').getBoundingClientRect();
  const g = (id) => { const e = document.querySelector(`[data-testid="${id}"]`);
    if (!e) return null; const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(2), y_rel: +(r.y - k.y).toFixed(2),
             w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  return { viewport: window.innerWidth,
           tasma: document.documentElement.scrollWidth > window.innerWidth,
           olculen: Object.fromEntries(['id1','id2','id3'].map(i => [i, g(i)])) };
}
```

If the pre-check passes, call `design-diff`; if it does not, **do not call it** — fix first.
Every agent round is ~2-4 min.

- At most **4 rounds**.
- Deviations that do not close in 4 rounds are written into the report as
  **"çözülemedi"** (unresolved), with the reason.
  **No hiding, no loosening tolerances, no changing target values.**
- A `⚠ font eksik` note is not a failure — carry it into the report as a warning.

### 4a. Verify responsive robustness — MANDATORY

Passing at the design's own width proves the geometry, **not the layout**. The measured
failure this step exists for: a header that was pixel-perfect at 1920 put the Search
button on top of the input and collapsed `Login / Wishlist / Cart` into each other on a
laptop.

**One command, five widths:**

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" render robust \
  --olcum "<reportDir>/<section-slug>/olcum.json" --url "<render url>" \
  --json -o "<reportDir>/<section-slug>/robust.json"
```

Default widths: **1920 · 1440 · 1366 · 1280 · 1024**. Override with
`--widths 1440,1280`. Exit code 1 when there is an error. About 1.5 s.

The two viewports serve different purposes and must not be conflated:

| Viewport | What it proves | Which command |
|---|---|---|
| The design's own width | pixel-perfect parity | `render verify` |
| The other widths | layout robustness | `render robust` |

**What counts as an error, and what does not:**

| Finding | Level | Why |
|---|---|---|
| Two siblings overlap | **hata** | Never intended |
| The page scrolls horizontally | **hata** | Never intended |
| A child escapes its container | **hata** | Never intended |
| Text got taller (reflowed) | `bilgi` | Narrowing is *supposed* to wrap text |

Reflow is not a defect. If it were reported as one, every narrow viewport would look
broken and this check would stop being read.

**When there is an error, the cause is nearly always fixed-pixel positioning.** Go to
`references/tailwind.md` → "Layout intent": which element absorbs the slack, which gap is
real, which element must not shrink.

**Do not fix an error by inventing a new design.** The goal is for the design's
relationships to survive a narrowing window — not for you to redesign the section. If the
layout genuinely cannot fit below some width, that is a structural decision: ask the user
(the question is written out in `tailwind.md` → "Preserving relationships ≠ inventing a
design").

Errors that do not close are written into `code.md` as **"çözülemedi"** with the width and
the reason. No hiding.

### 4b. Verify visually

The numeric table verifies the boxes, **not what is inside them.** Verified: all three
screens came out numerically clean; the first visual comparison immediately caught the `…`
character that `line-clamp-3` had added.

1. **Run the comparison yourself — one command:**

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" visual diff \
  --olcum "<reportDir>/<section-slug>/olcum.json" \
  --xd-url "<xd link>" --screen "<screen name>" \
  --url "<render url>" --testid "<section testid>" \
  --out-dir "<reportDir>/<section-slug>/gorsel"
```

Reference download (over HTTP, the XD viewer is never opened), render capture, pixel
comparison and **ready-made crops** — all inside, **~2.7 s**. The output is `visual.json`.

If there is no deviating region, **do not call the agent at all**. If there is, give the
`visual-diff` agent the path to `visual.json` — it **looks** at the crops and tells you
what it sees.

#### Legacy: capturing by hand with the agent

2. Call the `visual-diff` subagent and **give it the ready-made crop box**; do not make it
   derive the anchor. In the prompt: the `referans.png` path from `olcum.json` plus
   `referans.kirpma` and `referans.esleme`, the render URL + selector + viewport, and the
   **known/accepted differences** (images that could not be exported, approximate icons,
   missing fonts).
   *Measured difference:* making the agent derive the anchor pushes the visual diff to
   **19 min**; with a ready-made box it is **10 min**.
3. If the returned table has anything "requiring action", **fix it**, then decide what to
   run using the rule below.

The percentage is not a pass mark — read the agent's "what I saw" lines.

#### Visual round budget — AT MOST 2

`design-diff` has 4 rounds; **`visual-diff` has 2.** The reason is cost: a visual round is
8-17 min, a measurement round is 3 min. A measured real run: 3 visual rounds ate
**35 minutes** and pushed the total to 106 minutes.

**Do NOT run a full visual round after a fix — verify in a targeted way first.**
Most findings can be verified with a single number (did the box become 50, did the product
name land on x=160, is `resize` off). Do that with the single-call pre-check from §4.

Run a second visual round **only** if one of these holds:

- The fix **produces new pixels** (an element was added/removed, an icon changed, a wrap
  point moved) — a targeted measurement cannot see that.
- The pre-check **cannot confirm** that the finding closed.

For pure position/size fixes a second round is **unnecessary**: `design-diff` already
measures those.

**Visual findings that do not close in 2 rounds are written into `code.md` as
"çözülemedi"** — with the reason. No hiding, but no third round either.

#### Which agent after a fix?

| What you fixed | Run |
|---|---|
| Position / size / colour / font | `design-diff` (alone) |
| Element added or removed, icon, wrap point | `design-diff` **+** `visual-diff` |
| Accessibility / semantics only | neither — the pre-check is enough |

Do not reflexively run both: in the measured run, 3 visual rounds automatically brought 3
more measurement rounds and the cost grew multiplicatively.

### 4c. Review the code

Once the measurement and visual checks have closed:

1. Go through the list in `references/quality.md` against your own code.
2. Run `/code-review`; give `quality.md` + that section's `code.md` as context.
3. Apply the findings.
4. **Run `design-diff` again** — the refactor may have broken the alignment.

Findings that were not applied are written into the report with a rationale.

### 5. Output

`docs/d2c/<section-slug>/code.md` (do not write to the repo root):
- Comparison table (the last `design-diff` round, per viewport)
- Tokens used / arbitrary values
- **Tokens suggested for the config** (Tailwind v4: the `@theme` block inside
  `app/globals.css`) — suggest them, do not add them yourself
- **Responsive robustness** — the `render robust` result per width; any error that could
  not be closed, with its width and reason
- **Interactive components** — what was detected (carousel, tabs, …), whether the
  behaviour was implemented, and if not, why
- **Visual diff result** — differences requiring action, and why any could not be closed
- **Review result** — findings applied / not applied
- TODOs (images that could not be downloaded, missing fonts, responsive behaviour unknown
  because there was only one artboard, unresolved deviations)
- **Measurement provenance** (see `quality.md` §1): element → class → measurement table
  with read vs. computed marked, every half-line compensation and where it came from, and
  any assumptions. The code carries no comments, so this is where that information lives.

Summarise the paths of the generated files in the terminal.

### 6. Record what you learned

If you found a new trap during measurement, add it to the plugin's rule files
(`playbook.md` / `tailwind.md` / `quality.md`) — it ships to everyone with the next
release.

If the project keeps its own decision log, add a line there too; **otherwise skip it.**
