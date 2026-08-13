import { inflateRect, directionFromPosition } from "./geometry.js";
import { createNoteText, placeNoteText } from "./renderer.js";
import { isValidPosition, createRandom } from "./utils.js";
import { resolveLocalizedText } from "./locale.js";

// Clear space kept between the frame and the note's glyph box
const NOTE_GAP = 14;

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
 * Cap a horizontal shift so it can never slide the note onto the element.
 *
 * Only bites for a note sitting level with the element - one above or below it
 * is already clear vertically and may slide as far as it needs to.
 *
 * @param {import('./geometry.js').Rect} box
 * @param {import('./geometry.js').Rect} guard
 * @param {number} dx desired shift
 * @returns {number} the part of it that is safe
 */
function limitAgainstElement(box, guard, dx) {
  const level = box.y < guard.y + guard.height && box.y + box.height > guard.y;
  if (!level) return dx;

  if (dx < 0) {
    // Travelling left: stop once our left edge reaches the element's right
    const room = box.x - (guard.x + guard.width);
    return room <= 0 ? 0 : -Math.min(-dx, room);
  }

  // Travelling right: stop once our right edge reaches the element's left
  const room = guard.x - (box.x + box.width);
  return room <= 0 ? 0 : Math.min(dx, room);
}

/**
 * Slide a box back into the readable band, keeping the side it was placed on.
 *
 * The note tracks the space available rather than jumping to another side: it
 * moves by exactly the amount it overhangs, so a narrowing viewport walks it
 * gradually inward instead of snapping it somewhere else. The only ceiling is
 * the element itself.
 *
 * Horizontal only, deliberately. The overlay is fixed-position, so clamping
 * against the viewport's top and bottom made the note crawl back into view as
 * the page scrolled, sliding it off the element it belongs to. Horizontal
 * extent does not change with vertical scroll, so this stays anchored.
 *
 * @param {import('./geometry.js').Rect} box
 * @param {import('./geometry.js').Rect} guard
 * @param {{ x: number, width: number } | null} band
 */
export function nudgeIntoBand(box, guard, band) {
  if (!band || band.width <= 0) return box;

  const overhangLeft = band.x - box.x;
  const overhangRight = box.x + box.width - (band.x + band.width);

  let dx = 0;
  if (overhangLeft > 0) dx = overhangLeft;
  else if (overhangRight > 0) dx = -overhangRight;
  if (!dx) return box;

  dx = limitAgainstElement(box, guard, dx);
  if (!dx) return box;

  return { ...box, x: box.x + dx };
}

/**
 * @param {SVGElement} svg
 * @param {import('./geometry.js').Rect} rect
 * @param {{ text: string | Record<string, string>, position?: string, underline?: boolean, offset?: { x?: number, y?: number }, locale?: string | string[] | null }} noteOptions
 * @param {{ color: string, opacity: number, strokeWidth?: number, roughness?: number }} style
 * @param {number} [seed]
 * @param {{ band?: { x: number, width: number } | null, gap?: number }} [layout]
 * @returns {{ group: SVGGElement, box: import('./geometry.js').Rect, position: string } | null}
 */
export function renderAnnotation(
  svg,
  rect,
  noteOptions,
  style,
  seed = 1,
  layout = {},
) {
  // The text may be written in several languages; only one of them is drawn.
  const { text, locale } = resolveLocalizedText(
    noteOptions?.text,
    noteOptions?.locale,
  );
  if (!text) return null;

  const band = layout.band ?? null;

  const position = isValidPosition(noteOptions.position)
    ? noteOptions.position
    : "top-right";

  const random = createRandom(seed + 9);
  const note = createNoteText(svg, text, style, {
    wordsPerLine: noteOptions.wordsPerLine,
    locale,
  });

  const tilt = (random() - 0.45) * 7;
  // A tilted box needs a little more vertical room than its upright glyph box
  const tiltPad = Math.abs(Math.sin((tilt * Math.PI) / 180)) * note.width * 0.5;
  const size = {
    width: note.width,
    height: note.height + (noteOptions.underline === false ? 0 : 5),
  };

  const gap = (layout.gap ?? NOTE_GAP) + random() * 6;

  // The requested side is honoured exactly; only the horizontal position moves
  const placed = boxForPosition(
    rect,
    position,
    { width: size.width, height: size.height + tiltPad },
    gap,
  );

  // The offset moves the note off the spot `position` chose. It is applied
  // before the band check so that check sees where the note actually ends up -
  // nudging first and offsetting after meant a note only started sliding once
  // its *un-offset* position ran out of room, and the offset could then push it
  // straight back off screen.
  const shifted = {
    ...placed,
    x: placed.x + (Number(noteOptions.offset?.x) || 0),
    y: placed.y + (Number(noteOptions.offset?.y) || 0),
  };

  const guard = inflateRect(rect, gap * 0.7);
  const outer = nudgeIntoBand(shifted, guard, band);

  // Text box sits centred inside the tilt-padded outer box
  const box = {
    x: outer.x,
    y: outer.y + tiltPad / 2,
    width: size.width,
    height: note.height,
  };

  placeNoteText(note, box, style, seed, {
    tilt,
    underline: noteOptions.underline !== false,
  });

  return { group: note.group, box: inflateRect(outer, 4), position };
}
