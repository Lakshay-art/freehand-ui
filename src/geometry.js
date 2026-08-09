import { clamp } from "./utils.js";

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} [radius]
 */

/**
 * @param {DOMRectReadOnly} rect
 * @returns {Rect}
 */
export function rectFromDOMRect(rect) {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * @param {Element} element
 * @returns {number}
 */
function averageCornerRadius(element) {
  const style = getComputedStyle(element);
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ];

  const values = corners
    .map((value) => parseFloat(value) || 0)
    .filter((value) => value > 0);

  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * @param {Element} element
 * @returns {number}
 */
export function detectBorderRadius(element) {
  const own = averageCornerRadius(element);
  if (own > 0) return own;

  // A layout-only wrapper - the React <Doodle> span, an <a> around a button -
  // has no radius of its own. Borrow it from a sole child it fits tightly
  // around, so the doodle still follows the shape people actually see. Without
  // this a wrapped pill button gets drawn as a rectangle.
  const child =
    element.children.length === 1 ? element.firstElementChild : null;
  if (!child) return 0;

  const outer = element.getBoundingClientRect();
  const inner = child.getBoundingClientRect();
  const fitsTightly =
    Math.abs(outer.width - inner.width) <= 2 &&
    Math.abs(outer.height - inner.height) <= 2;

  return fitsTightly ? averageCornerRadius(child) : 0;
}

/**
 * @param {Element} element
 * @param {number} padding
 * @param {number | null} radiusOverride
 * @returns {Rect}
 */
export function getElementBounds(element, padding = 0, radiusOverride = null) {
  const rect = element.getBoundingClientRect();
  const radius =
    radiusOverride != null ? radiusOverride : detectBorderRadius(element);

  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;

  return {
    x: rect.left - padding,
    y: rect.top - padding,
    width,
    height,
    // Grow the radius with the padding so the doodle stays concentric with the
    // element instead of cutting its corners.
    radius: clamp(radius + padding * 0.6, 0, Math.min(width, height) / 2),
  };
}

/**
 * @param {Rect} outer
 * @param {Rect} inner
 * @returns {Rect}
 */
export function relativeRect(outer, inner) {
  return {
    x: inner.x - outer.x,
    y: inner.y - outer.y,
    width: inner.width,
    height: inner.height,
    radius: inner.radius,
  };
}

/**
 * @param {Rect[]} rects
 * @param {number} margin
 * @returns {Rect}
 */
export function unionRects(rects, margin = 0) {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0, radius: 0 };
  }

  const minX = Math.min(...rects.map((r) => r.x)) - margin;
  const minY = Math.min(...rects.map((r) => r.y)) - margin;
  const maxX = Math.max(...rects.map((r) => r.x + r.width)) + margin;
  const maxY = Math.max(...rects.map((r) => r.y + r.height)) + margin;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    radius: 0,
  };
}

/**
 * @param {Rect} rect
 * @param {number} amount
 * @returns {Rect}
 */
export function inflateRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

/**
 * @param {Rect} a
 * @param {Rect} b
 * @returns {number}
 */
export function intersectionArea(a, b) {
  if (!a || !b) return 0;
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean}
 */
export function rectsOverlap(a, b) {
  return intersectionArea(a, b) > 0;
}

/**
 * Area of `box` that falls outside `bounds` - used to keep notes on screen.
 * @param {Rect} box
 * @param {Rect | null} bounds
 * @returns {number}
 */
export function outsideArea(box, bounds) {
  if (!bounds) return 0;
  return Math.max(0, box.width * box.height - intersectionArea(box, bounds));
}

/**
 * Closest point on a rect's perimeter (or interior) to an arbitrary point.
 * @param {Rect} rect
 * @param {{ x: number, y: number }} point
 * @returns {{ x: number, y: number }}
 */
export function nearestPointOnRect(rect, point) {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height),
  };
}

/**
 * Distance from a point to a rounded rectangle's outline - positive outside.
 * Testing an axis-aligned box against the bounding box instead would report the
 * empty space off a rounded corner as a collision.
 * @param {{ x: number, y: number }} point
 * @param {Rect} rect
 * @param {number} [radius]
 * @returns {number}
 */
export function distanceToRoundedRect(point, rect, radius = 0) {
  const r = clamp(radius, 0, Math.min(rect.width, rect.height) / 2);
  const cx = clamp(point.x, rect.x + r, rect.x + rect.width - r);
  const cy = clamp(point.y, rect.y + r, rect.y + rect.height - r);
  return Math.hypot(point.x - cx, point.y - cy) - r;
}

/**
 * Point on a box's edge along the ray from its center toward `target`.
 * @param {Rect} box
 * @param {{ x: number, y: number }} target
 * @returns {{ x: number, y: number }}
 */
export function pointOnBoxToward(box, target) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = box.width / 2 || 0.001;
  const hh = box.height / 2 || 0.001;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Outward unit-ish direction implied by a position name.
 * @param {string} position
 * @returns {{ x: number, y: number }}
 */
export function directionFromPosition(position) {
  return {
    x: position.includes("right") ? 1 : position.includes("left") ? -1 : 0,
    y: position.includes("top") ? -1 : position.includes("bottom") ? 1 : 0,
  };
}

/**
 * @param {string} position
 * @param {Rect} rect
 * @returns {{ x: number, y: number }}
 */
export function pointFromPosition(position, rect) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  switch (position) {
    case "top":
      return { x: cx, y: rect.y };
    case "top-right":
      return { x: rect.x + rect.width, y: rect.y };
    case "right":
      return { x: rect.x + rect.width, y: cy };
    case "bottom-right":
      return { x: rect.x + rect.width, y: rect.y + rect.height };
    case "bottom":
      return { x: cx, y: rect.y + rect.height };
    case "bottom-left":
      return { x: rect.x, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: cy };
    case "top-left":
      return { x: rect.x, y: rect.y };
    case "center":
    default:
      return { x: cx, y: cy };
  }
}

/**
 * @param {string} position
 * @param {Rect} rect
 * @param {number} offset
 * @returns {{ x: number, y: number }}
 */
export function annotationAnchor(position, rect, offset = 12) {
  const point = pointFromPosition(position, rect);

  if (position.includes("top")) point.y -= offset;
  if (position.includes("bottom")) point.y += offset;
  if (position.includes("left")) point.x -= offset;
  if (position.includes("right")) point.x += offset;
  if (position === "top") point.y -= offset * 0.5;
  if (position === "bottom") point.y += offset * 0.5;
  if (position === "left") point.x -= offset * 0.5;
  if (position === "right") point.x += offset * 0.5;

  return point;
}
