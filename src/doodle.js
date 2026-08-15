import {
  mergeOptions,
  resolveElement,
  scheduleFrame,
  cancelFrame,
  getScrollableAncestors,
  insertOverlaySvg,
  syncOverlayStacking,
} from "./utils.js";
import {
  getElementBounds,
  relativeRect,
  unionRects,
} from "./geometry.js";
import {
  clearSvg,
  createOverlaySvg,
  drawBorder,
  drawArrow,
} from "./renderer.js";
import { renderAnnotation } from "./annotations.js";
import { renderDecorations } from "./decorations.js";
import { ensureHandwrittenFont } from "./fonts.js";
import { resolveLocalizedText } from "./locale.js";

/** @typedef {import('./utils.js').DoodleOptions} DoodleOptions */

const instances = new WeakMap();

/**
 * Monotonic clock for animation phase. The overlay is rebuilt on every scroll
 * and resize, so animations are placed by age rather than restarted.
 */
function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

/**
 * The readable horizontal band, in the overlay's local coordinates.
 *
 * Horizontal only, on purpose: the overlay is fixed-position, so a band with
 * top and bottom edges would move relative to the page as it scrolls, and
 * notes clamped to it would crawl away from the element they annotate.
 * Horizontal extent does not change with vertical scroll.
 *
 * @param {import('./geometry.js').Rect} overlayRect
 * @param {number} [inset]
 * @returns {{ x: number, width: number }}
 */
function localBand(overlayRect, inset = 8) {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;

  return {
    x: -overlayRect.x + inset,
    width: Math.max(0, width - inset * 2),
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
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.pendingFrame = null;
    this.pendingRepositionFrame = null;
    this.listeners = [];
    // Scroll only ever moves the element, never reshapes it - a scroll tick
    // just slides the overlay to match, it doesn't re-run the rough-stroke
    // generator. Anything that can actually change size or content (resize,
    // DOM mutation, fonts, language) still goes through the full `update()`.
    this.onScroll = this.scheduleReposition.bind(this);
    this.onResize = this.scheduleUpdate.bind(this);
    this.onLanguageChange = this.scheduleUpdate.bind(this);
    this.childElements = [];

    this.mount();
  }

  mount() {
    this.svg = createOverlaySvg(0, 0, 0, 0);
    insertOverlaySvg(this.svg, this.element);
    syncOverlayStacking(this.svg, this.element, this.options.zIndex);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.element);

    if (this.options.children) {
      this.observeChildren();
    }

    this.mutationObserver = new MutationObserver(this.scheduleUpdate.bind(this));
    this.mutationObserver.observe(this.element, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    for (const target of getScrollableAncestors(this.element)) {
      target.addEventListener("scroll", this.onScroll, { passive: true });
      this.listeners.push({ target, type: "scroll", handler: this.onScroll });
    }

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

  scheduleReposition() {
    // A full update is already queued (or about to redraw); it will paint the
    // overlay in the right place, so a plain reposition would just be
    // redundant work on top of it.
    if (this.pendingFrame != null || this.pendingRepositionFrame != null) {
      return;
    }
    this.pendingRepositionFrame = scheduleFrame(() => {
      this.pendingRepositionFrame = null;
      this.reposition();
    });
  }

  /**
   * Cheap scroll-driven path: slide the overlay to the element's new
   * viewport position without touching its contents. Scrolling can't change
   * an element's size, so the rects, viewBox and every hand-drawn stroke
   * inside them are still valid - only `left`/`top` need to move.
   */
  reposition() {
    if (!this.svg || !this.element.isConnected) return;

    const { padding, radius } = this.options;
    const targets = this.getTargets();
    const margin = this.overlayMargin();
    const absoluteRects = targets.map((target) =>
      getElementBounds(target, padding, radius)
    );
    const overlayRect = unionRects(absoluteRects, margin);

    const currentWidth = parseFloat(this.svg.style.width) || 0;
    const currentHeight = parseFloat(this.svg.style.height) || 0;
    const resized =
      Math.abs(overlayRect.width - currentWidth) > 0.5 ||
      Math.abs(overlayRect.height - currentHeight) > 0.5;

    // Something other than scroll changed the layout (e.g. a sticky header
    // toggling in) - fall back to a full rebuild rather than show a
    // mis-sized overlay.
    if (resized) {
      this.update();
      return;
    }

    this.svg.style.left = `${overlayRect.x}px`;
    this.svg.style.top = `${overlayRect.y}px`;
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
    const margin = this.overlayMargin();
    // Every stroke is rebuilt on each update, so animations are handed the
    // overlay's age and pick up where the last pass left off
    const elapsed = now() - this.startedAt;

    const absoluteRects = targets.map((target) =>
      getElementBounds(target, padding, radius)
    );

    const overlayRect = unionRects(absoluteRects, margin);

    clearSvg(this.svg);
    syncOverlayStacking(this.svg, this.element, this.options.zIndex);

    this.svg.setAttribute("width", String(overlayRect.width));
    this.svg.setAttribute("height", String(overlayRect.height));
    this.svg.setAttribute("viewBox", `0 0 ${overlayRect.width} ${overlayRect.height}`);
    this.svg.style.left = `${overlayRect.x}px`;
    this.svg.style.top = `${overlayRect.y}px`;
    this.svg.style.width = `${overlayRect.width}px`;
    this.svg.style.height = `${overlayRect.height}px`;

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
      band: localBand(overlayRect),
      gap: this.options.arrow ? 40 : 14,
    };

    targets.forEach((target, index) => {
      const absolute = absoluteRects[index];
      const local = relativeRect(overlayRect, absolute);
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

  /**
   * Room the overlay needs beyond the element for notes, arrows and decorations.
   */
  overlayMargin() {
    const { note, arrow, decorations } = this.options;
    if (!note && !arrow && !decorations) return 48;

    // Sized from the string that will actually be drawn: translations of the
    // same note differ in length, sometimes by half again.
    const { text } = resolveLocalizedText(note?.text, note?.locale);
    return Math.max(96, Math.min(240, 80 + text.length * 8));
  }

  destroy() {
    if (this.pendingFrame != null) {
      cancelFrame(this.pendingFrame);
      this.pendingFrame = null;
    }

    if (this.pendingRepositionFrame != null) {
      cancelFrame(this.pendingRepositionFrame);
      this.pendingRepositionFrame = null;
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

    if (this.svg?.parentNode) {
      this.svg.parentNode.removeChild(this.svg);
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
