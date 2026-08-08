import { createRandom, clamp } from "./utils.js";
import {
  pointFromPosition,
  annotationAnchor,
  nearestPointOnRect,
} from "./geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Caveat is loaded by the library (see fonts.js). The rest are system
// handwriting faces, so an app that blocks the webfont still gets something
// hand-drawn instead of the generic `cursive` calligraphic serif.
const HANDWRITTEN_FONT =
  '"Caveat", "Kalam", "Patrick Hand", "Bradley Hand", "Segoe Script", "Comic Sans MS", cursive';

const NOTE_FONT_SIZE = 19;

/**
 * @param {SVGElement} svg
 */
export function clearSvg(svg) {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

/**
 * @param {number} n
 */
function fmt(n) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/**
 * Smooth a point list into a Catmull-Rom spline expressed as cubic béziers.
 * This is what keeps strokes flowing instead of reading as jagged polylines.
 * @param {{ x: number, y: number }[]} points
 * @param {boolean} [closed]
 * @returns {string}
 */
export function catmullRomPath(points, closed = false) {
  if (!points.length) return "";
  if (points.length === 1) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  }

  const n = points.length;
  const at = (i) =>
    closed ? points[((i % n) + n) % n] : points[clamp(i, 0, n - 1)];

  let path = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  const segments = closed ? n : n - 1;

  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }

  if (closed) path += " Z";
  return path;
}

/**
 * Smooth, seamless noise along a stroke. Integer cycle counts make the wave
 * repeat exactly over `period`, so a loop closes without a visible seam.
 * @param {() => number} random
 * @param {number} period
 * @param {number} amplitude
 * @returns {(distance: number) => number}
 */
function createWave(random, period, amplitude) {
  const p = period || 1;
  const tau = (Math.PI * 2) / p;
  const f1 = tau * (2 + Math.floor(random() * 2));
  const f2 = tau * (5 + Math.floor(random() * 3));
  const phase1 = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;

  return (distance) =>
    Math.sin(distance * f1 + phase1) * amplitude +
    Math.sin(distance * f2 + phase2) * amplitude * 0.4;
}

/**
 * Gently bowed hand-drawn line. Endpoints stay exact — arrowheads and
 * underlines depend on that.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} roughness
 * @param {() => number} random
 * @param {{ bow?: number, steps?: number }} [opts]
 * @returns {string}
 */
export function roughLine(x1, y1, x2, y2, roughness, random, opts = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const steps = opts.steps ?? clamp(Math.round(length / 22), 2, 14);
  const bow = opts.bow ?? 0;
  const nx = -dy / length;
  const ny = dx / length;

  const amplitude = roughness * 0.32;
  const frequency = 1 + random() * 1.4;
  const phase = random() * Math.PI * 2;

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Envelope pins the wobble to zero at both ends
    const envelope = Math.sin(t * Math.PI);
    const offset =
      bow * envelope +
      Math.sin(t * Math.PI * frequency + phase) * amplitude * envelope;

    points.push({
      x: x1 + dx * t + nx * offset,
      y: y1 + dy * t + ny * offset,
    });
  }

  return catmullRomPath(points, false);
}

/**
 * Sample a rounded rectangle perimeter into evenly spaced points, each with
 * its outward normal so noise can be applied perpendicular to the edge.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @param {number} spacing
 */
function roundedRectOutline(x, y, width, height, radius, spacing) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  const right = x + width;
  const bottom = y + height;
  const HALF_PI = Math.PI / 2;

  const line = (x1, y1, x2, y2, nx, ny) => ({
    type: "line",
    x1,
    y1,
    x2,
    y2,
    nx,
    ny,
    length: Math.hypot(x2 - x1, y2 - y1),
  });
  const arc = (cx, cy, start, end) => ({
    type: "arc",
    cx,
    cy,
    start,
    end,
    r,
    length: Math.abs(end - start) * r,
  });

  const segments = [
    line(x + r, y, right - r, y, 0, -1),
    arc(right - r, y + r, -HALF_PI, 0),
    line(right, y + r, right, bottom - r, 1, 0),
    arc(right - r, bottom - r, 0, HALF_PI),
    line(right - r, bottom, x + r, bottom, 0, 1),
    arc(x + r, bottom - r, HALF_PI, Math.PI),
    line(x, bottom - r, x, y + r, -1, 0),
    arc(x + r, y + r, Math.PI, Math.PI + HALF_PI),
  ];

  const total = segments.reduce((sum, seg) => sum + seg.length, 0);
  const points = [];
  // Indices where a straight edge begins — the natural place for a pen to
  // start and finish, so the overlap hides in a corner instead of mid-edge.
  const edgeStarts = [];

  for (const seg of segments) {
    if (seg.length <= 0.01) continue;
    const steps = Math.max(1, Math.round(seg.length / spacing));
    if (seg.type === "line") edgeStarts.push(points.length);

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      if (seg.type === "line") {
        points.push({
          x: seg.x1 + (seg.x2 - seg.x1) * t,
          y: seg.y1 + (seg.y2 - seg.y1) * t,
          nx: seg.nx,
          ny: seg.ny,
        });
      } else {
        const angle = seg.start + (seg.end - seg.start) * t;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        points.push({
          x: seg.cx + nx * seg.r,
          y: seg.cy + ny * seg.r,
          nx,
          ny,
        });
      }
    }
  }

  return { points, total, edgeStarts };
}

/**
 * Hand-drawn rounded rect as ONE continuous, smoothly wobbling stroke.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @param {number} roughness
 * @param {() => number} random
 * @param {{ overshoot?: number, portion?: number, startAt?: number, snapToEdge?: boolean, amplitude?: number, spacing?: number, breaks?: { start: number, end: number }[] }} [opts]
 * @returns {string[]}
 */
export function generateHandDrawnRectPaths(
  x,
  y,
  width,
  height,
  radius,
  roughness,
  random,
  opts = {}
) {
  if (width <= 0 || height <= 0) return [];

  const spacing = opts.spacing ?? 11;
  const { points, total, edgeStarts } = roundedRectOutline(
    x,
    y,
    width,
    height,
    radius,
    spacing
  );

  const count = points.length;
  if (count < 3) return [];

  const amplitude = opts.amplitude ?? roughness * 0.45;
  const wave = createWave(random, total, amplitude);
  const step = total / count;

  const portion = clamp(opts.portion ?? 1, 0.05, 1);
  const overshoot = opts.overshoot ?? 0;

  let startIndex = Math.floor((opts.startAt ?? random()) * count);
  if (opts.snapToEdge && edgeStarts.length) {
    startIndex = edgeStarts.reduce((best, index) =>
      Math.abs(index - startIndex) < Math.abs(best - startIndex) ? index : best
    );
  }

  let drawn = Math.round(count * portion);

  // A partial retrace that stops mid-edge reads as a stray line; end it on a
  // corner so it looks like a deliberate second pass.
  if (opts.snapToEdge && edgeStarts.length && portion < 1) {
    const target = startIndex + drawn;
    let snapped = target;
    let bestDelta = Infinity;
    for (let lap = 0; lap <= 2; lap++) {
      for (const index of edgeStarts) {
        const candidate = index + lap * count;
        const delta = Math.abs(candidate - target);
        if (candidate > startIndex + 2 && delta < bestDelta) {
          bestDelta = delta;
          snapped = candidate;
        }
      }
    }
    drawn = Math.min(snapped - startIndex, count);
  }

  const tail =
    portion >= 1 ? Math.max(1, Math.round(overshoot / step)) : 0;

  const breaks = opts.breaks ?? [];
  const runs = [];
  let run = [];

  for (let k = 0; k <= drawn + tail; k++) {
    const index = (startIndex + k) % count;

    // Gaps live at fixed perimeter fractions, so every pass lifts the pen at
    // the same place and the break stays visible
    if (breaks.length && isBroken(index / count, breaks)) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }

    const point = points[index];
    // Index-based arc length keeps the wave continuous across the wrap
    let offset = wave((startIndex + k) * step);

    // The overlapping tail drifts a hair off the line, like a real pen —
    // any more and the overlap reads as a stray second stroke.
    if (tail > 0 && k > drawn) {
      offset += ((k - drawn) / tail) * 0.5;
    }

    run.push({
      x: point.x + point.nx * offset,
      y: point.y + point.ny * offset,
    });
  }

  if (run.length > 1) runs.push(run);

  return runs.map((points) => catmullRomPath(points, false));
}

/**
 * @param {number} fraction position around the perimeter, 0–1
 * @param {{ start: number, end: number }[]} breaks
 */
function isBroken(fraction, breaks) {
  return breaks.some((gap) =>
    gap.end > gap.start
      ? fraction >= gap.start && fraction < gap.end
      : fraction >= gap.start || fraction < gap.end
  );
}

/**
 * Lay out gaps around a perimeter: one per slice so they never clump, each a
 * random size between `min` and `max`, capped so the frame still reads closed.
 * @param {number} perimeter
 * @param {true | { count?: number | null, min?: number, max?: number }} config
 * @param {() => number} random
 * @returns {{ start: number, end: number }[]}
 */
export function createBorderBreaks(perimeter, config, random) {
  if (!config || perimeter <= 0) return [];

  const settings = config === true ? {} : config;
  const count = Math.max(
    1,
    Math.round(settings.count ?? 2 + random() * 3)
  );
  const min = Math.max(2, settings.min ?? 6);
  const max = Math.max(min, settings.max ?? 30);

  const slice = perimeter / count;
  let budget = perimeter * 0.35;
  const breaks = [];

  for (let i = 0; i < count; i++) {
    const length = Math.min(
      min + random() * (max - min),
      slice * 0.7,
      budget
    );
    if (length < 2) break;
    budget -= length;

    const start = i * slice + random() * Math.max(0, slice - length);
    breaks.push({
      start: start / perimeter,
      end: (start + length) / perimeter,
    });
  }

  return breaks;
}

/**
 * Back-compat single closed path for tests / simple use.
 * @returns {string}
 */
export function generateHandDrawnRectPath(
  x,
  y,
  width,
  height,
  radius,
  roughness,
  random
) {
  const paths = generateHandDrawnRectPaths(
    x,
    y,
    width,
    height,
    radius,
    roughness,
    random
  );
  return paths.join(" ") + " Z";
}

/**
 * Positioned group so shapes can be authored in local coordinates around the
 * origin and then placed / rotated as a unit.
 * @param {SVGElement} parent
 * @param {number} x
 * @param {number} y
 * @param {number} [rotation] degrees
 * @returns {SVGGElement}
 */
export function createGroup(parent, x, y, rotation = 0) {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute(
    "transform",
    `translate(${fmt(x)} ${fmt(y)}) rotate(${rotation.toFixed(1)})`
  );
  parent.appendChild(group);
  return group;
}

/**
 * @param {SVGElement} svg
 * @param {string} d
 * @param {{ color: string, strokeWidth: number, opacity: number, dashed?: boolean, fill?: string }} style
 */
export function appendPath(svg, d, style) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", style.fill ?? "none");
  path.setAttribute("stroke", style.color);
  path.setAttribute("stroke-width", String(style.strokeWidth));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("opacity", String(style.opacity));
  if (style.dashed) {
    path.setAttribute("stroke-dasharray", "2.5 4.5");
  }
  svg.appendChild(path);
  return path;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 */
function rectPerimeter(width, height, radius) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  return 2 * (width - 2 * r) + 2 * (height - 2 * r) + 2 * Math.PI * r;
}

/**
 * Hand-drawn border: one confident outline, plus a faint partial retrace so it
 * reads as sketched rather than traced twice.
 * @param {SVGElement} svg
 * @param {import('./geometry.js').Rect} rect
 * @param {{ color: string, strokeWidth: number, roughness: number, opacity: number, breaks?: true | object }} options
 * @param {number} seed
 */
export function drawBorder(svg, rect, options, seed) {
  const random = createRandom(seed);
  const roughness = clamp(options.roughness, 0, 3);
  const radius = rect.radius || 0;

  const breaks = options.breaks
    ? createBorderBreaks(
        rectPerimeter(rect.width, rect.height, radius),
        options.breaks,
        random
      )
    : [];
  // Denser sampling so a small gap lands where it was asked for
  const spacing = breaks.length ? 5.5 : 11;

  const main = generateHandDrawnRectPaths(
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    radius,
    roughness,
    random,
    {
      amplitude: roughness * 0.5,
      overshoot: 9 + roughness * 5,
      startAt: random(),
      snapToEdge: true,
      spacing,
      breaks,
    }
  );

  for (const d of main) {
    appendPath(svg, d, {
      color: options.color,
      strokeWidth: options.strokeWidth,
      opacity: options.opacity,
    });
  }

  if (roughness < 0.9) return;

  // Partial second pass, nudged outward — the "sketch density" of the reference
  const offset = 1.1 + random() * 0.9;
  const ghost = generateHandDrawnRectPaths(
    rect.x - offset,
    rect.y - offset,
    rect.width + offset * 2,
    rect.height + offset * 2,
    radius + offset,
    roughness,
    random,
    {
      amplitude: roughness * 0.45,
      portion: 0.45 + random() * 0.25,
      startAt: random(),
      snapToEdge: true,
      spacing,
      breaks,
    }
  );

  for (const d of ghost) {
    appendPath(svg, d, {
      color: options.color,
      strokeWidth: options.strokeWidth * 0.7,
      opacity: options.opacity * 0.4,
    });
  }
}

/**
 * @param {{ x: number, y: number }} vector
 */
function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (!length) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

/**
 * Where a callout leaves its note. Notes are wide and short, so a note sitting
 * above the frame launches from the far end of its baseline — that is what
 * produces the long diagonal sweep instead of a stubby vertical tick.
 * @param {import('./geometry.js').Rect} origin
 * @param {{ x: number, y: number }} target
 */
function arrowStartFromNote(origin, target) {
  const cx = origin.x + origin.width / 2;
  const cy = origin.y + origin.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const hw = origin.width / 2 || 0.001;
  const hh = origin.height / 2 || 0.001;

  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;

  if (Math.abs(dy) / hh >= Math.abs(dx) / hw) {
    return { x: cx - sx * hw * 0.72, y: cy + sy * (hh + 7) };
  }
  return { x: cx + sx * (hw + 7), y: cy + sy * hh * 0.2 };
}

/**
 * Resolve arrow start/end. When the note's measured box is known the arrow
 * runs from the note to just outside the frame — never across the content.
 * @param {import('./geometry.js').Rect} rect
 * @param {object} arrowOptions
 * @param {() => number} random
 * @param {import('./geometry.js').Rect | null} origin
 */
function arrowEndpoints(rect, arrowOptions, random, origin) {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const anchored = Boolean(origin && origin.width > 0 && origin.height > 0);

  let start = anchored
    ? arrowStartFromNote(origin, center)
    : annotationAnchor(
        arrowOptions.from || "top-right",
        rect,
        38 + random() * 12
      );

  const toPos = arrowOptions.to || "edge";
  let end;

  if (toPos === "center") {
    end = center;
  } else if (toPos === "edge") {
    const near = nearestPointOnRect(rect, start);
    let outward = normalize({ x: start.x - near.x, y: start.y - near.y });
    if (!outward.x && !outward.y) outward = { x: 0, y: -1 };
    // Land just OUTSIDE the frame so the tip kisses the border
    const gap = 6 + random() * 3;
    end = { x: near.x + outward.x * gap, y: near.y + outward.y * gap };
  } else {
    end = pointFromPosition(toPos, rect);
  }

  // Keep the gesture long enough to read as a sweep. Skipped when the arrow is
  // anchored to a note — extending backwards would run the shaft over the text.
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const minimum = 34;
  if (!anchored && distance < minimum) {
    const unit =
      distance > 0
        ? { x: (start.x - end.x) / distance, y: (start.y - end.y) / distance }
        : { x: 0, y: -1 };
    start = { x: end.x + unit.x * minimum, y: end.y + unit.y * minimum };
  }

  return { start, end };
}

/**
 * Sweeping hand-drawn arrow (reference-style curved callout).
 * @param {SVGElement} svg
 * @param {import('./geometry.js').Rect} rect
 * @param {object} arrowOptions
 * @param {{ color: string, strokeWidth: number, roughness: number, opacity: number }} style
 * @param {number} seed
 * @param {import('./geometry.js').Rect | null} [origin]
 */
export function drawArrow(svg, rect, arrowOptions, style, seed, origin = null) {
  const random = createRandom(seed + 17);
  const { start, end } = arrowEndpoints(rect, arrowOptions, random, origin);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dashed = arrowOptions.style === "dotted";

  // Tangent at the tip — drives the arrowhead so it follows the curve
  let tipAngle = Math.atan2(dy, dx);
  let shaft;
  const hull = [start, end];

  if (arrowOptions.style === "straight") {
    shaft = roughLine(start.x, start.y, end.x, end.y, style.roughness, random, {
      bow: (random() - 0.5) * style.roughness,
    });
  } else {
    // Bow away from the element so the curve never cuts across the content
    const perpendicular = { x: -dy / distance, y: dx / distance };
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const towardCenter = {
      x: rect.x + rect.width / 2 - mid.x,
      y: rect.y + rect.height / 2 - mid.y,
    };
    const sign =
      perpendicular.x * towardCenter.x + perpendicular.y * towardCenter.y > 0
        ? -1
        : 1;
    const bow = Math.min(distance * (0.16 + random() * 0.08), 30) * sign;

    const c1x = start.x + dx * 0.28 + perpendicular.x * bow;
    const c1y = start.y + dy * 0.28 + perpendicular.y * bow;
    const c2x = start.x + dx * 0.72 + perpendicular.x * bow * 0.85;
    const c2y = start.y + dy * 0.72 + perpendicular.y * bow * 0.85;
    hull.push({ x: c1x, y: c1y }, { x: c2x, y: c2y });

    shaft = `M ${fmt(start.x)} ${fmt(start.y)} C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(end.x)} ${fmt(end.y)}`;

    if (style.roughness >= 1.1) {
      const drift = () => (random() - 0.5) * 1.4;
      const ghost = `M ${fmt(start.x + drift())} ${fmt(start.y + drift())} C ${fmt(c1x + drift())} ${fmt(c1y + drift())} ${fmt(c2x + drift())} ${fmt(c2y + drift())} ${fmt(end.x + drift() * 0.4)} ${fmt(end.y + drift() * 0.4)}`;
      appendPath(svg, ghost, {
        ...style,
        opacity: style.opacity * 0.3,
        strokeWidth: style.strokeWidth * 0.7,
        dashed,
      });
    }

    tipAngle = Math.atan2(end.y - c2y, end.x - c2x);
  }

  appendPath(svg, shaft, { ...style, dashed });

  // Hand-drawn V arrowhead, aligned to the tangent
  const headLength = 9 + style.strokeWidth * 1.4;
  const spread = 0.46 + random() * 0.1;

  for (const side of [-1, 1]) {
    const angle = tipAngle + spread * side;
    const tail = {
      x: end.x - headLength * Math.cos(angle),
      y: end.y - headLength * Math.sin(angle),
    };
    appendPath(
      svg,
      roughLine(tail.x, tail.y, end.x, end.y, style.roughness * 0.5, random, {
        steps: 2,
        bow: 0.35 * side,
      }),
      { ...style, dashed: false }
    );
  }

  // A bézier stays inside the hull of its control polygon, so this bounds the
  // shaft — decorations use it to keep off the arrow.
  const xs = hull.map((p) => p.x);
  const ys = hull.map((p) => p.y);
  const bounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };

  return { start, end, bounds };
}

/**
 * Shaky underline sized to the *measured* text, not a character-count guess.
 * @param {SVGElement} svg
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {{ color: string, strokeWidth: number, roughness: number, opacity: number }} style
 * @param {() => number} random
 */
export function drawUnderline(svg, x, y, width, style, random) {
  if (width <= 4) return;

  const slope = (random() - 0.5) * 2.4;

  appendPath(
    svg,
    roughLine(x, y, x + width, y + slope, style.roughness * 0.6, random, {
      bow: (random() - 0.5) * 1.4,
      steps: 5,
    }),
    {
      color: style.color,
      strokeWidth: style.strokeWidth * 0.95,
      opacity: style.opacity * 0.9,
    }
  );

  // Faint partial second pass — hand-drawn, not a ruled double line
  const inset = width * (0.06 + random() * 0.12);
  const length = width * (0.62 + random() * 0.24);
  appendPath(
    svg,
    roughLine(
      x + inset,
      y + 2.6,
      x + Math.min(width, inset + length),
      y + 2.6 + slope * 0.6,
      style.roughness * 0.5,
      random,
      { bow: (random() - 0.5) * 1.1, steps: 4 }
    ),
    {
      color: style.color,
      strokeWidth: style.strokeWidth * 0.7,
      opacity: style.opacity * 0.38,
    }
  );
}

/**
 * Create the note text at the origin and measure it, so layout can use real
 * glyph metrics instead of estimating from the string length.
 * @param {SVGElement} svg
 * @param {string} text
 * @param {{ color: string, opacity: number, fontSize?: number }} style
 * @returns {{ group: SVGGElement, textEl: SVGTextElement, width: number, ascent: number, descent: number, fontSize: number }}
 */
export function createNoteText(svg, text, style) {
  const fontSize = style.fontSize ?? NOTE_FONT_SIZE;
  const group = document.createElementNS(SVG_NS, "g");
  const textEl = document.createElementNS(SVG_NS, "text");

  textEl.textContent = text;
  textEl.setAttribute("x", "0");
  textEl.setAttribute("y", "0");
  textEl.setAttribute("fill", style.color);
  textEl.setAttribute("opacity", String(style.opacity));
  textEl.setAttribute("font-size", String(fontSize));
  textEl.setAttribute("font-family", style.fontFamily || HANDWRITTEN_FONT);
  textEl.setAttribute("font-weight", "600");
  textEl.setAttribute("letter-spacing", "0.4");
  textEl.setAttribute("text-anchor", "start");
  textEl.setAttribute("dominant-baseline", "auto");

  group.appendChild(textEl);
  svg.appendChild(group);

  let width = 0;
  try {
    const box = textEl.getBBox();
    if (box && box.width > 0) width = box.width;
  } catch {
    /* not rendered yet — fall through to the estimate */
  }
  if (!width) {
    try {
      const measured = textEl.getComputedTextLength();
      if (Number.isFinite(measured) && measured > 0) width = measured;
    } catch {
      /* ignore */
    }
  }
  if (!width) width = text.length * fontSize * 0.45;

  // Stable font metrics keep the underline at a constant distance regardless
  // of whether the string happens to have ascenders or descenders.
  const ascent = fontSize * 0.74;
  const descent = fontSize * 0.26;

  return { group, textEl, width, ascent, descent, fontSize };
}

/**
 * Position a measured note inside `box` and draw its underline.
 * @param {ReturnType<typeof createNoteText>} note
 * @param {import('./geometry.js').Rect} box
 * @param {{ color: string, opacity: number, strokeWidth?: number, roughness?: number }} style
 * @param {number} seed
 * @param {{ tilt?: number, underline?: boolean }} [options]
 * @returns {SVGGElement}
 */
export function placeNoteText(note, box, style, seed, options = {}) {
  const random = createRandom(seed + 55);
  const tilt = options.tilt ?? (random() - 0.5) * 7;

  note.textEl.setAttribute("x", fmt(box.x));
  note.textEl.setAttribute("y", fmt(box.y + note.ascent));

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  note.group.setAttribute(
    "transform",
    `rotate(${tilt.toFixed(2)} ${fmt(cx)} ${fmt(cy)})`
  );

  if (options.underline !== false) {
    drawUnderline(
      note.group,
      box.x + 1,
      box.y + box.height + 2,
      box.width - 2,
      {
        color: style.color,
        strokeWidth: style.strokeWidth || 1.4,
        roughness: style.roughness || 1.4,
        opacity: style.opacity,
      },
      random
    );
  }

  return note.group;
}

/**
 * Convenience wrapper: create, place and underline a note in one call.
 * @param {SVGElement} svg
 * @param {import('./geometry.js').Rect} box
 * @param {string} text
 * @param {{ color: string, opacity: number, strokeWidth?: number, roughness?: number }} style
 * @param {number} [seed]
 * @param {{ tilt?: number, underline?: boolean }} [options]
 */
export function drawNote(svg, box, text, style, seed = 1, options = {}) {
  const note = createNoteText(svg, text, style);
  placeNoteText(note, { ...box, width: note.width }, style, seed, options);
  return note.textEl;
}

/**
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @returns {SVGSVGElement}
 */
export function createOverlaySvg(left, top, width, height) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "doodle-ui-overlay");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.position = "fixed";
  svg.style.left = `${left}px`;
  svg.style.top = `${top}px`;
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.style.pointerEvents = "none";
  svg.style.overflow = "visible";
  svg.style.zIndex = "2147483646";
  return svg;
}

export { HANDWRITTEN_FONT, NOTE_FONT_SIZE };
