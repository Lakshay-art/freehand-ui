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

/** A note above it - vertically clear, so free to slide. */
const above = (x) => ({ x, y: -50, width: 140, height: 30 });

/** A note level with it - sliding inward eventually hits the element. */
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
  // one pixel at a time - this is what makes a narrowing viewport feel smooth
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
    "stopped at the element rather than sliding over it",
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
  const note = {
    text: "fun with friends",
    position: "top",
    offset: { x: 300 },
  };
  const roomy = place(note, { x: 0, width: 2000 });

  // A band that only the *offset* position overruns. Sliding used to be judged
  // on the un-offset spot, so this note stayed put and hung off the edge.
  const tight = { x: 0, width: roomy.x + roomy.width - 60 };
  const squeezed = place(note, tight);

  assert.ok(
    squeezed.x < roomy.x,
    `expected the offset note to slide back, got ${squeezed.x} vs ${roomy.x}`,
  );
  assert.ok(
    squeezed.x + squeezed.width <= tight.x + tight.width + 4,
    "and to end up inside the band",
  );
});

test("an offset is honoured verbatim when there is room", () => {
  const band = { x: 0, width: 2000 };
  const plain = place({ text: "fun with friends", position: "top" }, band);
  const moved = place(
    { text: "fun with friends", position: "top", offset: { x: 120, y: -40 } },
    band,
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

// ───────────────────────── note colour, size, tilt and highlights ─────────────────────────

/**
 * A DOM that remembers what is built on it, so a note's colours and line
 * structure can be read back.
 */
function recordingDom() {
  const make = (tag) => {
    const el = {
      tag,
      attrs: {},
      children: [],
      _text: "",
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
      setAttributeNS(_ns, name, value) {
        this.attrs[name] = String(value);
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      get textContent() {
        return this.children.length
          ? this.children.map((c) => c.textContent).join("")
          : this._text;
      },
      set textContent(value) {
        this.children = [];
        this._text = String(value);
      },
    };
    return el;
  };
  globalThis.document = { createElementNS: (_ns, tag) => make(tag) };
  return make("svg");
}

/** Depth-first list of every node under `node`. */
function all(node) {
  return [node, ...node.children.flatMap(all)];
}

const NOTE_STYLE = { color: "#fff", opacity: 0.9, strokeWidth: 1.4, roughness: 1.4 };
const noteTextOf = (svg) => all(svg).find((n) => n.tag === "text");

test("a note takes its own colour, size and weight, and keeps the doodle's by default", () => {
  const plain = recordingDom();
  renderAnnotation(plain, ELEMENT, { text: "hi" }, NOTE_STYLE, 1);
  const text = noteTextOf(plain);
  assert.equal(text.attrs.fill, "#fff");
  assert.equal(text.attrs["font-size"], "19");
  assert.equal(text.attrs["font-weight"], "600");

  const styled = recordingDom();
  renderAnnotation(
    styled,
    ELEMENT,
    { text: "hi", color: "#ffc83d", fontSize: 25, fontWeight: 700 },
    NOTE_STYLE,
    1,
  );
  const own = noteTextOf(styled);
  assert.equal(own.attrs.fill, "#ffc83d");
  assert.equal(own.attrs["font-size"], "25");
  assert.equal(own.attrs["font-weight"], "700");
});

test("the underline follows the note's colour", () => {
  const svg = recordingDom();
  renderAnnotation(svg, ELEMENT, { text: "hi", color: "#ff4fa3" }, NOTE_STYLE, 1);
  const strokes = all(svg)
    .filter((n) => n.tag === "path")
    .map((n) => n.attrs.stroke);
  assert.ok(strokes.length > 0);
  assert.ok(strokes.every((c) => c === "#ff4fa3"), `got ${strokes}`);
});

test("unusable note styles are ignored, not drawn", () => {
  const svg = recordingDom();
  renderAnnotation(
    svg,
    ELEMENT,
    { text: "hi", color: "  ", fontSize: -4, fontWeight: "" },
    NOTE_STYLE,
    1,
  );
  const text = noteTextOf(svg);
  assert.equal(text.attrs.fill, "#fff");
  assert.equal(text.attrs["font-size"], "19");
  assert.equal(text.attrs["font-weight"], "600");
});

test("tilt pins the rotation, and leaves the rest of the layout where it was", () => {
  const rotation = (svg) =>
    Number(/rotate\(([-\d.]+)/.exec(all(svg).find((n) => n.tag === "g").attrs.transform)[1]);

  const pinned = recordingDom();
  const a = renderAnnotation(pinned, ELEMENT, { text: "hi", tilt: -11 }, NOTE_STYLE, 1);
  assert.equal(rotation(pinned), -11);

  const random = recordingDom();
  const b = renderAnnotation(random, ELEMENT, { text: "hi" }, NOTE_STYLE, 1);
  assert.notEqual(rotation(random), -11);
  // Same seed, same gap: only the tilt (and what it needs) differs
  assert.equal(Math.round(a.box.x), Math.round(b.box.x));
});

test("a highlight paints just those words, and plain words inherit the note's colour", () => {
  const svg = recordingDom();
  renderAnnotation(
    svg,
    ELEMENT,
    {
      text: "Start chat\nin Game Mode!",
      wordsPerLine: 0,
      highlight: { text: "Game Mode!", color: "#ffc83d", fontWeight: 700 },
    },
    NOTE_STYLE,
    1,
  );

  const lines = noteTextOf(svg).children;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].textContent, "Start chat");
  // The first line has nothing to paint: a plain line, as before
  assert.equal(lines[0].children.length, 0);

  assert.equal(lines[1].textContent, "in Game Mode!");
  const runs = lines[1].children;
  assert.deepEqual(
    runs.map((r) => r.textContent),
    ["in ", "Game Mode!"],
  );
  assert.equal(runs[0].attrs.fill, undefined);
  assert.equal(runs[1].attrs.fill, "#ffc83d");
  assert.equal(runs[1].attrs["font-weight"], "700");
});

test("a highlight survives the note being wrapped between its words", () => {
  const svg = recordingDom();
  renderAnnotation(
    svg,
    ELEMENT,
    // two words a line puts "Game" and "Mode!" on different lines
    { text: "in Game Mode!", highlight: { text: "Game Mode!", color: "#f00" } },
    NOTE_STYLE,
    1,
  );

  const lines = noteTextOf(svg).children;
  assert.deepEqual(
    lines.map((l) => l.textContent),
    ["in Game", "Mode!"],
  );
  const painted = lines.flatMap((l) => l.children.filter((r) => r.attrs.fill === "#f00"));
  assert.deepEqual(
    painted.map((r) => r.textContent),
    ["Game", "Mode!"],
  );
});

test("highlights: every occurrence, several at once, earlier entries win, strings allowed", () => {
  const svg = recordingDom();
  renderAnnotation(
    svg,
    ELEMENT,
    {
      text: "go go now",
      wordsPerLine: 0,
      highlight: [{ text: "go", color: "#0f0" }, { text: "now", color: "#00f" }, "go"],
    },
    NOTE_STYLE,
    1,
  );

  const runs = noteTextOf(svg).children[0].children;
  assert.deepEqual(
    runs.map((r) => [r.textContent, r.attrs.fill]),
    [
      ["go go", "#0f0"],
      [" ", undefined],
      ["now", "#00f"],
    ],
  );
});

test("a highlight that is not in the note changes nothing", () => {
  const svg = recordingDom();
  renderAnnotation(svg, ELEMENT, { text: "hello there", highlight: { text: "nope", color: "#f00" } }, NOTE_STYLE, 1);
  const lines = noteTextOf(svg).children;
  assert.ok(lines.every((l) => l.children.length === 0));
});

test("note and arrow styles survive option normalization", () => {
  const { note, arrow } = mergeOptions({
    note: { text: "hi", color: "#fff", fontSize: 25, tilt: -11, highlight: { text: "hi", color: "#f00" }, wordsPerLine: 0 },
    arrow: { color: "#ff4fa3", strokeWidth: 3.4, roughness: 0.8, opacity: 0.5 },
  });
  assert.equal(note.color, "#fff");
  assert.equal(note.fontSize, 25);
  assert.equal(note.tilt, -11);
  assert.deepEqual(note.highlight, { text: "hi", color: "#f00" });
  assert.equal(note.wordsPerLine, 0);
  assert.equal(arrow.color, "#ff4fa3");
  assert.equal(arrow.strokeWidth, 3.4);
  assert.equal(arrow.roughness, 0.8);
  assert.equal(arrow.opacity, 0.5);
  // an arrow that sets nothing carries nothing, so it keeps the doodle's pen
  assert.equal("color" in mergeOptions({ arrow: true }).arrow, false);
});
