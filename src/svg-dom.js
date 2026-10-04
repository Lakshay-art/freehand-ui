/**
 * Where SVG nodes come from. The web build creates real DOM elements; the
 * React Native build swaps this module for `native/svg-dom.js`, which builds a
 * lightweight tree that is rendered with react-native-svg instead. Every
 * drawer goes through here so the geometry is shared between the two.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @param {string} tag
 * @returns {SVGElement}
 */
export function createSvgElement(tag) {
  return document.createElementNS(SVG_NS, tag);
}
