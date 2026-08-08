import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["examples/react/app.jsx"],
  bundle: true,
  format: "esm",
  outfile: "examples/react/app.bundle.js",
  jsx: "automatic",
  platform: "browser",
  target: ["es2020"],
  alias: {
    "@aznabee/freehand-ui/react": "./dist/react.js",
  },
});

console.log("Built examples/react/app.bundle.js");
