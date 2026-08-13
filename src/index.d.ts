export type DoodlePosition =
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "top-left"
  | "center";

export type DecorationType =
  | "heart"
  | "sparkle"
  | "star"
  | "twinkle"
  | "smiley"
  | "emphasis"
  | "arcs"
  | "dots"
  | "stroke"
  | "steam";

/**
 * Note text, either written once or written per language.
 *
 * A map is keyed by BCP-47 tag - `en`, `pt-BR`, `zh-Hant` - plus an optional
 * `default` for visitors whose language is not covered. Without one, the first
 * translation written is used.
 */
export type LocalizedText = string | Record<string, string>;

export interface NoteOptions {
  text: LocalizedText;
  /**
   * Which side of the element the note sits on. Always honoured - a note that
   * would run off screen slides horizontally to stay in view rather than
   * moving to another side.
   */
  position?: DoodlePosition;
  /** Underline sized to the measured text. Default `true`. */
  underline?: boolean;
  /**
   * Nudge the note from where `position` put it, in px. The note is still kept
   * in view from the offset spot, so a large `x` slides back rather than
   * running off screen.
   */
  offset?: { x?: number; y?: number };
  /**
   * Language to write this note in, overriding the top-level `locale` and the
   * visitor's own languages. Only meaningful when `text` is a map.
   */
  locale?: string | string[] | null;
}

export interface ArrowAnimationOptions {
  /**
   * Reveal the stroke with a dash sweep, so the pen appears to travel from the
   * note to the tip. Default `true`. A `dotted` arrow spends its dash pattern
   * on the dots, so those flow toward the tip instead of being drawn on.
   */
  draw?: boolean;
  /** Lean the arrow a few px toward what it points at. Default `true`. */
  drift?: boolean;
  /** Multiplier over every duration - `2` plays twice as fast. Default `1`. */
  speed?: number;
  /** How long the shaft takes to draw, ms, before `speed`. Default `900`. */
  duration?: number;
  /** Wait before the first stroke appears, ms. Default `150`. */
  delay?: number;
  /** How far the lean travels, px. Default `5`. */
  distance?: number;
  /** One full lean-and-return, ms. Default `2200`. */
  driftDuration?: number;
  /** Keep leaning. `false` settles once and stays put. Default `true`. */
  repeat?: boolean;
}

export interface ArrowOptions {
  /**
   * Where the arrow leaves. With a `note` this names a side of *the note* -
   * the arrow always departs from the handwriting and travels to the element,
   * however far an `offset` has moved it. `"note"` (the default) picks the side
   * facing the element. Without a note it names a side of the element instead.
   */
  from?: DoodlePosition | "note";
  /** `"edge"` lands just outside the frame; `"center"` points into it. */
  to?: DoodlePosition | "edge";
  style?: "curved" | "straight" | "dotted" | "looped";
  /**
   * Motion for the arrow. On by default - the shaft draws itself on and the
   * whole mark leans toward its target. `false` draws it static. Respects
   * `prefers-reduced-motion`.
   */
  animate?: boolean | ArrowAnimationOptions;
}

export interface DecorationOptions {
  /** Marks drawn around the border. Hard-capped at 2. */
  count?: number | null;
  /** Omit to choose automatically from the element's size. */
  style?: "corners" | "sides";
  /** Omit for the curated default set. */
  types?: DecorationType[] | null;
}

export interface BreakOptions {
  /** Omit for 2–5 gaps. */
  count?: number | null;
  /** Shortest gap, px. Default 6. */
  min?: number;
  /** Longest gap, px. Default 30. */
  max?: number;
}

export interface DoodleOptions {
  border?: boolean;
  color?: string;
  strokeWidth?: number;
  roughness?: number;
  /** Gap between the element's edge and the frame. Default `0`. */
  padding?: number;
  /** Auto-detected from CSS when omitted. */
  radius?: number | null;
  opacity?: number;
  /** Selector for decorating descendants instead of the element itself. */
  children?: string | null;
  note?: LocalizedText | NoteOptions | null;
  arrow?: boolean | ArrowOptions;
  decorations?: boolean | DecorationOptions;
  /** Lift the pen at random points around the outline. */
  addBreaks?: boolean | number | BreakOptions;
  /**
   * Font stack for handwritten notes. Point this at your own family - a
   * `next/font` CSS variable, for instance - to take over from the built-in one.
   */
  fontFamily?: string | null;
  /**
   * Fetch the Caveat webfont when the page has not already provided it.
   * Default `true`. Set `false` if a strict CSP blocks Google Fonts, or if you
   * self-host the family; the notes then use `fontFamily` or the system
   * handwriting fallbacks.
   */
  autoLoadFont?: boolean;
  /**
   * Which language a multilingual `note` is written in. Omit to follow the
   * visitor's own languages - `navigator.languages`, which is what their
   * operating system is set to - falling back to the document's `lang`.
   *
   * Set it to drive notes from your app's own i18n state instead. Accepts a
   * list, in preference order.
   */
  locale?: string | string[] | null;
  /**
   * Overlay stacking order. Omit to follow the target element's z-index so
   * doodles stay above the annotated element but below modals and other UI.
   */
  zIndex?: number | null;
}

export interface DoodleInstance {
  /** Recalculate geometry and redraw. */
  update(): void;
  /** Remove the overlay and disconnect observers. */
  destroy(): void;
}

/**
 * Wrap a DOM element with a hand-drawn SVG doodle overlay.
 * Calling twice on the same element replaces the previous overlay.
 */
export function doodle(
  target: string | Element,
  options?: DoodleOptions,
): DoodleInstance;
