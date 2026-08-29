---
name: d2c
description: "Runs end to end from an XD link: splits the screen into sections, measures and converts the selected sections into Tailwind + React code, then puts them through the measurement + visual + review loop."
argument-hint: <xd-link> [screen no|section no|"all"]
---

# d2c

The single entry point. You do not call `/d2c-spec` and `/d2c-code` yourself — this
command runs them in order.

**Argument:** the XD link. Optional second argument: a screen number, a section
number, or `all`. If omitted, show the section map and ask.

## First thing

On the network path (the default), segmentation is done by `d2c sections` — skip to
§1-2. Read `references/segmentation.md` only on the **legacy** path, or when the
section map comes out meaningless for a design.


## Script paths

Resolve the plugin root before calling any script. `CLAUDE_PLUGIN_ROOT` is provided as
an environment variable in plugin context; when it is missing (in-repo development
install) the fallback chain kicks in:

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

From here on the CLI is called as `"$D2C_ROOT/cli/dist/d2c.mjs"` and Python scripts as
`"$D2C_ROOT/skills/.../scripts/..."`.
**Never write repo-relative paths** — the plugin runs inside someone else's project.

## 0. Prerequisite check — STOP if anything is missing

Silent failure is the most expensive error. Check in order, stop at the first gap and
say so.

| # | Check | How | If missing |
|---|---|---|---|
| 0 | Node + CLI | `node "$D2C_ROOT/cli/dist/d2c.mjs" doctor` | Node ≥18 required. Measurement runs through this path; no browser needed. |
| 1 | Chrome (for verification) | `node "$D2C_ROOT/cli/dist/d2c.mjs" doctor` | `playwright-core` + system Chrome. Without it **measurement still works**, `render verify` / `visual diff` do not: `npm i -D playwright-core` |
| 2 | Python + PIL | `python3 -c "import PIL"` | **NOT needed on the normal path** (1.11.0: the visual diff moved to TS, equivalence with PIL is proven). Only for `extractorStrategy: "legacy"` or `visual diff --motor python` / `--kalibre` |
| 3 | chrome-devtools MCP | **only when `extractorStrategy: "legacy"`** | **NOT needed** on the normal path. On legacy: `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated` (**`--isolated` is mandatory**). For agent registration traps see `docs/troubleshooting.md` |
| 5 | `.d2c.json` | Present at the repo root | If missing, **ask and create it** (see below) |
| 6 | Fonts | Is every family in `.d2c.json` actually loaded in the project — canvas width test (`document.fonts.check` LIES, see `design-diff` §3) | **Stop and say so.** Verified: 5 elements silently fell back to Arial; the measurements looked right while the family was wrong. |
| 7 | Lock | **legacy mode only** — `<reportDir>/.d2c.lock` | Not needed on the network path (no shared browser). On legacy, if present **stop** — see §5 |

## 0b. `.d2c.json`

Looked up at the repo root. **If missing, ask the user and create it; do not start
generating code before reading it.**

```jsonc
{
  "styling": { "tailwind": 4, "themeFile": "app/globals.css" },
  // For Tailwind v3: { "tailwind": 3, "config": "tailwind.config.js" }
  "componentsDir": "components",
  "previewDir": "app",              // where verification pages are written
  "devCommand": "npm run dev",
  "devPort": 3005,                  // 3000 may be taken
  "fonts": ["<design body font>", "<design heading font>"],
  // The family names shown in the XD spec panel — they must be LOADED in the
  // project, otherwise text measurements silently drift (check #6 catches this).
  "reportDir": "docs/d2c",
  "writeAllowlist": ["components/**", "app/**", "docs/d2c/**"],
  "extractorStrategy": "auto"       // auto | network | legacy  (default: auto)
}
```

| Field | Used for |
|---|---|
| `styling.tailwind` | **4**: the theme is the `@theme` block inside `themeFile`, there is NO `tailwind.config.js`. **3**: the `config` file is read. Token suggestions are formatted accordingly. |
| `componentsDir` | Generated components + the inventory scan live here |
| `previewDir` | `<previewDir>/<slug>-preview/page.tsx` verification pages |
| `devCommand` / `devPort` | Used by the verification agents. If the port is taken, pick a free one and **confirm the page you opened is the right app** via `document.title` + an expected selector. |
| `fonts` | Prerequisite check #6 |
| `reportDir` | All report output. Do not pollute the repo root. |
| `writeAllowlist` | **Do NOT write outside these patterns.** If you need to change a file outside them, stop and ask. |
| `extractorStrategy` | **`auto`** (default): network path; stops with a diagnosis if the contract is broken. **`network`**: network only. **`legacy`**: 1.4.0 behaviour (chrome-devtools MCP + playbook). The legacy path is **preserved**. |

## 1-2. Screen selection + section map — **a single command**

When `extractorStrategy` is `auto` or `network` (the default), these two steps finish
without a browser, in one CLI call:

```bash
D2C="$D2C_ROOT/cli/dist/d2c.mjs"
node "$D2C" xd inspect "<link>"                              # screen list (~0.5 s)
node "$D2C" xd extract "<link>" --screen "<name>" -o "$R/design.json"   # desktop+mobile
node "$D2C" sections --design "$R/design.json" --json -o "$R/bolum-haritasi-<screen>.json"
```

`xd inspect` also shows each screen's **mobile counterpart** (`↔ eşi var`); `xd extract`
extracts both together. When no counterpart is found you see `—` — in that case ask the
user which mobile screen it is, **do not assume**.

> **Do NOT open `design.json`.** It is the full scenegraph, hundreds of KB. Everything
> code generation needs is in `olcum.json` (§3). This boundary is deliberate.

**No calibration, no probes, no screenshots** — those three were the most expensive part
of the main loop.

### Legacy path  *(preserved)*

When `extractorStrategy: "legacy"`, or when the network path reported a contract error,
the classic flow applies:

**1. Pick the screen.** Open the link (`xd-viewer-notes.md` §2-4). If there is a
`/screen/<id>` use that screen; otherwise list the screens (`xd-viewer-notes.md` §12)
and ask the user. Find the mobile counterpart too.

**2. Section map (legacy)**

Apply the four steps in `references/segmentation.md`: calibration → band scan → blank-row
analysis → naming. Put the result in a table:

```
#   Y range          height     background  section
10  2923 – 3653      730        #FAFAFA     "Section Title" (48px)
```

Save the map as `<reportDir>/bolum-haritasi-<screen>.json` so later runs do not redo the
segmentation. **Write the calibration into that file too**
(`{"kalibrasyon": {"desktop": {...}, "mobil": {...}}}`): later sections of the same
screen should not have to reposition XD. On a five-section screen that alone saves four
calibration rounds.

If no section was given in the argument, show the map and ask **which section(s)**.
If the answer is `all`, produce them in order.

## 3. For each section: `/d2c-code`

First produce the section's measurement (one command on the network path):

```bash
node "$D2C" spec --design "$R/design.json" --section <no|slug> --out-dir "$R/<section-slug>"
```

Then invoke the `d2c-code` skill (via the Skill tool) and give it the **path to
`olcum.json`**. Build the section description from the map: section name + design box
(`Y..H`, full width).

`/d2c-code` already does the following internally — do not repeat them:
3a inventory → 3a3 interaction detection → 3 code → 4 `design-diff` →
**4a `render robust` (five widths)** → 4b `visual-diff` → 4c `/code-review` + regression.

**Do not stop between sections**; if one fails, record it and move to the next, then
report everything together at the end.

## 3b. Speed budget — count tool calls

In this pipeline **time ≈ number of tool calls × ~15 s**. The bottleneck is not the
browser, it is per-call model latency; **the only lever is the call count.**

Measured (1.4.0 → 1.8.0):

| Step | Before (median) | Now |
|---|---|---|
| Extraction + section map + `olcum.json` | ~229 calls | **1** |
| Render verification | 11 calls / 184 s | **1** / 1.3 s |
| Visual comparison | 56 calls / 960 s | **1** / 2.7 s (+ ≤4 `Read`) |

Details: `docs/benchmark.md`.

**On the network path the measurement phase collapsed to one call** (1.6.0). For the
measured baseline see `docs/benchmark.md`: median **139 calls / 57.7 min** per section
(1.4.0).

Target budget for a single section:

| Phase | Calls (network) | Calls (legacy) |
|---|---|---|
| Extraction + section map + `olcum.json` | **1-3** | 25-40 |
| Setup + lock + inventory | 3 | 3 |
| Calibration (`xd-viewer-notes.md` §24) | **0** | 1-2 |
| Measurement probes (§10) | **0** | 4-6 |
| Reference capture (during the measurement phase) | 2-3 |
| Code + preview page | 3-4 |
| Fixes + pre-check (**one** call per round) | 2-4 |
| Report + telemetry | 2 |
| **Skill total** | **~18** |
| `design-diff` ×2 · `visual-diff` ×1 | (agents) |

**Where waste happens most often:**
1. Trial-and-error pan/zoom → use the **§24** routine from the playbook, do not improvise.
2. Going back to XD during the code phase → `olcum.json` is already there (§4).
3. Separate `navigate` + `emulate` + `evaluate` after a fix → use **one** `evaluate_script`.
4. Calling an agent too early → do your own pre-check first; each agent round is 2-4 min.
5. **Reflexively running both agents** → look at the "which agent" table in `d2c-code`
   §4b; a pure position fix does not need a visual round.

## 3c. Time ceiling — 25 minutes

One measured real run took **106 minutes**. The breakdown shows what blew up:

| | Time | Share |
|---|---|---|
| Main loop (measurement + code + report) | 57.3 min | 54% |
| `visual-diff` **3 rounds** | 35 min | 33% |
| `design-diff` **4 rounds** | 13.2 min | 13% |

Two lessons:
- **The main loop is bigger than the agents.** Almost all of it was trial-and-error
  pan/zoom and repeated repositioning — §24 and `olcum.json` exist for exactly this.
- **Cost is driven by the number of rounds**, not the cost per round. `design-diff` ran
  all four rounds, and `visual-diff` had no cap at all back then.

**If a section passes 25 minutes, stop.** Tell the user where you are and where the time
went (how many measurement rounds, how many visual rounds, which finding will not close).
Let them decide whether to continue. **Do not silently burn an hour.**

## 4. Report

Everything goes under `<reportDir>` (default `docs/d2c/`) — do not pollute the repo root:

```
docs/d2c/
  bolum-haritasi-<screen>.json
  <section-slug>/spec.md        ← /d2c-spec output (for humans)
  <section-slug>/olcum.json     ← /d2c-spec output (for LATER PHASES)
  <section-slug>/xd-<vp>.png    ← visual diff reference, captured during measurement
  <section-slug>/code.md        ← /d2c-code output
  ozet.md                       ← one table covering all sections
```

`ozet.md`: section | measurement rounds | deviation | visual diff | review findings | result.

**`olcum.json` must not be skipped.** It holds the calibration, the reference PNG path
and the crop box; without it the code phase goes back to XD and `visual-diff` re-derives
the anchor — a loss of **~15 tool calls ≈ 4 minutes** per section. Its schema is in the
`d2c-spec` SKILL.md.

## 5. Concurrency

**No lock is needed on the network path.** Extraction happens over HTTP; verification and
visual comparison open their own Playwright session and **close it on every run**. The
shared-single-browser problem (and its patch, `.d2c.lock`) is gone.

> **The lock is still required in legacy mode.** `extractorStrategy: "legacy"` uses
> chrome-devtools MCP's **shared, single** browser; a second concurrent `/d2c` takes over
> the other's page (this actually happened). In that mode the `<reportDir>/.d2c.lock`
> check and the `run_in_background: false` rule still apply — see
> `docs/troubleshooting.md`.


## 6. Telemetry

Every run appends **one line** to `<reportDir>/runs.jsonl` (one line per section).

**Take the timestamp when the section starts** — you cannot compute it at the end:

```bash
BASLANGIC=$(date +%s)
```

When the section finishes, write the line:

```bash
printf '%s\n' "{\"tarih\":\"$(date -Iseconds)\",\"surum\":\"$(python3 -c "
import json;print(json.load(open('$D2C_ROOT/.claude-plugin/plugin.json'))['version'])")\",...,\"sure_sn\":$(( $(date +%s) - BASLANGIC ))}" >> "$REPORT_DIR/runs.jsonl"
```

Full schema:

```json
{"tarih":"2026-08-26T14:02:11+03:00","surum":"1.3.0","ekran":"Desktop - Screen A","bolum":10,"bolum_ad":"Section Title","artboardlar":["1440x3778","375x4164"],"olcum_turu":2,"sapma":0,"gorsel_diff":{"ham":7.81,"yapisal":10.03,"aksiyon":0},"review_bulgu":10,"review_uygulanan":6,"cozulemedi":1,"sonuc":"tamam","sure_sn":842,"arac_cagrisi":{"ana_dongu":69,"ajan":70,"toplam":139},"faz_sn":{"ana_dongu":2240,"design_diff":308,"visual_diff":612},"tur":{"design_diff":2,"visual_diff":1}}
```

`sonuc`: `tamam` · `sapmayla-bitti` · `basarisiz` · `atlandi-zaten-var`

> The JSON field names are the tool's internal data contract and stay in Turkish;
> only the prose in this repo is English.

### `arac_cagrisi` — the metric that matters

**Time is noisy; the tool-call count is not.** Model latency and machine load move the
clock, but the call count is a count of deterministic steps. Whether an improvement
worked is decided **here**.

Do not fill this field **by counting yourself** — that is fragile and unverifiable.
When the section finishes, measure it from the transcript:

```bash
node "$D2C_ROOT/cli/test/bench/count-tool-calls.mjs" \
  --project "$(pwd)" --since "$BASLANGIC_ISO" --json
```

`ana_dongu` = the skill's own calls · `ajan` = the calls inside the `design-diff` and
`visual-diff` rounds · `toplam` = the sum of both.

`faz_sn` breaks the time down by phase; `tur` records how many rounds each verification
agent ran. **Cost is driven by round count**, not cost per round (see §3c) — which is why
the round count is recorded separately.

> **1.12.0: the durations are measured now, not estimated.** Every command writes phase
> durations as JSON with `--trace <file>`; `--verbose` prints the same summary to stderr
> in human-readable form (so stdout stays machine-readable). Example:
>
> ```bash
> node "$D2C" render verify … --trace "$REPORT_DIR/izleme.json"
> # izleme.json → {"toplamMs":1256,"fazlar":[…],"fazSn":{"sayfa-yukleme":0.51,…}}
> ```
>
> `fazSn` can be dropped straight into the `faz_sn` field of `runs.jsonl`. Measured
> phases: `xd-shell` · `cdn-indirme` · `cikarma` · `bolumleme` · `playwright-yukleme` ·
> `sayfa-yukleme` · `olcum` · `referans-indirme` · `render-yakalama` ·
> `piksel-karsilastirma` · `envanter-tarama` · `smoke`.
>
> The trace carries DURATIONS only; no URL or token goes into it (Rule 2).

Baselines and the comparison method: [`docs/benchmark.md`](../../docs/benchmark.md).
Measured baseline (pre-1.4.0, three acceptance screens): median **139 calls**,
**57.7 min** per section; `design-diff` median 11 calls per round, `visual-diff` 56.

**`sure_sn` and `surum` must not be left empty.** Both the tool's accuracy *and* its speed
come out of this file; without `surum` you cannot compare whether an improvement worked.
These fields were left `null`, which is why 1.2.0's speed gain could never be measured —
do not repeat that.

Comparison:

```bash
python3 - <<'EOF'
import json, collections
d = collections.defaultdict(list)
for l in open("docs/d2c/runs.jsonl"):
    r = json.loads(l)
    if r.get("sure_sn"): d[r.get("surum","?")].append(r["sure_sn"])
for v, s in sorted(d.items()):
    print(f"{v}: n={len(s)} median={sorted(s)[len(s)//2]}s avg={sum(s)//len(s)}s")
EOF
```

## 7. Record what you learned

If a new trap or a lasting decision came out of the run, write it into **the plugin's own
rule files** — `playbook.md` (measurement), `tailwind.md` (code generation), `quality.md`
(the bar). These live inside the plugin; an item added here ships to every user with the
next release. The tool getting better over time depends on this.

If the project keeps its own decision log or progress file (when `CLAUDE.md` defines such
a rule), add a line there too. **Otherwise skip this step** — do not invent a file.
