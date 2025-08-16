import * as Comlink from 'comlink';
import type { loadPyodide } from '../vendor/pyodide';

import type { GlasgowFileSystem } from '../filesystem';

export class InputOutputMethods {
    private [Comlink.proxyMarker] = true;

    read: () => Promise<Uint8Array>;
    write: (buf: Uint8Array) => number;
    terminalColumns: () => number;

    constructor(methods: { [key in keyof InputOutputMethods]: InputOutputMethods[key] }) {
        this.read = methods.read;
        this.write = methods.write;
        this.terminalColumns = methods.terminalColumns;
    }
}

export interface GlasgowControllerInterface {
    handleUSBRequestDevice(callback: (options?: USBDeviceRequestOptions) => Promise<void>): void;

    getFileSystem(): GlasgowFileSystem;

    setupInputOutput(methods: InstanceType<typeof InputOutputMethods>): void;

    onExecutionStart(callback: () => void): void;

    onExecutionEnd(callback: () => void): void;

    interrupt(): void;

    install(wheelURL: string): Promise<void>;

    runPythonAsync(code: string): Promise<unknown>;
}

export interface ExposedMethods {
    loadToolchain(): Promise<void>;

    createController(...args: Parameters<typeof loadPyodide>): Promise<GlasgowControllerInterface>;
}
