import "../global.d.ts";
import { Driver as OriginalDriver } from "zwave-js";
import { db } from "@zwave-js/bindings-browser/db";
import { fs } from "@zwave-js/bindings-browser/fs";
import { log as createLogContainer } from "@zwave-js/core/bindings/log/browser";

// For using the driver in a browser context, we need to pass custom bindings
const Driver = new Proxy(OriginalDriver, {
  construct(target, args: any[]) {
    if (!window.port || !window.port.open) {
      throw new Error("The serial port is not open");
    }
    if (!window.serialBinding) {
      throw new Error("The custom serial port binding has not been created");
    }

    const options = args[1] ?? {};
    // Define browser-specific bindings
    options.host ??= {};
    Object.assign(options.host, {
      fs,
      db,
      log: createLogContainer,
      serial: {
        // no listing, no creating by path!
      },
    });

    return new target(
      // Ignore any specified paths
      window.serialBinding,
      // Use the patched options object
      options,
      // Pass anything else through
      ...args.slice(2)
    );
  },
});

export * from "zwave-js";
export { Driver };
