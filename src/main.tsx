import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { NoSerial } from "./NoSerial.tsx";
import { ConfirmLoad } from "./ConfirmLoad.tsx";
import * as esbuild from "esbuild-wasm";

const App = lazy(() => import("./App.tsx"));

const search = new URLSearchParams(window.location.search);
const isEmbed = search.get("embed") != null;
const confirmedEmbed = localStorage.getItem("loadEmbedded") === "true";

const root = createRoot(document.getElementById("root")!);

if ("serial" in navigator) {
  if (isEmbed && !confirmedEmbed) {
    root.render(<ConfirmLoad />);
  } else {
    await esbuild.initialize({
      wasmURL: "/esbuild.wasm",
    });

    root.render(
      <StrictMode>
        <Suspense fallback={<div>Loading...</div>}>
          <App
            esbuild={esbuild}
            showShareButton={!isEmbed}
            showOpenInNewWindowButton={isEmbed}
            showEmbedButton={!isEmbed}
            defaultLogsVisible={!isEmbed}
          />
        </Suspense>
      </StrictMode>
    );
  }
} else {
  root.render(<NoSerial />);
}
