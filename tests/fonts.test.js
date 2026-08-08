import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ensureHandwrittenFont, resetHandwrittenFont } from "../src/fonts.js";

/**
 * Minimal stand-in for the bits of the DOM the loader touches.
 * @param {{ fontAvailable?: boolean, existingLink?: boolean }} [opts]
 */
function stubDocument({ fontAvailable = false, existingLink = false } = {}) {
  const appended = [];

  globalThis.document = {
    head: { },
    fonts: { check: () => fontAvailable },
    querySelector: (selector) =>
      existingLink && selector.includes("data-freehand-font") ? {} : null,
    createElement: () => {
      const attrs = {};
      return {
        set rel(value) {
          attrs.rel = value;
        },
        get rel() {
          return attrs.rel;
        },
        set href(value) {
          attrs.href = value;
        },
        get href() {
          return attrs.href;
        },
        setAttribute: (name, value) => {
          attrs[name] = value;
        },
        attrs,
      };
    },
  };

  globalThis.document.head.appendChild = (node) => appended.push(node);
  return appended;
}

afterEach(() => {
  resetHandwrittenFont();
  delete globalThis.document;
});

test("injects the webfont when the page has not provided it", () => {
  const appended = stubDocument();

  ensureHandwrittenFont();

  assert.equal(appended.length, 1, "one stylesheet link");
  assert.equal(appended[0].rel, "stylesheet");
  assert.match(appended[0].href, /family=Caveat/);
  assert.ok("data-freehand-font" in appended[0].attrs, "is marked as ours");
});

test("skips injection when the host already supplies the family", () => {
  const appended = stubDocument({ fontAvailable: true });

  ensureHandwrittenFont();

  assert.equal(appended.length, 0);
});

test("skips injection when a link is already present", () => {
  const appended = stubDocument({ existingLink: true });

  ensureHandwrittenFont();

  assert.equal(appended.length, 0);
});

test("only requests the font once per page", () => {
  const appended = stubDocument();

  ensureHandwrittenFont();
  ensureHandwrittenFont();
  ensureHandwrittenFont();

  assert.equal(appended.length, 1);
});

test("is a no-op without a document", () => {
  delete globalThis.document;
  assert.doesNotThrow(() => ensureHandwrittenFont());
});
