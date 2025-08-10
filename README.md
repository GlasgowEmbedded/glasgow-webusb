# Glasgow Interface Explorer on the Web platform

## Usage

Run:

```console
$ npm install
$ npm run serve
```

Navigate to http://127.0.0.1:8020/. (WebUSB only works on secure origins, so make sure the IP is right.)

## To do before this is usable

- Windows is still broken due to USB _Set Configuration_ issues
- Pyodide in this repo is patched manually:
    - https://github.com/pyodide/pyodide/issues/5782
    - https://github.com/python/cpython/pull/136822
- REPL doesn't have line editing (we should use Pyrepl instead of `prompt()` and cooked terminal, but see below)
- Pyrepl is broken:
    - https://github.com/python/cpython/pull/136758
- No termios integration between Pyodide and Xterm
    - `COLUMNS` isn't set properly, etc
- Setting stdin to be a tty is broken for some reason
