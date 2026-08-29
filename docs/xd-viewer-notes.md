# XD viewer notes  *(formerly `playbook.md`)*

This file has **two roles**:

1. **The reference for the `extractorStrategy: "legacy"` path.** If network-based
   extraction reports a contract error, or the user deliberately switches to legacy,
   measurement is still done with the method described here. These items are **valid and
   necessary**.
2. **An archive of XD viewer behaviour.** The normal flow no longer uses a browser
   (extraction over HTTP + AGC, visual reference from the manifest thumbnail). The items
   here therefore do not apply on the default path — but they were **not deleted**: each
   one is a failure that actually happened, and if a browser path is ever needed again it
   should not have to be rediscovered from scratch.

## Where each item went

| Status | Items | Where |
|---|---|---|
| **Rule — still read** | §14 spacing derivation · §18 text box ≠ ink · §19 no carrying values between artboards · §21 stroke geometry ≠ visual | `skills/d2c-code/references/tailwind.md` |
| **Embedded in code** | §13 coordinate scales · §25 state between phases | `cli/src/source/adobe-xd/agc.ts`, `cli/src/olcum/project.ts` |
| **Comes from the source data** | §5 palette/character styles · §9 panel reading · §16 Path radius · §22 Character Styles inference | The AGC scenegraph — no pixel fitting or inference needed |
| **Archive** (valid on legacy) | §1-4, §6-8, §10-12, §15, §17, §20, §23, §24 | this file |

> **§1 IS CORRECTED.** *"WebFetch/curl will never work"* — the reasoning is right (there is
> no DOM content on a canvas) but the conclusion is **wrong**: the *source* of the data
> drawn to the canvas can be fetched over plain HTTP. That single assumption is why the
> whole architecture was built around a browser. §1 below is kept as a historical record.

---

# XD spec playbook

Methods verified to work in a real session. Do not try alternatives.

1. **WebFetch/curl will never work.** The XD viewer is an SPA; the artboard is drawn to a
   canvas and there is no content in the DOM. The only way is chrome-devtools MCP.
2. **Open:** open the link with `new_page` (timeout 60-90 s). For the spec panel the URL
   must end in `.../specs/`; if it does not, append `specs/`. Without `/screen/<id>` the
   first screen opens.
3. **Wide viewport:** ~1600×1000 via `emulate`/`resize_page` — so the right panel is fully
   visible.
4. **Dialogs:** if a "Grid View" intro box appears, click the button whose text is "OK".
   The blue hotspot/pan toast at the bottom is harmless. **Do not click "Sign in" or
   "Home screen"** — on some links Home redirects to Adobe auth; if that happens, go back
   to the specs URL with `navigate_page`. If you see a password form, ask the user for the
   password.
5. **Snapshot first:** `take_snapshot` gives the right panel as text: the screen name in
   the breadcrumb, the "N of M" counter, Viewport/Design size, the hex list of ALL colours,
   and Character Styles (family, weight, px, colour). Take colour and typography from here.
6. **Zoom:** `fill` the zoom textbox in the header (the one whose value is "50%" in the
   snapshot) + Enter. ~22-25% shows a long mobile artboard in full; 50% is a good overview;
   75-100% is readable detail.
7. **Pan:** keyboard and scroll DO NOT WORK. Dispatch a wheel event to the canvas (without
   ctrl — ctrl+wheel zooms). deltaY is vertical, deltaX horizontal:
   ```js
   const el = document.elementFromPoint(500, 500); // canvas
   for (let i = 0; i < 8; i++)
     el.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, deltaX: 0,
       bubbles: true, cancelable: true, clientX: 500, clientY: 500 }));
   ```
8. **Selecting an element:** the MCP `click` tool cannot select inside the canvas (there is
   no uid). Send a synthetic pointer+mouse sequence to the coordinate, then wait ~600ms:
   ```js
   const clickAt = (x, y) => {
     const el = document.elementFromPoint(x, y);
     const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
       buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
     ['pointermove','pointerdown','pointerup'].forEach(t =>
       el.dispatchEvent(new PointerEvent(t, { ...o, buttons: t === 'pointerup' ? 0 : 1 })));
     ['mousemove','mousedown','mouseup','click'].forEach(t =>
       el.dispatchEvent(new MouseEvent(t, { ...o,
         buttons: (t === 'mousemove' || t === 'mousedown') ? 1 : 0 })));
   };
   ```
9. **Read the spec panel** (after clicking):
   ```js
   const readPanel = () => {
     const all = [...document.querySelectorAll('div,aside,section')];
     const c = all.filter(e => e.offsetWidth > 280 && e.offsetWidth < 420 &&
       e.offsetHeight > 300 && /px/.test(e.innerText || ''));
     if (!c.length) return 'no panel';
     c.sort((a, b) => a.innerText.length - b.innerText.length);
     return c[c.length - 1].innerText.replace(/\n{2,}/g, '\n');
   };
   ```
   The panel gives: element type+name (Text/Rectangle/Path/Group/Component), W/H/X/Y
   (DESIGN pixels), radius ("8px8px8px8px"), fill, border (colour+width+Inner/Center
   stroke), typography and a ready CSS block (`/* Layout Properties */`,
   `/* UI Properties */`).
   The typography line's pattern: `Size14pxAlignmentLeft-0.2px170` → 14px size, -0.2px
   letter-spacing, and **the trailing number is the line-height** (17.0 appears as 170 in
   the panel).
10. **Batch measurement:** click-wait-read several points inside a SINGLE
    `evaluate_script` (550-650ms sleep in between), returning the `readPanel()` result for
    each point.
11. **Verification loop:** the expected element may not come up at the clicked point (the
    parent Group gets selected). Check the element name in the panel header; if it is
    wrong, shift a few px and click again. The flow: screenshot (jpeg, quality 80-88) →
    visual position → click → verify by the panel's name.
12. **Screen navigation:** the bottom bar has buttons with aria-label "Previous screen" /
    "Next screen"; the counter is
    `document.body.innerText.match(/(\d+) of (\d+)/)`. To list all screens, loop with Next
    and collect the breadcrumb name + Design size at each step.
13. **Coordinate scales:** X/Y/W/H in the panel are design pixels (independent of zoom);
    click coordinates are viewport pixels. Do not conflate them.
14. **Spacing derivation:** padding/gap are NOT in the panel; compute them from the X/Y/W/H
    difference of neighbouring boxes (left padding = content.x − box.x;
    gap = box2.x − (box1.x + box1.w)).
15. **Screenshots:** always jpeg + quality 80-88; fullPage is rarely needed.

---

## Addendum: findings from the verification session

16. **Path elements have NO radius.** The panel gives a `radius` row only for a
    **Rectangle**. If the card/box is a `Path` (typical: a vector with rounded corners in
    XD), neither a `radius` row nor a `border-radius` in the CSS block appears — do not
    trust the field list in §9 and conclude "radius 0". In that case **measure the radius
    from pixels**:
    - Use `emulate` with `<w>x<h>x3` (deviceScaleFactor 3) + zoom 200% → 6 device pixels
      per design pixel. (The zoom textbox caps at 200%; since the canvas is WebGL,
      `getImageData` does not work — capture a PNG with `take_screenshot` + `filePath` and
      read it with Python/PIL.)
    - Filter the edge colour (e.g. `#D7DFE9`) and find long vertical/horizontal strip runs;
      the strip centres are the box's **geometry edges**. Verify against the panel's W/H —
      they must match exactly (if they do not, the scaling is wrong; do not proceed before
      fixing it).
    - At the corner, measure the deviation from the straight edge:
      `deviation(k) = r − √(r² − (r−k)²)`, where k is the distance from the corner. Solve
      for r by least squares. **Do not fit a circle over a mix of corner arc and straight
      edge** — that inflates R; the deviation-profile method is safe.
17. **If a child element cannot be selected, the parent Group comes up, and insisting does
    not help.** Clicking the same region again moves up the hierarchy. Taking the
    measurement from pixels (§16) is often faster than forcing the click — especially for
    the gap between repeated grid elements.

    **But first, move a few pixels OUTWARD.** Clicking on a small glyph gives you the
    glyph; the box you want is often selectable in the *ring around* the glyph. A verified
    example: a close button — the glyph `Path C` is 10×10, the circle `Rectangle H` is
    **47.2×47.2**, so there is a ~18 design px clickable ring around the glyph. Clicking on
    the glyph always returned `Path C`; shifting 6 px toward the corner returned the circle
    (verified from three independent points). Before reporting a box as "could not be
    measured", try the element's **edge**.
18. **Text box ≠ ink.** The panel width of icon/glyph elements includes their side
    bearings; the ink box measured from pixels comes out ~1px narrower. Do not conflate the
    two when comparing positions.
19. **Do not carry a value measured on one artboard to the other.** Two elements doing the
    same job and carrying the same name can differ between artboards. A verified example: a
    summary bar had radius **12** on desktop and radius **8** on mobile; on top of that the
    desktop one was a `Path` and the mobile one a `Rectangle`. Measure each artboard
    separately — concluding "it was 8 on mobile, so desktop is 8 too" produces wrong code.
20. **Validate a pixel measurement with a control element.** While doing the radius
    measurement from §16, if the same screen has a `Rectangle` whose radius the panel does
    report, **measure that too**. If you hit the known value, the method is reliable; if
    you do not, the scale or the edge detection is wrong and you should not trust the Path
    measurement either. (Verified: a mobile bar the panel calls 8 measured 7.01 from pixels
    — r=8 RMS 0.633, r=12 RMS 2.072. The method reads 8 as 8.)
21. **The gap between two stroked boxes gives three different numbers.** With *Center
    Stroke* the geometry edge and the visual edge differ by half a stroke: between two
    48×48 buttons with a 2px stroke you get **17** from the panel geometry and **15** from
    the visual outside. Write down which one you reported; because a CSS `border` is drawn
    inside the box, the `gap` in the code ends up closer to the visual value than to the
    geometry one.
22. **Identify an unselectable element by elimination from the Character Styles list.**
    Some text cannot be selected from inside an XD group — no matter how often you click,
    the panel gives the parent `Group` (§17). In that case: clear the selection (click
    outside the artboard), read the panel's **Character Styles** list, and find the single
    style matching the element's visible properties (size, colour). Family + weight + size
    + colour come from there; **line-height does not** — note in the report that you could
    not measure it.
    ```js
    // after clearing the selection: family -> style matches
    const t = document.body.innerText, i = t.indexOf('Character Styles');
    const L = t.slice(i, i + 4000).split('\n').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (let k = 0; k < L.length - 1; k++)
      if (/px,\s*#/.test(L[k+1]) && /,/.test(L[k])) out.push(L[k] + ' -> ' + L[k+1]);
    ```
    This is an inference, not a panel reading — mark it separately in the report, e.g. `P*`.
23. **Capturing a reference for the visual comparison.** The section has to be captured
    uncropped and at design resolution:
    - **Scale:** `emulate` with dpr **2** + zoom **50%** → 1 design pixel = 1 device pixel.
      (dpr 3 + 200% is for measurement; unnecessarily large for a reference.)
    - **Framing:** the whole section must fit inside the canvas area. The spec panel on the
      right takes ~380 CSS px; a 1440 artboard at 50% is 720 CSS px and fits comfortably.
    - Capture a PNG with `take_screenshot` + `filePath`.
    - **Crop anchor:** do not use the section background — XD's own canvas background is
      also `#FAFAFA` and cannot be distinguished. Instead pick a **uniquely coloured, solid
      and wide** element inside the section (like a navy bar) as the calibration anchor and
      give its design box as well. `visual-diff.py --kalibre "#0C2380:64,3133,1312,72"`
      finds that anchor's largest solid block and derives scale + offset.
    - **The longer the anchor's long edge, the more precise the scale**: on a 72px edge a
      1px antialiasing error is a 1.4% scale error, which means a 10px shift on a 730px
      crop. That is why the script derives the scale from the long edge.

24. **Do the calibration in a SINGLE call — no pan/zoom trial and error.** The routine below
    sets the zoom, finds the target with a coarse scan, resolves its edges by binary search
    and returns the mapping. It replaces the 10-15 tool calls that trial and error costs;
    each call is ~15 s of model latency, so the difference is large.

    Two important points:
    - **The wait is adaptive.** Instead of a fixed 550ms it polls every 40ms *until the
      panel changes*. A typical probe drops to 150-250ms, so ~60 probes fit into one call.
    - **The budget is bounded.** `evaluate_script` times out at ~30 s; the routine counts
      probes and **returns a diagnosis** if it goes over (rather than blindly retrying).

    ```js
    async () => {
      const ZOOM = 50;                 // 25 overview · 50-75 measurement · 200 radius
      const HEDEF = /Rectangle 7931/;  // if null, the artboard edge is searched for
      let butce = 90;

      const $ = () => document.querySelector('input');
      const clickAt = (x, y) => {
        const el = document.elementFromPoint(x, y); if (!el) return;
        const o = { bubbles:true, cancelable:true, clientX:x, clientY:y, button:0,
          buttons:1, pointerId:1, pointerType:'mouse', isPrimary:true, view:window };
        ['pointermove','pointerdown','pointerup'].forEach(t =>
          el.dispatchEvent(new PointerEvent(t, {...o, buttons: t==='pointerup'?0:1})));
        ['mousemove','mousedown','mouseup','click'].forEach(t =>
          el.dispatchEvent(new MouseEvent(t, {...o,
            buttons: (t==='mousemove'||t==='mousedown')?1:0})));
      };
      const readPanel = () => {
        const c = [...document.querySelectorAll('div,aside,section')].filter(e =>
          e.offsetWidth>280 && e.offsetWidth<420 && e.offsetHeight>300 && /px/.test(e.innerText||''));
        if (!c.length) return '';
        c.sort((a,b) => a.innerText.length - b.innerText.length);
        return c[c.length-1].innerText.replace(/\n{2,}/g,'\n');
      };
      // ADAPTIVE PROBE: poll until the panel changes, no fixed wait
      const probe = async (x, y) => {
        if (butce-- <= 0) throw new Error('probe budget exhausted');
        const onceki = readPanel();
        clickAt(x, y);
        for (let i = 0; i < 18; i++) {
          await new Promise(r => setTimeout(r, 40));
          const t = readPanel();
          if (t && t !== onceki) return t;
        }
        return readPanel();
      };
      const disi = t => /Screen Details/.test(t) || !/W-?[\d.]+px/.test(t);
      const tut  = t => HEDEF ? HEDEF.test(t) : !disi(t);

      // 1) zoom
      const inp = $(), set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      inp.focus(); set.call(inp, String(ZOOM));
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      ['keydown','keypress','keyup'].forEach(k => inp.dispatchEvent(
        new KeyboardEvent(k,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true})));
      inp.blur(); await new Promise(r => setTimeout(r, 1300));

      // 2) coarse scan — find the target, pan if not found (bounded rounds)
      const cv = document.querySelector('canvas');
      const kaydir = async (dy, n) => { for (let i=0;i<n;i++) {
        cv.dispatchEvent(new WheelEvent('wheel',{deltaY:dy,deltaX:0,bubbles:true,cancelable:true,clientX:500,clientY:500}));
        await new Promise(r=>setTimeout(r,45)); } await new Promise(r=>setTimeout(r,600)); };
      const X = [200, 500, 800];
      let ic = null;
      for (let tur = 0; tur < 8 && !ic; tur++) {
        for (const x of X) { for (let y = 100; y <= 1250; y += 110) {
          if (tut(await probe(x, y))) { ic = {x, y}; break; } } if (ic) break; }
        if (!ic) await kaydir(100, 5);
      }
      if (!ic) return { hata: 'target not found', kalanButce: butce,
                        oneri: 'the HEDEF regex may be wrong; reload the page and try ZOOM 25' };

      // 3) binary search — top and left edges
      let lo = Math.max(60, ic.y - 260), hi = ic.y;
      while (hi - lo > 1) { const m = (lo+hi)>>1; if (tut(await probe(ic.x, m))) hi = m; else lo = m; }
      const ustV = hi;
      lo = 0; hi = ic.x;
      while (hi - lo > 1) { const m = (lo+hi)>>1; if (tut(await probe(m, ic.y))) hi = m; else lo = m; }
      const solV = hi;

      return { solV, ustV, olcek: ZOOM/100, zoom: ZOOM, kalanButce: butce,
               not: 'design(x,y) -> vp(solV + olcek*(x - hedefX), ustV + olcek*(y - hedefY))' };
    }
    ```

    **What the return value means:** `solV/ustV` is the viewport position of the top-left
    corner of the HEDEF element. If the target is the artboard, that is `design(0,0)`
    directly; if it is an element, build the offset using that element's `X/Y` as read from
    the panel. **Verify the mapping immediately**: compute the expected viewport position of
    a second known element and send a single probe there.

25. **Write the calibration and the reference into `olcum.json` — so the next phase does not
    repeat them.** When the measurement finishes, the browser is already on the right
    artboard at the right zoom. Capture the reference PNG **there** (§23) and save it, along
    with the calibration, into `<reportDir>/<slug>/olcum.json`. The code phase and
    `visual-diff` read this file; they do not go back to XD and do not re-derive the anchor.
    Measured difference: with the anchor provided, the visual diff takes **10 min instead of
    19**.
