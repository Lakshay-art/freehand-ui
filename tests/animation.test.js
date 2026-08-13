import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARROW_ANIMATION_DEFAULTS,
  animateArrow,
  arrowTiming,
  normalizeArrowAnimation,
  resetArrowAnimationStyles,
} from "../src/animation.js";
import { mergeOptions } from "../src/utils.js";

test("arrows animate unless asked not to", () => {
  assert.deepEqual(normalizeArrowAnimation(undefined), ARROW_ANIMATION_DEFAULTS);
  assert.deepEqual(normalizeArrowAnimation(true), ARROW_ANIMATION_DEFAULTS);

  assert.equal(normalizeArrowAnimation(false), false);
  assert.equal(normalizeArrowAnimation(null), false);
});

test("a partial animate object keeps the rest of the defaults", () => {
  const animation = normalizeArrowAnimation({ speed: 2, distance: 12 });

  assert.equal(animation.speed, 2);
  assert.equal(animation.distance, 12);
  assert.equal(animation.duration, ARROW_ANIMATION_DEFAULTS.duration);
  assert.equal(animation.draw, true);
  assert.equal(animation.drift, true);
});

test("both gestures off is the same as no animation", () => {
  assert.equal(normalizeArrowAnimation({ draw: false, drift: false }), false);
  // A lean of zero px is not a lean
  assert.equal(normalizeArrowAnimation({ draw: false, distance: 0 }), false);

  // ...but either one alone still plays
  assert.equal(normalizeArrowAnimation({ draw: false }).drift, true);
  assert.equal(normalizeArrowAnimation({ drift: false }).draw, true);
});

test("nonsense timings fall back rather than freezing the arrow", () => {
  const animation = normalizeArrowAnimation({
    speed: 0,
    duration: -400,
    delay: "soon",
    distance: NaN,
  });

  assert.equal(animation.speed, ARROW_ANIMATION_DEFAULTS.speed);
  assert.equal(animation.duration, ARROW_ANIMATION_DEFAULTS.duration);
  assert.equal(animation.delay, ARROW_ANIMATION_DEFAULTS.delay);
  assert.equal(animation.distance, ARROW_ANIMATION_DEFAULTS.distance);
});

test("speed scales every phase of the animation", () => {
  const normal = arrowTiming(normalizeArrowAnimation({}));
  const fast = arrowTiming(normalizeArrowAnimation({ speed: 2 }));

  assert.equal(fast.shaft.duration, normal.shaft.duration / 2);
  assert.equal(fast.shaft.delay, normal.shaft.delay / 2);
  assert.equal(fast.head.duration, normal.head.duration / 2);
  assert.equal(fast.flow.duration, normal.flow.duration / 2);
  assert.equal(fast.drift.duration, normal.drift.duration / 2);
  assert.equal(fast.drift.delay, normal.drift.delay / 2);
});

test("the head lands as the shaft arrives, and the lean waits for both", () => {
  const animation = normalizeArrowAnimation({});
  const timing = arrowTiming(animation);
  const arrives = timing.shaft.delay + timing.shaft.duration;

  assert.ok(timing.head.delay < arrives, "the arms start before the pen stops");
  assert.ok(
    timing.head.delay > timing.shaft.delay + timing.shaft.duration * 0.5,
    "and not halfway down the shaft",
  );
  assert.ok(timing.drift.delay >= arrives, "the lean starts once it is drawn");
});

test("with no draw there is nothing for the lean to wait for", () => {
  const timing = arrowTiming(normalizeArrowAnimation({ draw: false }));
  assert.equal(timing.drift.delay, timing.shaft.delay);
});

/** Enough of an element to record what the animation puts on it. */
function element(attrs = {}) {
  const style = {
    properties: {},
    setProperty(name, value) {
      this.properties[name] = value;
    },
  };

  return {
    attrs: { ...attrs },
    style,
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    // Real paths measure themselves; this one just has a length
    getTotalLength: () => 200,
  };
}

/** A document with a head, so the keyframes have somewhere to land. */
function fakeDocument() {
  const head = { children: [], appendChild(child) { this.children.push(child); } };

  globalThis.document = {
    head,
    createElement: () => ({
      attrs: {},
      textContent: "",
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
    }),
    querySelector: () => null,
  };

  resetArrowAnimationStyles();
  return head;
}

/** One arrow's worth of elements: a group, a shaft, two head arms. */
function arrow(dasharray) {
  return {
    group: element(),
    shaft: [element(dasharray ? { "stroke-dasharray": dasharray } : {})],
    head: [element(), element()],
    start: { x: 0, y: 0 },
    end: { x: 300, y: 400 },
  };
}

test("a drawn arrow hides its stroke behind a full-length dash", () => {
  fakeDocument();
  const parts = arrow();
  animateArrow(parts.group, parts, normalizeArrowAnimation({}));

  const shaft = parts.shaft[0];
  assert.equal(shaft.style.strokeDasharray, "200.00px");
  assert.equal(shaft.style.properties["--freehand-dash"], "200.00px");
  assert.match(shaft.style.animation, /^freehand-arrow-dash 900ms ease-out/);
  // Held at the start until its delay is up, and at the end once it is drawn
  assert.match(shaft.style.animation, /both$/);

  // The head follows the shaft rather than racing it
  assert.match(parts.head[0].style.animation, /freehand-arrow-dash/);
  assert.notEqual(parts.head[0].style.animation, shaft.style.animation);
});

test("the arrow leans along its own line of travel", () => {
  fakeDocument();
  const parts = arrow();
  animateArrow(parts.group, parts, normalizeArrowAnimation({ distance: 10 }));

  assert.equal(parts.group.getAttribute("class"), "freehand-arrow");
  // (300, 400) is 500 long, so a 10px lean is (6, 8)
  assert.equal(parts.group.style.properties["--freehand-drift-x"], "6.00px");
  assert.equal(parts.group.style.properties["--freehand-drift-y"], "8.00px");
  assert.match(parts.group.style.animation, /freehand-arrow-drift .* infinite$/);
});

test("a single lean settles instead of repeating", () => {
  fakeDocument();
  const parts = arrow();
  animateArrow(parts.group, parts, normalizeArrowAnimation({ repeat: false }));

  assert.match(parts.group.style.animation, /freehand-arrow-settle/);
  assert.match(parts.group.style.animation, /both$/);
});

test("dotted arrows flow their dots instead of being drawn on", () => {
  // One dash pattern cannot both space the dots and hide the tail
  fakeDocument();
  const parts = arrow("2.5 4.5");
  animateArrow(parts.group, parts, normalizeArrowAnimation({}));

  const shaft = parts.shaft[0];
  assert.equal(shaft.getAttribute("stroke-dasharray"), "2.5 4.5", "keeps its dots");
  assert.equal(shaft.style.strokeDasharray, undefined, "and is not overridden");
  // One pattern repeat, travelling toward the tip forever at a steady crawl -
  // not a fraction of the draw, which on a long shaft would strobe
  assert.equal(shaft.style.properties["--freehand-dash"], "7.00px");
  assert.match(shaft.style.animation, /freehand-arrow-dash .* linear .* infinite$/);

  const timing = arrowTiming(normalizeArrowAnimation({}));
  assert.match(shaft.style.animation, new RegExp(`${Math.round(timing.flow.duration)}ms`));
});

test("a redraw resumes the animation instead of restarting it", () => {
  fakeDocument();
  const animation = normalizeArrowAnimation({});

  const fresh = arrow();
  animateArrow(fresh.group, fresh, animation, 0);

  const later = arrow();
  animateArrow(later.group, later, animation, 3000);

  const delayOf = (el) => Number(el.style.animation.match(/(-?\d+)ms(?!.*\d+ms)/)[1]);

  assert.ok(delayOf(fresh.shaft[0]) >= 0, "the first pass waits its turn");
  assert.ok(
    delayOf(later.shaft[0]) < -2000,
    "a later pass is dropped back where it had got to",
  );
});

test("the keyframes are injected once, however many arrows there are", () => {
  const head = fakeDocument();
  const animation = normalizeArrowAnimation({});

  for (let i = 0; i < 3; i++) {
    const parts = arrow();
    animateArrow(parts.group, parts, animation);
  }

  assert.equal(head.children.length, 1);
  assert.match(head.children[0].textContent, /@keyframes freehand-arrow-dash/);
  assert.match(head.children[0].textContent, /prefers-reduced-motion/);
});

test("animate false leaves the arrow completely alone", () => {
  fakeDocument();
  const parts = arrow();
  animateArrow(parts.group, parts, false);

  assert.equal(parts.group.getAttribute("class"), null);
  assert.equal(parts.group.style.animation, undefined);
  assert.equal(parts.shaft[0].style.animation, undefined);
});

test("mergeOptions resolves arrow.animate", () => {
  assert.deepEqual(
    mergeOptions({ arrow: true }).arrow.animate,
    ARROW_ANIMATION_DEFAULTS,
  );

  assert.equal(mergeOptions({ arrow: { animate: false } }).arrow.animate, false);
  assert.equal(
    mergeOptions({ arrow: { animate: { speed: 1.5 } } }).arrow.animate.speed,
    1.5,
  );

  // No arrow, nothing to animate
  assert.equal(mergeOptions({}).arrow, false);
});
