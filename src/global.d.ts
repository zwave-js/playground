interface Window {
  define?: Function;
  port?: SerialPort;
  serialBinding?: ZWaveSerialBindingFactory;
  Bytes: (typeof import("@zwave-js/shared").Bytes);
  Buffer: (typeof import("@zwave-js/shared").Bytes);
}