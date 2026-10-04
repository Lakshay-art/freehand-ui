import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  createSvgElement,
  estimateTextWidth,
  pathDataLength,
} from "../src/native/svg-dom.js";

// The shared drawers import `svg-dom.js`, which the native build swaps for the
// virtual nodes; here the swap is made through the document it would call.
globalThis.document = { createElementNS: (_ns, tag) => createSvgElement(tag) };
const { buildDoodle } = await import("../src/native/layout.js");

/** @param {import('../src/native/svg-dom.js').VirtualElement} node */
function* walk(node) {
  yield node;
  for (const child of node.children) yield* walk(child);
}

test("path length follows lines and curves, absolute or relative", () => {
  assert.equal(pathDataLength("M 0 0 L 30 40"), 50);
  assert.equal(pathDataLength("M 10 10 l 3 4 l 0 5"), 10);
  // A straight cubic is as long as its chord
  assert.ok(Math.abs(pathDataLength("M 0 0 C 10 0, 20 0, 30 0") - 30) < 1e-6);
  // A bowed one is longer
  assert.ok(pathDataLength("M 0 0 C 0 40, 30 40, 30 0") > 60);
  assert.ok(Math.abs(pathDataLength("M 0 0 L 10 0 L 10 10 Z") - (20 + Math.hypot(10, 10))) < 1e-6);
});

test("Caveat text is measured at its real glyph widths", () => {
  // Advances read from Caveat at weight 600, plus the note's 0.4px tracking
  assert.ok(Math.abs(estimateTextWidth("Start chat", 19, "Caveat") - 75.9) < 0.2);
  assert.ok(Math.abs(estimateTextWidth("your community", 19, "Caveat") - 104.3) < 0.2);
});

test("text width grows with the text and the font size", () => {
  assert.ok(estimateTextWidth("start chat", 19) > estimateTextWidth("start", 19));
  assert.ok(estimateTextWidth("mmm", 19) > estimateTextWidth("iii", 19));
  assert.equal(estimateTextWidth("hello", 38) > estimateTextWidth("hello", 19) * 1.9, true);
  // The wider platform faces take more room than condensed Caveat
  assert.ok(
    estimateTextWidth("hello", 19, "casual") >
      estimateTextWidth("hello", 19, '"Caveat", cursive'),
  );
});

test("virtual nodes move on re-append, like the DOM", () => {
  const root = createSvgElement("svg");
  const a = root.appendChild(createSvgElement("g"));
  const b = root.appendChild(createSvgElement("g"));
  root.appendChild(a);

  assert.deepEqual(root.children, [b, a]);
  assert.ok(root.contains(a));
});

test("a native doodle draws the same marks as the web overlay", () => {
  const { root, bounds } = buildDoodle({
    width: 200,
    height: 60,
    seed: 7,
    options: {
      note: { text: "Start chat", position: "bottom" },
      arrow: { from: "left", to: "edge", style: "curved" },
      decorations: { types: ["heart"] },
      radius: 30,
    },
  });

  const nodes = [...walk(root)];
  assert.ok(nodes.some((node) => node.tagName === "path"), "strokes are drawn");

  // Handwriting is re-appended last so it sits above every stroke
  const last = root.children[root.children.length - 1];
  const tspan = [...walk(last)].find((node) => node.tagName === "tspan");
  assert.equal(tspan?.textContent, "Start chat");

  // The arrow carries its animation for the native renderer to replay
  const arrow = root.children.find(
    (node) => node.getAttribute("class") === "freehand-arrow",
  );
  assert.ok(arrow, "the arrow is animated by default");
  assert.match(arrow.style.animation, /^freehand-arrow-drift \d+ms/);
  assert.ok(arrow.children[0].getTotalLength() > 0);

  // The canvas takes in the element and everything drawn around it
  assert.ok(bounds.x < 0 && bounds.y < 0);
  assert.ok(bounds.x + bounds.width > 200 && bounds.y + bounds.height > 60);
});

test("a note is kept inside the window band", () => {
  const band = { x: 8, width: 300 };
  const { root } = buildDoodle({
    width: 60,
    height: 40,
    seed: 3,
    band,
    // Centred over a narrow element at the window's left edge, it overhangs
    options: { note: { text: "a rather long note here", position: "top" } },
  });

  const note = root.children[root.children.length - 1];
  const text = [...walk(note)].find((node) => node.tagName === "text");
  const unclamped = buildDoodle({
    width: 60,
    height: 40,
    seed: 3,
    options: { note: { text: "a rather long note here", position: "top" } },
  }).root;
  const loose = [...walk(unclamped.children.at(-1))].find((n) => n.tagName === "text");

  assert.ok(Number(loose.getAttribute("x")) < band.x, "the note would overhang");
  assert.ok(Number(text.getAttribute("x")) >= band.x - 1, "the band pulls it in");
});

test("animate: false leaves the arrow as a plain, static group", () => {
  const { root } = buildDoodle({
    width: 100,
    height: 40,
    options: { arrow: { animate: false } },
  });

  assert.ok(
    root.children.every((node) => node.getAttribute("class") !== "freehand-arrow"),
  );
});

test("note lines keep their own x; the text element's is not added on top", async () => {
  const { propsOf } = await import("../src/native/svg-props.js");
  const { root } = buildDoodle({
    width: 260,
    height: 90,
    options: { note: { text: "Start chat", position: "bottom" }, fontFamily: "Caveat" },
  });
  const text = [...walk(root)].find((node) => node.tagName === "text");
  const tspan = text.children[0];

  assert.equal(propsOf(text).x, undefined);
  assert.equal(propsOf(text).fontFamily, "Caveat");
  assert.equal(propsOf(tspan).x, tspan.getAttribute("x"));
});

// Metro loads the CJS build. This package is `"type": "module"`, so esbuild
// compiles a default import of a CJS dependency to `__toESM(require(..), 1)`
// (Node mode), whose `.default` is the whole module object instead of the
// component - LayerSvg then fails with "Element type is invalid ... got: object".
// react-native-svg also exports `Svg` by name, which survives both builds.
test("react-native-svg is imported by name, never by its default export", () => {
  const source = readFileSync(
    new URL("../src/native/react-native.js", import.meta.url),
    "utf8",
  );
  // Anchored to a line start, so the word "import" in a comment can't match
  const bindings = source.match(/^import\s+([^;]*?)\s+from\s+"react-native-svg"/m)[1];

  assert.ok(
    bindings.trimStart().startsWith("{") && /\bSvg\b/.test(bindings),
    'use `import { Svg, ... } from "react-native-svg"` - a default import breaks in the CJS build',
  );
});

const builtCjs = new URL("../dist/native.cjs", import.meta.url);

test(
  "the built CJS renders <Svg> from the named export",
  { skip: !existsSync(builtCjs) && "run `npm run build` first" },
  () => {
    const cjs = readFileSync(builtCjs, "utf8");

    assert.equal(cjs.includes("import_react_native_svg.default"), false);
    assert.ok(cjs.includes("import_react_native_svg.Svg"));
  },
);
