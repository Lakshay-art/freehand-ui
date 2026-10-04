/**
 * Stand-in for `../svg-dom.js` in the React Native build. There is no DOM to
 * draw into, so the drawers build a small tree of plain objects instead - just
 * enough of the SVGElement surface they touch - and `react-native.js` turns
 * that tree into react-native-svg elements.
 *
 * The two things a browser would work out from layout are computed here
 * instead: text width (from Caveat's own glyph advances) and path length (by
 * sampling).
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

// Advance widths in em of Caveat at weight 600 - the face and weight notes are
// drawn in - for printable ASCII, U+0020 to U+007E, read from the font itself.
// Exact for Caveat, so the note's box, underline and handwriting accents sit
// where the glyphs actually end.
const CAVEAT_ADVANCES = [
  0.242, 0.21, 0.237, 0.559, 0.45, 0.6, 0.564, 0.117, 0.33, 0.33, 0.363, 0.446,
  0.198, 0.326, 0.198, 0.33, 0.45, 0.45, 0.45, 0.45, 0.45, 0.439, 0.464, 0.447,
  0.45, 0.442, 0.198, 0.198, 0.446, 0.446, 0.446, 0.374, 0.643, 0.508, 0.522, 0.475,
  0.584, 0.532, 0.462, 0.492, 0.57, 0.406, 0.312, 0.505, 0.426, 0.726, 0.612, 0.502,
  0.467, 0.495, 0.542, 0.492, 0.458, 0.482, 0.49, 0.72, 0.524, 0.504, 0.522, 0.33,
  0.33, 0.33, 0.446, 0.446, 0.353, 0.443, 0.441, 0.361, 0.399, 0.331, 0.297, 0.361,
  0.47, 0.193, 0.21, 0.371, 0.175, 0.566, 0.456, 0.359, 0.378, 0.377, 0.36, 0.347,
  0.331, 0.37, 0.331, 0.517, 0.343, 0.341, 0.315, 0.33, 0.33, 0.33, 0.446,
];
// Caveat's average lowercase advance, for anything outside that range
const CAVEAT_FALLBACK_EM = 0.37;
// Past Latin - Devanagari, CJK, Arabic - Caveat has no glyphs and the system
// font takes over, which runs wider
const NON_LATIN_EM = 0.62;
// Same tracking the note text is drawn with (see `createNoteText`)
const LETTER_SPACING = 0.4;

// How much wider than Caveat other handwriting faces set - Caveat is
// condensed, the platform faces the native component defaults to are not.
const FAMILY_WIDTH = {
  caveat: 1,
  noteworthy: 1.4,
  casual: 1.5,
};
const OTHER_FAMILY_WIDTH = 1.3;

/**
 * @param {string | null | undefined} stack
 */
function familyWidth(stack) {
  if (!stack) return 1;
  const first = String(stack)
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  return FAMILY_WIDTH[first] ?? OTHER_FAMILY_WIDTH;
}

/**
 * @param {string} char
 */
function caveatAdvance(char) {
  const code = char.codePointAt(0);
  if (code >= 0x20 && code <= 0x7e) return CAVEAT_ADVANCES[code - 0x20];
  return code > 0x2ff ? NON_LATIN_EM : CAVEAT_FALLBACK_EM;
}

/**
 * @param {string} text
 * @param {number} fontSize
 * @param {string | null} [fontFamily] only the first family counts
 * @returns {number}
 */
export function estimateTextWidth(text, fontSize, fontFamily = null) {
  let em = 0;
  let glyphs = 0;

  for (const char of String(text)) {
    glyphs += 1;
    em += caveatAdvance(char);
  }

  return (
    em * fontSize * familyWidth(fontFamily) +
    Math.max(0, glyphs - 1) * LETTER_SPACING
  );
}

/**
 * @param {number[]} p control points as x0 y0 x1 y1 ...
 * @param {number} t
 */
function bezierPoint(p, t) {
  const u = 1 - t;
  if (p.length === 6) {
    return {
      x: u * u * p[0] + 2 * u * t * p[2] + t * t * p[4],
      y: u * u * p[1] + 2 * u * t * p[3] + t * t * p[5],
    };
  }
  return {
    x: u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
    y: u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
  };
}

/**
 * @param {number[]} p
 */
function curveLength(p) {
  const steps = 16;
  let length = 0;
  let previous = { x: p[0], y: p[1] };
  for (let i = 1; i <= steps; i++) {
    const point = bezierPoint(p, i / steps);
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return length;
}

/**
 * Length of a path made of the commands the drawers emit: M, L, C, Q and Z,
 * absolute or relative.
 *
 * @param {string} d
 * @returns {number}
 */
export function pathDataLength(d) {
  const commands = String(d).match(/[MLCQZmlcqz][^MLCQZmlcqz]*/g) ?? [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let length = 0;

  for (const command of commands) {
    const type = command[0];
    const upper = type.toUpperCase();
    const relative = type !== upper;
    const numbers = (command.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(
      Number,
    );

    if (upper === "Z") {
      length += Math.hypot(startX - x, startY - y);
      x = startX;
      y = startY;
      continue;
    }

    const arity = { M: 2, L: 2, Q: 4, C: 6 }[upper];
    for (let i = 0; i + arity <= numbers.length; i += arity) {
      const args = numbers.slice(i, i + arity);
      const ox = relative ? x : 0;
      const oy = relative ? y : 0;
      const points = [];
      for (let j = 0; j < args.length; j += 2) {
        points.push(args[j] + ox, args[j + 1] + oy);
      }
      const endX = points[points.length - 2];
      const endY = points[points.length - 1];

      // A second pair after M is an implicit lineto
      if (upper === "M" && i === 0) {
        startX = endX;
        startY = endY;
      } else if (upper === "M" || upper === "L") {
        length += Math.hypot(endX - x, endY - y);
      } else {
        length += curveLength([x, y, ...points]);
      }

      x = endX;
      y = endY;
    }
  }

  return length;
}

/**
 * The inline style surface the drawers write to: `style.filter = ...`,
 * `style.animation = ...` and `style.setProperty("--var", ...)`.
 */
function createStyle() {
  const custom = {};
  return Object.defineProperties(
    {},
    {
      setProperty: {
        value: (name, value) => {
          custom[name] = String(value);
        },
      },
      getPropertyValue: { value: (name) => custom[name] ?? "" },
      custom: { value: custom },
    },
  );
}

class VirtualElement {
  /**
   * @param {string} tagName
   */
  constructor(tagName) {
    this.tagName = tagName;
    this.nodeName = tagName;
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.style = createStyle();
    this._text = "";
  }

  get childNodes() {
    return this.children;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get textContent() {
    if (this.children.length) {
      return this.children.map((child) => child.textContent).join("");
    }
    return this._text;
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value ?? "");
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  setAttributeNS(_namespace, name, value) {
    this.setAttribute(name, value);
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  /**
   * Moves the node if it already has a parent, like the DOM does - the note
   * groups rely on that to be re-appended on top of every stroke.
   * @param {VirtualElement} child
   */
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  getTotalLength() {
    return pathDataLength(this.getAttribute("d") ?? "");
  }

  /**
   * @param {string} name
   */
  inherited(name) {
    for (let node = this; node; node = node.parentNode) {
      const value = node.getAttribute(name);
      if (value != null) return value;
    }
    return null;
  }

  getComputedTextLength() {
    return estimateTextWidth(
      this.textContent,
      Number(this.inherited("font-size")) || 19,
      this.inherited("font-family"),
    );
  }

  getBBox() {
    return { x: 0, y: 0, width: this.getComputedTextLength(), height: 0 };
  }
}

/**
 * @param {string} tag
 * @returns {VirtualElement}
 */
export function createSvgElement(tag) {
  return new VirtualElement(tag);
}

export { VirtualElement };
