![freehand-ui — make your UI delightfully human](docs/images/hero.png)

# Freehand-ui

Wrap any existing web element with a beautiful, responsive, hand-drawn doodle layer.

## What it does

`freehand-ui` adds a subtle SVG overlay on top of your UI — thin pen strokes, handwritten notes, arrows, and small decorations. It does **not** change your HTML layout or block clicks (`pointer-events: none`).

**Good for:** call-to-action buttons, feature cards, onboarding hints, playful marketing UI.

| Feature         | One-liner                                                           |
| --------------- | ------------------------------------------------------------------- |
| **Border**      | Hand-drawn frame that follows the element's shape and border-radius |
| **Notes**       | Caveat handwriting beside the element                               |
| **Arrows**      | Curved, straight, dotted, or looped pointers into the element       |
| **Decorations** | Corner accents, stars, hearts, and more                             |
| **Responsive**  | Stays aligned on resize, scroll, and reflow                         |

**Live on [Aznabee.com](https://aznabee.com)** — see it in production on the real product.

## ![Basic hand-drawn border around a card](docs/images/basic.png)

## Install

```bash
npm install @aznabee/freehand-ui
```

---

## Vanilla JavaScript

Import from the main entry point and call `doodle()` on any element or CSS selector.

### Quick start

```javascript
import { doodle } from "@aznabee/freehand-ui";

doodle(document.querySelector(".card"));
// or
doodle(".card");
```

This draws a hand-drawn border around the element and keeps it aligned as the page resizes, scrolls, or reflows.

### Configuration

Pass a second argument to `doodle()`:

```javascript
doodle(".card", {
  border: true,
  color: "#ffffff",
  strokeWidth: 1.5,
  roughness: 1.5,
  padding: 0, // gap between the element's edge and the frame
  radius: 20, // optional override; auto-detected from CSS when omitted
  opacity: 0.9,
  addBreaks: false, // lift the pen at random points around the outline
  fontFamily: null, // override the handwriting stack
  autoLoadFont: true,
});
```

The frame traces the element's own edge by default. Raise `padding` to stand it off — `padding: 8` leaves a comfortable margin around a card.

### Handwriting font

Notes are set in [Caveat](https://fonts.google.com/specimen/Caveat). The library loads it the first time a note is drawn, so handwriting looks right in a plain app with no font setup. Without it, text falls back to the generic `cursive` family (on macOS that's a calligraphic serif, not handwriting).

It skips the request when the page already provides the family, and only ever requests it once. To take over:

```javascript
// self-hosted, or already loaded elsewhere on the page
doodle(".card", { note: "hi", autoLoadFont: false });

// your own family
doodle(".card", { note: "hi", fontFamily: "var(--font-caveat)" });
```

Setting `autoLoadFont: false` without a `fontFamily` falls back to system handwriting faces (Bradley Hand, Segoe Script, Comic Sans MS). Notes are re-measured when a font finishes loading, so the underline always matches the final glyph widths.

### Broken outlines

`addBreaks` cuts randomly sized gaps into the border so it reads as a few confident dashes rather than one closed loop:

```javascript
doodle(".cta", { addBreaks: true });

doodle(".cta", { addBreaks: 5 }); // five gaps

doodle(".cta", {
  addBreaks: {
    count: 4, // omit for 2–5 gaps
    min: 6, // shortest gap, px
    max: 30, // longest gap, px
  },
});
```

Gaps are spread one per section of the perimeter so they never clump, and their total is capped at a third of the outline so the frame still reads as a frame. On small elements the gaps shrink to fit.

### Handwritten annotations

```javascript
doodle(".cta", {
  note: "start chat ♡",
});

doodle(".cta", {
  note: { text: "try me", position: "bottom-right", underline: false },
});
```

**Positions:** `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `top-left`. Same names apply to `arrow.from` / `arrow.to`.

Notes are measured from real glyph metrics and laid out so they never sit on top of the element. The underline is drawn to the measured text width; set `underline: false` for plain handwriting.

### Placement behavior

- **The side you ask for is the side you get.** When a note runs past the viewport edge it slides horizontally by exactly the amount it overhangs, so a narrowing viewport walks it gradually inward instead of snapping to the opposite side.
- **Vertical placement is fixed** relative to the element and does not react to scrolling — a note stays pinned to what it annotates.
- If an element is jammed against the viewport edge, a note may sit partly off screen — use a different `position` or an `offset` there.

Nudge a note with `offset`:

```javascript
doodle(".cta", {
  note: { text: "start chat", position: "top", offset: { x: 40, y: -12 } },
});
```

The offset moves the note from the spot `position` chose. A large horizontal offset slides back into the viewport rather than carrying the note off screen.

### Arrows

```javascript
doodle(".cta", { arrow: true });

doodle(".cta", {
  arrow: {
    from: "top-right", // note | any position name
    to: "center",
    style: "curved", // curved | straight | dotted | looped
  },
});
```

![Arrow styles — curved, straight, dotted, and looped](docs/images/arrows.png)

**Styles:** `curved` (default), `straight`, `dotted`, `looped` — `looped` adds a flourish that doubles back before reaching the tip.

**`from`** decides where the arrow leaves:

- **With a note** — names a side of the note (where the pen lifts off the handwriting), then travels to the element.
- **`"note"`** (default) — picks the side of the note facing the element.
- **Without a note** — `from` names a side of the element itself.

```javascript
doodle(".cta", {
  note: { text: "start chat", position: "top-right" },
  arrow: { from: "bottom-left" }, // leaves the note's bottom-left corner
});
```

**`to`:** `"edge"` (default) lands the tip just outside the frame; `"center"` points into the element.

### Decorations

```javascript
doodle(".card", { decorations: true });

doodle(".card", {
  decorations: {
    count: 2, // border marks, hard-capped at 2
    style: "corners", // corners | sides — omit to pick automatically
    types: ["arcs", "twinkle", "heart"],
  },
});
```

![Decoration types — corner accents, stars, handwriting marks, and more](docs/images/decorations.png)

A frame stays readable with **at most two marks around it**. Default composition:

- **one corner accent** — `arcs` or `emphasis` — hugging a corner, aimed outward
- **one corner star** — `twinkle` or `star` — on the corner farthest from it
- **one handwriting accent** — `heart` or `sparkle` — beside the note, not the component

Corner marks follow the _rounded_ corner rather than the bounding box. Marks too large for their gap are pushed further out.

### Handwriting accents

`heart` and `sparkle` are drawn at the far end of the note, on the side away from the element. With no `note` they are skipped rather than moved to the border.

### Small components

Chips and icon buttons get a mirrored pair of two-stroke `emphasis` marks — one either side — instead of corner marks. This is automatic when the element is under 48px on its short side or under 130px wide. `style: "sides"` forces it at any size; `style: "corners"` opts out.

Other types — `star`, `smiley`, `dots`, `stroke`, `steam` — fill a corner slot when no accent or star was requested.

### Child selector mode

Decorate multiple children from a single parent overlay:

```javascript
doodle("#hero", {
  children: ".doodle-item",
});
```

### Lifecycle

```javascript
const instance = doodle(".card");

instance.update(); // recalculate geometry and redraw
instance.destroy(); // remove overlay and disconnect observers
```

Calling `doodle()` twice on the same element replaces the previous overlay — no duplicates.

---

## React / Next.js

Import from `@aznabee/freehand-ui/react`. Every option in the [Vanilla JavaScript](#vanilla-javascript) section works as a prop.

### Component

```jsx
import Doodle from "@aznabee/freehand-ui/react";

<Doodle note="start chat" strokeWidth={2}>
  <Button />
</Doodle>;
```

Ships `"use client"` — drops into the Next.js App Router without a wrapper, and renders on the server without warnings.

The doodle is drawn around **the wrapped component as a whole** — children are never decorated individually. To decorate descendants instead, opt in with `childSelector`:

```jsx
<Doodle childSelector=".card">
  {items.map((item) => (
    <Card key={item.id} className="card" {...item} />
  ))}
</Doodle>
```

### Configuration

Same options as `doodle()`, passed as props:

```jsx
<Doodle
  border
  color="#ffffff"
  strokeWidth={1.5}
  roughness={1.5}
  padding={0}
  radius={20}
  opacity={0.9}
  addBreaks={false}
  autoLoadFont
>
  <Card />
</Doodle>
```

### Wrapper element

`<Doodle>` renders a `<span style="display:inline-flex">` that shrink-wraps its child, so the frame hugs your component instead of stretching to the full width of its container. `inline-flex` specifically: an `inline-block` wrapper adds baseline leading beneath an inline-level child like a `<button>`, which would leave the frame visibly taller than the button.

Override when you need different layout — extra props go to the DOM node:

```jsx
<Doodle as="div" style={{ display: "block" }} className="w-full" note="hi">
  <Card />
</Doodle>
```

Border radius is picked up automatically: if the wrapper has none of its own, it inherits the radius of the child it hugs, so a wrapped pill button is still drawn as a pill.

### Hook

For an element you already hold a ref to, skip the wrapper:

```jsx
import { useDoodle } from "@aznabee/freehand-ui/react";

function Card() {
  const ref = useRef(null);
  useDoodle(ref, { note: "new", decorations: true });
  return <div ref={ref}>…</div>;
}
```

### Handwriting font

With `next/font`:

```jsx
import { Caveat } from "next/font/google";
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });

<Doodle note="start chat" fontFamily="var(--font-caveat)" autoLoadFont={false}>
  <Button />
</Doodle>;
```

### React notes

- Inline object props (`note={{ text: "hi" }}`) are compared by value, so a re-render does not tear down and redraw the overlay with a new random seed.
- `disabled` skips drawing entirely — useful behind a reduced-motion check or a feature flag.
- TypeScript definitions ship with the package for both entry points.

---

## Examples

Run the dev server after building:

```bash
npm install
npm run build
npm run dev
```

Then open:

- http://localhost:5173/examples/basic/
- http://localhost:5173/examples/annotations/
- http://localhost:5173/examples/arrows/
- http://localhost:5173/examples/children/
- http://localhost:5173/examples/decorations/
- http://localhost:5173/examples/react/

---

## Design principles

- **Framework agnostic** — plain JavaScript at the core; React is an optional entry point
- **SVG based** — hand-drawn paths, not CSS borders
- **Non-invasive** — `pointer-events: none`, no layout changes
- **Responsive** — `ResizeObserver`, scroll listeners, and `requestAnimationFrame`
- **Lightweight** — zero runtime dependencies

---

## License

MIT
