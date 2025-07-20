// Slightly cursed wrapper to integrate with esbuild.

// @ts-ignore
import { loadPyodide as originalLoadPyodide } from './pyodide/pyodide.mjs';
import type * as pyodide from './pyodide/pyodide';

export type { PyodideInterface } from './pyodide/pyodide';
export type { PyProxy } from './pyodide/ffi';

export const loadPyodide: typeof pyodide.loadPyodide = async (options: any) => {
    await import(new URL('./pyodide/pyodide.asm.js', import.meta.url).href);
    return originalLoadPyodide({
        indexURL: '.',
        stdLibURL: new URL('./pyodide/python_stdlib.zip', import.meta.url).href,
        lockFileURL: new URL('./pyodide/pyodide-lock.json', import.meta.url).href,
        ...options
    });
};
