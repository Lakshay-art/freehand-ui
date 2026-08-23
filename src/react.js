"use client";

import {
  createElement,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { doodle } from "./doodle.js";

/**
 * `useLayoutEffect` warns during server rendering, which Next.js does on every
 * request. There is nothing to measure on the server anyway.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Props consumed by the wrapper itself rather than forwarded to the DOM. */
const OPTION_KEYS = [
  "border",
  "color",
  "strokeWidth",
  "roughness",
  "padding",
  "radius",
  "opacity",
  "note",
  "arrow",
  "decorations",
  "addBreaks",
  "fontFamily",
  "autoLoadFont",
  "locale",
];

/**
 * @param {Record<string, unknown>} props
 * @returns {Record<string, unknown>}
 */
function collectOptions(props) {
  const options = {};

  for (const key of OPTION_KEYS) {
    if (props[key] !== undefined) options[key] = props[key];
  }

  // `childSelector` maps to the core's `children` option. Renamed here because
  // `children` already means React children on a component.
  if (props.childSelector) options.children = props.childSelector;

  return options;
}

/**
 * Hand-drawn doodle layer for an element you already have a ref to.
 *
 * @param {import('react').RefObject<Element>} ref
 * @param {object} [options] same options as the core `doodle()`
 * @param {boolean} [enabled]
 */
export function useDoodle(ref, options = {}, enabled = true) {
  // Inline object props (`note={{ text: "hi" }}`) are a new identity on every
  // render. Keying the effect on the serialised options stops the overlay from
  // being torn down and redrawn - with a fresh random seed - each time.
  const key = useMemo(() => JSON.stringify(options ?? {}), [options]);
  const latest = useRef(options);
  latest.current = options;

  useIsomorphicLayoutEffect(() => {
    if (!enabled) return undefined;

    const element = ref.current;
    if (!element) return undefined;

    const instance = doodle(element, latest.current);
    return () => instance.destroy();
  }, [ref, key, enabled]);
}

/**
 * @param {...(import('react').Ref<unknown> | undefined)} refs
 */
function mergeRefs(...refs) {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else ref.current = value;
    }
  };
}

/**
 * Wrap any component in a hand-drawn doodle layer.
 *
 * ```jsx
 * <Doodle note="start chat" strokeWidth={2}>
 *   <Button />
 * </Doodle>
 * ```
 *
 * The doodle is drawn around the wrapper as a whole - children are never
 * decorated individually unless you opt in with `childSelector`. The overlay
 * itself is an absolutely-positioned, `pointer-events: none` SVG mounted
 * beside the wrapper, so it never affects layout or blocks clicks - but it is
 * clipped by an `overflow: hidden` ancestor, the same as any other content.
 */
const Doodle = forwardRef(function Doodle(props, forwardedRef) {
  const {
    children,
    as = "span",
    className,
    style,
    disabled = false,
    // Option props are pulled out so they are not spread onto the DOM node
    border,
    color,
    strokeWidth,
    roughness,
    padding,
    radius,
    opacity,
    note,
    arrow,
    decorations,
    addBreaks,
    fontFamily,
    autoLoadFont,
    locale,
    childSelector,
    ...rest
  } = props;

  const innerRef = useRef(null);

  const options = useMemo(
    () =>
      collectOptions({
        border,
        color,
        strokeWidth,
        roughness,
        padding,
        radius,
        opacity,
        note,
        arrow,
        decorations,
        addBreaks,
        fontFamily,
        autoLoadFont,
        locale,
        childSelector,
      }),
    [
      border,
      color,
      strokeWidth,
      roughness,
      padding,
      radius,
      opacity,
      // Objects and arrays are compared by value so inline literals are stable
      JSON.stringify(note ?? null),
      JSON.stringify(arrow ?? null),
      JSON.stringify(decorations ?? null),
      JSON.stringify(addBreaks ?? null),
      fontFamily,
      autoLoadFont,
      JSON.stringify(locale ?? null),
      childSelector,
    ],
  );

  useDoodle(innerRef, options, !disabled);

  return createElement(
    as,
    {
      ...rest,
      ref: mergeRefs(innerRef, forwardedRef),
      className,
      // inline-flex shrink-wraps the child so the doodle hugs the component
      // rather than a full-width block. Flex specifically - inline-block would
      // add baseline leading under an inline-level child like a <button>,
      // leaving the frame taller than what it wraps. Override via `style`/`as`.
      style: { display: "inline-flex", ...style },
    },
    children,
  );
});

export default Doodle;
export { Doodle };
