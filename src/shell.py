import js
import os
import sys
import shlex
import asyncio
import traceback
from pyodide.ffi import to_js
from glasgow.cli import main


failures = 0
while failures < 3:
    try:
        interrupt_fut = asyncio.get_event_loop().create_future()
        js.setInterruptFuture(to_js(interrupt_fut))
        command = input("\n> glasgow ")
        sys.argv = ["glasgow", *shlex.split(command)]
        os.environ["COLUMNS"] = str(await js.terminalColumns())
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
        print()
    except BaseException as exn:
        print(f"\n\x1b[1;31m{''.join(traceback.format_exception(exn))}\x1b[0m", file=sys.stderr, end="")
        failures += 1

print(f"\nToo many errors, giving up.", file=sys.stderr)
