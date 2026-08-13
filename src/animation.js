/**
 * Arrow motion. Two gestures, both CSS-driven so the browser animates them off
 * the main thread and a redraw costs nothing extra:
 *
 * - **draw** - the shaft is revealed by sweeping `stroke-dashoffset` down to
 *   zero, so the pen appears to travel from the note to the tip.
 * - **drift** - the whole arrow nudges a few pixels along its own direction of
 *   travel, which reads as it leaning toward what it points at.
 *
 * The overlay is rebuilt from scratch on every scroll and resize, so a naive
 * animation would restart several times a second. Every timing here is offset by
 * how long the overlay has been alive (`elapsed`): a negative `animation-delay`
 * drops the animation back at the phase it had reached, so a rebuild is
 * invisible and a finished draw stays finished.
 */

const STYLE_MARKER = "data-freehand-animation";

// Custom properties carry the per-arrow values into shared keyframes - the
// distance a path has to reveal, and the vector the arrow leans along.
const CSS = `
@keyframes freehand-arrow-dash {
  from { stroke-dashoffset: var(--freehand-dash, 0px); }
  to { stroke-dashoffset: 0; }
}
@keyframes freehand-arrow-drift {
  0%, 100% { transform: translate(0px, 0px); }
  50% { transform: translate(var(--freehand-drift-x, 0px), var(--freehand-drift-y, 0px)); }
}
@keyframes freehand-arrow-settle {
  from { transform: translate(0px, 0px); }
  to { transform: translate(var(--freehand-drift-x, 0px), var(--freehand-drift-y, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  .freehand-arrow, .freehand-arrow path { animation: none !important; }
  .freehand-arrow path { stroke-dashoffset: 0 !important; }
}
`;

export const ARROW_ANIMATION_DEFAULTS = {
  /** Reveal the stroke with a dash sweep. */
  draw: true,
  /** Lean the arrow toward its tip. */
  drift: true,
  /** Multiplier over every duration - 2 plays twice as fast. */
  speed: 1,
  /** How long the shaft takes to draw, ms, before `speed`. */
  duration: 900,
  /** Wait before the first stroke appears, ms. */
  delay: 150,
  /** How far the arrow leans, px. */
  distance: 5,
  /** One full lean-and-return, ms. */
  driftDuration: 2200,
  /** Keep leaning. `false` settles once and stays put. */
  repeat: true,
};

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function atLeastZero(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Resolve `arrow.animate` into a settled config. Arrows animate by default, so
 * an omitted `animate` means the defaults and only an explicit `false` opts out.
 *
 * @param {boolean | Record<string, unknown> | null | undefined} config
 * @returns {typeof ARROW_ANIMATION_DEFAULTS | false}
 */
export function normalizeArrowAnimation(config) {
  if (config === false || config === null) return false;

  const settings =
    config === true || config === undefined || typeof config !== "object"
      ? {}
      : config;

  const animation = {
    draw: settings.draw !== false,
    drift: settings.drift !== false,
    speed: positive(settings.speed, ARROW_ANIMATION_DEFAULTS.speed),
    duration: positive(settings.duration, ARROW_ANIMATION_DEFAULTS.duration),
    delay: atLeastZero(settings.delay, ARROW_ANIMATION_DEFAULTS.delay),
    distance: atLeastZero(settings.distance, ARROW_ANIMATION_DEFAULTS.distance),
    driftDuration: positive(
      settings.driftDuration,
      ARROW_ANIMATION_DEFAULTS.driftDuration,
    ),
    repeat: settings.repeat !== false,
  };

  // Nothing left to play
  if (!animation.draw && (!animation.drift || !animation.distance)) return false;

  return animation;
}

// How long a dotted shaft's dash pattern takes to advance by one repeat - a
// steady crawl, whatever the shaft's length. Deriving it from the draw instead
// would tie it to length: a reveal covers the whole shaft in `duration`, and at
// that speed a 7px pattern cycles in a few milliseconds and strobes.
const FLOW_PERIOD = 260;

/**
 * Millisecond timings once `speed` has been applied.
 *
 * The head follows the shaft rather than racing it: the arms start near the end
 * of the sweep so the flick lands as the pen arrives, and the lean waits for the
 * whole arrow to exist before it starts.
 *
 * @param {typeof ARROW_ANIMATION_DEFAULTS} animation
 */
export function arrowTiming(animation) {
  const duration = animation.duration / animation.speed;
  const delay = animation.delay / animation.speed;
  const drawn = animation.draw ? duration : 0;

  return {
    shaft: { duration, delay },
    head: { duration: duration * 0.22, delay: delay + drawn * 0.82 },
    flow: { duration: FLOW_PERIOD / animation.speed, delay },
    drift: {
      duration: animation.driftDuration / animation.speed,
      delay: delay + drawn * 1.04,
    },
  };
}

let injected = false;

/**
 * Add the keyframes to the page once. Cheap enough to call per arrow.
 */
export function ensureArrowAnimationStyles() {
  if (injected) return;
  if (typeof document === "undefined" || !document.head) return;
  injected = true;

  if (document.querySelector(`style[${STYLE_MARKER}]`)) return;

  const style = document.createElement("style");
  style.setAttribute(STYLE_MARKER, "");
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Test seam - lets a suite exercise the injection more than once. */
export function resetArrowAnimationStyles() {
  injected = false;
}

/**
 * @param {number} ms
 */
function time(ms) {
  return `${Math.round(ms)}ms`;
}

/**
 * @param {SVGElement} element
 * @param {{ name: string, duration: number, easing: string, delay: number, iterations?: string, fill?: string }} spec
 */
function setAnimation(element, spec) {
  const parts = [
    spec.name,
    time(spec.duration),
    spec.easing,
    time(spec.delay),
    spec.iterations ?? "1",
  ];
  // `none` is a valid animation-name as well as a fill-mode, so it is left out
  // of the shorthand rather than risking an ambiguous parse
  if (spec.fill) parts.push(spec.fill);

  element.style.animation = parts.join(" ");
}

/**
 * @param {SVGPathElement} path
 */
function pathLength(path) {
  try {
    const length = path.getTotalLength();
    return Number.isFinite(length) && length > 0 ? length : 0;
  } catch {
    // No layout engine behind this path (SSR, or a stubbed DOM)
    return 0;
  }
}

/**
 * Length of one repeat of a path's dash pattern.
 * @param {SVGPathElement} path
 */
function dashPeriod(path) {
  const pattern = (path.getAttribute("stroke-dasharray") || "")
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!pattern.length) return 0;
  // An odd-length pattern repeats twice before it lines up again
  const sum = pattern.reduce((total, n) => total + n, 0);
  return pattern.length % 2 === 0 ? sum : sum * 2;
}

/**
 * Reveal a solid stroke by pulling its dash gap back to nothing.
 *
 * A dotted stroke already spends its dash pattern on the dots, and one pattern
 * cannot both space the dots and hide the tail - offsetting a repeating pattern
 * by the length of the path just lands back on itself. Those flow toward the tip
 * instead, which is the same property animated to the same end.
 *
 * @param {SVGPathElement} path
 * @param {{ duration: number, delay: number }} timing
 * @param {number} elapsed
 * @param {{ duration: number, delay: number }} flow timing for a dotted stroke
 */
function applyDash(path, timing, elapsed, flow) {
  const length = pathLength(path);
  if (!length) return;

  const period = dashPeriod(path);

  if (period) {
    path.style.setProperty("--freehand-dash", `${period.toFixed(2)}px`);
    setAnimation(path, {
      name: "freehand-arrow-dash",
      duration: flow.duration,
      easing: "linear",
      delay: flow.delay - elapsed,
      iterations: "infinite",
    });
    return;
  }

  // One dash as long as the whole path: offsetting it by its own length hides
  // the stroke completely, and winding that back to zero draws it on
  path.style.setProperty("--freehand-dash", `${length.toFixed(2)}px`);
  path.style.strokeDasharray = `${length.toFixed(2)}px`;
  setAnimation(path, {
    name: "freehand-arrow-dash",
    duration: timing.duration,
    easing: "ease-out",
    delay: timing.delay - elapsed,
    fill: "both",
  });
}

/**
 * Lean the arrow along its own line of travel, toward what it points at.
 *
 * @param {SVGGElement} group
 * @param {{ start: { x: number, y: number }, end: { x: number, y: number } }} parts
 * @param {{ duration: number, delay: number }} timing
 * @param {number} elapsed
 * @param {typeof ARROW_ANIMATION_DEFAULTS} animation
 */
function applyDrift(group, parts, timing, elapsed, animation) {
  const dx = parts.end.x - parts.start.x;
  const dy = parts.end.y - parts.start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;

  const scale = animation.distance / length;
  group.style.setProperty("--freehand-drift-x", `${(dx * scale).toFixed(2)}px`);
  group.style.setProperty("--freehand-drift-y", `${(dy * scale).toFixed(2)}px`);

  setAnimation(
    group,
    animation.repeat
      ? {
          name: "freehand-arrow-drift",
          duration: timing.duration,
          easing: "ease-in-out",
          delay: timing.delay - elapsed,
          iterations: "infinite",
        }
      : {
          // A single lean is a settle, not a round trip, so it takes half a cycle
          name: "freehand-arrow-settle",
          duration: timing.duration * 0.5,
          easing: "ease-out",
          delay: timing.delay - elapsed,
          fill: "both",
        },
  );
}

/**
 * Animate one arrow.
 *
 * @param {SVGGElement} group the arrow's own group - what drifts
 * @param {{ shaft: SVGPathElement[], head: SVGPathElement[], start: { x: number, y: number }, end: { x: number, y: number } }} parts
 * @param {typeof ARROW_ANIMATION_DEFAULTS | false | null | undefined} animation
 * @param {number} [elapsed] ms the overlay has been on the page
 */
export function animateArrow(group, parts, animation, elapsed = 0) {
  if (!animation || !group) return;

  ensureArrowAnimationStyles();
  group.setAttribute("class", "freehand-arrow");

  const timing = arrowTiming(animation);
  const age = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;

  if (animation.draw) {
    for (const path of parts.shaft) {
      applyDash(path, timing.shaft, age, timing.flow);
    }
    // The arms are never dotted, so they always draw on
    for (const path of parts.head) applyDash(path, timing.head, age, timing.flow);
  }

  if (animation.drift && animation.distance > 0) {
    applyDrift(group, parts, timing.drift, age, animation);
  }
}
