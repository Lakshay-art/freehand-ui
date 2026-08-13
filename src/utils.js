import { normalizeArrowAnimation } from "./animation.js";
import { isLocaleMap } from "./locale.js";

const DEFAULT_OPTIONS = {
  border: true,
  color: "#ffffff",
  strokeWidth: 1.5,
  roughness: 1.5,
  // The frame traces the element's own edge. Raise this to stand it off.
  padding: 0,
  radius: null,
  opacity: 0.9,
  children: null,
  note: null,
  arrow: false,
  decorations: false,
  addBreaks: false,
  /** Override the handwriting stack, e.g. a next/font CSS variable. */
  fontFamily: null,
  /** Fetch Caveat when the page has not provided it. */
  autoLoadFont: true,
  /**
   * Language for a note written in more than one. Omit to follow the visitor's
   * own languages, which is what their operating system is set to.
   */
  locale: null,
  /**
   * Overlay stacking order. Omit to mirror the target element's z-index so
   * doodles stay above the annotated element but below modals and other UI.
   */
  zIndex: null,
};

/**
 * @param {string | Element | null | undefined} target
 * @returns {Element | null}
 */
export function resolveElement(target) {
  if (!target) return null;
  if (typeof target === "string") {
    return document.querySelector(target);
  }
  if (target instanceof Element) {
    return target;
  }
  return null;
}

/**
 * @param {Partial<Record<string, unknown>>} options
 * @returns {Record<string, unknown>}
 */
export function mergeOptions(options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options };

  if (merged.note) {
    // A bare string is the note. So is a bare `{ en: "hi", fr: "salut" }` - a
    // map of languages is a way of writing the text, not a note config.
    const config =
      typeof merged.note === "string" || isLocaleMap(merged.note)
        ? { text: merged.note }
        : merged.note;

    merged.note = {
      ...config,
      position: config.position ?? "top-right",
      // The note carries the chosen language, so `renderAnnotation` can resolve
      // a multilingual note on its own.
      locale: config.locale ?? merged.locale ?? null,
    };
  }

  if (merged.arrow) {
    const config = merged.arrow === true ? {} : merged.arrow;

    merged.arrow = {
      // "note" launches from the annotation, a position name from that side of
      // the element. Normalised for every arrow, not just `arrow: true`, so an
      // explicit `from` is honoured whether or not there is a note.
      from: config.from ?? (merged.note ? "note" : "top-right"),
      to: config.to ?? "edge",
      style: config.style ?? "curved",
      // Arrows draw themselves on and lean toward their target by default;
      // `animate: false` opts out, an object tunes speed and gestures
      animate: normalizeArrowAnimation(config.animate),
    };
  }

  if (merged.decorations === true) {
    // `null` types defer to the curated default set in decorations.js
    merged.decorations = { count: null, types: null };
  }

  if (merged.addBreaks) {
    // `true` → a few gaps of mixed size; a number → that many gaps
    const config =
      typeof merged.addBreaks === "number"
        ? { count: merged.addBreaks }
        : merged.addBreaks === true
          ? {}
          : merged.addBreaks;

    merged.addBreaks = {
      count: config.count ?? null,
      min: config.min ?? 6,
      max: config.max ?? 30,
    };
  }

  return merged;
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * @param {number} seed
 */
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => void} fn
 */
export function scheduleFrame(fn) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(fn);
  }
  return setTimeout(fn, 16);
}

/**
 * @param {number} id
 */
export function cancelFrame(id) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {string} position
 * @returns {boolean}
 */
export function isValidPosition(position) {
  return [
    "top",
    "top-right",
    "right",
    "bottom-right",
    "bottom",
    "bottom-left",
    "left",
    "top-left",
    "center",
  ].includes(position);
}

/**
 * @param {Element} element
 * @returns {Element[]}
 */
export function getScrollableAncestors(element) {
  const ancestors = [];
  let node = element.parentElement;

  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const overflow = style.overflow + style.overflowY + style.overflowX;
    if (/(auto|scroll|overlay)/.test(overflow)) {
      ancestors.push(node);
    }
    node = node.parentElement;
  }

  ancestors.push(window);
  return ancestors;
}

/**
 * z-index for the overlay: one step above the target when it participates in
 * stacking, otherwise `auto` and DOM order (inserted as next sibling) wins.
 *
 * @param {Element} element
 * @param {number | null | undefined} override
 * @returns {number | null}
 */
export function resolveOverlayZIndex(element, override) {
  if (override != null) return override;

  const { zIndex, position } = getComputedStyle(element);
  if (zIndex !== "auto") {
    const parsed = Number.parseInt(zIndex, 10);
    if (Number.isFinite(parsed)) return parsed + 1;
  }

  // A positioned ancestor may carry the stacking order instead.
  let node = element.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (style.zIndex !== "auto" && style.position !== "static") {
      const parsed = Number.parseInt(style.zIndex, 10);
      if (Number.isFinite(parsed)) return parsed + 1;
    }
    node = node.parentElement;
  }

  return null;
}

/**
 * Mount the overlay beside the target so it shares the same stacking context
 * instead of painting above every body-level modal.
 *
 * @param {SVGElement} svg
 * @param {Element} element
 */
export function insertOverlaySvg(svg, element) {
  const parent = element.parentNode;
  if (!parent) {
    document.body.appendChild(svg);
    return;
  }

  parent.insertBefore(svg, element.nextSibling);
}

/**
 * @param {SVGElement} svg
 * @param {Element} element
 * @param {number | null | undefined} zIndexOverride
 */
export function syncOverlayStacking(svg, element, zIndexOverride) {
  const zIndex = resolveOverlayZIndex(element, zIndexOverride);
  if (zIndex == null) {
    svg.style.zIndex = "";
  } else {
    svg.style.zIndex = String(zIndex);
  }
}
