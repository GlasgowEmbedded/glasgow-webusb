import js
import sys
import shlex
import asyncio
from glasgow.cli import main

failures = 0
while failures < 3:
    try:
        command = input("\n> glasgow ")
        sys.argv = ["glasgow", *shlex.split(command)]
        await js.syncFSFromBacking()
        js.signalExecutionStart()
        try:
            await asyncio.create_task(main())
        finally:
            js.signalExecutionEnd()
            await js.syncFSToBacking()
        failures = 0
    except asyncio.CancelledError:
        pass
    except KeyboardInterrupt:
        print()
    except BaseException as exn:
        import sys, traceback
        print(f"\n\x1b[1;31m{''.join(traceback.format_exception(exn))}\x1b[0m", file=sys.stderr, end="")
        failures += 1

print(f"\nToo many errors, giving up.", file=sys.stderr)
