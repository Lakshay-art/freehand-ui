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

export interface NoteOptions {
  text: string;
  /** Preferred side. Flips automatically if it would run off screen. */
  position?: DoodlePosition;
  /** Underline sized to the measured text. Default `true`. */
  underline?: boolean;
}

export interface ArrowOptions {
  from?: DoodlePosition;
  /** `"edge"` lands just outside the frame; `"center"` points into it. */
  to?: DoodlePosition | "edge";
  style?: "curved" | "straight" | "dotted";
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
  note?: string | NoteOptions | null;
  arrow?: boolean | ArrowOptions;
  decorations?: boolean | DecorationOptions;
  /** Lift the pen at random points around the outline. */
  addBreaks?: boolean | number | BreakOptions;
  /**
   * Font stack for handwritten notes. Point this at your own family — a
   * `next/font` CSS variable, for instance — to take over from the built-in one.
   */
  fontFamily?: string | null;
  /**
   * Fetch the Caveat webfont when the page has not already provided it.
   * Default `true`. Set `false` if a strict CSP blocks Google Fonts, or if you
   * self-host the family; the notes then use `fontFamily` or the system
   * handwriting fallbacks.
   */
  autoLoadFont?: boolean;
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
  options?: DoodleOptions
): DoodleInstance;
