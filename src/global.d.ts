interface Window {
  define?: Function;
  port?: SerialPort;
  serialBinding?: ZWaveSerialBindingFactory;
  Bytes: (typeof import("@zwave-js/shared").Bytes);
  Buffer: (typeof import("@zwave-js/shared").Bytes);
  originalConsole: Console;
  drivers?: (import("zwave-js").Driver)[];
}