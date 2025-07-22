import { loadToolchain } from './toolchain';
import { loadPyodide } from './pyodide';
import { Terminal } from './terminal';
// @ts-expect-error
import shell from './shell.py';

const HOME_DIRECTORY = "/root";
const MOUNT_DIRECTORY = "/mnt";

declare global {
    function syncFSFromBacking(): Promise<void>;
    function syncFSToBacking(): Promise<void>;
}

(async () => {
    const xtermContainer = <HTMLDivElement>document.getElementById('terminal');
    if (typeof WebAssembly !== "object") {
        xtermContainer.innerText = 'WebAssembly is required but not available.';
        return;
    // @ts-expect-error
    } else if (typeof WebAssembly.promising !== "function") {
        xtermContainer.innerText = 'WebAssembly JSPI is required but not available.';
        return;
    } else if (typeof navigator.usb !== "object") {
        xtermContainer.innerText = 'WebUSB is required but not available.';
        return;
    } else {
        xtermContainer.innerText = '';
    }

    const xterm = new Terminal(xtermContainer);
    xterm.focus();

    xterm.write(new TextEncoder().encode('Loading toolchain...\n'));
    await loadToolchain();

    xterm.write(new TextEncoder().encode('Loading Python...\n'));
    const pyodide = await loadPyodide({
        env: { HOME: HOME_DIRECTORY },
    });

    const interruptBuffer = new Uint8Array(new ArrayBuffer(1));
    pyodide.setInterruptBuffer(interruptBuffer);
    xterm.onInterrupt(() => interruptBuffer[0] = 2);

    const conoutHandler = {
        write(buf: Uint8Array) {
            xterm.write(buf);
            return buf.length;
        },
        isatty: true
    };
    pyodide.setStdout(conoutHandler);
    pyodide.setStderr(conoutHandler);

    pyodide.FS.closeStream(0);
    pyodide.FS.unlink("/dev/stdin");
    // @ts-expect-error
    pyodide.FS.createAsyncInputDevice("/dev", "stdin", () => xterm.read());
    const stdinStream = pyodide.FS.open("/dev/stdin", "r");
    // @ts-expect-error
    if (stdinStream.fd !== 0) throw "stdin fd not zero";
    // broken:
    // stdinStream.tty = { ops: {} };

    globalThis.syncFSFromBacking = async () => {
        pyodide.FS.syncfs(true, (error) => {
            if (error !== null) {
                console.log('[FS Error]', error);
            }
        });
    };

    globalThis.syncFSToBacking = async () => {
        pyodide.FS.syncfs(false, (error) => {
            if (error !== null) {
                console.log('[FS Error]', error);
            }
        });
    };

    pyodide.FS.mkdirTree(HOME_DIRECTORY);
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, { autoPersist: true }, HOME_DIRECTORY);
    syncFSFromBacking();

    let isNativeFSMounted = false;
    const toggleNativeFSMountButton = <HTMLButtonElement>document.getElementById('mountNativeFS');

    toggleNativeFSMountButton.onclick = async (event: PointerEvent) => {
        event.preventDefault();
        toggleNativeFSMountButton.disabled = true;

        if (isNativeFSMounted) {
            // Native FS is mounted, so handle unmounting

            // @ts-expect-error
            pyodide.FS.unmount(MOUNT_DIRECTORY);
            pyodide.FS.rmdir(MOUNT_DIRECTORY);
            isNativeFSMounted = false;
        } else {
            // Native FS is unmounted, so select a directory and mount it
            try {
                const fileSystemHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                pyodide.FS.mkdirTree(MOUNT_DIRECTORY);
                pyodide.FS.mount(pyodide.FS.filesystems.NATIVEFS_ASYNC, {
                    fileSystemHandle,
                    autoPersist: true
                }, MOUNT_DIRECTORY);
                syncFSFromBacking();

                isNativeFSMounted = true;
            } catch (error) {
                console.info("Got error while mounting native FS", error);
            }
        }

        // Update the button based on if the filesystem is now mounted
        toggleNativeFSMountButton.disabled = false;
        toggleNativeFSMountButton.innerText = isNativeFSMounted ? "Unmount /mnt" : "Mount /mnt";
    };

    xterm.write(new TextEncoder().encode('Loading dependencies...\n'));
    await pyodide.loadPackage([
        './whl/micropip-0.10.0-py3-none-any.whl',
        './whl/markupsafe-3.0.2-cp313-cp313-pyodide_2025_0_wasm32.whl',
        './whl/cobs-1.2.1-cp313-cp313-pyodide_2025_0_wasm32.whl',
    ]);

    xterm.write(new TextEncoder().encode('Loading Glasgow software...\n'));
    await pyodide.runPythonAsync(String.raw`
        import micropip
        await micropip.install('./whl/glasgow-0.1-py3-none-any.whl')

        #from _pyrepl.main import interactive_console
        #interactive_console()
    `);

    await pyodide.runPythonAsync(shell);
})();
