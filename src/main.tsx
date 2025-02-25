import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

import * as esbuild from "esbuild-wasm";

await esbuild.initialize({
  wasmURL: "/esbuild.wasm",
});

const isEmbed =
  new URLSearchParams(window.location.search).get("embed") != null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      esbuild={esbuild}
      showShareButton={!isEmbed}
      showOpenInNewWindowButton={isEmbed}
    />
  </StrictMode>
);
