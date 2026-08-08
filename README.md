# freehand-ui

Wrap any existing web element with a beautiful, responsive, hand-drawn doodle layer.

`freehand-ui` adds a subtle SVG overlay — thin white pen strokes, handwritten notes, arrows, and sparse decorations — without changing your HTML layout or intercepting pointer events.

## Install

```bash
npm install @aznabee/freehand-ui
```

## Basic usage

```javascript
import { doodle } from "@aznabee/freehand-ui";

doodle(document.querySelector(".card"));
// or
doodle(".card");
```

This immediately draws a hand-drawn border around the element and keeps it aligned as the page resizes, scrolls, or reflows.

## React / Next.js

```jsx
import Doodle from "@aznabee/freehand-ui/react";

<Doodle note="start chat" strokeWidth={2}>
  <Button />
</Doodle>;
```

Every option below works as a prop. The component ships `"use client"`, so it
drops straight into the Next.js App Router without a wrapper of your own, and
it renders on the server without warnings.

The doodle is drawn around **the wrapped component as a whole** — children are
never decorated individually. To decorate descendants instead, opt in with
`childSelector`:

```jsx
<Doodle childSelector=".card">
  {items.map((item) => <Card key={item.id} className="card" {...item} />)}
</Doodle>
```

### Wrapper element

`<Doodle>` renders a `<span style="display:inline-flex">` that shrink-wraps its
child, so the frame hugs your component instead of stretching to the full width
of its container. `inline-flex` specifically: an `inline-block` wrapper adds
baseline leading beneath an inline-level child like a `<button>`, which would
leave the frame visibly taller than the button.

Override it when you need different layout — any extra props go to the DOM node:

```jsx
<Doodle as="div" style={{ display: "block" }} className="w-full" note="hi">
  <Card />
</Doodle>
```

Border radius is picked up automatically: if the wrapper has none of its own,
it inherits the radius of the child it hugs, so a wrapped pill button is still
drawn as a pill.

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

### Notes

- Inline object props (`note={{ text: "hi" }}`) are compared by value, so a
  re-render does not tear down and redraw the overlay with a new random seed.
- The handwriting font is fetched automatically — see [Handwriting
  font](#handwriting-font) to use `next/font` or self-host instead.
- `disabled` skips drawing entirely — useful behind a reduced-motion check or a
  feature flag.
- TypeScript definitions ship with the package for both entry points.

## Configuration

```javascript
doodle(".card", {
  border: true,
  color: "#ffffff",
  strokeWidth: 1.5,
  roughness: 1.5,
  padding: 0,        // gap between the element's edge and the frame
  radius: 20,        // optional override; auto-detected from CSS when omitted
  opacity: 0.9,
  addBreaks: false,  // lift the pen at random points around the outline
  fontFamily: null,  // override the handwriting stack
  autoLoadFont: true,
});
```

The frame traces the element's own edge by default. Raise `padding` to stand it
off — `padding: 8` leaves a comfortable margin around a card.

## Handwriting font

Notes are set in [Caveat](https://fonts.google.com/specimen/Caveat). The library
loads it for you the first time a note is drawn, so the handwriting looks right
in a plain app with no font setup of its own — without it the text falls back to
the generic `cursive` family, which on macOS is a calligraphic serif rather than
anything handwritten.

It skips the request when the page already provides the family, and only ever
requests it once. To take over:

```javascript
// self-hosted, or already loaded elsewhere on the page
doodle(".card", { note: "hi", autoLoadFont: false });

// your own family — a next/font CSS variable, for instance
doodle(".card", { note: "hi", fontFamily: "var(--font-caveat)" });
```

```jsx
import { Caveat } from "next/font/google";
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });

<Doodle note="start chat" fontFamily="var(--font-caveat)" autoLoadFont={false}>
  <Button />
</Doodle>;
```

Setting `autoLoadFont: false` without a `fontFamily` falls back to whatever
handwriting faces the system has (Bradley Hand, Segoe Script, Comic Sans MS).
Notes are re-measured when a font finishes loading, so the underline always
matches the final glyph widths.

## Broken outlines

`addBreaks` cuts randomly sized gaps into the border, so it reads as a few
confident dashes rather than one closed loop:

```javascript
doodle(".cta", { addBreaks: true });

doodle(".cta", { addBreaks: 5 });          // five gaps

doodle(".cta", {
  addBreaks: {
    count: 4,   // omit for 2–5 gaps
    min: 6,     // shortest gap, px
    max: 30,    // longest gap, px
  },
});
```

Gaps are spread one per section of the perimeter so they never clump, and their
total is capped at a third of the outline so the frame still reads as a frame.
On small elements the gaps shrink to fit.

## Handwritten annotations

```javascript
doodle(".cta", {
  note: "start chat ♡",
});

doodle(".cta", {
  note: { text: "try me", position: "bottom-right", underline: false },
});
```

Positions: `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `top-left`. Same names apply to `arrow.from`/`arrow.to`.

The position is a preference, not a command. Notes are measured from their real
glyph metrics and laid out so they never sit on top of the element — if the
preferred side would run off screen, the note flips to a side that fits. The
underline is drawn to the measured text width; set `underline: false` for plain
handwriting.

## Arrows

```javascript
doodle(".cta", { arrow: true });

doodle(".cta", {
  arrow: {
    from: "top-right",
    to: "center",
    style: "curved", // curved | straight | dotted
  },
});
```

When the element also has a `note`, the arrow ignores `from` and launches from
the note itself. `to: "edge"` (the default) lands the tip just *outside* the
frame; `to: "center"` is the one setting that deliberately points into the
element.

## Decorations

```javascript
doodle(".card", { decorations: true });

doodle(".card", {
  decorations: {
    count: 2,             // border marks, hard-capped at 2
    style: "corners",     // corners | sides — omit to pick automatically
    types: ["arcs", "twinkle", "heart"],
  },
});
```

A frame stays readable with **at most two marks around it**, so `count` is
capped at 2 and the default composition is deliberately fixed:

- **one corner accent** — `arcs` or `emphasis` — hugging a corner, aimed outward
- **one corner star** — `twinkle` or `star` — on the corner farthest from it,
  and sitting noticeably further off the border than the accent
- **one handwriting accent** — `heart` or `sparkle` — beside the note, not the
  component

Corner marks follow the *rounded* corner rather than the bounding box, so they
hug a pill's cap as closely as a card's corner, and any mark too large for the
gap it landed in is pushed further out. Everything keeps off the element, off
the note, and off the arrow's sweep.

### Handwriting accents

`heart` and `sparkle` belong to text: they are drawn at the far end of the
note, on the side away from the element. With no `note` on the element they are
skipped rather than moved to the border.

### Small components

Chips and icon buttons have no corner worth pointing at, so they get a mirrored
pair of two-stroke `emphasis` marks — one either side — instead of corner
marks. This is chosen automatically when the element is under 48px on its short
side or under 130px wide; `style: "sides"` forces it at any size and
`style: "corners"` opts out.

The remaining types — `star`, `smiley`, `dots`, `stroke`, `steam` — are still
available and fill a corner slot when no accent or star was requested.

## Child selector mode

Decorate multiple children from a single parent overlay:

```javascript
doodle("#hero", {
  children: ".doodle-item",
});
```

## Lifecycle

```javascript
const instance = doodle(".card");

instance.update();  // recalculate geometry and redraw
instance.destroy(); // remove overlay and disconnect observers
```

Calling `doodle()` twice on the same element replaces the previous overlay — no duplicates.

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
- http://localhost:5173/examples/children/
- http://localhost:5173/examples/decorations/

## Design principles

- **Framework agnostic** — plain JavaScript at the core; React is an optional entry point
- **SVG based** — hand-drawn paths, not CSS borders
- **Non-invasive** — `pointer-events: none`, no layout changes
- **Responsive** — `ResizeObserver`, scroll listeners, and `requestAnimationFrame`
- **Lightweight** — zero runtime dependencies

## License

MIT
