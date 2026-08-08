import {
  inflateRect,
  intersectionArea,
  outsideArea,
  directionFromPosition,
} from "./geometry.js";
import { createNoteText, placeNoteText } from "./renderer.js";
import { isValidPosition, createRandom, clamp } from "./utils.js";

// Clear space kept between the frame and the note's glyph box
const NOTE_GAP = 14;

/**
 * Mirror a position across an axis, used to build fallback placements.
 * @param {string} position
 * @param {"x" | "y"} axis
 */
function mirror(position, axis) {
  if (axis === "x") {
    if (position.includes("right")) return position.replace("right", "left");
    if (position.includes("left")) return position.replace("left", "right");
    return position;
  }
  if (position.includes("top")) return position.replace("top", "bottom");
  if (position.includes("bottom")) return position.replace("bottom", "top");
  return position;
}

/**
 * Preferred placement first, then progressively different sides.
 * @param {string} position
 * @returns {string[]}
 */
function candidatePositions(position) {
  const candidates = [
    position,
    mirror(position, "x"),
    mirror(position, "y"),
    mirror(mirror(position, "x"), "y"),
  ];
  return candidates.filter((value, index) => candidates.indexOf(value) === index);
}

/**
 * Box for the note on one side of the frame. Corner placements clear the frame
 * vertically and then slide back toward the corner, which is what makes them
 * read as attached to the element instead of floating off in the diagonal.
 * @param {import('./geometry.js').Rect} rect
 * @param {string} position
 * @param {{ width: number, height: number }} size
 * @param {number} gap
 * @returns {import('./geometry.js').Rect}
 */
function boxForPosition(rect, position, size, gap) {
  const direction = directionFromPosition(position);
  const guard = inflateRect(rect, gap);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  let x;
  let y;

  if (direction.y !== 0) {
    y = direction.y > 0 ? guard.y + guard.height : guard.y - size.height;

    if (direction.x > 0) x = guard.x + guard.width - size.width * 0.35;
    else if (direction.x < 0) x = guard.x - size.width * 0.65;
    else x = cx - size.width / 2;
  } else {
    x = direction.x > 0 ? guard.x + guard.width : guard.x - size.width;
    y = cy - size.height / 2;
  }

  return { x, y, width: size.width, height: size.height };
}

/**
 * Pick the placement that keeps the note off the content and on screen.
 * @param {import('./geometry.js').Rect} rect
 * @param {string} position
 * @param {{ width: number, height: number }} size
 * @param {number} gap
 * @param {import('./geometry.js').Rect | null} viewport
 */
function placeNote(rect, position, size, gap, viewport) {
  const guard = inflateRect(rect, gap * 0.7);
  let best = null;

  candidatePositions(position).forEach((candidate, index) => {
    const box = boxForPosition(rect, candidate, size, gap);
    const penalty =
      intersectionArea(box, guard) * 6 +
      outsideArea(box, viewport) +
      index * 0.5;

    if (!best || penalty < best.penalty) {
      best = { box, penalty, position: candidate };
    }
  });

  return best;
}

/**
 * Nudge a box back on screen, but never at the cost of covering the element.
 * @param {import('./geometry.js').Rect} box
 * @param {import('./geometry.js').Rect} guard
 * @param {import('./geometry.js').Rect | null} viewport
 */
function clampToViewport(box, guard, viewport) {
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) return box;

  const shifted = {
    ...box,
    x: clamp(
      box.x,
      viewport.x,
      Math.max(viewport.x, viewport.x + viewport.width - box.width)
    ),
    y: clamp(
      box.y,
      viewport.y,
      Math.max(viewport.y, viewport.y + viewport.height - box.height)
    ),
  };

  // Only accept the correction if it does not push the note onto the content
  if (intersectionArea(shifted, guard) > intersectionArea(box, guard)) {
    return box;
  }
  return shifted;
}

/**
 * @param {SVGElement} svg
 * @param {import('./geometry.js').Rect} rect
 * @param {{ text: string, position?: string, underline?: boolean }} noteOptions
 * @param {{ color: string, opacity: number, strokeWidth?: number, roughness?: number }} style
 * @param {number} [seed]
 * @param {{ viewport?: import('./geometry.js').Rect | null, gap?: number }} [layout]
 * @returns {{ group: SVGGElement, box: import('./geometry.js').Rect, position: string } | null}
 */
export function renderAnnotation(
  svg,
  rect,
  noteOptions,
  style,
  seed = 1,
  layout = {}
) {
  if (!noteOptions?.text) return null;

  const viewport = layout.viewport ?? null;

  const position = isValidPosition(noteOptions.position)
    ? noteOptions.position
    : "top-right";

  const random = createRandom(seed + 9);
  const note = createNoteText(svg, noteOptions.text, style);

  const tilt = (random() - 0.45) * 7;
  // A tilted box needs a little more vertical room than its upright glyph box
  const tiltPad = Math.abs(Math.sin((tilt * Math.PI) / 180)) * note.width * 0.5;
  const size = {
    width: note.width,
    height: note.ascent + note.descent + (noteOptions.underline === false ? 0 : 5),
  };

  const gap = (layout.gap ?? NOTE_GAP) + random() * 6;
  const placed = placeNote(
    rect,
    position,
    { width: size.width, height: size.height + tiltPad },
    gap,
    viewport
  );

  const guard = inflateRect(rect, gap * 0.7);
  const outer = clampToViewport(
    { ...placed.box, height: size.height + tiltPad },
    guard,
    viewport
  );

  // Text box sits centred inside the tilt-padded outer box
  const box = {
    x: outer.x,
    y: outer.y + tiltPad / 2,
    width: size.width,
    height: note.ascent + note.descent,
  };

  placeNoteText(note, box, style, seed, {
    tilt,
    underline: noteOptions.underline !== false,
  });

  return { group: note.group, box: inflateRect(outer, 4), position: placed.position };
}
