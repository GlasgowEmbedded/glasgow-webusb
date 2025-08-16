import * as Comlink from 'comlink';
import '../comlink-transfer-handlers';
import cloneDeepWith from 'lodash/cloneDeepWith';
import { loadPyodide, type PyodideAPI, type PyProxy } from '../vendor/pyodide';

import { loadToolchain } from '../toolchain';
import { GlasgowFileSystem } from '../filesystem';

import type { ExposedMethods, GlasgowControllerInterface } from './proto';

declare global {
    function terminalColumns(): Promise<number>;

    function syncFSFromBacking(): Promise<void>;
    function syncFSToBacking(): Promise<void>;

    function signalExecutionStart(): void;
    function signalExecutionEnd(): void;
    function setInterruptFuture(future: any): void;
}

let interruptFuture: PyProxy | undefined;
globalThis.setInterruptFuture = (future) => {
    interruptFuture = future;
};

async function createController(...args: Parameters<typeof loadPyodide>) {
    const pyodide = await loadPyodide(...args);
    const controller = new GlasgowController(pyodide);

    // For easier debugging
    Object.assign(globalThis, { controller });

    return Comlink.proxy(controller);
}

class GlasgowController implements GlasgowControllerInterface {
    #pyodide: PyodideAPI;
    #filesystem: GlasgowFileSystem;
    #interruptBuffer: Uint8Array;
    #micropipLoaded = false;

    constructor(pyodide: PyodideAPI) {
        this.#pyodide = pyodide;
        this.#filesystem = new GlasgowFileSystem({ pyodide });

        this.#interruptBuffer = new Uint8Array(new SharedArrayBuffer(1));
        pyodide.setInterruptBuffer(this.#interruptBuffer);

        globalThis.syncFSFromBacking = () => {
            return this.#filesystem.syncFSFromBacking();
        };

        globalThis.syncFSToBacking = () => {
            return this.#filesystem.syncFSToBacking();
        };
    }

    handleUSBRequestDevice(callback: (options?: USBDeviceRequestOptions) => Promise<void>) {
        Object.defineProperty(navigator.usb, 'requestDevice', {
            get: () => async (...args: Parameters<USB['requestDevice']>) => {
                const cloner = (value: unknown) => {
                    if (value instanceof this.#pyodide.ffi.PyProxy) {
                        return value.toJs({
                            create_pyproxies: false,
                            dict_converter: Object.fromEntries,
                        });
                    }
                };

                const newArgs: Parameters<USB['requestDevice']> = cloneDeepWith(args, cloner);
                await callback(...newArgs);

                let devices = await navigator.usb.getDevices();
                const [options] = newArgs;
                if (options?.filters?.length) {
                    const { filters } = options;
                    devices = devices.filter((device) => filters.some((filter) => {
                        if (filter.vendorId !== undefined && device.vendorId !== filter.vendorId) return false;
                        if (filter.productId !== undefined && device.productId !== filter.productId) return false;
                        if (filter.classCode !== undefined && device.deviceClass !== filter.classCode) return false;
                        if (filter.subclassCode !== undefined && device.deviceSubclass !== filter.subclassCode) return false;
                        if (filter.protocolCode !== undefined && device.deviceProtocol !== filter.protocolCode) return false;
                        if (filter.serialNumber !== undefined && device.serialNumber !== filter.serialNumber) return false;
                        return true;
                    }));
                }
                if (!devices[0]) {
                    throw new Error('Requested USB device not found (most likely programmer error)');
                }
                return devices[0];
            },
        });
    }

    getFileSystem() {
        return Comlink.proxy(this.#filesystem);
    }

    setupInputOutput(methods: {
        read: () => Promise<Uint8Array>;
        write: (buf: Uint8Array) => number;
        terminalColumns: () => number;
    }) {
        const { read, write, terminalColumns } = methods as unknown as Comlink.Remote<typeof methods>;

        const conoutHandler = {
            write(buf: Uint8Array) {
                write(buf);
                return buf.length;
            },
            isatty: true
        };
        this.#pyodide.setStdout(conoutHandler);
        this.#pyodide.setStderr(conoutHandler);

        this.#pyodide.FS.closeStream(0);
        this.#pyodide.FS.unlink("/dev/stdin");
        this.#pyodide.FS.createAsyncInputDevice("/dev", "stdin", read);
        const stdinStream = this.#pyodide.FS.open("/dev/stdin", "r");
        if (stdinStream.fd !== 0) throw "stdin fd not zero";
        // broken:
        // stdinStream.tty = { ops: {} };

        globalThis.terminalColumns = () => {
            return terminalColumns();
        };
    }

    onExecutionStart(callback: () => void) {
        const remoteCallback = callback as Comlink.Remote<typeof callback>;

        globalThis.signalExecutionStart = () => {
            remoteCallback();
        };
    }

    onExecutionEnd(callback: () => void) {
        const remoteCallback = callback as Comlink.Remote<typeof callback>;

        globalThis.signalExecutionEnd = () => {
            remoteCallback();
        };
    }

    interrupt() {
        const pyKeyboardInterrupt = this.#pyodide.globals.get("KeyboardInterrupt");
        if (interruptFuture !== undefined && !interruptFuture.done()) {
            // raise `KeyboardInterrupt` exception within Python webloop on next iteration;
            // this will interrupt async I/O (but not stdin reads or long running computations).
            interruptFuture.set_exception(pyKeyboardInterrupt());
        } else {
            // raise SIGINT signal within Python interpreter on next PyErr_CheckSignals() call;
            // this will interrupt long running computations (but not async I/O or stdin reads)
            this.#interruptBuffer[0] = 2;
        }
    }

    async install(wheelURL: string) {
        if (!this.#micropipLoaded) {
            await this.#pyodide.loadPackage(['micropip']);
        }
        const micropip = await this.#pyodide.pyimport('micropip');
        await micropip.install(wheelURL);
    }

    runPythonAsync(code: string) {
        return this.#pyodide.runPythonAsync(code);
    }
}

Comlink.expose({
    loadToolchain,
    createController,
} satisfies ExposedMethods);
