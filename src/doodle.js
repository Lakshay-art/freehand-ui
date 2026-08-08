import {
  mergeOptions,
  resolveElement,
  scheduleFrame,
  cancelFrame,
  getScrollableAncestors,
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

/** @typedef {import('./utils.js').DoodleOptions} DoodleOptions */

const instances = new WeakMap();

/**
 * Viewport expressed in the overlay's local coordinate space, so annotations
 * can be kept on screen.
 * @param {import('./geometry.js').Rect} overlayRect
 * @param {number} [inset]
 * @returns {import('./geometry.js').Rect}
 */
function localViewport(overlayRect, inset = 8) {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;

  return {
    x: -overlayRect.x + inset,
    y: -overlayRect.y + inset,
    width: Math.max(0, width - inset * 2),
    height: Math.max(0, height - inset * 2),
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
    this.svg = null;
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.pendingFrame = null;
    this.scrollTargets = [];
    this.onScroll = this.scheduleUpdate.bind(this);
    this.onResize = this.scheduleUpdate.bind(this);
    this.childElements = [];

    this.mount();
  }

  mount() {
    this.svg = createOverlaySvg(0, 0, 0, 0);
    document.body.appendChild(this.svg);

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
      this.scrollTargets.push({ target, type: "scroll" });
    }

    window.addEventListener("resize", this.onResize, { passive: true });
    this.scrollTargets.push({ target: window, type: "resize" });

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
    const margin = this.overlayMargin();

    const absoluteRects = targets.map((target) =>
      getElementBounds(target, padding, radius)
    );

    const overlayRect = unionRects(absoluteRects, margin);

    clearSvg(this.svg);

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
      viewport: localViewport(overlayRect),
      gap: this.options.arrow ? 32 : 14,
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
            note ? note.box : null
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

    const text = typeof note?.text === "string" ? note.text : "";
    return Math.max(96, Math.min(240, 80 + text.length * 8));
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

    for (const { target, type } of this.scrollTargets) {
      target.removeEventListener(type, type === "scroll" ? this.onScroll : this.onResize);
    }
    this.scrollTargets = [];

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
