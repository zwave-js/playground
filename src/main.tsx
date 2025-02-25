import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { NoSerial } from "./NoSerial.tsx";
import { ConfirmLoad } from "./ConfirmLoad.tsx";

const App = lazy(() => import("./App.tsx"));

const search = new URLSearchParams(window.location.search);
const isEmbed = search.get("embed") != null;
const confirmedEmbed = search.get("load") != null;

if ("serial" in navigator) {
  if (isEmbed && !confirmedEmbed) {
    createRoot(document.getElementById("root")!).render(<ConfirmLoad />);
  } else {
    const esbuild = await import("esbuild-wasm");

    await esbuild.initialize({
      wasmURL: "/esbuild.wasm",
    });

    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <Suspense fallback={<div>Loading...</div>}>
          <App
            esbuild={esbuild}
            showShareButton={!isEmbed}
            showOpenInNewWindowButton={isEmbed}
            showEmbedButton={!isEmbed}
          />
        </Suspense>
      </StrictMode>
    );
  }
} else {
  createRoot(document.getElementById("root")!).render(<NoSerial />);
}
