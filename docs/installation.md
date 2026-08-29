# Installation

## Prerequisites

### 0. Node 18+ (required)

Measurement now runs through `cli/dist/d2c.mjs`, **without a browser**. The bundle is
committed to the repo; no `npm install` is needed.

```bash
node "$D2C_ROOT/cli/dist/d2c.mjs" doctor
```

Verified in CI on Node 18, 20, 22 and 24.

### 1. chrome-devtools MCP (only for the legacy path)

**No longer required for measurement.** Where it is still needed:
- the `design-diff` and `visual-diff` verification agents when Playwright is unavailable
- extraction with `extractorStrategy: "legacy"`

> Note: the XD viewer is an SPA and the artboard is drawn to a `<canvas>` — there is no
> content in the DOM. But the **source** of the data drawn to that canvas can be fetched
> over plain HTTP; that is what the measurement path uses.

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated
```

> **Why `--isolated` is mandatory:** installed without arguments, the server always opens
> Chrome with the same fixed profile (`~/.cache/chrome-devtools-mcp/chrome-profile`).
> Because Chrome gives a profile to one process at a time, **a second Claude Code session
> cannot open the browser at all** and gets:
>
> ```
> The browser is already running for .../chrome-profile.
> Use --isolated to run multiple browser instances.
> ```
>
> `--isolated` gives every server its own temporary profile, so sessions do not lock each
> other out. Since XD *view* links are public, there is no need for a persistent profile
> (logins, cookies).

Verify: in a fresh session `mcp__chrome-devtools__list_pages` must be callable.

### 2. Playwright (for verification)

`render verify` and `visual diff` use the system's Chrome — they **do not download a
binary**.

```bash
npm i -D playwright-core     # in the target project
```

Without it, measurement (`xd extract` / `sections` / `spec`) **still works**; only the
verification commands do not. `d2c doctor` tells you the status.

### 3. Python — **no longer required** (1.11.0)

**Pillow (PIL) is not needed at all on the normal path.** The visual comparison moved to
TypeScript in 1.11.0 and its equivalence with PIL was proven at the pixel level (across 8
cases the raw/structural difference is **exactly 0**; the heat map and crops are byte for
byte identical). The code is bundled inside `cli/dist/d2c.mjs` — there is nothing to
install.

**Since 1.12.0 `python3` itself is no longer called on the normal path either.** The
component inventory moved to `d2c inventory` (AST based, in the bundle).

The remaining Python scripts are only used on **optional paths**, and both need Pillow:

| Script | When | PIL? |
|---|---|---|
| `section-map.py` | **only** with `extractorStrategy: "legacy"` | yes |
| `visual-diff.py` | **only** with `visual diff --motor python` / `--kalibre` | yes |
| `component-inventory.py` | no longer called — kept as a fallback | no (stdlib only) |

So: install Python only if you are going to use the *legacy path* or the *anchor fallback*.

```bash
pip install Pillow     # only for legacy / --kalibre
```

### 4. Node + your project (required)

Verification renders the generated code on a real dev server and measures it. The target
project has to be runnable (`npm run dev` must start).

### 5. The design's fonts (not required, but strongly recommended)

If the fonts are not loaded in the project, **text measurements drift**. The tool detects
this and warns, but everything beyond box measurements becomes unreliable. Wire them up
with `next/font/local`.

## Installing the plugin

This repo is **both the plugin and its own marketplace**. The
`.claude-plugin/marketplace.json` inside it defines a marketplace called `d2c-marketplace`
and, via `"source": "./"`, says "the plugin is at the root of this repo". So no separate
marketplace repo is needed — whoever registers the repo can also install the plugin.

### From GitHub (normal use)

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

The first command registers the marketplace on your machine (once), the second installs the
plugin.

> **If the repo is private**, `marketplace add` clones with your git identity; whoever
> installs it needs access to the repo (an SSH key or `gh auth`). Without access the
> command fails at the clone step — that is not a plugin error.

**If you use it as a team**, you can define the marketplace at project scope:

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c --scope project
```

This writes the marketplace entry into the project's settings; it is then ready for
everyone who opens the repo, and nobody has to run `marketplace add` by hand.

### From a local directory (while developing this plugin)

```bash
claude plugin marketplace add /path/to/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

For editing and testing the source files. **Do not forget to bump the version** —
`plugin update` looks at the version number, not the contents (see troubleshooting).

### Verify the installation

```bash
claude plugin validate /path/to/claude-plugin-d2c --strict
claude plugin list
```

> **A newly installed plugin's agents are registered in the next session.** Restart Claude
> Code after installing. "The file is there" is not proof — as its first step `/d2c` runs a
> smoke test by actually calling `design-diff` and `visual-diff`.

## Project configuration

Every project needs a `.d2c.json` at its root. If it is missing, `/d2c` asks and creates it
on the first run.

```jsonc
{
  "styling": { "tailwind": 4, "themeFile": "app/globals.css" },
  "componentsDir": "components",
  "previewDir": "app",
  "devCommand": "npm run dev",
  "devPort": 3005,
  "fonts": ["<design body font>", "<design heading font>"],
  // The family names shown in the XD spec panel — they must be LOADED in the
  // project, otherwise text measurements silently drift (check #6 catches this).
  "reportDir": "docs/d2c",
  "writeAllowlist": ["components/**", "app/**", "docs/d2c/**"],
  "extractorStrategy": "auto"
}
```

`extractorStrategy`: **`auto`** (default) uses the network path and stops with a diagnosis
if the contract is broken · **`network`** network only · **`legacy`** 1.4.0 behaviour
(chrome-devtools MCP + the playbook probe method). The legacy path is preserved.

If you use Tailwind v3:
`"styling": { "tailwind": 3, "config": "tailwind.config.js" }`

## First run

```
/d2c https://xd.adobe.com/view/<id>/specs/
```

It splits the screen into sections, shows the map, and asks which section to generate.

| Command | What it does |
|---|---|
| `/d2c <link> [section\|all]` | End to end: segment → measure → generate → verify → review |
| `/d2c-spec <link> [section]` | Measurement only, generates no code |
| `/d2c-code <link\|report> <section>` | Code generation + the verification loop only |
| `/d2c-verify <component\|route>` | Re-verifies existing code |

## Updating

```bash
/plugin update d2c     # a restart is required
```
