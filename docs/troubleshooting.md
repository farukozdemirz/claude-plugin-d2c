# Troubleshooting

Every entry here **actually happened** while building this tool. No hypothetical scenarios.

> **1.8.0 note.** The normal flow no longer uses chrome-devtools MCP; measurement goes
> through HTTP + AGC, verification uses its own Playwright session, and the visual
> reference comes from the manifest thumbnail. Some of the entries below therefore only
> come up in **`extractorStrategy: "legacy"`** mode. None were deleted — the legacy path
> works and every entry happened once for real. Where each applies is stated at the top of
> the entry.

## Four entries added in 1.8.0

**`render verify` says "nothing was found".** The `testid`s in `olcum.json` do not match
the `data-testid`s in the render. The code phase (`d2c-code` §3) has to fill in the
mapping. The command deliberately **does not measure**: measuring with an invented
selector silently produces wrong results.

**The visual diff reports a 30% difference but they look identical.** The reference and
the render are at different scales. The thumbnail reference is 0.5×, the render is 1×. The
code detects this and scales the render down, but no scaling is applied on the `--kalibre`
path — there, capture the reference at full resolution.

**POC-4 reports every font as "not loaded".** `next/font/local` changes the generated
family name (`Bw Modelica` → `bwModelica`). The check has to use the **generated** name;
`font parity` resolves this automatically from the page by size + colour. If it cannot, it
uses the XD name and the difference shows up in the table.

**`playwright-core not found`.** It is an optional dependency: `npm i -D playwright-core`.
Measurement (`xd extract` / `sections` / `spec`) works without this package.

---

## The agent registers but the chrome-devtools tools are MISSING (0 tools) *(legacy only)*

**Symptom:** `design-diff` / `visual-diff` are invoked and reply — but a call to
`mcp__chrome-devtools__list_pages` says `No such tool available`. Measurement and render
capture are impossible. The agent's tool list is only `Bash, Read`.

**Cause — a documented restriction:** *Plugin* subagents **do not support** the
`mcpServers:` field; it is silently ignored:

> "For security reasons, plugin subagents don't support the `hooks`, `mcpServers`,
> or `permissionMode` frontmatter fields. These fields are ignored when loading
> agents from a plugin."
> — code.claude.com/docs/en/sub-agents

When the field is dropped, only the restrictive `tools:` list remains → zero MCP tools.

**The trap:** the same file **does work** with `mcpServers:` when it sits under
`.claude/agents/`. If a project copy exists, the smoke test **passes by accident** — what
is running is the project copy, not the plugin copy. This actually happened: two
byte-identical files, the project copy with 29 tools and the plugin copy with 0.
Distinguish them by calling the agent with the **`d2c:` prefix**:

```
Agent(subagent_type: "d2c:design-diff")   # the plugin copy
Agent(subagent_type: "design-diff")       # the project copy (if any)
```

**Fix:** grant MCP access inside `tools:` with the server pattern — no `mcpServers:`:

```yaml
tools: Bash, Read, Glob, Grep, mcp__chrome-devtools__*
```

The `mcp__<server>__*` pattern grants **all** of that server's tools (29 chrome-devtools
tools). Listing tool names one by one also works but is unnecessary and fragile.

**Careful:** if you see advice somewhere saying "`tools:` does not accept MCP names, use
`mcpServers:`", that observation was made on a **project agent**; it does not apply to a
plugin agent.

**Note:** the agent registry is loaded **at the start of a session**. After fixing the
frontmatter, restart Claude Code, otherwise the old registration persists.

---

## `The browser is already running for .../chrome-profile` *(legacy only)*

**Symptom:** any `mcp__chrome-devtools__*` call fails with:

```
The browser is already running for ~/.cache/chrome-devtools-mcp/chrome-profile.
Use --isolated to run multiple browser instances.
```

**Cause:** the MCP server was installed **without arguments**. Chrome is then always
opened with the same fixed profile, and Chrome gives a profile to one process at a time.
With several Claude Code sessions, whoever grabs the profile first wins and the others
cannot open a browser at all.

**Fix — permanent:**
```bash
claude mcp remove chrome-devtools
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated
```
**A running MCP server's arguments do not change** — the new setting only takes effect
after Claude Code is restarted.

**Fix — immediate:** find and close the Chrome holding the profile. Trace its owner like
this:

```bash
ls -l ~/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock   # -> ...-<chrome_pid>
ps -o ppid=,args= -p <chrome_pid>                                 # -> which MCP server
```
**Ask** before closing someone else's session — it may be in the middle of a measurement.

---

## A `fullPage` screenshot re-lays out the page *(legacy only — the new path does not use `fullPage`)*

**Symptom:** you did `emulate({viewport:"1455x1000x1"})` and verified
`clientWidth === 1440`, but in a screenshot taken with `fullPage: true` the measurements
belong to the 1455 layout (a 1312 bar looks like 1327).

**Cause:** while capturing a full page, Chrome removes the scrollbar and **re-lays out**
the page; the 15px compensation goes back into the layout at that moment.

**Fix:** emulate a height where the page fits vertically (e.g. `1440x1300`) and take a
**normal viewport** screenshot; do not use `fullPage`. After capturing, verify the width
of a known element in the image.

---

## The visual diff calibration locks onto the wrong element *(only on the `--kalibre` path)*

> **1.11.0 note:** the visual comparison now runs on the TypeScript engine by default (no
> PIL needed). When `--kalibre` is given the engine **falls back to Python automatically**,
> because the anchor logic below was deliberately not ported. So this section still applies
> and `visual-diff.py` is still in place. If you suspect the TS engine, force the old path
> with `visual diff --motor python`.

**Symptom:** you passed `--kalibre "#0C2380:64,701.16,1312,72"` but the crop is completely
off; the scale comes out as some odd number instead of 1.0.

**Cause:** `bbox_of_solid_block` in `visual-diff.py` matches colours with **`tol=60`**. If
there is another navy on screen close to the anchor (a real example: a campaign banner at
`#06205E` matches `#0C2380` at that tolerance) and that block is **longer**, the script
anchors onto it.

**Fix:** choose a **unique** colour inside the section as the anchor; if a second close
colour exists on the same screen, crop the reference yourself with a narrow tolerance
(`tol≈12`) and hand the script pre-cropped images.

**How the script addresses this:**
- The `--kalibre-tol` flag was added (default 60) — the anchor threshold is now tunable.
  Do not confuse it with `--tol`: that is the difference threshold (default 28).
- Block selection is no longer "the longest run" but **the candidate whose aspect ratio is
  closest to the design box you gave in `--kalibre`**. Fake candidates (like a banner) are
  1-2 rows tall, so their ratios land far from the target and they are eliminated.
  Candidates narrower than 20% of the widest one are also discarded (a 7×1 smudge can also
  have the "right ratio").
- If two candidates are both close to the target ratio, the script now prints a **WARNING**
  — it does not stay silent.

Verification (three real references, anchor `#0C2380`):

| Screen | Old (longest run) | New (ratio match) |
|---|---|---|
| (a) product reviews | 1311×71 ✓ | 1311×71 ✓ |
| (b) review list | **1438×453 ✗ (banner)** | **1312×71 ✓ (product bar)** |
| (c) review drawer | 436×63 ✓ | 436×63 ✓ |

---

## The measurements are right but the font is wrong — nobody notices

**Symptom:** the `design-diff` table is spotless; font-size, line-height and colour all
match. But the text looks wrong by eye.

**Cause:** `document.fonts.check('16px "Bw Modelica"')` **returns `true` even with a
fallback in place.** Even when the family is not loaded, the browser counts it as
"available". In testing it gave a false positive for both `Bw Modelica` and
`Helvetica Neue`.

**Fix:** a canvas width comparison:
```js
const c = document.createElement('canvas').getContext('2d');
const s = 'ABCDEFGHIJ...0123456789';
const w = f => { c.font = `48px ${f}`; return c.measureText(s).width; };
const yuklu = ['monospace','serif'].some(fb => w(`"${aile}",${fb}`) !== w(fb));
```

**Related:** `next/font/local` changes the generated family name (`Bw Modelica` →
`bwModelica`). Run the check with the **generated** name.

---

## The font falls back to Arial at the section root

**Symptom:** the card is in the right font, but the section's own text (heading, subtitle,
button) is `Arial, Helvetica, sans-serif`.

**Cause:** `globals.css` has `body { font-family: Arial, ... }`. You set the component
family only on child components, so the section's own text picks up body's fallback. It
goes unnoticed because the measurements look right.

**Fix:** put the family on the **section's root element**. Have `design-diff` report each
element's computed `fontFamily`.

---

## Port 3000 is taken / I measured the wrong app

**Symptom:** the measurements are odd; the page does not contain the expected selector.

**Cause:** another project is running on 3000.

**Fix:** set `devPort` in `.d2c.json`, or pick a free port:
```bash
# With Node — since 1.11.0 python3 is no longer a prerequisite
PORT=$(node -e "const s=require('net').createServer();s.listen(0,()=>{console.log(s.address().port);s.close()})")
```
After opening it, confirm it is **the right app** via `document.title` + the expected
selector. If the selector is missing, **do not measure**.

---

## I measured at 1440 but the values come out as 1425

> **1.12.0 note — this does not happen in every environment.** Measured: *headless* Chrome
> uses an **overlay** scrollbar; it does not consume layout width and the compensation is
> never triggered. The trap is specific to environments with **classic** scrollbars (headed
> Chrome, depending on system settings). `viewportAyarla` handles both correctly: it
> applies the compensation only when needed and **verifies the result** — if it does not
> hold, it does not measure.
> The compensation branch is now tested deterministically with a fake `Page`
> (`cli/test/verify.test.mjs`), because in a real browser whether that branch runs depends
> on the scrollbar regime of the machine running it.

**Cause:** if the page overflows vertically, Chrome's classic scrollbar takes ~15px; in a
1440 window the layout width becomes **1425**. A 1312 bar reads 1297, a 640 card reads
632.5.

**Fix:** emulate a window 15px wider and **verify**:
```
emulate({ viewport: "1455x1000x1" })  →  document.documentElement.clientWidth === 1440
```
If it does not hold, do not measure.

---

## The mobile viewport will not go down to 375

**Cause:** `resize_page` hits Chrome's minimum window width (~500px) and silently stays
wider — turning a mobile measurement into a desktop one.

**Fix:** `emulate({ viewport: "375x800x1" })`, then verify `window.innerWidth`.

---

## The panel does not report a radius *(legacy only — AGC reports the radius verbatim)*

**Symptom:** the card's corner is rounded but there is no `radius` row in the spec panel.

**Cause:** the XD panel reports a radius **only for a `Rectangle`**. If the element is a
`Path`, neither a `radius` row nor a `border-radius` in the CSS block appears. Do **not**
say "radius 0".

**Fix:** measure it from pixels — `dpr 3` + zoom 200% (6 device px per design px), isolate
the edge colour, and solve the deviation profile from the straight edge at the corner with
`r − √(r² − (r−k)²)`.
**If the same screen has a Rectangle whose radius the panel does report, measure that too
and validate the method.**

Verified example: the reference said "radius 8"; the measurement gave 12. The control
element (a mobile bar where the panel says radius 8) measured 7.01 from pixels → the method
reads 8 as 8, so the desktop 12 is real.

---

## The card height does not match, and the deviation grows further down

**Cause:** **XD text frame ≠ CSS line box.** For an auto-height frame XD reports
`(n−1)×line-height + fontBox`; CSS renders `n×line-height`. The difference is
`line-height − fontBox` and **half sits above, half below**. It accumulates.

For Bw Modelica, `fontBox ≈ 1.25 × font-size`.

**Fix:** shrink the space above and below text whose `line-height > fontBox` by the
half-line. Verified: 16/27 body text (halfLine 3.5) → `mt-[4.5px]` (XD 8) and
`mt-[12.5px]` (XD 16) below it → card 248.88 against XD's 248.89. Without compensation it
was 256.

---

## Clicking an element always selects the parent Group *(legacy only — AGC gives the whole tree)*

**Cause:** XD will not let you select some text from inside a group; no matter how many
times you click, the panel gives you the `Group`.

**Fix:** do not insist. Clear the selection (click outside the artboard), read the panel's
**Character Styles** list, and find the single style matching the element's visible
properties (size, colour). Family + weight + size + colour come from there; **line-height
does not** — report that you could not measure it.

---

## The measurement was cut short / the page was pulled out from under me *(legacy only — no shared browser on the network path)*

**Cause:** the chrome-devtools MCP browser is **shared and single**. A verification agent
running in the background took over the main measurement's page.

**Fix:** call the verification agents with `run_in_background: false`. Do not touch the
browser while `/d2c` is running. The lock file (`<reportDir>/.d2c.lock`) stops a second
run; if the process died, delete it by hand.

---

## `line-clamp` adds an ellipsis, XD does not

**Cause:** Tailwind v4 emits the **standard** `line-clamp` (not `-webkit-box`). There the
ellipsis is governed by `block-ellipsis` rather than `text-overflow`, and Chrome does not
implement it — so `[text-overflow:clip]` has **no effect**.

**Fix:** change the clipping mechanism: a fixed-height outer box + an inner box with
`max-h` + `overflow-hidden`.

---

## A horizontally scrolling strip pushes everything below it down

**Cause:** `overflow-x-auto` reserves 15px for the classic scrollbar. In the measurement it
shows up as "the gap that should be 24 came out 39".

**Fix:** `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`

---

## Zoom will not go below 25% *(legacy only)*

**Cause:** the XD viewer's zoom box bottoms out at 25 (even if you type 20/15/12).

**Fix:** to see the whole of a long artboard, **make the window taller**
(`resize_page` 1600×1400 → inner height ~1297; a 3778px artboard is 944.5 px at 25%).

---

## The plugin cannot find its script

**Symptom:** `ERROR: plugin root not found`, or the script does not run.

**Cause:** `CLAUDE_PLUGIN_ROOT` is empty and the fallback chain is looking in the wrong
place.

**The real install path includes a version subdirectory:**
```
~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
```
For example: `~/.claude/plugins/cache/d2c-marketplace/d2c/1.1.0/`

A flat path like `~/.claude/plugins/<plugin>` **does not exist**. Also, old version
directories remain after an update — a plain glob sorts alphabetically and puts `1.0.10`
before `1.0.9`. The fallback chain must pick the newest with `sort -Vr`.

---

## I changed the source but the installed plugin stayed old

**Symptom:** you fixed a file, ran `claude plugin update`, it says
`✔ d2c is already at the latest version`, and the old behaviour persists.

**Cause:** `plugin update` compares the **version number**, not the file contents. If the
version in `plugin.json` did not change, the cache is never refreshed. If you `--amend`ed a
commit or made a fix without bumping the version, the installed copy stays stale.

**Fix:** **bump the version** on every content change. You can tell whether it is stale by
looking directly at the cache:

```bash
grep -rn "the-change-you-are-looking-for" ~/.claude/plugins/cache/*/d2c/<version>/
```

---

## `claude plugin update d2c` → "Plugin not found"

**Cause:** the update command wants the **full identity**.

```bash
claude plugin update d2c@d2c-marketplace     # correct
claude plugin update d2c                     # "not found"
```

A **restart** is required after updating.

---

## An agent with the same name exists in both the project and the plugin

**Symptom:** the plugin is installed but the agent's old behaviour persists.

**Cause:** the project's `.claude/agents/design-diff.md` and the plugin's
`agents/design-diff.md` carry the same name.

**Fix:** after switching to the plugin, delete the copies in the project — let the plugin
be the single source. As long as the rule files (playbook, tailwind, quality,
segmentation) live inside the plugin, every rule added there reaches everyone; a project
copy breaks that.
