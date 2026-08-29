# d2c — Design to Code (Adobe XD)

Measures Adobe XD designs and turns them into **verified** Tailwind + React code.

The difference: the values are not read by eye, they come from **XD's own spec data**; the
generated code is rendered in a browser and **measured again** to compare it against the
design.

```
/d2c <xd-link>
   │
   ├─ prerequisites (Node · .d2c.json · fonts)    ← MCP is NO LONGER required
   ├─ xd extract   → design.json   (HTTP + AGC scenegraph, ~1 s, no browser)
   ├─ sections     → section map   (no probes/calibration/screenshots, ~1 ms)
   │
   └─ for each section:
        ├─ spec          → olcum.json + spec.md   (Claude's ONLY input)
        ├─ component inventory ("does it already exist?")
        ├─ generate Tailwind + React
        ├─ render verify → verification.json      (Playwright, ~1.3 s)
        ├─ visual diff   → visual.json + ready-made crops (~2.7 s)
        ├─ /code-review  → quality bar
        └─ regression                             → code.md + runs.jsonl
```

Measurement never opens the XD viewer any more: the scenegraph the share link itself
provides is read over plain HTTP. Measured gains and method:
[docs/benchmark.md](docs/benchmark.md).

## Commands

| Command | What it does |
|---|---|
| `/d2c <link> [section\|all]` | End to end |
| `/d2c-spec <link> [section]` | Measurement only |
| `/d2c-code <link\|report> <section>` | Code + verification only |
| `/d2c-verify <component\|route>` | Re-verifies existing code |

The CLI underneath the skills can also be used directly
(`node "$D2C_ROOT/cli/dist/d2c.mjs" --help`):

| Command | What it does |
|---|---|
| `doctor` | prerequisite check |
| `xd inspect <link>` | screen list + contract health |
| `xd smoke <link>` | live contract check — exit code 1 when it breaks (weekly CI) |
| `inventory [dir]` | current component inventory (AST) — "does this already exist?" |

Every command accepts `--verbose` (duration summary) and `--trace <file>` (JSON).

## Installation

```bash
claude plugin marketplace add farukozdemirz/claude-plugin-d2c
claude plugin install d2c@d2c-marketplace
```

Then **restart Claude Code** — agents and skills are registered at the start of a session.

This repo is both the plugin and its own marketplace; no separate marketplace repo is
needed. Prerequisites (Node, optional Playwright, `.d2c.json`, fonts) and project
configuration: [docs/installation.md](docs/installation.md)

## When something goes wrong

[docs/troubleshooting.md](docs/troubleshooting.md) — every entry actually happened

## What the tool cannot do

[docs/limitations.md](docs/limitations.md) — **read this before installing.** Interactions
are not read, breakpoints are an assumption, it generates no tests.

## Rule files

Everything the tool has learned is written down here. When a new trap is found it is added
here and the plugin version is bumped — so it reaches everyone.

| File | Contents |
|---|---|
| `docs/xd-viewer-notes.md` | The verified items for driving XD in a browser |
| `skills/d2c-code/references/tailwind.md` | Code generation rules (half-line compensation, font root, scrollbar…) |
| `skills/d2c-code/references/quality.md` | The bar a generated component has to clear |
| `skills/d2c/references/segmentation.md` | The screen segmentation method |
| `fixtures/README.md` | How to set up the acceptance-test fixture with your own design |

## Versioning

- **Minor** — when a rule/reference is added
- **Major** — when a command name or the `.d2c.json` schema changes
