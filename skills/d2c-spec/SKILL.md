---
name: d2c-spec
description: "Extracts screen and section measurements from an Adobe XD view/specs link; produces olcum.json + spec.md. The default path is browserless (network based); the legacy path keeps working through chrome-devtools MCP."
argument-hint: <xd-link> [what to measure]
---

# d2c-spec

Extracts measurements from an XD share link. **Argument:** the first word is the XD link,
the rest is a free-form task description (optional).

## Which path

Decided by `extractorStrategy` in `.d2c.json` (default `auto`):

| Value | Behaviour |
|---|---|
| `auto` (default) | Network path. If the contract is broken it **stops with a diagnosis** and suggests switching to legacy |
| `network` | Network path only |
| `legacy` | 1.4.0 behaviour: chrome-devtools MCP + `$D2C_ROOT/docs/xd-viewer-notes.md` |

---

## Network path (default) — NO browser

Three commands. The XD viewer is never opened, nothing is clicked, no calibration is
needed.

```bash
D2C="$D2C_ROOT/cli/dist/d2c.mjs"          # see below for root resolution
R="<reportDir>"                            # from .d2c.json

# 1) extract the screen (desktop + mobile together, ~1 s)
node "$D2C" xd extract "<xd-link>" --screen "<screen name|id>" -o "$R/design.json"

# 2) section map
node "$D2C" sections --design "$R/design.json" --json -o "$R/bolum-haritasi.json"

# 3) measurement for the chosen section → olcum.json + spec.md
node "$D2C" spec --design "$R/design.json" --section <no|slug> --out-dir "$R/<section-slug>"
```

If you do not know the screen name, list them first:
`node "$D2C" xd inspect "<xd-link>"`

### Outputs and **who reads what**

| File | Read by |
|---|---|
| `design.json` | **Tools only.** The full scenegraph, hundreds of KB per screen. **Claude does NOT open it.** |
| `olcum.json` | **Claude.** Section-scoped and self-contained: box · spacing · radius · colour · stroke · typography · text · element relationships |
| `spec.md` | Humans |

This boundary does not move. Pulling `design.json` into context would shift the cost of
measurement from tool calls to tokens — relocating the problem, not solving it.

### What you need to know about `olcum.json`

- **`testid` starts out `null`.** The code phase fills it in (`d2c-code` §3). Until it is
  filled, the verification agent cannot use this file.
- **Re-running `d2c spec` preserves the `testid`s** — they are carried over by element
  `id`. Use `--force` to reset them. Anything that could not be carried over is written
  into `cozulemedi`.
- **The `tekrar` field describes a compressed series:** `adet` · when regular,
  `eksen`+`adim` (or on a grid `sutun`/`satir`/`adimX`/`adimY`), when irregular
  `duzenli:false` + `konumlar` (all positions preserved, no information lost). Eight
  identical cards become a single record.
- **`hesaplanan`** reports gaps **once per step**, and every record states its origin in
  the `nasil` field.
- **`font.fontKutusuAgc` is the RAW AGC value and is NOT used.** `fontKutusuKaynak` comes
  back as `"tarayici"` and `yariSatir` is `null`: for half-line compensation the font box
  is **measured in the browser during the code phase** (`d2c-code` §3). This was measured
  — the AGC value matches Chrome exactly for one family but is off by 10px at 48px for
  another, which flips the sign of the half-line.
- If the radius source is `rect` or `yol`, it came verbatim from the source data (counts
  as `P`). If it is `bilinmiyor`, it **could not be derived** — it was not invented, and
  the report says so.

### If the contract breaks

`xd inspect` / `xd extract` stop with a diagnosis. Two cases are distinct:

- **"XD linki geçersiz veya erişilemiyor"** → a typo in the link, a withdrawn share, or a
  non-public link. Ask the user.
- **"XD paylaşım sözleşmesi değişmiş olabilir"** → something changed on Adobe's side.
  Switch to the path below with `extractorStrategy: "legacy"` and report the situation.

---

## Legacy path — chrome-devtools MCP  *(preserved)*

Used when `extractorStrategy: "legacy"`, or when the network path reported a contract
error.

**First thing:** read `$D2C_ROOT/docs/xd-viewer-notes.md`. The 25 items there were
verified in a real session — do not try alternatives (especially MCP `click`, or
keyboard/scroll panning).

1. **Prerequisite.** If `mcp__chrome-devtools__*` is unavailable, stop and say:
   `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated`
2. **Open and prepare** (`xd-viewer-notes.md` §2-4) → **snapshot** (§5) →
   **calibration** (§24, a single call)
3. **Measure** — click elements and read the panel (§8-11), compute gaps from box
   differences (§14), run probes **in batches** (§10)
4. **Capture the reference here** (§23): dpr 2 + zoom 50%, **clear the selection**, save
   as PNG
5. **Report** — the same two files: `olcum.json` + `spec.md`

> On the legacy path `olcum.json` is filled in by hand; its schema is identical to the
> network path's (`cli/src/contracts/olcum.ts`). The `kalibrasyon` and `referans` fields
> are meaningful on this path and must be populated.

---

## Visual reference

**On the network path you do not need to do anything here.** `d2c visual diff` downloads
the reference **over HTTP** from the artboard thumbnail in the manifest; because the scale
is exactly 0.5 no calibration anchor is derived and the XD viewer is never opened.

On the legacy path the reference is still captured by hand (`xd-viewer-notes.md` §23:
dpr 2 + zoom 50%, clear the selection) and written into the `referans` field of
`olcum.json`.

## Script paths

```bash
D2C_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$D2C_ROOT" ]; then
  for c in $(ls -d "$HOME"/.claude/plugins/cache/*/d2c/*/ 2>/dev/null | sort -Vr) \
           "$HOME"/.claude/plugins/*/d2c "$HOME"/.claude/skills/d2c ./.claude; do
    [ -f "$c/cli/dist/d2c.mjs" ] && D2C_ROOT="${c%/}" && break
  done
fi
[ -z "$D2C_ROOT" ] && echo "ERROR: plugin root not found" && exit 1
```

## Report format (`spec.md`)

Generated automatically on the network path. Written by hand on the legacy path; the
content must be the same: screen · colour palette · character styles · table of measured
elements · computed gaps (with the two boxes they were derived from) · accepted
deviations · unresolved items.
**Read values and computed values are marked separately.**
