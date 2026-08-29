# XD spec playbook → moved

The contents of this file moved to **`docs/xd-viewer-notes.md`**.

**Why:** the normal flow no longer opens the XD viewer at all — extraction goes through
HTTP + the AGC scenegraph, and the visual reference comes from the manifest thumbnail.
Loading 247 lines of browser-driving instructions into the skill context on every
measurement was an unnecessary cost.

**Nothing was deleted.** All 25 items are there; the table at the top of that file records
where each one went (rule / embedded in code / comes from the source data / archive).

## When to read it

When `.d2c.json` has `extractorStrategy: "legacy"`, **or** when the network path reported
a contract error. In that case measurement still follows the method described there:

```
$D2C_ROOT/docs/xd-viewer-notes.md
```
