import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOptions, createRandom, clamp, isValidPosition, resolveOverlayZIndex, insertOverlaySvg } from "../src/utils.js";
import { unionRects, pointFromPosition, relativeRect } from "../src/geometry.js";
import {
  generateHandDrawnRectPath,
  generateHandDrawnRectPaths,
  createBorderBreaks,
} from "../src/renderer.js";
import { DEFAULT_TYPES } from "../src/decorations.js";

test("mergeOptions applies defaults and normalizes note", () => {
  const options = mergeOptions({ note: "hello" });
  assert.equal(options.border, true);
  assert.equal(options.color, "#ffffff");
  assert.deepEqual(options.note, { text: "hello", position: "top-right" });
});

test("the frame traces the element's edge unless padding is asked for", () => {
  assert.equal(mergeOptions({}).padding, 0);
  assert.equal(mergeOptions({ padding: 12 }).padding, 12);
});

test("handwriting font is fetched by default and overridable", () => {
  const defaults = mergeOptions({});
  assert.equal(defaults.autoLoadFont, true);
  assert.equal(defaults.fontFamily, null);

  const custom = mergeOptions({
    fontFamily: "var(--font-caveat)",
    autoLoadFont: false,
  });
  assert.equal(custom.fontFamily, "var(--font-caveat)");
  assert.equal(custom.autoLoadFont, false);
});

test("mergeOptions normalizes arrow and decorations", () => {
  const options = mergeOptions({ arrow: true, decorations: true });
  assert.equal(options.arrow.from, "top-right");
  assert.equal(options.arrow.to, "edge");
  // types stay null so decorations.js owns the default set
  assert.deepEqual(options.decorations, { count: null, types: null });
});

test("default decoration set pairs a corner accent with a star", () => {
  const accents = DEFAULT_TYPES.filter((t) => ["arcs", "emphasis"].includes(t));
  const stars = DEFAULT_TYPES.filter((t) => ["twinkle", "star"].includes(t));
  const text = DEFAULT_TYPES.filter((t) => ["heart", "sparkle"].includes(t));

  assert.ok(accents.length, "has a corner accent");
  assert.ok(stars.length, "has a corner star");
  assert.ok(text.length, "has a handwriting accent");
});

test("an arrow defaults to launching from the note", () => {
  const withNote = mergeOptions({
    note: { text: "hey", position: "left" },
    arrow: true,
  });
  assert.equal(withNote.arrow.from, "note");

  const alone = mergeOptions({ arrow: true });
  assert.equal(alone.arrow.from, "top-right");
});

test("an explicit arrow.from is kept, note or not", () => {
  // Previously the note path ignored `from` entirely
  const options = mergeOptions({
    note: { text: "hey", position: "left" },
    arrow: { from: "bottom-right" },
  });

  assert.equal(options.arrow.from, "bottom-right");
  // partial arrow objects still get the rest of the defaults
  assert.equal(options.arrow.to, "edge");
  assert.equal(options.arrow.style, "curved");
});

test("createRandom is deterministic for a seed", () => {
  const a = createRandom(42);
  const b = createRandom(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test("clamp limits values", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
});

test("isValidPosition validates anchor names", () => {
  assert.equal(isValidPosition("top-right"), true);
  assert.equal(isValidPosition("nope"), false);
});

test("unionRects expands to fit all rects", () => {
  const bounds = unionRects(
    [
      { x: 10, y: 10, width: 20, height: 20 },
      { x: 50, y: 30, width: 10, height: 10 },
    ],
    5
  );
  assert.equal(bounds.x, 5);
  assert.equal(bounds.y, 5);
  assert.equal(bounds.width, 60);
  assert.equal(bounds.height, 40);
});

test("pointFromPosition returns expected anchors", () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };
  assert.deepEqual(pointFromPosition("center", rect), { x: 50, y: 25 });
  assert.deepEqual(pointFromPosition("top-left", rect), { x: 0, y: 0 });
});

test("relativeRect converts absolute coordinates", () => {
  const outer = { x: 100, y: 100, width: 300, height: 200 };
  const inner = { x: 150, y: 130, width: 80, height: 40, radius: 8 };
  assert.deepEqual(relativeRect(outer, inner), {
    x: 50,
    y: 30,
    width: 80,
    height: 40,
    radius: 8,
  });
});

test("generateHandDrawnRectPath returns closed SVG path", () => {
  const random = createRandom(7);
  const path = generateHandDrawnRectPath(0, 0, 100, 50, 8, 1.5, random);
  assert.match(path, /^M /);
  assert.match(path, / Z$/);
});

test("mergeOptions normalizes addBreaks", () => {
  assert.equal(mergeOptions({}).addBreaks, false);

  assert.deepEqual(mergeOptions({ addBreaks: true }).addBreaks, {
    count: null,
    min: 6,
    max: 30,
  });

  assert.equal(mergeOptions({ addBreaks: 3 }).addBreaks.count, 3);
  assert.equal(mergeOptions({ addBreaks: { min: 2 } }).addBreaks.min, 2);
});

test("createBorderBreaks lays out ordered, non-overlapping gaps", () => {
  const breaks = createBorderBreaks(400, { count: 4 }, createRandom(11));

  assert.equal(breaks.length, 4);
  for (const gap of breaks) {
    assert.ok(gap.start >= 0 && gap.end <= 1, "stays within the perimeter");
    assert.ok(gap.end > gap.start, "has positive length");
  }
  for (let i = 1; i < breaks.length; i++) {
    assert.ok(breaks[i].start >= breaks[i - 1].end, "gaps do not overlap");
  }

  const covered = breaks.reduce((sum, g) => sum + (g.end - g.start), 0);
  assert.ok(covered <= 0.35, "never erases more than a third of the frame");
});

test("createBorderBreaks is disabled without config", () => {
  assert.deepEqual(createBorderBreaks(400, false, createRandom(3)), []);
  assert.deepEqual(createBorderBreaks(0, true, createRandom(3)), []);
});

test("breaks split the outline into multiple strokes", () => {
  const solid = generateHandDrawnRectPaths(0, 0, 200, 100, 12, 1.5, createRandom(5));
  assert.equal(solid.length, 1);

  const broken = generateHandDrawnRectPaths(
    0,
    0,
    200,
    100,
    12,
    1.5,
    createRandom(5),
    { spacing: 5.5, breaks: createBorderBreaks(560, { count: 3 }, createRandom(5)) }
  );
  assert.ok(broken.length > 1, "outline is cut into separate strokes");
  for (const d of broken) assert.match(d, /^M /);
});

test("resolveOverlayZIndex follows the target and allows overrides", () => {
  const element = {
    parentElement: null,
  };

  globalThis.getComputedStyle = () => ({
    zIndex: "auto",
    position: "static",
  });

  assert.equal(resolveOverlayZIndex(element, 42), 42);
  assert.equal(resolveOverlayZIndex(element, null), null);

  globalThis.getComputedStyle = () => ({
    zIndex: "5",
    position: "relative",
  });
  assert.equal(resolveOverlayZIndex(element, null), 6);
});

test("insertOverlaySvg mounts beside the target element", () => {
  const parent = {
    nodeType: 1,
    insertBefore(svg, ref) {
      this.lastInsert = { svg, ref };
    },
  };
  const next = {};
  const element = { parentNode: parent, nextSibling: next };
  const svg = {};

  insertOverlaySvg(svg, element);
  assert.deepEqual(parent.lastInsert, { svg, ref: next });
});
