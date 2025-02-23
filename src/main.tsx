import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

import * as esbuild from "esbuild-wasm";

await esbuild.initialize({
  wasmURL: "./node_modules/esbuild-wasm/esbuild.wasm?url",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App esbuild={esbuild} />
  </StrictMode>
);
