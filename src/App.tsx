import "./global.d.ts";
import { useRef, useState } from "react";
import "./App.css";
import Editor, { OnChange, OnMount } from "@monaco-editor/react";
import { type ZWaveSerialBindingFactory } from "@zwave-js/serial";
import { createWebSerialPortFactory } from "@zwave-js/bindings-browser/serial";
import "./setimmediate.js";
import { setupTypeAcquisition } from "@typescript/ata";
import defaultCode from "./assets/default.ts?raw";

// FIXME: There should be a way to reuse the TS instance from the editor
import ts from "typescript";

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

const typesFilter = [
  "zwave-js",
  "@zwave-js/shared",
  "@zwave-js/core",
  "@zwave-js/cc",
  "@zwave-js/config",
  "@zwave-js/nvmedit",
  "@zwave-js/serial",
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
  const [code, setCode] = useState(defaultCode.trim());

  const ataRef = useRef<ReturnType<typeof setupTypeAcquisition>>(null);
  const debounceTimeoutRef = useRef<number | null>(null);

  const handleRunClick = async () => {
    try {
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

      const actualCode = `
const Buffer = (await import("@zwave-js/shared")).Bytes;
${result.outputFiles[0].text}
`;

      // Code in Blob konvertieren und als Modul ausführen
      const blob = new Blob([actualCode], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);

      // JSON-Logic has a test for `define` which breaks how the esbuild bundle is executed
      const originalDefine = window.define;
      window.define = undefined;

      // Ensure the script has access to the serial port
      if (!window.port || !window.serialBinding) {
        await getPort();
      }

      window.Bytes ??= (await import("@zwave-js/shared")).Bytes;
      window.Buffer = window.Bytes;

      try {
        await import(/* @vite-ignore */ url);
      } finally {
        URL.revokeObjectURL(url);
        window.define = originalDefine;
      }
    } catch (error: any) {
      alert(error.message + "\n" + error.stack);
      console.error(error);
    }
  };

  const handleEditorDidMount: OnMount = async (editor, monaco) => {
    const defaults = monaco.languages.typescript.typescriptDefaults;

    defaults.setCompilerOptions({
      module: monaco.languages.typescript.ModuleKind.ESNext,
      target: monaco.languages.typescript.ScriptTarget.ESNext,
    });

    // Bytes/Buffer are globally available
    defaults.addExtraLib(
      `
declare const Bytes: typeof import("@zwave-js/shared").Bytes;
declare const Buffer: typeof Bytes;
`,
      "playground_global.d.ts"
    );

    // For some reason, simply loading the type definitions does not work, so we set up tsconfig paths instead
    const entrypoints = new Map<string, string>();

    ataRef.current = setupTypeAcquisition({
      projectName: "Z-Wave JS Playground",
      typescript: ts,
      logger: console,
      async fetcher(input: string, init) {
        // Filter out requests for external modules
        const moduleName = /\/npm\/(.+?)@/.exec(input)?.[1];
        if (!moduleName || !typesFilter.includes(moduleName)) {
          console.warn("filtered request for ", input);
          return new Response(null, {
            status: 404,
            statusText: "Not Found",
          });
        }

        // Modify the /resolve JSDelivr API response to return the embedded version for our packages
        if (
          input.includes("/resolve/npm/") &&
          (input.includes("/zwave-js") || input.includes("/@zwave-js")) &&
          input.endsWith("@latest")
        ) {
          return new Response(
            JSON.stringify({
              version: "14.3.8-0-pr-7581-401b2ca",
            })
          );
        }

        // Modify the /flat JSDelivr API response to omit CommonJS files
        if (input.endsWith("/flat")) {
          const response = await fetch(input, init);
          const flat = await response.json();
          flat.files = flat.files.filter(
            (file: any) => !file.name.includes("/build/cjs/")
          );
          return new Response(JSON.stringify(flat));
        }

        return fetch(input, init);
      },
      delegate: {
        receivedFile: (code: string, path: string) => {
          // Monaco editor has no support for package.json exports, so we fake the resolution ourselves
          if (path.endsWith("package.json")) {
            const packageJson = JSON.parse(code);
            if (
              typeof packageJson.exports === "object" &&
              packageJson.exports["."] &&
              !packageJson.types
            ) {
              for (const [key, exprt] of Object.entries(packageJson.exports)) {
                if (typeof exprt !== "object" || exprt === null) continue;
                if (!key.startsWith(".")) continue;

                // Remember which files are an entrypoint to a module
                for (const [mode, subpath] of Object.entries(exprt)) {
                  if (
                    mode === "browser" ||
                    mode === "import" ||
                    mode === "default"
                  ) {
                    entrypoints.set(
                      `/node_modules/${(subpath as string).replace(
                        /^\./,
                        packageJson.name
                      )}`.replace(/\.js$/, ".d.ts"),
                      key.replace(/^\./, packageJson.name)
                    );
                    break;
                  }
                }
              }
            }
            // No need to add the package.json to the VFS
            return;
          }

          const addLib = (code: string, path: string) => {
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
              code,
              path
            );
            // Creating the models allows goto definition,
            // but this also causes the editor to throw "leak" warnings
            // const uri = monaco.Uri.file(path);
            // if (monaco.editor.getModel(uri) === null) {
            //   monaco.editor.createModel(code, "javascript", uri);
            // }
          };

          addLib(code, path);
        },
        // started: () => {
        //   console.log("ATA start");
        // },
        // progress: (downloaded: number, total: number) => {
        //   console.log(`Got ${downloaded} out of ${total}`);
        // },
        finished: (vfs) => {
          // console.log("ATA done");

          // Update the compiler options with the new paths
          const compilerOptions = defaults.getCompilerOptions();
          for (const [path, mod] of entrypoints) {
            compilerOptions.paths ??= {};
            compilerOptions.paths[mod] = [path];
          }
          defaults.setCompilerOptions(compilerOptions);
        },
      },
    });

    // No matter the code, we always need to import the shared package for `Bytes/Buffer` to be globally available
    await ataRef.current(`import "@zwave-js/shared"`);
    await ataRef.current(code);
  };

  const handleEditorChange: OnChange = (value) => {
    setCode(value || "");

    // Perform type acquisition, but make sure it does not happen too often
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(async () => {
      await ataRef.current?.(code);
    }, 2500);
  };

  return (
    <div>
      <Editor
        height="600px"
        theme="vs-dark"
        defaultLanguage="typescript"
        defaultValue={code}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        defaultPath="script.ts"
        path="script.ts"
      />

      <button id="run" onClick={handleRunClick}>
        Run
      </button>

      <pre id="output"></pre>
    </div>
  );
}

export default App;
