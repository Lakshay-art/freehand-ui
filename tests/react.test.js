import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Doodle, { Doodle as NamedDoodle, useDoodle } from "../src/react.js";
import { detectBorderRadius } from "../src/geometry.js";

/**
 * Render on the server the way Next.js does, capturing anything React
 * complains about.
 */
function renderSSR(element) {
  const warnings = [];
  const original = console.error;
  console.error = (...args) => warnings.push(args.join(" "));
  try {
    return { html: renderToStaticMarkup(element), warnings };
  } finally {
    console.error = original;
  }
}

test("exports a component and a hook", () => {
  assert.equal(typeof useDoodle, "function");
  assert.equal(Doodle, NamedDoodle);
});

test("renders a shrink-wrapping wrapper around its children", () => {
  const { html, warnings } = renderSSR(
    createElement(Doodle, null, createElement("button", null, "Find")),
  );

  // inline-flex, not inline-block: an inline-block wrapper adds baseline
  // leading under a <button>, so the frame would sit taller than the button
  assert.match(html, /display:inline-flex/);
  assert.match(html, /<button>Find<\/button>/);
  assert.equal(warnings.length, 0, "server render must not warn");
});

test("option props never reach the DOM", () => {
  const { html } = renderSSR(
    createElement(
      Doodle,
      {
        note: "start chat",
        strokeWidth: 2,
        roughness: 1.5,
        padding: 8,
        opacity: 0.9,
        border: true,
        arrow: true,
        decorations: true,
        addBreaks: true,
        childSelector: ".item",
        className: "wrap",
        "data-testid": "x",
      },
      createElement("button", null, "Find"),
    ),
  );

  for (const leaked of [
    "note",
    "strokeWidth",
    "roughness",
    "decorations",
    "addBreaks",
    "childSelector",
  ]) {
    assert.ok(!html.includes(leaked), `${leaked} must not be rendered`);
  }

  // ...while genuine DOM props still pass through
  assert.match(html, /class="wrap"/);
  assert.match(html, /data-testid="x"/);
});

test("as and style override the wrapper", () => {
  const { html } = renderSSR(
    createElement(
      Doodle,
      { as: "div", style: { display: "block", margin: 4 } },
      "hi",
    ),
  );

  assert.match(html, /^<div/);
  assert.match(html, /display:block/);
  assert.ok(!html.includes("inline-flex"));
});

test("detectBorderRadius borrows the radius of a tightly wrapped child", () => {
  const original = globalThis.getComputedStyle;

  /** @param {number} radius @param {number} w @param {number} h */
  const node = (radius, w, h, children = []) => ({
    radius,
    children,
    firstElementChild: children[0] ?? null,
    getBoundingClientRect: () => ({ width: w, height: h }),
  });

  globalThis.getComputedStyle = (el) => ({
    borderTopLeftRadius: `${el.radius}px`,
    borderTopRightRadius: `${el.radius}px`,
    borderBottomRightRadius: `${el.radius}px`,
    borderBottomLeftRadius: `${el.radius}px`,
  });

  try {
    const pill = node(999, 160, 48);

    // Its own radius always wins
    assert.equal(detectBorderRadius(node(24, 200, 80)), 24);

    // A layout-only wrapper hugging one child inherits it - this is what keeps
    // a wrapped pill from being drawn as a rectangle
    assert.equal(detectBorderRadius(node(0, 160, 48, [pill])), 999);

    // ...but only when it really is hugging
    assert.equal(detectBorderRadius(node(0, 400, 200, [pill])), 0);

    // and only for a sole child
    assert.equal(
      detectBorderRadius(node(0, 160, 48, [pill, node(8, 160, 48)])),
      0,
    );
  } finally {
    globalThis.getComputedStyle = original;
  }
});
