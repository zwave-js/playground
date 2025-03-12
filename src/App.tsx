import "./global.d.ts";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import Editor, { OnChange, OnMount } from "@monaco-editor/react";
import { createWebSerialPortFactory } from "@zwave-js/bindings-browser/serial";
import "./setimmediate.js";
import { setupTypeAcquisition } from "@typescript/ata";
import defaultCode from "./assets/default.ts?raw";
import LinkIcon from "@heroicons/react/16/solid/LinkIcon";
import LinkSlashIcon from "@heroicons/react/16/solid/LinkSlashIcon";
import PlayIcon from "@heroicons/react/16/solid/PlayIcon";
import StopIcon from "@heroicons/react/16/solid/StopIcon";
import ansi from "ansicolor";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as Window } from "react-window";
import throttle from "lodash/throttle";
import LZString from "lz-string";
import ArrowUpOnSquareIcon from "@heroicons/react/24/outline/ArrowUpOnSquareIcon";
import CommandLineIcon from "@heroicons/react/24/outline/CommandLineIcon";
import CodeBracketSquareIcon from "@heroicons/react/24/outline/CodeBracketSquareIcon";
import ArrowTopRightOnSquareIcon from "@heroicons/react/24/outline/ArrowTopRightOnSquareIcon";

// FIXME: There should be a way to reuse the TS instance from the editor
import ts from "typescript";
import { Header } from "./Header.tsx";

interface AppProps {
  esbuild: typeof import("esbuild-wasm");
  showShareButton?: boolean;
  showOpenInNewWindowButton?: boolean;
  showEmbedButton?: boolean;
  showHeader?: boolean;
  defaultLogsVisible?: boolean;
}

ansi.rgb.blue = [36, 114, 200];
ansi.rgb.cyan = [17, 168, 205];
ansi.rgb.green = [13, 188, 121];
const lineHeight = 18;

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

function getDefaultCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get("code");
  if (codeParam) {
    return LZString.decompressFromEncodedURIComponent(codeParam);
  } else {
    return defaultCode;
  }
}

function formatLog(log: string) {
  const pseudoHtml = ansi.parse(log).spans;
  const spans = pseudoHtml.map((span) => {
    return `<span style="${span.css.replace(
      /^background:/,
      "color:#1e1e1e;background:"
    )}">${span.text}</span>`;
  });
  return spans.join("");
}

function getErrorMessage(e: Error): string {
  let ret = e.valueOf() as string;
  if (e.stack) {
    ret += e.stack.slice(e.stack.indexOf("\n"));
  }
  return ret;
}

function App({
  esbuild,
  showShareButton,
  showOpenInNewWindowButton,
  showEmbedButton,
  defaultLogsVisible,
  showHeader,
}: AppProps) {
  const [code, setCode] = useState(getDefaultCode().trim());
  const [hasPort, setHasPort] = useState(!!window.port);
  const [isRunning, setIsRunning] = useState(false);

  const ataRef = useRef<ReturnType<typeof setupTypeAcquisition>>(null);
  const debounceTimeoutRef = useRef<number | null>(null);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const windowRef = useRef<Window>(null);

  const [logsVisible, setLogsVisible] = useState(defaultLogsVisible ?? true);

  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (log: string) => {
    setLogs((logs) => {
      return [...logs, log];
    });
  };
  const getLogHeight = (index: number) => {
    return logs[index].split("\n").length * lineHeight;
  };

  function renderLog({ index, style }) {
    const log = logs[index];

    return <pre style={style} dangerouslySetInnerHTML={{ __html: log }}></pre>;
  }

  const [autoScroll, setAutoScroll] = useState(true);
  const scrollToBottom = throttle(
    () => {
      // FIXME: Figure out why this scrolls to the item before the last one
      windowRef.current?.scrollToItem(logs.length - 1, "end");
    },
    100,
    {
      leading: true,
      trailing: true,
    }
  );
  useEffect(() => {
    if (autoScroll && logs.length > 0) {
      scrollToBottom();
    }
  }, [logs.length, autoScroll, scrollToBottom]);

  async function getPort(): Promise<void> {
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
    window.port = port;

    setHasPort(true);
  }

  async function disconnect(): Promise<void> {
    if (!window.port) return;
    await window.port.close();
    window.port = undefined;
    setHasPort(false);
  }

  async function ensureBinding(): Promise<void> {
    const serialBinding = createWebSerialPortFactory(window.port!);
    window.serialBinding = serialBinding;
  }

  const onGlobalError = ({ error }: ErrorEvent) => {
    addLog(formatLog(ansi.red(getErrorMessage(error))));
  };

  const onUnhandledRejection = ({ reason }: PromiseRejectionEvent) => {
    if (reason instanceof Error) {
      addLog(formatLog(ansi.red(getErrorMessage(reason))));
    } else {
      addLog(formatLog(ansi.red(String(reason))));
    }
  };

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
      if (!window.port) await getPort();
      if (!window.serialBinding) {
        await ensureBinding();
      }

      window.Bytes ??= (await import("@zwave-js/shared")).Bytes;
      window.Buffer = window.Bytes;

      if (!window.originalConsole) {
        window.originalConsole = console;
        window.console = Object.assign({}, window.originalConsole, {
          log: (...args: any[]) => {
            addLog(formatLog(args[0]));
          },
          warn: (...args: any[]) => {
            addLog(formatLog(args[0]));
          },
          error: (...args: any[]) => {
            addLog(formatLog(args[0]));
          },
        });
      }

      setLogs([]);
      windowRef.current?.resetAfterIndex(0);

      window.addEventListener("error", onGlobalError);
      window.addEventListener("unhandledrejection", onUnhandledRejection);

      try {
        await import(/* @vite-ignore */ url);
        setIsRunning(true);
      } finally {
        URL.revokeObjectURL(url);
        window.define = originalDefine;
      }
    } catch (error: any) {
      alert(error.message + "\n" + error.stack);
      console.error(error);
      window.removeEventListener("error", onGlobalError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
  };

  const handleStopClick = async () => {
    if (window.drivers) {
      for (const driver of window.drivers) {
        try {
          await driver.destroy();
        } catch (e) {
          console.error(e);
        }
      }
    }
    window.drivers = [];

    setIsRunning(false);
  };

  // Resize the editor when the window is resized
  useEffect(() => {
    window.addEventListener("resize", resizeEditor);
    return () => {
      window.removeEventListener("resize", resizeEditor);
    };
  }, []);

  const resizeEditor = () => {
    if (!editorRef.current) return;
    // Set the editor to a small size, then immediately let it find the correct size
    // Otherwise it won't shrink
    editorRef.current.layout({ width: 100, height: 100 }, true);
    editorRef.current.layout(undefined, true);
  };

  useEffect(() => {
    resizeEditor();
  }, [logsVisible]);

  const handleEditorDidMount: OnMount = async (editor, monaco) => {
    editorRef.current = editor;

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
          (window.originalConsole ?? console).warn(
            "filtered request for ",
            input
          );
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
              version: "15.0.0",
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

  const shareCode = (code: string) => {
    const compressedCode = LZString.compressToEncodedURIComponent(code || "");
    const newUrl = `${window.location.origin}${window.location.pathname}?code=${compressedCode}`;
    window.history.replaceState(null, "", newUrl);

    navigator.clipboard.writeText(newUrl);
    alert("URL copied to clipboard");
  };

  const copyEmbedURL = (code: string) => {
    const compressedCode = LZString.compressToEncodedURIComponent(code || "");
    const newUrl = `${window.location.origin}${window.location.pathname}?embed&code=${compressedCode}`;

    navigator.clipboard.writeText(newUrl);
    alert("Embed URL copied to clipboard");
  };

  const openInNewWindow = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("embed");
    window.open(url.toString(), "_blank");
  };

  return (
    <>
      {showHeader && <Header />}
      <div className="toolbar">
        {!isRunning && (
          <button id="run" onClick={handleRunClick}>
            <span>Run</span>
            <PlayIcon style={{ width: "16px" }} />
          </button>
        )}
        {isRunning && (
          <button id="stop" onClick={handleStopClick}>
            <span>Stop</span>
            <StopIcon style={{ width: "16px" }} />
          </button>
        )}

        {hasPort ? (
          <button
            className="icon-button"
            id="disconnect"
            onClick={disconnect}
            title="Connected"
            disabled={isRunning}
          >
            <LinkIcon
              style={{
                width: "20px",
                color: "darkgreen",
              }}
            />
          </button>
        ) : (
          <button
            className="icon-button"
            id="connect"
            onClick={getPort}
            title="Not connected"
            disabled={isRunning}
          >
            <LinkSlashIcon
              style={{
                width: "20px",
                // color: "darkred",
              }}
            />
          </button>
        )}

        <button
          className="icon-button"
          id="toggle-logs"
          title={logsVisible ? "Hide logs" : "Show logs"}
          onClick={() => setLogsVisible((val) => !val)}
        >
          <CommandLineIcon
            style={{
              width: "20px",
              color: logsVisible ? "lightgreen" : "inherit",
            }}
          />
          {!logsVisible && logs.length > 0 && <span className="badge"></span>}
        </button>

        {showShareButton && (
          <button
            className="icon-button"
            title="Share"
            onClick={() => shareCode(code)}
          >
            <ArrowUpOnSquareIcon
              style={{
                width: "20px",
              }}
            />
          </button>
        )}

        {showEmbedButton && (
          <button
            className="icon-button"
            title="Copy embed URL"
            onClick={() => copyEmbedURL(code)}
          >
            <CodeBracketSquareIcon
              style={{
                width: "20px",
              }}
            />
          </button>
        )}

        {showOpenInNewWindowButton && (
          <button
            className="icon-button"
            title="Open in new window"
            onClick={openInNewWindow}
          >
            <ArrowTopRightOnSquareIcon
              style={{
                width: "20px",
              }}
            />
          </button>
        )}
      </div>
      <Editor
        theme="vs-dark"
        defaultLanguage="typescript"
        defaultValue={code}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        defaultPath="script.ts"
        path="script.ts"
        width="100%"
        height="inherit"
      />
      <code id="output" style={{ display: logsVisible ? "block" : "none" }}>
        <AutoSizer>
          {({ height, width }) => (
            <Window
              itemCount={logs.length}
              itemSize={getLogHeight}
              width={width}
              height={height}
              ref={windowRef}
            >
              {renderLog}
            </Window>
          )}
        </AutoSizer>
      </code>
    </>
  );
}

export default App;
