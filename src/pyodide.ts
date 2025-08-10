// @ts-expect-error
import { loadPyodide as originalLoadPyodide } from './pyodide/pyodide.mjs';
import type { loadPyodide as originalLoadPyodideType } from './pyodide/pyodide';

export const loadPyodide: typeof originalLoadPyodideType = async (options: any) => {
    await import(new URL('./pyodide/pyodide.asm.js', import.meta.url).href);
    return originalLoadPyodide({
        indexURL: '.',
        stdLibURL: new URL('./pyodide/python_stdlib.zip', import.meta.url).href,
        lockFileURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.1/full/pyodide-lock.json',
        ...options
    });
};

export type { PyodideAPI } from './pyodide/pyodide';
export type { PyProxy } from './pyodide/ffi';
