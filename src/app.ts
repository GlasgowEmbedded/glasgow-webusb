import { loadToolchain } from './toolchain';
import { loadPyodide } from './pyodide';
import { Terminal } from './terminal';

const xterm = new Terminal(<HTMLDivElement>document.getElementById('terminal'));
xterm.focus();

const homeDirectory = "/root";
(async () => {
    xterm.write(new TextEncoder().encode('Loading toolchain...\n'));
    await loadToolchain();

    xterm.write(new TextEncoder().encode('Loading Python...\n'));
    const pyodide = await loadPyodide({
        env: { HOME: homeDirectory },
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

    pyodide.FS.mkdirTree(homeDirectory);
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, { autoPersist: true }, homeDirectory);
    pyodide.FS.syncfs(true, (error) => {
        if (error !== null) {
            console.log('[IDBFS Error]', error);
        }
    });

    xterm.write(new TextEncoder().encode('Loading packages...\n'));
    await pyodide.loadPackage([
        './whl/micropip-0.10.0-py3-none-any.whl',
        './whl/markupsafe-3.0.2-cp313-cp313-pyodide_2025_0_wasm32.whl',
        './whl/cobs-1.2.1-cp313-cp313-pyodide_2025_0_wasm32.whl',
    ]);

    await pyodide.runPythonAsync(String.raw`
        import micropip
        await micropip.install('./whl/glasgow-0.1-py3-none-any.whl')

        #from _pyrepl.main import interactive_console
        #interactive_console()

        import sys
        import asyncio
        import shlex
        from glasgow.cli import main

        while True:
            try:
                command = input("\n> glasgow ")
                sys.argv = ["glasgow", *shlex.split(command)]
                asyncio.new_event_loop().run_until_complete(main())
            except Exception as exn:
                import sys, traceback
                print(f"\x1b[1;31m{''.join(traceback.format_exception(exn))}\x1b[0m", file=sys.stderr, end="")
            except SystemExit:
                pass
    `);
})();
