import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { nudgeIntoBand, renderAnnotation } from "../src/annotations.js";
import { mergeOptions } from "../src/utils.js";

/**
 * Enough of the DOM for a note to be built and measured. Text measurement falls
 * back to an estimate when getBBox is unavailable, which is all this needs.
 */
function stubDom() {
  globalThis.document = {
    createElementNS: () => ({
      setAttribute() {},
      appendChild() {},
      textContent: "",
    }),
  };
  return { appendChild() {} };
}

const ELEMENT = { x: 200, y: 200, width: 160, height: 60, radius: 8 };
const STYLE = { color: "#fff", opacity: 0.9, strokeWidth: 1.4, roughness: 1.4 };

/** Same seed each time, so gap and tilt are identical across runs. */
function place(noteOptions, band) {
  const svg = stubDom();
  return renderAnnotation(svg, ELEMENT, noteOptions, STYLE, 1, { band }).box;
}

const band = { x: 0, width: 500 };

/** Element sitting in the middle of the band. */
const element = { x: 180, y: 0, width: 160, height: 60 };

/** A note above it — vertically clear, so free to slide. */
const above = (x) => ({ x, y: -50, width: 140, height: 30 });

/** A note level with it — sliding inward eventually hits the element. */
const beside = (x) => ({ x, y: 15, width: 140, height: 30 });

test("a note is never moved vertically to stay on screen", () => {
  // The overlay is fixed-position: anything that reacts to scroll offset drifts
  // off the element it annotates. Only horizontal space may move a note.
  const box = above(100);

  assert.equal(nudgeIntoBand({ ...box, y: -4000 }, element, band).y, -4000);
  assert.equal(nudgeIntoBand({ ...box, y: 9000 }, element, band).y, 9000);
});

test("a note slides by exactly what it overhangs, keeping its side", () => {
  // 60px past the right edge → moves 60px left, not to another side
  const overRight = above(band.x + band.width - 80);
  assert.equal(nudgeIntoBand(overRight, element, band).x, overRight.x - 60);

  // 40px past the left edge → moves 40px right
  const overLeft = above(-40);
  assert.equal(nudgeIntoBand(overLeft, element, band).x, 0);
});

test("sliding tracks the space available rather than snapping", () => {
  // Walking the band's right edge inward should walk the note inward with it,
  // one pixel at a time — this is what makes a narrowing viewport feel smooth
  const box = above(400);

  for (const width of [540, 520, 500, 480]) {
    const shifted = nudgeIntoBand(box, element, { x: 0, width });
    const overhang = Math.max(0, box.x + box.width - width);
    assert.equal(shifted.x, box.x - overhang, `width ${width}`);
  }
});

test("a note already inside the band is left alone", () => {
  const box = above(100);
  assert.deepEqual(nudgeIntoBand(box, element, band), box);
});

test("a note level with the element stops before covering it", () => {
  // Sits to the element's right and overhangs by 200px, but may only travel
  // until its left edge meets the element
  const box = beside(360);
  const shifted = nudgeIntoBand(box, element, { x: 0, width: 300 });

  assert.ok(shifted.x < box.x, "moved inward");
  assert.ok(
    shifted.x >= element.x + element.width,
    "stopped at the element rather than sliding over it"
  );
});

test("no band means no adjustment", () => {
  const box = above(-900);
  assert.deepEqual(nudgeIntoBand(box, element, null), box);
  assert.deepEqual(nudgeIntoBand(box, element, { x: 0, width: 0 }), box);
});

afterEach(() => {
  delete globalThis.document;
});

test("an offset note is kept in view on its own terms", () => {
  const note = { text: "fun with friends", position: "top", offset: { x: 300 } };
  const roomy = place(note, { x: 0, width: 2000 });

  // A band that only the *offset* position overruns. Sliding used to be judged
  // on the un-offset spot, so this note stayed put and hung off the edge.
  const tight = { x: 0, width: roomy.x + roomy.width - 60 };
  const squeezed = place(note, tight);

  assert.ok(
    squeezed.x < roomy.x,
    `expected the offset note to slide back, got ${squeezed.x} vs ${roomy.x}`
  );
  assert.ok(
    squeezed.x + squeezed.width <= tight.x + tight.width + 4,
    "and to end up inside the band"
  );
});

test("an offset is honoured verbatim when there is room", () => {
  const band = { x: 0, width: 2000 };
  const plain = place({ text: "fun with friends", position: "top" }, band);
  const moved = place(
    { text: "fun with friends", position: "top", offset: { x: 120, y: -40 } },
    band
  );

  assert.equal(Math.round(moved.x - plain.x), 120);
  assert.equal(Math.round(moved.y - plain.y), -40);
});

test("note offset survives option normalization", () => {
  const options = mergeOptions({
    note: { text: "hi", position: "top", offset: { x: 40, y: -30 } },
  });

  assert.deepEqual(options.note.offset, { x: 40, y: -30 });
});
