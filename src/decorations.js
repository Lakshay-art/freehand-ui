import { createRandom, clamp } from "./utils.js";
import {
  appendPath,
  roughLine,
  createGroup,
  catmullRomPath,
  generateHandDrawnRectPaths,
} from "./renderer.js";
import { intersectionArea, distanceToRoundedRect } from "./geometry.js";

/**
 * Every drawer works in local coordinates centred on (0, 0); placement and
 * rotation live on the wrapping group.
 * @typedef {(parent: SVGElement, size: number, style: DecorStyle, random: () => number) => void} Drawer
 * @typedef {{ color: string, strokeWidth: number, opacity: number, roughness: number }} DecorStyle
 */

/**
 * Round dot — a zero-length stroke with a round cap.
 */
function drawDot(parent, x, y, style, scale = 1.7) {
  appendPath(parent, `M ${x.toFixed(2)} ${y.toFixed(2)} l 0.01 0`, {
    ...style,
    strokeWidth: style.strokeWidth * scale,
  });
}

/**
 * Heart outline: bottom tip, one lobe up each side, meeting at the cleft.
 */
function drawHeart(parent, size, style, random) {
  const s = size;
  const j = () => (random() - 0.5) * s * 0.12;

  const path = [
    `M 0 ${(s * 0.95).toFixed(2)}`,
    `C ${(-s * 1.16 + j()).toFixed(2)} ${(s * 0.08).toFixed(2)}, ${(-s * 0.94 + j()).toFixed(2)} ${(-s * 0.78).toFixed(2)}, 0 ${(-s * 0.3).toFixed(2)}`,
    `C ${(s * 0.94 + j()).toFixed(2)} ${(-s * 0.78).toFixed(2)}, ${(s * 1.16 + j()).toFixed(2)} ${(s * 0.08).toFixed(2)}, 0 ${(s * 0.95).toFixed(2)}`,
    "Z",
  ].join(" ");

  appendPath(parent, path, style);
}

/**
 * Four-point twinkle. The control points sit near the centre, which pinches
 * each side inward — that concave waist is what reads as a sparkle rather than
 * a plus sign or a diamond.
 */
function twinkle(parent, radiusX, radiusY, pinch, style) {
  const rx = radiusX;
  const ry = radiusY;
  const c = pinch;

  const path = [
    `M 0 ${(-ry).toFixed(2)}`,
    `Q ${c.toFixed(2)} ${(-c).toFixed(2)} ${rx.toFixed(2)} 0`,
    `Q ${c.toFixed(2)} ${c.toFixed(2)} 0 ${ry.toFixed(2)}`,
    `Q ${(-c).toFixed(2)} ${c.toFixed(2)} ${(-rx).toFixed(2)} 0`,
    `Q ${(-c).toFixed(2)} ${(-c).toFixed(2)} 0 ${(-ry).toFixed(2)}`,
    "Z",
  ].join(" ");

  appendPath(parent, path, style);
}

/**
 * Slim, tall twinkle — the classic sparkle accent.
 */
function drawSparkle(parent, size, style, random) {
  twinkle(
    parent,
    size * (0.34 + random() * 0.1),
    size,
    size * (0.06 + random() * 0.06),
    style
  );
}

/**
 * Fuller four-point star — same construction, wider arms and a softer waist.
 */
function drawStar(parent, size, style, random) {
  twinkle(
    parent,
    size * (0.66 + random() * 0.12),
    size,
    size * (0.2 + random() * 0.08),
    style
  );
}

/**
 * Solid five-point star. Each side is a quadratic whose control sits close to
 * the centre — at that radius the waist lands near the classic star proportion
 * while the sides stay gently concave.
 */
function drawTwinkle(parent, size, style, random) {
  const count = 5;
  const first = -Math.PI / 2 + (random() - 0.5) * 0.5;

  const at = (angle, radius) => ({
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  });

  // Tips are computed up front so the two curves meeting at one share it
  // exactly. Arm length and spacing both wander — a drawn star is never
  // regular, and the unevenness is what stops it reading as clip art.
  const tips = [];
  for (let i = 0; i < count; i++) {
    const angle =
      first + (Math.PI * 2 * i) / count + (random() - 0.5) * 0.24;
    tips.push({ angle, ...at(angle, size * (0.8 + random() * 0.4)) });
  }

  let path = `M ${tips[0].x.toFixed(2)} ${tips[0].y.toFixed(2)}`;
  for (let i = 0; i < count; i++) {
    const from = tips[i];
    const to = tips[(i + 1) % count];

    let delta = to.angle - from.angle;
    while (delta <= 0) delta += Math.PI * 2;

    // Waist depth varies per side, so some arms are fatter than others
    const control = at(
      from.angle + delta / 2 + (random() - 0.5) * 0.16,
      size * (0.02 + random() * 0.13)
    );

    path += ` Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  }
  path += " Z";

  const filled = appendPath(parent, path, {
    ...style,
    fill: style.color,
    strokeWidth: style.strokeWidth * 0.45,
  });

  // Round joins blunt the tips into a blob; a star needs its points
  filled.setAttribute("stroke-linejoin", "miter");
  filled.setAttribute("stroke-linecap", "butt");
}

/**
 * Concentric arcs sweeping around a corner — the "motion" marks that hug a
 * button's edge. Drawn around local up so the outward rotation aims them.
 */
function drawArcs(parent, size, style, random) {
  const count = 2 + Math.floor(random() * 2);
  // Focal point sits behind the slot so the arcs curve around the corner
  // instead of floating out past it
  const focus = size * 0.55;

  for (let i = 0; i < count; i++) {
    const radius = size * (0.75 + i * 0.4);
    const sweep = 0.8 + random() * 0.3 - i * 0.08;
    const steps = 7;
    const points = [];

    for (let s = 0; s <= steps; s++) {
      const angle = -Math.PI / 2 - sweep / 2 + sweep * (s / steps);
      const wobble = radius + (random() - 0.5) * size * 0.06;
      points.push({
        x: Math.cos(angle) * wobble,
        y: focus + Math.sin(angle) * wobble,
      });
    }

    appendPath(parent, catmullRomPath(points, false), {
      ...style,
      strokeWidth: style.strokeWidth * (1 - i * 0.12),
      opacity: style.opacity * (1 - i * 0.14),
    });
  }
}

/**
 * Small face: hand-drawn circle, two dot eyes, curved mouth.
 */
function drawSmiley(parent, size, style, random) {
  const r = size * 0.92;

  // Reuse the border generator — a rounded rect whose radius is half its side
  // is a circle, and it comes with the same pen overlap as the frame
  const circle = generateHandDrawnRectPaths(
    -r,
    -r,
    r * 2,
    r * 2,
    r,
    style.roughness * 0.7,
    random,
    {
      amplitude: style.roughness * 0.22,
      overshoot: r * 0.55,
      spacing: Math.max(3, r * 0.45),
      startAt: random(),
    }
  );

  for (const d of circle) {
    appendPath(parent, d, { ...style, strokeWidth: style.strokeWidth * 0.9 });
  }

  drawDot(parent, -r * 0.36, -r * 0.22, style, 1.5);
  drawDot(parent, r * 0.36, -r * 0.22, style, 1.5);

  appendPath(
    parent,
    `M ${(-r * 0.44).toFixed(2)} ${(r * 0.18).toFixed(2)} Q 0 ${(r * 0.72).toFixed(2)} ${(r * 0.44).toFixed(2)} ${(r * 0.18).toFixed(2)}`,
    style
  );
}

/**
 * Emphasis burst — strokes radiating from a focal point at diverging angles,
 * with a hollow centre and uneven lengths. Parallel same-length ticks read as
 * "|||"; the divergence is what makes it a burst.
 */
function drawEmphasis(parent, size, style, random, opts = {}) {
  const count = opts.count ?? 3 + Math.floor(random() * 2);
  const spread = opts.spread ?? 0.62 + random() * 0.3;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = -Math.PI / 2 + t * spread * 2;
    const inner = size * (0.34 + random() * 0.12);
    const outer = size * (0.86 + random() * 0.36);

    appendPath(
      parent,
      roughLine(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
        0.7,
        random,
        { steps: 2, bow: (random() - 0.5) * 0.9 }
      ),
      { ...style, strokeWidth: style.strokeWidth * (0.85 + random() * 0.4) }
    );
  }
}

/**
 * Three dots, unevenly spaced.
 */
function drawDots(parent, size, style, random) {
  let x = -size * 0.7;
  for (let i = 0; i < 3; i++) {
    drawDot(parent, x, (random() - 0.5) * size * 0.16, style);
    x += size * (0.6 + random() * 0.25);
  }
}

/**
 * Single confident slash.
 */
function drawStroke(parent, size, style, random) {
  appendPath(
    parent,
    roughLine(-size, 0, size, 0, 1.2, random, {
      bow: (random() - 0.5) * size * 0.35,
      steps: 4,
    }),
    style
  );
}

/**
 * Two rising wisps. Both lean the same way — mirrored wisps read as brackets
 * rather than steam.
 */
function drawSteam(parent, size, style, random) {
  const lean = random() < 0.5 ? -1 : 1;

  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * size * 0.72;
    const base = size * 0.62 - i * size * 0.14;

    appendPath(
      parent,
      `M ${x.toFixed(2)} ${base.toFixed(2)} Q ${(x + lean * size * 0.52).toFixed(2)} ${(base - size * 0.62).toFixed(2)} ${(x + lean * size * 0.06).toFixed(2)} ${(base - size * 1.3).toFixed(2)}`,
      style
    );
  }
}

/** @type {Record<string, Drawer>} */
const DECORATION_DRAWERS = {
  heart: drawHeart,
  sparkle: drawSparkle,
  star: drawStar,
  twinkle: drawTwinkle,
  smiley: drawSmiley,
  emphasis: drawEmphasis,
  arcs: drawArcs,
  dots: drawDots,
  stroke: drawStroke,
  steam: drawSteam,
};

// Marks that accent handwriting rather than the component itself
const TEXT_TYPES = ["heart", "sparkle"];
// Directional marks that hug a corner
const CORNER_ACCENTS = ["arcs", "emphasis"];
// Stars that sit off a corner, further out than an accent
const CORNER_STARS = ["twinkle", "star"];

// A frame stays readable with at most two marks around it
const MAX_BORDER_MARKS = 2;

/**
 * Per-type composition rules. `standoff` is the gap from the element's outline:
 * accents hug it, stars sit noticeably further out. `brightness` scales opacity
 * past the shared base so a solid mark can read as a glint.
 */
const TYPE_TRAITS = {
  heart: { size: [7, 10], tilt: 14, standoff: 22 },
  sparkle: { size: [6, 9], tilt: 20, standoff: 22 },
  star: { size: [8, 11], tilt: 25, standoff: 26 },
  twinkle: { size: [5, 7.5], tilt: 30, standoff: 26, brightness: 1.4 },
  smiley: { size: [8, 11], tilt: 10, standoff: 22 },
  emphasis: { size: [12, 17], tilt: 10, standoff: 13, outward: true },
  arcs: { size: [11, 16], tilt: 12, standoff: 12, outward: true },
  dots: { size: [6, 9], tilt: 8, standoff: 20 },
  stroke: { size: [8, 12], tilt: 40, standoff: 20 },
  steam: { size: [8, 11], tilt: 10, standoff: 20 },
};

export const DEFAULT_TYPES = [
  "twinkle",
  "arcs",
  "emphasis",
  "heart",
  "sparkle",
];

/**
 * @param {{ x: number, y: number }} point
 * @param {number} radius
 * @param {import('./geometry.js').Rect[]} blockers
 */
function isClear(point, radius, blockers) {
  const box = {
    x: point.x - radius,
    y: point.y - radius,
    width: radius * 2,
    height: radius * 2,
  };
  return !blockers.some((blocker) => intersectionArea(box, blocker) > 0);
}

/**
 * @param {string[]} types
 * @param {string[]} family
 * @param {() => number} random
 * @returns {string | null}
 */
function pickFrom(types, family, random) {
  const pool = types.filter(
    (type) => family.includes(type) && DECORATION_DRAWERS[type]
  );
  if (!pool.length) return null;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * @param {[number, number]} range
 * @param {() => number} random
 */
function sizeFrom(range, random) {
  return range[0] + random() * (range[1] - range[0]);
}

/**
 * @param {{ opacity: number }} style
 * @param {{ brightness?: number }} traits
 * @param {number} variation
 */
function markOpacity(style, traits, variation) {
  return clamp(style.opacity * variation * (traits.brightness ?? 1), 0, 1);
}

/**
 * The four rounded corners, each with the centre of its arc and the outward
 * diagonal. Marks are offset from the arc centre so they follow the real
 * silhouette — a pill's cap as faithfully as a card's corner.
 * @param {import('./geometry.js').Rect} rect
 */
function cornerAnchors(rect) {
  const radius = clamp(
    rect.radius ?? 0,
    0,
    Math.min(rect.width, rect.height) / 2
  );
  const d = Math.SQRT1_2;
  const right = rect.x + rect.width - radius;
  const bottom = rect.y + rect.height - radius;
  const left = rect.x + radius;
  const top = rect.y + radius;

  return [
    { cx: left, cy: top, dir: { x: -d, y: -d } },
    { cx: right, cy: top, dir: { x: d, y: -d } },
    { cx: right, cy: bottom, dir: { x: d, y: d } },
    { cx: left, cy: bottom, dir: { x: -d, y: d } },
  ].map((anchor) => ({ ...anchor, radius }));
}

/**
 * @param {{ cx: number, cy: number, dir: { x: number, y: number }, radius: number }} anchor
 * @param {number} standoff
 */
function cornerPoint(anchor, standoff) {
  return {
    x: anchor.cx + anchor.dir.x * (anchor.radius + standoff),
    y: anchor.cy + anchor.dir.y * (anchor.radius + standoff),
  };
}

/**
 * Rotation that aims a mark drawn around local "up" away from the element.
 * @param {{ x: number, y: number }} dir
 */
function outwardTilt(dir) {
  return (Math.atan2(dir.y, dir.x) * 180) / Math.PI + 90;
}

/**
 * Draw one mark at a corner. Returns false when there was no room.
 */
function placeAtCorner(svg, type, anchor, style, random, hasRoom) {
  const traits = TYPE_TRAITS[type] ?? { size: [8, 12], tilt: 15 };
  const size = sizeFrom(traits.size, random);
  const point = cornerPoint(anchor, traits.standoff ?? 20);

  // Outward marks grow away from the element, so they need far less room
  const needed = (traits.outward ? size * 0.35 : size) + 4;
  if (!hasRoom(point, needed)) return false;

  const tilt = traits.outward
    ? outwardTilt(anchor.dir) + (random() - 0.5) * traits.tilt
    : (random() - 0.5) * traits.tilt;

  DECORATION_DRAWERS[type](
    createGroup(svg, point.x, point.y, tilt),
    size,
    { ...style, opacity: markOpacity(style, traits, 0.8 + random() * 0.18) },
    random
  );

  return true;
}

/**
 * Corner composition: one accent hugging a corner, one star further out on the
 * corner farthest from it.
 */
function renderCornerMarks(svg, rect, types, budget, style, random, hasRoom) {
  const accent = pickFrom(types, CORNER_ACCENTS, random);
  const star = pickFrom(types, CORNER_STARS, random);

  const picks = [accent, star].filter(Boolean);
  if (picks.length < budget) {
    // Anything else the caller asked for can fill the remaining slot
    const rest = types.filter(
      (type) =>
        DECORATION_DRAWERS[type] &&
        !TEXT_TYPES.includes(type) &&
        !CORNER_ACCENTS.includes(type) &&
        !CORNER_STARS.includes(type)
    );
    picks.push(...rest);
  }
  if (!picks.length) return;

  // Only one family was offered — repeat it rather than under-filling `count`
  for (let i = 0; picks.length < budget; i++) {
    picks.push(picks[i % picks.length]);
  }

  const anchors = cornerAnchors(rect)
    .map((anchor) => ({ anchor, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.anchor);

  let placed = 0;
  let previous = null;

  for (const type of picks.slice(0, budget)) {
    // Second mark goes on the corner farthest from the first
    const ordered = previous
      ? [...anchors].sort(
          (a, b) =>
            Math.hypot(b.cx - previous.cx, b.cy - previous.cy) -
            Math.hypot(a.cx - previous.cx, a.cy - previous.cy)
        )
      : anchors;

    const anchor = ordered.find(
      (candidate) =>
        candidate !== previous &&
        placeAtCorner(svg, type, candidate, style, random, hasRoom)
    );

    if (anchor) {
      previous = anchor;
      placed += 1;
      if (placed >= budget) break;
    }
  }
}

/**
 * Small components have no corner worth pointing at, so they get a mirrored
 * pair of two-stroke emphasis marks instead — one either side.
 */
function renderSideMarks(svg, rect, style, random, hasRoom) {
  const cy = rect.y + rect.height / 2;

  for (const side of [-1, 1]) {
    const size = 10 + random() * 4;
    const dir = { x: side, y: 0 };
    const point = {
      x:
        side < 0
          ? rect.x - (13 + size * 0.35)
          : rect.x + rect.width + (13 + size * 0.35),
      y: cy + (random() - 0.5) * rect.height * 0.45,
    };

    if (!hasRoom(point, size * 0.35 + 4)) continue;

    drawEmphasis(
      createGroup(
        svg,
        point.x,
        point.y,
        outwardTilt(dir) + (random() - 0.5) * 12
      ),
      size,
      { ...style, opacity: style.opacity * (0.82 + random() * 0.15) },
      random,
      { count: 2, spread: 0.3 + random() * 0.14 }
    );
  }
}

/**
 * Hearts and sparkles accent handwriting: one sits at the far end of the note,
 * on the side away from the element.
 * @returns {import('./geometry.js').Rect | null} the space it occupies
 */
function renderTextMark(svg, rect, note, types, style, random) {
  if (!note) return null;

  const type = pickFrom(types, TEXT_TYPES, random);
  if (!type) return null;

  const traits = TYPE_TRAITS[type];
  const size = sizeFrom(traits.size, random);
  const trailing =
    note.x + note.width / 2 >= rect.x + rect.width / 2 ? 1 : -1;

  const x =
    trailing > 0
      ? note.x + note.width + size + 2
      : note.x - size - 2;
  const y = note.y + note.height * 0.44;

  DECORATION_DRAWERS[type](
    createGroup(svg, x, y, (random() - 0.5) * traits.tilt),
    size,
    { ...style, opacity: markOpacity(style, traits, 0.85 + random() * 0.15) },
    random
  );

  return {
    x: x - size - 2,
    y: y - size - 2,
    width: size * 2 + 4,
    height: size * 2 + 4,
  };
}

/**
 * A component too small to carry corner marks — chips, icon buttons.
 * @param {import('./geometry.js').Rect} rect
 */
function isSmall(rect) {
  return Math.min(rect.width, rect.height) < 48 || rect.width < 130;
}

/**
 * Compose sparse decorations around the frame — intentional, not chaotic.
 * @param {SVGElement} svg
 * @param {import('./geometry.js').Rect} rect
 * @param {{ count?: number | null, types?: string[] | null, style?: "corners" | "sides" }} decorationOptions
 * @param {{ color: string, strokeWidth: number, opacity: number, roughness: number }} style
 * @param {number} seed
 * @param {{ avoid?: import('./geometry.js').Rect[], note?: import('./geometry.js').Rect | null }} [context]
 */
export function renderDecorations(
  svg,
  rect,
  decorationOptions,
  style,
  seed,
  context = {}
) {
  const random = createRandom(seed + 101);
  const types = decorationOptions.types?.length
    ? decorationOptions.types
    : DEFAULT_TYPES;

  const avoid = [...(context.avoid ?? [])];

  // Handwriting accents first — the mark it leaves becomes a no-go zone
  const textMark = renderTextMark(
    svg,
    rect,
    context.note ?? null,
    types,
    style,
    random
  );
  if (textMark) avoid.push(textMark);

  const budget = Math.min(
    decorationOptions.count ?? MAX_BORDER_MARKS,
    MAX_BORDER_MARKS
  );
  if (budget < 1) return;

  /**
   * Room for a mark: clear of the element's outline and of every annotation.
   * @param {{ x: number, y: number }} point
   * @param {number} radius
   */
  const hasRoom = (point, radius) =>
    distanceToRoundedRect(point, rect, rect.radius) >= radius &&
    isClear(point, radius, avoid);

  // The side layout is built from `emphasis`; auto-picking it when the caller
  // never asked for that mark would silently ignore the types they did request
  const layout =
    decorationOptions.style ??
    (isSmall(rect) && types.includes("emphasis") ? "sides" : "corners");

  if (layout === "sides") {
    renderSideMarks(svg, rect, style, random, hasRoom);
  } else {
    renderCornerMarks(svg, rect, types, budget, style, random, hasRoom);
  }
}
