# Quality bar for the generated component

A clean `design-diff` table is **not enough**. The measurement is numeric; a component
that looks wrong, is hard to maintain, or is inaccessible passes that table just fine.
The items below are self-checked before running `/code-review`, and then this list is
handed to the review.

## 1. Measurement provenance must be traceable — **in the report, not in the code**

It must be possible to tell where every number in the code came from. But this is **not
done with comments**: traceability is the job of the `<section-slug>/code.md` report.

> **CODE IS GENERATED WITHOUT COMMENTS.** Explanatory comments, JSDoc blocks, a
> "source: XD screen 4/24" note — none of these go into the component file. They go
> into the report.

- **No comments for arbitrary values.** `mt-[9px]`, `w-[316px]`, `pb-[26px]` are written
  bare. Where they came from lives in the measurement table in `code.md`.
- **No JSDoc block per component.** The reuse check now runs on the AST via
  `d2c inventory` (exports, `data-testid`s, size classes); it does not need JSDoc.
- **`code.md` must carry these three things** — the information that used to live in the
  code goes here:
  1. element → class → measurement table (marking read vs. computed)
  2. **every value where half-line compensation was applied**, and which element it was
     derived from. If a number like `mt-[4.5px]` is unexplained in the report too, the
     next developer will read it as an unrounded mistake, "fix" it, and break the
     alignment — this actually happened.
  3. where assumptions were made, and why

### The one exception: an unmeasured value

**No unmeasured value may pass silently.** If the report does not contain a value and the
code cannot be written without it, leave `{/* TODO: <what was not measured> */}` on that
line and write it in the report as well.

This is not an explanation, it is a **missing-data marker**: silently presenting an
invented number as correct violates this repository's most basic rule. Do not write
comments for decoration; mark only what is genuinely missing.

## 2. Semantics and accessibility

- The right element: a card is `<article>`, a heading `<h2>/<h3>`, a date `<time>`,
  something clickable `<button>`/`<a>`, a form field `<label>` + `<input>/<textarea>`
  (ids must match). Do not make everything a `<div>`.
- `aria-hidden` on purely decorative SVGs; `aria-label` on meaningful ones.
- `aria-label` is mandatory on icon buttons with no text.
- For components like star ratings, also expose the value as text
  (`aria-label="5 stars"`).
- Toggle: `role="switch"` + `aria-checked`.
- Colour must never carry meaning **on its own**.
- Do not skip heading levels (h2 straight to h4).

## 3. Component contract

- Use `twMerge` in components that accept an external class — otherwise the caller's
  `p-4` collides with the component's `p-6` and CSS order decides the winner.
- Props must be typed and `export`ed (for the reuse check).
- Content must not be hard-coded: text comes from props. The one exception is labels that
  are fixed in the design ("See all", "Submit").
- A presentational component must not fetch data or hold state.

## 4. Responsive

- Mobile is the base, desktop is `lg:`.
- **Layout comes from relationships, not coordinates.** No `absolute left-*` for elements
  that sit in a row; exactly one element absorbs the slack; anything that must not shrink
  gets `shrink-0`. See `tailwind.md` → "Layout intent".
- **`render robust` must be clean** at 1920/1440/1366/1280/1024: no overlap, no horizontal
  overflow, nothing escaping its container. Text reflow is fine — that is the layout
  working.
- With only one artboard: keep the design's relationships as the window narrows (do this
  without asking), but do not invent a structural change — stacking, hiding elements or a
  hamburger is a design decision and gets asked. Fixed pixels are **not** the neutral
  choice here; they are a claim that the layout never adapts.
- If the order changes between the two artboards, do not duplicate the DOM — use `order-*`.
- Prefer padding and content-derived height over fixed heights; use `min-h-*` when you
  must.

## 4b. Interaction

- If the design shows arrows, dots, chevrons or an active/inactive state, the component is
  **not static**. Detect the pattern (carousel, tabs, accordion, dropdown, modal,
  pagination) and build markup that can carry the behaviour: real `<button>`s, `aria-label`,
  `aria-current` on the active item.
- If the behaviour is not implemented, leave a TODO and write it in the report — do not
  ship a static strip as if it were finished.
- **No dependency is installed without the user's approval.** Use what the project already
  has; if there is nothing, ask (see SKILL.md §3a4).

## 5. Token discipline

- Use a token class for a colour that has an exact match in the theme; otherwise use an
  arbitrary value **and** add a "token worth adding" line to the report.
- The `@theme` block is never changed on your own initiative — it is a shared surface, and
  changing it for a single component affects other screens.
- If the same hex appears as an arbitrary value in three separate components, it is now a
  token candidate — **surface it** in the report, do not silently write it a fourth time.

## 6. Dead code and consistency

- Do not leave unused props, imports or `data-testid`s.
- `data-testid` exists only for verification; never bind behaviour to it in product code.
- If the same icon is duplicated in two components, extract it into a shared file.
- File and directory naming must follow the project's existing convention.
- **Every identifier in the code is in ENGLISH.** File name, component name, prop,
  variable, `data-testid`, CSS token name — all of them. Even when the design is in
  another language, the code is written in English: `ProductCard.tsx` / `<ProductCard>` /
  `data-testid="product-card"`, not `UrunKarti`. Other languages stay **only** in
  user-visible strings and in the report.

## 7. What the review gets

When `/code-review` runs, this file plus that section's `code.md` are given as context.
What is expected from the review: violations of the items above **and** general
correctness/simplicity findings. After the review findings are applied, `design-diff` is
run **again** — a refactor may have broken the alignment.
