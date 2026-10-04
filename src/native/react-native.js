import {
  createElement as h,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
  TSpan,
} from "react-native-svg";
import { buildDoodle } from "./layout.js";
import { parseAnimation, propsOf } from "./svg-props.js";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Props consumed by the wrapper itself rather than forwarded to the View. */
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
  "locale",
  // Web-only, accepted so shared doodle configs can be spread onto either
  "autoLoadFont",
  "zIndex",
];

// Horizontal inset a note is kept inside of, as on the web
const BAND_INSET = 8;

// Handwriting faces every device already has, so notes read as handwritten
// without linking a font into the app. Pass `fontFamily` to use your own -
// "Caveat", to match the web, once it is linked.
const PLATFORM_HANDWRITING = Platform.select({
  ios: "Noteworthy",
  android: "casual",
  default: undefined,
});

const ELEMENTS = { g: G, path: Path, circle: Circle, text: SvgText };

const EASINGS = {
  linear: Easing.linear,
  // The CSS keywords' own curves
  "ease-out": Easing.bezier(0, 0, 0.58, 1),
  "ease-in-out": Easing.bezier(0.42, 0, 0.58, 1),
};

/**
 * @param {import('./svg-dom.js').VirtualElement} node
 */
function blurOf(node) {
  const match = /blur\(\s*([\d.]+)px\s*\)/.exec(node.style.filter ?? "");
  return match ? Number(match[1]) : 0;
}

/**
 * @param {import('./svg-dom.js').VirtualElement} node
 * @param {string | number} key
 * @param {{ defs: unknown[], clock: Animated.Value | null, prefix: string }} context
 */
function renderNode(node, key, context) {
  const props = { key, ...propsOf(node) };

  if (node.tagName === "tspan") return h(TSpan, props, node.textContent);

  // A glow is a CSS-blurred disc on the web; native svg has no CSS filters,
  // so the same softness comes from a radial fade out to the blurred edge
  if (node.tagName === "circle" && blurOf(node) > 0) {
    const id = `${context.prefix}-glow-${context.defs.length}`;
    const color = props.fill;
    context.defs.push(
      h(
        RadialGradient,
        { key: id, id, cx: "50%", cy: "50%", r: "50%" },
        h(Stop, { offset: "0", stopColor: color, stopOpacity: 1 }),
        h(Stop, { offset: "0.55", stopColor: color, stopOpacity: 0.55 }),
        h(Stop, { offset: "1", stopColor: color, stopOpacity: 0 }),
      ),
    );
    props.fill = `url(#${id})`;
    props.r = String(Number(props.r) + blurOf(node) * 1.5);
  }

  const animation = parseAnimation(node.style.animation);
  if (
    node.tagName === "path" &&
    context.clock &&
    animation?.name === "freehand-arrow-dash" &&
    // A dotted shaft crawls forever on the web; that would keep the JS thread
    // busy for as long as the doodle is on screen, so it is left still here
    !animation.infinite &&
    animation.duration > 0
  ) {
    const length = node.getTotalLength();
    if (length > 0) {
      return h(AnimatedPath, {
        ...props,
        strokeDasharray: [length, length],
        strokeDashoffset: context.clock.interpolate({
          inputRange: [animation.delay, animation.delay + animation.duration],
          outputRange: [length, 0],
          easing: EASINGS[animation.easing] ?? EASINGS.linear,
          extrapolate: "clamp",
        }),
      });
    }
  }

  const Component = ELEMENTS[node.tagName];
  if (!Component) return null;

  return h(
    Component,
    props,
    node.children.map((child, index) => renderNode(child, index, context)),
  );
}

/**
 * Consecutive top-level marks share one Svg; each animated arrow gets its own
 * so it can drift on the native driver as a plain View transform. Paint order
 * is kept, so handwriting still lands on top.
 * @param {import('./svg-dom.js').VirtualElement} root
 */
function splitLayers(root) {
  const layers = [];
  let run = null;

  for (const child of root.children) {
    if (child.getAttribute("class") === "freehand-arrow") {
      layers.push({ arrow: true, nodes: [child] });
      run = null;
    } else {
      if (!run) {
        run = { arrow: false, nodes: [] };
        layers.push(run);
      }
      run.nodes.push(child);
    }
  }

  return layers;
}

function LayerSvg({ nodes, bounds, clock, prefix }) {
  const context = { defs: [], clock, prefix };
  const content = nodes.map((node, index) => renderNode(node, index, context));

  return h(
    Svg,
    {
      style: StyleSheet.absoluteFill,
      width: bounds.width,
      height: bounds.height,
    },
    context.defs.length ? h(Defs, null, context.defs) : null,
    // Drawing coordinates are the element's own; the canvas starts further out
    h(G, { transform: `translate(${-bounds.x} ${-bounds.y})` }, content),
  );
}

/**
 * When the arrow's strokes finish drawing, and how it leans - read back off
 * the timings `animateArrow` wrote onto the tree.
 * @param {import('./svg-dom.js').VirtualElement} group
 */
function arrowPlan(group) {
  let drawEnd = 0;
  for (const path of group.children) {
    const animation = parseAnimation(path.style.animation);
    if (animation && !animation.infinite) {
      drawEnd = Math.max(drawEnd, animation.delay + animation.duration);
    }
  }

  const lean = parseAnimation(group.style.animation);
  const dx = parseFloat(group.style.getPropertyValue("--freehand-drift-x")) || 0;
  const dy = parseFloat(group.style.getPropertyValue("--freehand-drift-y")) || 0;

  return {
    drawEnd,
    drift:
      lean && (dx || dy)
        ? {
            dx,
            dy,
            duration: lean.duration,
            delay: Math.max(0, lean.delay),
            repeat: lean.infinite,
          }
        : null,
  };
}

function ArrowLayer({ node, bounds, prefix }) {
  const clock = useRef(new Animated.Value(0)).current;
  const lean = useRef(new Animated.Value(0)).current;
  const plan = arrowPlan(node);
  // Timings never depend on layout, so the first plan is the one that plays
  const initialPlan = useRef(plan).current;

  useEffect(() => {
    const running = [];
    let timer = null;

    if (initialPlan.drawEnd > 0) {
      const draw = Animated.timing(clock, {
        toValue: initialPlan.drawEnd,
        duration: initialPlan.drawEnd,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      draw.start();
      running.push(draw);
    }

    const drift = initialPlan.drift;
    if (drift) {
      const step = (toValue, duration, easing) =>
        Animated.timing(lean, { toValue, duration, easing, useNativeDriver: true });
      const gesture = drift.repeat
        ? Animated.loop(
            Animated.sequence([
              step(1, drift.duration / 2, EASINGS["ease-in-out"]),
              step(0, drift.duration / 2, EASINGS["ease-in-out"]),
            ]),
          )
        : step(1, drift.duration, EASINGS["ease-out"]);
      timer = setTimeout(() => gesture.start(), drift.delay);
      running.push(gesture);
    }

    return () => {
      if (timer != null) clearTimeout(timer);
      for (const animation of running) animation.stop();
    };
  }, [clock, lean, initialPlan]);

  const drift = plan.drift;
  const transform = drift
    ? [
        { translateX: lean.interpolate({ inputRange: [0, 1], outputRange: [0, drift.dx] }) },
        { translateY: lean.interpolate({ inputRange: [0, 1], outputRange: [0, drift.dy] }) },
      ]
    : undefined;

  return h(
    Animated.View,
    { pointerEvents: "none", style: [StyleSheet.absoluteFill, { transform }] },
    h(LayerSvg, { nodes: [node], bounds, clock, prefix }),
  );
}

function DoodleLayers({ doodle, session, animate }) {
  const { root, bounds } = doodle;
  const layers = splitLayers(root);

  return h(
    View,
    {
      pointerEvents: "none",
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      style: {
        position: "absolute",
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
    },
    layers.map((layer, index) => {
      const prefix = `fh${session.id}-${index}`;
      return layer.arrow && animate
        ? // Keyed by session: new options restart the draw, a relayout does not
          h(ArrowLayer, { key: `a${session.id}-${index}`, node: layer.nodes[0], bounds, prefix })
        : h(LayerSvg, { key: `s${index}`, nodes: layer.nodes, bounds, clock: null, prefix });
    }),
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduced(Boolean(value)))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (value) => setReduced(Boolean(value)),
    );
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
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

let sessions = 0;

/**
 * Wrap any React Native view in a hand-drawn doodle layer.
 *
 * ```jsx
 * <Doodle note="start chat" arrow decorations>
 *   <Button />
 * </Doodle>
 * ```
 *
 * The wrapper is a plain `View`; the doodle is drawn in an absolutely
 * positioned, touch-transparent layer inside it, so it never affects layout or
 * blocks presses - but it is clipped if the wrapper (or an ancestor) sets
 * `overflow: "hidden"`.
 */
const Doodle = forwardRef(function Doodle(props, forwardedRef) {
  const { children, style, disabled = false, onLayout, ...rest } = props;

  const options = {};
  const viewProps = {};
  for (const [name, value] of Object.entries(rest)) {
    if (OPTION_KEYS.includes(name)) {
      if (value !== undefined) options[name] = value;
    } else {
      viewProps[name] = value;
    }
  }

  if (options.fontFamily == null && PLATFORM_HANDWRITING) {
    options.fontFamily = PLATFORM_HANDWRITING;
  }

  // No computed style to detect a radius from - borrow the wrapper's own
  if (options.radius == null) {
    const radius = StyleSheet.flatten(style)?.borderRadius;
    if (typeof radius === "number") options.radius = radius;
  }

  // Inline object props are a new identity every render; key on content so
  // the doodle is only redrawn - with a fresh seed - when it actually changes
  const key = JSON.stringify(options);
  const session = useMemo(
    () => ({ id: ++sessions, seed: Math.floor(Math.random() * 1e9) }),
    [key],
  );

  const viewRef = useRef(null);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const [frame, setFrame] = useState(null);
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const handleLayout = useCallback((event) => {
    onLayoutRef.current?.(event);
    const { width, height } = event.nativeEvent.layout;

    setFrame((previous) =>
      previous && previous.width === width && previous.height === height
        ? previous
        : { left: previous?.left ?? null, width, height },
    );

    // Where the view sits on screen, so a note is kept inside the window
    viewRef.current?.measureInWindow?.((left) => {
      if (!Number.isFinite(left)) return;
      setFrame((previous) =>
        previous && Math.round(previous.left ?? NaN) !== Math.round(left)
          ? { ...previous, left }
          : previous,
      );
    });
  }, []);

  const doodle = useMemo(() => {
    if (disabled || !frame || frame.width <= 0 || frame.height <= 0) return null;

    const band =
      frame.left == null
        ? null
        : {
            x: -frame.left + BAND_INSET,
            width: Math.max(0, windowWidth - BAND_INSET * 2),
          };

    return buildDoodle({
      width: frame.width,
      height: frame.height,
      options: JSON.parse(key),
      seed: session.seed,
      band,
    });
  }, [disabled, frame, key, session, windowWidth]);

  return h(
    View,
    {
      ...viewProps,
      ref: mergeRefs(viewRef, forwardedRef),
      style,
      onLayout: handleLayout,
    },
    children,
    doodle ? h(DoodleLayers, { doodle, session, animate: !reducedMotion }) : null,
  );
});

export default Doodle;
export { Doodle, buildDoodle };
