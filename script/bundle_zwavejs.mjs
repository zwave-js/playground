#!/usr/bin/env node

import esbuild from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import fs from "node:fs/promises";



const inlineBundles = {
  "zwave-js": `export * from "./src/bundles/zwave-js.js"`,
  "@zwave-js/shared": `export * from "@zwave-js/shared"`,
  "@zwave-js/core": `export * from "@zwave-js/core"`,
  "@zwave-js/cc": `export * from "@zwave-js/cc"`,
  "@zwave-js/config": `export * from "@zwave-js/config"`,
  "@zwave-js/nvmedit": `export * from "@zwave-js/nvmedit"`,
  "@zwave-js/serial": `export * from "@zwave-js/serial"`,
  "@zwave-js/serial/serialapi": `export * from "@zwave-js/serial/serialapi"`,
  //   "zwave-js/safe": `export * from "zwave-js/safe"`,
  //   "@zwave-js/shared/safe": `export * from "@zwave-js/shared/safe"`,
  //   "@zwave-js/core/safe": `export * from "@zwave-js/core/safe"`,
  //   "@zwave-js/cc/safe": `export * from "@zwave-js/cc/safe"`,
  //   "@zwave-js/config/safe": `export * from "@zwave-js/config/safe"`,
  //   "@zwave-js/nvmedit/safe": `export * from "@zwave-js/nvmedit/safe"`,
  //   "@zwave-js/serial/safe": `export * from "@zwave-js/serial/safe"`,
};

for (const [name, code] of Object.entries(inlineBundles)) {
  const otherModules = Object.keys(inlineBundles).filter((n) => n !== name);
  const outFile = name
    .replace(/^@zwave-js\//, "zwave-js-")
    .replaceAll("/", "-");
  const result = await esbuild.build({
    // entryPoints: ["bundle.ts"],
    stdin: {
      contents: code,
      sourcefile: "index.ts",
      resolveDir: process.cwd(),
    },
    write: false,
    bundle: true,
    sourcemap: true,
    //   analyze: "verbose",
    // outdir: "public/dist/",
    target: "es2022",
    format: "esm",
    platform: "browser",
    external: [
      ...(name === "zwave-js" ? [] : otherModules),
      "@zwave-js/serial/bindings/node",
      "@zwave-js/core/bindings/fs/node",
      "@zwave-js/core/bindings/db/jsonl",
      "@zwave-js/core/bindings/log/node",
      "node:crypto",
      // "source-map-support",
    ],
    // logLevel: "verbose",
    logLevel: "info",
    logLimit: 0,
    keepNames: true,
    plugins: [
      nodeModulesPolyfillPlugin({
        // fallback: "error",
        modules: {
          // Required for source-map-support
          path: true,
          // FIXME: Required for zwave-js internally
          module: true,
          url: true,
          // Required for mdns
          dgram: "empty",
          os: "empty",
          events: "empty",
          buffer: "empty",
        },
      }),
    ],
  });

  await fs.mkdir("public/dist", { recursive: true });
  await fs.writeFile(`public/dist/${outFile}.js`, result.outputFiles[0].text);
}
