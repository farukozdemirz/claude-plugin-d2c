# Benchmark — baseline measurement and comparison

This file exists to make the gain from moving to the deterministic architecture
**provable**. The repo made this mistake once: 1.2.0's speed gain could never be measured
because `sure_sn` was left empty. The numbers here are so that does not happen again.

> **Rule:** when a hand-written expected value contradicts the measurement, **the
> measurement wins** and the reference error is reported. This file is the record of the
> measurement.

---

## 1. The metric that matters: tool-call count

In this pipeline **time ≈ tool calls × model latency**. The bottleneck is not the browser,
it is per-call latency. So the measure of an improvement is not time but the **call
count**:

- Time is noisy (model latency, network, machine load).
- The call count is a count of deterministic steps — it is reproducible.

The call count is measured **from the transcript**, not by asking the model to count:

```bash
node cli/test/bench/count-tool-calls.mjs --project <target-project>
node cli/test/bench/count-tool-calls.mjs --project <project> --since <ISO> --until <ISO> --json
```

Details: [`cli/test/bench/README.md`](../cli/test/bench/README.md)

---

## 2. Baseline — legacy behaviour before 1.4.0

**Source:** the three acceptance-test screens (a/b/c), real runs from 2026-08-25.
Measured retrospectively from transcripts; no new run was made.
The windows are anchored to observable events: each starts at the `/d2c-spec` command and
ends when that section's **last verification agent finishes**.

| Section | Window (UTC) | Main loop | Agent calls | **Total** | Time |
|---|---|---:|---:|---:|---:|
| a — product reviews | 18:36:15 – 19:44:27 | 107 | 83 | **190** | 68.2 min |
| b — review list | 19:44:27 – 20:42:11 | 52 | 70 | **122** | 57.7 min |
| c — review drawer | 20:42:11 – 21:37:13 | 69 | 70 | **139** | 55.0 min |
| **Median** | | **69** | **70** | **139** | **57.7 min** |
| **Total (3 sections)** | | 228 | 223 | **451** | 180.9 min |

### Verification agents — cost per round

| Agent | Rounds | Calls (per round) | Time (per round) |
|---|---|---|---|
| `design-diff` | 5 | 14 · 11 · 14 · 10 · 7 → **median 11** | 208 · 140 · 228 · 184 · 124 s → **median 184 s** |
| `visual-diff` | 3 | 58 · 56 · 53 → **median 56** | 1166 · 960 · 612 s → **median 960 s** |

`visual-diff` consumed **2738 seconds** (45.6 min) over three rounds — **25%** of the
total time of three sections, for a single verification step.

### Method validation

The measurement method reproduced, exactly, two values that were **independently recorded**
in the rule files (the "verify with a control element" discipline of `playbook.md` §20):

| Recorded in `skills/d2c/SKILL.md` §3b | Measured from the transcript |
|---|---|
| `visual-diff` 612 s / 53 calls | "Visual diff drawer c" → **612 s / 53 calls** ✓ |
| `design-diff` 124 s / 7 calls | "round 2 regression c" → **124 s / 7 calls** ✓ |

The counting is reliable.

### Reference correction — main-loop call count

The architecture plan had **derived** the main-loop call count using the repo's own
formula: `57.3 min ÷ 15 s ≈ 229 calls`. Direct measurement does not confirm that:

| | Value |
|---|---|
| Derived (by formula) | ~229 calls / section |
| **Measured** | **52 – 107 calls / section** (median 69) |

**Why:** the `~15 s/call` average works well for subagents (short, single-purpose calls),
but in the main loop long `Bash` calls, large `evaluate_script` calls and the thinking time
in between inflate the formula.

**Conclusion:** the target does not change — extraction + the section map will collapse to
one call. But the claimed gain now rests on a measured baseline. The derived number in the
architecture plan is **corrected** by this file.

---

## 3. Historical records (measurements recorded in the docs)

Other measurements the main plan rests on, as recorded in the rule files:

| Source | Measurement |
|---|---|
| `skills/d2c/SKILL.md` §3c | A single-section run of **106 min**: main loop 57.3 min (54%) · `visual-diff` ×3 35 min (33%) · `design-diff` ×4 13.2 min (13%) |
| `skills/d2c-code/SKILL.md` §4b | With the calibration anchor provided, the visual diff goes **19 min → 10 min** |
| `skills/d2c/SKILL.md` §4 | A missing `olcum.json` costs **~15 calls ≈ 4 min** per section |
| `skills/d2c-spec/references/playbook.md` §24 | Single-call calibration replaces the **10-15 calls** of trial and error |
| `docs/limitations.md` | Measurement ~30 clicks · visual diff ~50 calls per round · 10-20 min per section was "normal" |

The 106 min run in §3c is a **different** run from the three in §2 (in that section
`design-diff` ran 4 rounds and `visual-diff` 3). The three runs in §2 fall between 55 and
68 min.

---

## 4. Targets

From the architecture plan; the "milestone" column shows when each is due.

| Metric | Measured (baseline) | Target | Milestone |
|---|---|---|---|
| XD extraction + section map — Claude calls | most of the main loop | **1** | M1 |
| XD extraction time | — | **< 5 s** | M1 |
| `design-diff` — calls per round | median 11 | **1** | M2 |
| `visual-diff` — calls per round | median 56 | **3** | M3 |
| Total calls per section | median **139** | — | — |
| Time per section | median **57.7 min** | < 20 min | M3 |

**M1's only numeric acceptance criterion:** the number of Claude tool calls spent until a
section's `olcum.json` is produced → **1**. In M1 the code generation, verification and
review times will not change, and that does not count as a failure.

---

## 5. Comparison method

- The same three fixture screens, the same target project, the same fonts loaded.
- Each run appends one line to `<reportDir>/runs.jsonl`; `surum` and `sure_sn` **must not
  be left empty**.
- The call count is measured with the bench tool and written into the line as
  `arac_cagrisi`.
- The **median** is reported, not the mean (n is small, outliers mislead).
- Version-based comparison (the snippet from `skills/d2c/SKILL.md` §6):

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

---

## 6. Raw data

- Instrumented telemetry: `<target-project>/docs/d2c-kabul/runs.jsonl`
  (marked `olcum_kaynak: "transcript-geri-donuk"`; backup: `runs.jsonl.yedek-faz0`)
- Transcripts: `~/.claude/projects/<encoded-project-path>/`
- Measurement tool: `cli/test/bench/count-tool-calls.mjs`
