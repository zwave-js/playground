import "./global.d.ts";
import { useState } from "react";
import "./App.css";
import Editor from "@monaco-editor/react";
import { type ZWaveSerialBindingFactory } from "@zwave-js/serial";
import { createWebSerialPortFactory } from "@zwave-js/bindings-browser/serial";
import "./setimmediate.js";

interface AppProps {
  esbuild: typeof import("esbuild-wasm");
}

const external = [
  // These are bundled at compile time and loaded through an import map:
  "zwave-js",
  "@zwave-js/shared",
  "@zwave-js/core",
  "@zwave-js/cc",
  "@zwave-js/config",
  "@zwave-js/nvmedit",
  "@zwave-js/serial",
  // These are never loaded
  "@zwave-js/serial/bindings/node",
  "@zwave-js/core/bindings/fs/node",
  "@zwave-js/core/bindings/db/jsonl",
  "@zwave-js/core/bindings/log/node",
  "node:crypto",
  // "source-map-support",
];

async function getPort(): Promise<{
  port: SerialPort;
  serialBinding: ZWaveSerialBindingFactory;
}> {
  const port = await navigator.serial.requestPort({
    filters: [
      // CP2102
      { usbVendorId: 0x10c4, usbProductId: 0xea60 },
      // Nabu Casa ESP bridge, first EVT revision
      { usbVendorId: 0x1234, usbProductId: 0x5678 },
      // Nabu Casa ESP bridge, uses Espressif VID/PID
      { usbVendorId: 0x303a, usbProductId: 0x4001 },
    ],
  });

  await port.open({ baudRate: 115200 });

  const serialBinding = createWebSerialPortFactory(port);

  window.port = port;
  window.serialBinding = serialBinding;

  return { port, serialBinding };
}

function App({ esbuild }: AppProps) {
  const [code, setCode] = useState(
    `
import { Driver } from "zwave-js";

const driver = new Driver(
    // Tell the driver which serial port to use
    "/dev/serial/by-id/my-usb-port",
    // and configure options like security keys
    {
        securityKeys: {
            S0_Legacy: Bytes.from("0102030405060708090a0b0c0d0e0f10", "hex"),
            S2_Unauthenticated: Bytes.from(
                "11111111111111111111111111111111",
                "hex",
            ),
            S2_AccessControl: Bytes.from(
                "22222222222222222222222222222222",
                "hex",
            ),
            S2_Authenticated: Bytes.from(
                "33333333333333333333333333333333",
                "hex",
            ),
        },
        securityKeysLongRange: {
            S2_Authenticated: Bytes.from(
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "hex",
            ),
            S2_AccessControl: Bytes.from(
                "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
                "hex",
            ),
        },
    },
);

// Listen for the driver ready event before doing anything with the driver
driver.once("driver ready", () => {
    console.log("Driver is ready");
});

// Start the driver
await driver.start();
`.trim()
  );

  const handleRunClick = async () => {
    try {
      // Plugin zum Patchen von Importen
      const patchImportsPlugin = {
        name: "patch-imports",
        setup(build: any) {
          build.onResolve({ filter: /.*/ }, async (args: any) => {
            if (external.includes(args.path)) {
              return { external: true };
            }
          });

          // build.onLoad(
          //   { filter: /.*/, namespace: "http-url" },
          //   async (args: any) => {
          //     const response = await fetch(args.path);
          //     const text = await response.text();
          //     return { contents: text, loader: "ts" };
          //   }
          // );
        },
      };

      // Build den Code mit dem Plugin
      const result = await esbuild.build({
        bundle: true,
        write: false,
        outdir: "out",
        format: "esm",
        platform: "browser",
        plugins: [patchImportsPlugin],
        stdin: {
          contents: code,
          resolveDir: "/",
          sourcefile: "input.ts",
          loader: "ts",
        },
      });

      // Code in Blob konvertieren und als Modul ausführen
      const blob = new Blob([result.outputFiles[0].text], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);

      // JSON-Logic has a test for `define` which breaks how the esbuild bundle is executed
      const originalDefine = window.define;
      window.define = undefined;

      // @ts-expect-error
      window.Bytes ??= (await import("@zwave-js/shared")).Bytes;

      // Ensure the script has access to the serial port
      if (!window.port || !window.serialBinding) {
        await getPort();
      }

      try {
        /* @vite-ignore */
        await import(url);
      } finally {
        URL.revokeObjectURL(url);
        window.define = originalDefine;
      }
    } catch (error) {
      alert(error.message + "\n" + error.stack);
      console.error(error);
    }
  };

  return (
    <div>
      <Editor
        height="600px"
        theme="vs-dark"
        defaultLanguage="typescript"
        defaultValue={code}
        onChange={(value) => setCode(value || "")}
      />

      <button id="run" onClick={handleRunClick}>
        Run
      </button>

      <pre id="output"></pre>
    </div>
  );
}

export default App;
