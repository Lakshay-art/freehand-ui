import {
  mergeOptions,
  resolveElement,
  scheduleFrame,
  cancelFrame,
  insertOverlaySvg,
  removeOverlaySvg,
  syncOverlayStacking,
} from "./utils.js";
import { getElementBounds, relativeRect } from "./geometry.js";
import {
  clearSvg,
  createOverlaySvg,
  drawBorder,
  drawArrow,
} from "./renderer.js";
import { renderAnnotation } from "./annotations.js";
import { renderDecorations } from "./decorations.js";
import { ensureHandwrittenFont } from "./fonts.js";

/** @typedef {import('./utils.js').DoodleOptions} DoodleOptions */

const instances = new WeakMap();

/**
 * Monotonic clock for animation phase. The overlay is rebuilt whenever the
 * element resizes or its content mutates, so animations are placed by age
 * rather than restarted.
 */
function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

/**
 * The readable horizontal band, in the overlay's local coordinates.
 *
 * Horizontal only, on purpose: the note's vertical position is set by
 * `position` relative to the element it annotates, not by how much of the
 * page is scrolled into view - clamping it to a vertical band would fight
 * that and crawl the note away from the element. Viewport width is a real,
 * screen-relative constraint worth clamping to; viewport height is not.
 *
 * @param {number} originLeft viewport x the overlay's local x=0 sits at
 * @param {number} [inset]
 * @returns {{ x: number, width: number }}
 */
function localBand(originLeft, inset = 8) {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;

  return {
    x: -originLeft + inset,
    width: Math.max(0, width - inset * 2),
  };
}

/**
 * The element's padding box, in viewport coordinates - exactly the area an
 * absolutely positioned child with `left: 0; top: 0; width/height: 100%`
 * covers, so it is both where the overlay's own box goes and the origin its
 * drawing coordinates are measured from.
 *
 * @param {Element} element
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
function paddingBox(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const left = parseFloat(style.borderLeftWidth) || 0;
  const top = parseFloat(style.borderTopWidth) || 0;
  const right = parseFloat(style.borderRightWidth) || 0;
  const bottom = parseFloat(style.borderBottomWidth) || 0;

  return {
    left: rect.left + left,
    top: rect.top + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
}

/**
 * @typedef {Object} DoodleInstance
 * @property {() => void} update
 * @property {() => void} destroy
 */

class DoodleOverlay {
  /**
   * @param {Element} element
   * @param {ReturnType<typeof mergeOptions>} options
   */
  constructor(element, options) {
    this.element = element;
    this.options = options;
    this.seed = Math.floor(Math.random() * 1e9);
    // Animations are anchored to this, not to the redraw that happens to be
    // painting them - see `now()`
    this.startedAt = now();
    this.svg = null;
    // Whether `insertOverlaySvg` had to force `position: relative` on the
    // element, and so must clear it again on teardown.
    this.setPosition = false;
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.pendingFrame = null;
    this.listeners = [];
    this.onResize = this.scheduleUpdate.bind(this);
    this.onLanguageChange = this.scheduleUpdate.bind(this);
    this.childElements = [];

    this.mount();
  }

  mount() {
    this.svg = createOverlaySvg(0, 0, 0, 0);
    this.setPosition = insertOverlaySvg(this.svg, this.element);
    syncOverlayStacking(this.svg, this.element, this.options.zIndex);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.element);

    if (this.options.children) {
      this.observeChildren();
    }

    // The svg lives inside `this.element` now, so every stroke `update()`
    // draws is itself a childList/attribute mutation within the observed
    // subtree - without filtering those out, redrawing would trigger the
    // observer, which would schedule another redraw, forever.
    this.mutationObserver = new MutationObserver((records) => {
      // `contains` is true for the svg itself as well as its descendants, so
      // this alone excludes every mutation `update()` makes to its own tree.
      const relevant = records.some((record) => !this.svg.contains(record.target));
      if (relevant) this.scheduleUpdate();
    });
    this.mutationObserver.observe(this.element, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    window.addEventListener("resize", this.onResize, { passive: true });
    this.listeners.push({
      target: window,
      type: "resize",
      handler: this.onResize,
    });

    // A multilingual note follows the browser's language list, which the user
    // can change while the page is open - redraw so the note keeps up.
    window.addEventListener("languagechange", this.onLanguageChange);
    this.listeners.push({
      target: window,
      type: "languagechange",
      handler: this.onLanguageChange,
    });

    if (
      this.options.note &&
      this.options.autoLoadFont &&
      !this.options.fontFamily
    ) {
      ensureHandwrittenFont();
    }

    // Note layout depends on measured glyphs, so remeasure once webfonts land.
    // `loadingdone` matters as well as `ready`: the font request above may be
    // issued after `ready` has already settled for the page.
    this.onFontsLoaded = () => this.scheduleUpdate();
    document.fonts?.addEventListener?.("loadingdone", this.onFontsLoaded);
    document.fonts?.ready?.then(this.onFontsLoaded).catch(() => {});

    this.update();
  }

  observeChildren() {
    const children = this.element.querySelectorAll(this.options.children);
    this.childElements = Array.from(children);
    for (const child of this.childElements) {
      this.resizeObserver.observe(child);
    }
  }

  scheduleUpdate() {
    if (this.pendingFrame != null) return;
    this.pendingFrame = scheduleFrame(() => {
      this.pendingFrame = null;
      this.update();
    });
  }

  getTargets() {
    if (this.options.children) {
      const nodes = this.element.querySelectorAll(this.options.children);
      return Array.from(nodes);
    }
    return [this.element];
  }

  update() {
    if (!this.svg || !this.element.isConnected) return;

    const { padding, radius, color, strokeWidth, roughness, opacity } =
      this.options;

    const targets = this.getTargets();
    // Every stroke is rebuilt on each update, so animations are handed the
    // overlay's age and pick up where the last pass left off
    const elapsed = now() - this.startedAt;

    const absoluteRects = targets.map((target) =>
      getElementBounds(target, padding, radius)
    );

    clearSvg(this.svg);
    syncOverlayStacking(this.svg, this.element, this.options.zIndex);

    // The overlay's box is exactly the element's padding box - no margin for
    // the notes, arrows and decorations that reach outside it. That is the
    // point: an absolutely positioned box *does* extend the page's scrollable
    // area, so a box inflated to enclose a note would put a scrollbar on the
    // page. Whatever is drawn beyond the box is ink overflow instead, which
    // paints (thanks to `overflow: visible`) without affecting layout.
    const box = paddingBox(this.element);
    // A zero width or height would switch the svg off entirely.
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    // Local drawing coordinates are measured from the same origin the box
    // sits at, so `viewBox` maps 1:1 to CSS pixels and needs no offset.
    const origin = { x: box.left, y: box.top };

    this.svg.setAttribute("width", String(width));
    this.svg.setAttribute("height", String(height));
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.style.left = "0px";
    this.svg.style.top = "0px";
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${height}px`;

    const strokeStyle = { color, strokeWidth, roughness, opacity };
    const noteStyle = {
      color,
      opacity,
      strokeWidth,
      roughness,
      fontFamily: this.options.fontFamily,
    };
    const noteGroups = [];
    // A connected note is pushed further out so its arrow has room to sweep
    const noteLayout = {
      band: localBand(origin.x),
      gap: this.options.arrow ? 40 : 14,
    };

    targets.forEach((target, index) => {
      const absolute = absoluteRects[index];
      const local = relativeRect(origin, absolute);
      const seed = this.seed + index * 31;

      // The note is measured and placed first: the arrow starts from its box
      // and decorations steer clear of it.
      const note =
        this.options.note && index === 0
          ? renderAnnotation(
              this.svg,
              local,
              this.options.note,
              noteStyle,
              seed,
              noteLayout
            )
          : null;

      if (this.options.border) {
        drawBorder(
          this.svg,
          local,
          { ...strokeStyle, breaks: this.options.addBreaks },
          seed
        );
      }

      // Arrow before decorations so the marks can steer around its sweep
      const arrow = this.options.arrow
        ? drawArrow(
            this.svg,
            local,
            this.options.arrow,
            strokeStyle,
            seed,
            note ? note.box : null,
            { elapsed }
          )
        : null;

      if (this.options.decorations) {
        renderDecorations(
          this.svg,
          local,
          this.options.decorations,
          strokeStyle,
          seed,
          {
            avoid: [note?.box, arrow?.bounds].filter(Boolean),
            note: note?.box ?? null,
          }
        );
      }

      if (note) noteGroups.push(note.group);
    });

    // Keep handwriting above every stroke
    for (const group of noteGroups) {
      this.svg.appendChild(group);
    }
  }

  destroy() {
    if (this.pendingFrame != null) {
      cancelFrame(this.pendingFrame);
      this.pendingFrame = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.onFontsLoaded) {
      document.fonts?.removeEventListener?.("loadingdone", this.onFontsLoaded);
      this.onFontsLoaded = null;
    }

    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners = [];

    if (this.svg) {
      removeOverlaySvg(this.svg, this.element, this.setPosition);
    }
    this.svg = null;

    instances.delete(this.element);
  }
}

/**
 * Wrap a DOM element with a hand-drawn SVG doodle overlay.
 * @param {string | Element} target
 * @param {Partial<DoodleOptions>} [options]
 * @returns {DoodleInstance}
 */
export function doodle(target, options = {}) {
  const element = resolveElement(target);
  if (!element) {
    throw new Error("doodle-ui: target element not found");
  }

  const existing = instances.get(element);
  if (existing) {
    existing.destroy();
  }

  const merged = mergeOptions(options);
  const instance = new DoodleOverlay(element, merged);
  instances.set(element, instance);

  return {
    update: () => instance.update(),
    destroy: () => instance.destroy(),
  };
}

export { DoodleOverlay };
