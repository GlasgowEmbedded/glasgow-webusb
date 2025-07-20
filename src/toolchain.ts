import { Tree } from '@yowasp/runtime';

import { Builder } from './builder';

// Interface used by Python code to detect and invoke the toolchain.
declare global {
    var glasgowToolchain: {
        available(packageName: string): boolean,
        version(packageName: string): string,
        build(files: Tree, scriptName: string, writeOutput: (chars: string) => void):
            Promise<{ code: number, files: Tree }>,
    };
}

export async function loadToolchain(): Promise<void> {
    if (globalThis.glasgowToolchain !== undefined) {
        return;
    }

    const builder = new Builder;
    const packageVersions = await builder.packages();
    console.log('[App] Package versions', packageVersions);
    globalThis.glasgowToolchain = {
        available: (packageName) => packageName in packageVersions,
        version: (packageName) => packageVersions[packageName],
        build: (files, scriptName, writeOutput) => {
            return builder.build(files, scriptName, (bytes) => {
                writeOutput(new TextDecoder().decode(bytes));
            });
        }
    };
}
