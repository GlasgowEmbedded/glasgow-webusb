import js
import os
import sys
import shlex
import asyncio
import traceback
import contextlib
import platformdirs
from pyodide.ffi import to_js
from glasgow.cli import main
from _pyrepl import readline, unix_console


@contextlib.contextmanager
def readline_reader(reader):
    old_reader = readline._wrapper.reader
    readline._wrapper.reader = reader
    try:
        yield
    finally:
        readline._wrapper.reader = old_reader


console = unix_console.UnixConsole(sys.stdin.fileno(), sys.stdout.fileno(), encoding=sys.getdefaultencoding())
reader = readline.ReadlineAlikeReader(console=console, config=readline.ReadlineConfig())
reader.can_colorize = False
reader.ps1 = "> glasgow "

state_path = platformdirs.user_state_path("GlasgowEmbedded", appauthor=False, ensure_exists=True)
history_filename = state_path / "shell-history"
try:
    with readline_reader(reader):
        readline.read_history_file(history_filename)
except FileNotFoundError:
    pass

failures = 0
while failures < 3:
    try:
        interrupt_fut = asyncio.get_event_loop().create_future()
        js.setInterruptFuture(to_js(interrupt_fut))
        command = reader.readline()
        with readline_reader(reader):
            readline.append_history_file(history_filename)
        sys.argv = ["glasgow", *shlex.split(command)]
        os.environ["GLASGOW_COLORS"] = "TRACE=37:INFO=1;37"
        await js.syncFSFromBacking()
        js.signalExecutionStart()
        try:
            async def run_main():
                await main()
                if not interrupt_fut.done():
                    interrupt_fut.cancel()
            async def wait_for_interrupt():
                return await interrupt_fut
            async with asyncio.TaskGroup() as group:
                group.create_task(run_main())
                group.create_task(wait_for_interrupt())
        finally:
            js.signalExecutionEnd()
            await js.syncFSToBacking()
        failures = 0
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    except BaseException as exn:
        print(f"\n\x1b[1;31m{''.join(traceback.format_exception(exn))}\x1b[0m", file=sys.stderr, end="")
        failures += 1
    print()

print(f"\nToo many errors, giving up.", file=sys.stderr)
