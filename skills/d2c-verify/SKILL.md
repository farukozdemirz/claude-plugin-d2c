---
name: d2c-verify
description: "Re-verifies an existing component against its XD design: measures it with design-diff and compares pixels with visual-diff. Generates no code."
argument-hint: <component|route> [xd-link]
---

# d2c-verify

**Re-verifies** existing code. It does not generate or fix code — it runs `/d2c-code`'s
verification loop on its own.

When to use it: after a component was edited by hand, when the design was updated, or to
see whether a refactor broke the alignment.

## Input

- **Component name or route** — `review-card` or `/review-card-preview`
- **XD link** (optional) — if omitted, the measurements in `<reportDir>/<slug>/spec.md`
  and the **`olcum.json`** next to it (calibration + ready-made reference PNG + crop box)
  are used as the target values. If given, the design is re-measured first (it may have
  changed).

## Flow

1. **Read `.d2c.json`.** If it is missing, stop — `/d2c` has to be run to create it.
2. **Find the target values.** If `<reportDir>/<slug>/spec.md` does not exist and no XD
   link was given, **stop**: you do not know what to verify against.
3. **Measure — two commands, no agent needed:**

```bash
D2C="$D2C_ROOT/cli/dist/d2c.mjs"
node "$D2C" render verify --olcum "<reportDir>/<slug>/olcum.json" --url "<route>" \
  --json -o "<reportDir>/<slug>/verification.json"
node "$D2C" visual diff --olcum "<reportDir>/<slug>/olcum.json" \
  --xd-url "<xd link>" --screen "<screen>" --url "<route>" --testid "<section testid>" \
  --out-dir "<reportDir>/<slug>/gorsel"
```

Together they take **~4 s**. If there is no `sapan` in `verification.json` and no
deviating region in `visual.json`, the verification is clean — do not call an agent.

> **Engine (1.11.0).** The visual comparison now runs in TypeScript; **Python + PIL are
> not required**. If you doubt the result, `--motor python` runs the old script (their
> equivalence is pinned by tests). If you pass `--kalibre` the engine automatically falls
> back to Python; which one ran is recorded in the `motor` field of `visual.json`.

4. **If something deviates, have it interpreted.** Give the `design-diff` agent the path
   to `verification.json` and the `visual-diff` agent the path to `visual.json`. The
   agents do not measure; they explain **why** and look at the ready-made crops.

   *Legacy:* if `playwright-core` is unavailable, call the agents in their MCP form —
   that path is preserved.
5. **Report** — `<reportDir>/<slug>/verify-<date>.md`. Do **not** change the code; if
   there are deviations, list them and suggest fixing them with `/d2c-code`.
6. Append a line to `<reportDir>/runs.jsonl` (`"sonuc":"dogrulama"`).

## Known and accepted deviations

Do not count these as ✗ — they come up in every verification:

- **`border-box`**: on boxes with a 1px border the inner measurements shrink by 2px (XD's
  *Center Stroke* sits on the geometry edge, while a CSS border is drawn inside the box).
- **XD text frame ≠ CSS line box**: for a single line XD reports ≈1.25×font-size, CSS
  reports `line-height`. Text **height** rows are marked `✓ (metin çerçevesi)`.
- **Vector icons are approximate** on the legacy path — the XD viewer does not export
  them; the box and colour are measured, the path is not. *(Solved on the network path:
  `d2c xd assets` exports real SVG.)*
- **The visual diff percentage has a ~5-10% floor** — XD draws to a canvas, the browser
  draws the DOM. The percentage is not a pass mark; look at the deviating regions.
