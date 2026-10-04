import esbuild from "esbuild";
import { mkdirSync, copyFileSync } from "fs";
import path from "path";

const DOM_NODES = path.resolve("src/svg-dom.js");
const VIRTUAL_NODES = path.resolve("src/native/svg-dom.js");

/**
 * React Native has no DOM: the drawers there build virtual SVG nodes, which
 * the native component renders with react-native-svg.
 */
const virtualSvgNodes = {
  name: "virtual-svg-nodes",
  setup(build) {
    build.onResolve({ filter: /svg-dom\.js$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path);
      return resolved === DOM_NODES ? { path: VIRTUAL_NODES } : undefined;
    });
  },
};

mkdirSync("dist", { recursive: true });

const targets = [
  { entry: "src/index.js", name: "freehand-ui" },
  // React is a peer dependency - never bundled, so the host app's copy is used
  { entry: "src/react.js", name: "react", external: ["react"] },
  {
    entry: "src/native/react-native.js",
    name: "native",
    external: ["react", "react-native", "react-native-svg"],
    platform: "neutral",
    plugins: [virtualSvgNodes],
  },
];

for (const {
  entry,
  name,
  external = [],
  platform = "browser",
  plugins = [],
} of targets) {
  for (const [format, extension] of [
    ["esm", "js"],
    ["cjs", "cjs"],
  ]) {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format,
      external,
      outfile: `dist/${name}.${extension}`,
      platform,
      plugins,
      target: ["es2020"],
      // esbuild drops directives when bundling; the App Router needs this one
      banner: name === "react" ? { js: '"use client";' } : undefined,
    });
  }
}

for (const types of ["index.d.ts", "react.d.ts", "native.d.ts"]) {
  copyFileSync(`src/${types}`, `dist/${types}`);
}

console.log(
  "Built dist/freehand-ui.{js,cjs}, dist/react.{js,cjs}, dist/native.{js,cjs} and types",
);
