import esbuild from "esbuild";
import { mkdirSync, copyFileSync } from "fs";

mkdirSync("dist", { recursive: true });

const targets = [
  { entry: "src/index.js", name: "freehand-ui" },
  // React is a peer dependency - never bundled, so the host app's copy is used
  { entry: "src/react.js", name: "react", external: ["react"] },
];

for (const { entry, name, external = [] } of targets) {
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
      platform: "browser",
      target: ["es2020"],
      // esbuild drops directives when bundling; the App Router needs this one
      banner: name === "react" ? { js: '"use client";' } : undefined,
    });
  }
}

for (const types of ["index.d.ts", "react.d.ts"]) {
  copyFileSync(`src/${types}`, `dist/${types}`);
}

console.log("Built dist/freehand-ui.{js,cjs}, dist/react.{js,cjs} and types");
