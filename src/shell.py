import sys
import shlex
import asyncio
from glasgow.cli import main

failures = 0
while failures < 3:
    try:
        command = input("\n> glasgow ")
        sys.argv = ["glasgow", *shlex.split(command)]
        asyncio.new_event_loop().run_until_complete(main())
        failures = 0
    except (SystemExit, KeyboardInterrupt, asyncio.CancelledError):
        pass
    except Exception as exn:
        import sys, traceback
        print(f"\n\x1b[1;31m{''.join(traceback.format_exception(exn))}\x1b[0m", file=sys.stderr, end="")
        failures += 1

print(f"\nToo many errors, giving up.", file=sys.stderr)
