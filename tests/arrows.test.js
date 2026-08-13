import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrowStartFromNote,
  bowOverTheTop,
  drawArrow,
  loopedCurvePoints,
} from "../src/renderer.js";
import { createRandom } from "../src/utils.js";

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

/** Total signed rotation of a polyline - positive is clockwise on screen. */
function turning(points) {
  let total = 0;

  for (let i = 2; i < points.length; i++) {
    const a = {
      x: points[i - 1].x - points[i - 2].x,
      y: points[i - 1].y - points[i - 2].y,
    };
    const b = {
      x: points[i].x - points[i - 1].x,
      y: points[i].y - points[i - 1].y,
    };
    total += Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  }

  return total;
}

test("the curl sits on the side it is told to", () => {
  // A base curve running straight to the right: its normal points down the
  // screen, so side 1 hangs the loop below the line and -1 lifts it above.
  const base = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 100, y: 0 },
  ];
  const radius = 10;

  const below = loopedCurvePoints(...base, radius, createRandom(4), 1);
  const above = loopedCurvePoints(...base, radius, createRandom(4), -1);

  const span = (points) => ({
    min: Math.min(...points.map((p) => p.y)),
    max: Math.max(...points.map((p) => p.y)),
  });

  assert.ok(span(below).max > radius, "side 1 loops below the line");
  assert.ok(span(above).min < -radius, "side -1 loops above the line");

  // The curl straddles the line rather than hanging off it, so each one pokes a
  // little past the line on its way out - that is the crossing - but no further
  assert.ok(span(below).min < 0, "the lower curl crosses back over the line");
  assert.ok(span(below).min > -radius * 0.6, "...without hanging off the far side");

  assert.ok(span(above).max > 0, "the upper curl crosses back over the line");
  assert.ok(span(above).max < radius * 0.6, "...without hanging off the far side");

  // Sitting on opposite sides, the two curls also turn opposite ways
  assert.ok(turning(below) > 0, "the lower curl turns clockwise");
  assert.ok(turning(above) < 0, "the upper curl turns anticlockwise");
});

/** Minimal SVG stand-in - records attributes, measures nothing. */
function fakeSvg() {
  const create = () => ({
    attrs: {},
    style: {},
    children: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  });

  globalThis.document = { createElementNS: create };
  return create();
}

/** On-curve points of a path made of `M` plus cubic segments. */
function onCurvePoints(d) {
  return (d.match(/[MC][^MC]*/g) ?? []).map((command) => {
    const numbers = command.slice(1).trim().split(/[\s,]+/).map(Number);
    return {
      x: numbers[numbers.length - 2],
      y: numbers[numbers.length - 1],
    };
  });
}

test("a looped arrow curls the way its sweep already turns", () => {
  // The curl is one continuous movement with the sweep, so it has to carry on
  // round the same way. Curling against the bow unwinds the gesture - that is
  // the "loops backwards" shape this guards against.
  const rect = { x: 240, y: 210, width: 180, height: 60, radius: 12 };

  for (const seed of [1, 2, 3, 7, 19, 101, 4242]) {
    const svg = fakeSvg();
    const arrow = drawArrow(
      svg,
      rect,
      { from: "top-left", to: "edge", style: "looped", animate: false },
      { color: "#fff", strokeWidth: 1.5, roughness: 1.5, opacity: 0.9 },
      seed,
    );

    // The group holds the shaft first, then the two head arms
    const shaft = arrow.group.children[0];
    const points = onCurvePoints(shaft.getAttribute("d"));

    // The sweep runs before the curl, so its leading third gives the direction
    // the pen was already turning
    const sweep = turning(points.slice(0, Math.floor(points.length / 3)));
    const whole = turning(points);

    assert.ok(Math.abs(sweep) > 0.05, `seed ${seed}: the sweep bows one way`);
    assert.ok(
      Math.abs(whole) > 4,
      `seed ${seed}: a full curl is tied into the stroke, got ${whole.toFixed(2)}`,
    );
    assert.equal(
      Math.sign(whole),
      Math.sign(sweep),
      `seed ${seed}: the curl turns with the sweep, not against it`,
    );
  }
});

test("a shaft with nothing to steer around always arcs over the top", () => {
  // The tip lands on the element's near edge, so for a note sitting diagonally
  // off its element the rest of the element lies beyond the tip rather than to
  // one side, and "bow away from the element" has nothing to say. That used to
  // fall back to a coin flip, which mirrored the whole gesture from one seed -
  // and one redraw - to the next.
  const note = { x: 40, y: 60, width: 150, height: 40 };
  const rect = { x: 240, y: 250, width: 130, height: 46, radius: 23 };

  for (const seed of [1, 2, 3, 8, 40, 77, 512]) {
    const svg = fakeSvg();
    const arrow = drawArrow(
      svg,
      rect,
      { from: "note", to: "edge", style: "curved", animate: false },
      { color: "#fff", strokeWidth: 1.5, roughness: 1, opacity: 0.9 },
      seed,
      note,
    );

    // A single cubic, so the bow lives entirely in its control points
    const numbers = arrow.group.children[0]
      .getAttribute("d")
      .match(/C([^MC]*)/)[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    const dx = arrow.end.x - arrow.start.x;
    const dy = arrow.end.y - arrow.start.y;
    const length = Math.hypot(dx, dy);
    const perpendicular = { x: -dy / length, y: dx / length };

    for (const control of [
      { x: numbers[0], y: numbers[1] },
      { x: numbers[2], y: numbers[3] },
    ]) {
      const lateral =
        (control.x - arrow.start.x) * perpendicular.x +
        (control.y - arrow.start.y) * perpendicular.y;

      assert.ok(
        perpendicular.y * lateral < 0,
        `seed ${seed}: the bow lifts the shaft above the straight line`,
      );
    }
  }
});

test("bowOverTheTop picks the side that lifts the shaft", () => {
  // Travelling right, the normal points down the screen - so bow the other way
  assert.equal(bowOverTheTop({ x: 0, y: 1 }), -1);
  assert.equal(bowOverTheTop({ x: 0, y: -1 }), 1);

  // Nothing is "over" a vertical shaft; it leans out to the right instead
  assert.equal(bowOverTheTop({ x: 1, y: 0 }), 1);
  assert.equal(bowOverTheTop({ x: -1, y: 0 }), -1);
});

test("an unanimated arrow is left as plain paths", () => {
  const svg = fakeSvg();
  const arrow = drawArrow(
    svg,
    { x: 240, y: 210, width: 180, height: 60, radius: 12 },
    { from: "top-left", to: "edge", style: "curved", animate: false },
    { color: "#fff", strokeWidth: 1.5, roughness: 1.5, opacity: 0.9 },
    5,
  );

  assert.equal(arrow.group.getAttribute("class"), null);
  for (const path of arrow.group.children) {
    assert.equal(path.style.animation, undefined);
  }
});

