import { Driver } from "zwave-js";

const driver = new Driver(
    // Tell the driver which serial port to use
    "/dev/serial/by-id/my-usb-port",
    // and configure options like security keys
    {
        securityKeys: {
            S0_Legacy: Bytes.from("0102030405060708090a0b0c0d0e0f10", "hex"),
            S2_Unauthenticated: Bytes.from("11111111111111111111111111111111", "hex"),
            S2_AccessControl: Bytes.from("22222222222222222222222222222222", "hex"),
            S2_Authenticated: Bytes.from("33333333333333333333333333333333", "hex"),
        },
        securityKeysLongRange: {
            S2_Authenticated: Bytes.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "hex"),
            S2_AccessControl: Bytes.from("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "hex"),
        },
    },
);

// Listen for the driver ready event before doing anything with the driver
driver.once("driver ready", () => {
    console.log("Driver is ready");
});

// Start the driver
await driver.start();