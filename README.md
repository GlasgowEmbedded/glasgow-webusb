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
- Pyodide in this repo is patched manually (see [src/vendor/pyodide/patches/](src/vendor/pyodide/patches/))
