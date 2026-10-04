import { mergeOptions, clamp } from "../utils.js";
import { inflateRect, unionRects } from "../geometry.js";
import { drawBorder, drawArrow } from "../renderer.js";
import { renderAnnotation } from "../annotations.js";
import { renderDecorations } from "../decorations.js";
import { createSvgElement } from "../svg-dom.js";

// Room left around everything that was placed, for the decorations dotted
// round the corners and for stroke width - neither reports a box of its own.
const INK_MARGIN = 48;

/**
 * Draw a doodle for an element of the given size, without touching a DOM.
 *
 * The same drawers as the web overlay run in the same order - note first so
 * the arrow can start from it and decorations can steer clear of both - and
 * produce a tree of virtual SVG nodes in the element's own coordinates: (0, 0)
 * is its top-left corner.
 *
 * @param {{
 *   width: number,
 *   height: number,
 *   options?: Record<string, unknown>,
 *   seed?: number,
 *   band?: { x: number, width: number } | null,
 *   elapsed?: number,
 * }} input
 * @returns {{ root: import('./svg-dom.js').VirtualElement, bounds: { x: number, y: number, width: number, height: number } }}
 */
export function buildDoodle({
  width,
  height,
  options = {},
  seed = 1,
  band = null,
  elapsed = 0,
}) {
  const merged = mergeOptions(options);
  const { padding, color, strokeWidth, roughness, opacity } = merged;

  const root = createSvgElement("svg");

  const outerWidth = Math.max(0, width) + padding * 2;
  const outerHeight = Math.max(0, height) + padding * 2;
  const rect = {
    x: -padding,
    y: -padding,
    width: outerWidth,
    height: outerHeight,
    // Grown with the padding so the frame stays concentric with the element,
    // as `getElementBounds` does on the web
    radius: clamp(
      (Number(merged.radius) || 0) + padding * 0.6,
      0,
      Math.max(0, Math.min(outerWidth, outerHeight) / 2),
    ),
  };

  const strokeStyle = { color, strokeWidth, roughness, opacity };
  const noteStyle = {
    color,
    opacity,
    strokeWidth,
    roughness,
    fontFamily: merged.fontFamily,
  };

  const note = merged.note
    ? renderAnnotation(root, rect, merged.note, noteStyle, seed, {
        band,
        gap: merged.arrow ? 40 : 14,
      })
    : null;

  if (merged.border) {
    drawBorder(root, rect, { ...strokeStyle, breaks: merged.addBreaks }, seed);
  }

  const arrow = merged.arrow
    ? drawArrow(root, rect, merged.arrow, strokeStyle, seed, note?.box ?? null, {
        elapsed,
      })
    : null;

  if (merged.decorations) {
    renderDecorations(root, rect, merged.decorations, strokeStyle, seed, {
      avoid: [note?.box, arrow?.bounds].filter(Boolean),
      note: note?.box ?? null,
    });
  }

  // Keep handwriting above every stroke
  if (note) root.appendChild(note.group);

  const bounds = inflateRect(
    unionRects([rect, note?.box, arrow?.bounds].filter(Boolean)),
    INK_MARGIN,
  );

  return { root, bounds };
}
