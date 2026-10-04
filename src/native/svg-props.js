/**
 * Virtual SVG node attributes → react-native-svg props. Kept free of any
 * react-native import so it runs (and is tested) anywhere.
 */

/** SVG attribute → react-native-svg prop, for everything the drawers set. */
export const ATTRIBUTES = {
  d: "d",
  fill: "fill",
  stroke: "stroke",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  opacity: "opacity",
  transform: "transform",
  r: "r",
  cx: "cx",
  cy: "cy",
  x: "x",
  y: "y",
  dy: "dy",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "letter-spacing": "letterSpacing",
  "text-anchor": "textAnchor",
};

/**
 * A CSS font stack names fallbacks native text has no way to try in turn;
 * the first family is the one that has to be linked into the app.
 * @param {string | null} stack
 */
function firstFamily(stack) {
  const first = String(stack ?? "")
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
  return first && first !== "cursive" ? first : undefined;
}

/**
 * The `animation` shorthand `animation.js` writes, back into parts.
 * @param {string | undefined} value
 */
export function parseAnimation(value) {
  const parts = String(value ?? "").trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [name, duration, easing, delay, iterations] = parts;
  return {
    name,
    duration: parseFloat(duration) || 0,
    easing,
    delay: parseFloat(delay) || 0,
    infinite: iterations === "infinite",
  };
}

/**
 * @param {import('./svg-dom.js').VirtualElement} node
 */
export function propsOf(node) {
  const props = {};
  for (const [name, value] of Object.entries(node.attributes)) {
    const prop = ATTRIBUTES[name];
    if (prop) props[prop] = value;
  }

  const family = firstFamily(node.getAttribute("font-family"));
  if (family) props.fontFamily = family;

  // Native text has no bidi embedding to turn `start` into the right edge, so
  // a right-to-left note anchors its end there instead - same placement
  if (node.getAttribute("direction") === "rtl") props.textAnchor = "end";

  // Every line already carries its own x. react-native-svg adds a text-level
  // x on top of the first line's, which shifted notes a few px right of the
  // box they were laid out in - into the heart that trails them.
  if (
    node.tagName === "text" &&
    node.children.length &&
    node.children.every((child) => child.getAttribute("x") != null)
  ) {
    delete props.x;
  }

  return props;
}
