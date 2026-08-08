import { test } from "node:test";
import assert from "node:assert/strict";
import { arrowStartFromNote } from "../src/renderer.js";

/** A note box sitting to the right of an element. */
const note = { x: 400, y: 100, width: 120, height: 40 };
const element = { x: 60, y: 110 };

/** How far outside the note a departure point may sit. */
const SLACK = 14;

function isInsideNote(point) {
  return (
    point.x > note.x &&
    point.x < note.x + note.width &&
    point.y > note.y &&
    point.y < note.y + note.height
  );
}

function nearNote(point) {
  return (
    point.x > note.x - SLACK &&
    point.x < note.x + note.width + SLACK &&
    point.y > note.y - SLACK &&
    point.y < note.y + note.height + SLACK
  );
}

test("from names a side of the note, not of the element", () => {
  const left = arrowStartFromNote(note, element, "left");
  const right = arrowStartFromNote(note, element, "right");
  const bottomLeft = arrowStartFromNote(note, element, "bottom-left");

  // Measured on the note's own box
  assert.equal(left.x, note.x - 10);
  assert.equal(right.x, note.x + note.width + 10);
  assert.equal(left.y, note.y + note.height / 2);

  assert.equal(bottomLeft.x, note.x - 10);
  assert.equal(bottomLeft.y, note.y + note.height + 10);

  // ...and each side is a genuinely different departure point
  assert.notEqual(left.y, bottomLeft.y);
  assert.notEqual(left.x, right.x);
});

test("every departure point sits on the note, however far away the element is", () => {
  // The note keeping its distance is exactly the `offset` case: the arrow must
  // still leave the handwriting and travel to the element, not start mid-air.
  const sides = ["left", "right", "top", "bottom", "top-left", "bottom-right"];

  for (const far of [element, { x: -3000, y: -2000 }, { x: 9000, y: 8000 }]) {
    for (const side of sides) {
      const point = arrowStartFromNote(note, far, side);
      assert.ok(nearNote(point), `${side} → ${JSON.stringify(point)}`);
    }
    assert.ok(nearNote(arrowStartFromNote(note, far, "note")), "auto");
  }
});

test("from center leaves the note instead of starting on the glyphs", () => {
  // A centre point has no outward direction of its own, so it used to start the
  // shaft in the middle of the handwriting and cross it on the way out.
  const point = arrowStartFromNote(note, element, "center");

  assert.ok(
    point.x < note.x,
    `must clear the note's left edge toward the element, got x=${point.x}`
  );
  assert.ok(!isInsideNote(point), "never starts inside the glyph box");
});

test("no departure point lands inside the glyph box", () => {
  const targets = [element, { x: 900, y: 120 }, { x: 460, y: -800 }];

  for (const target of targets) {
    for (const side of ["center", "note", "left", "right", "top", "bottom"]) {
      const point = arrowStartFromNote(note, target, side);
      assert.ok(
        !isInsideNote(point),
        `${side} → ${JSON.stringify(point)} sits on the text`
      );
    }
  }
});

test("the automatic side faces the element", () => {
  const toLeft = arrowStartFromNote(note, { x: 60, y: 120 }, "note");
  const toRight = arrowStartFromNote(note, { x: 900, y: 120 }, "note");

  assert.ok(toLeft.x < note.x + note.width / 2, "leaves from the left half");
  assert.ok(toRight.x > note.x + note.width / 2, "leaves from the right half");
});
