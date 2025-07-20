import { Tree } from '@yowasp/runtime';
import * as yosys from '@yowasp/yosys';
import * as nextpnrIce40 from '@yowasp/nextpnr-ice40';

import { Builder } from './builder';

const packageVersions: { [name: string]: string } = {
    'yosys': yosys.version,
    'nextpnr-ice40': nextpnrIce40.version,
};

// Interface used by Python code to detect and invoke the toolchain.
declare global {
    var glasgowToolchain: {
        available(packageName: string): boolean,
        version(packageName: string): string,
        build(files: Tree, scriptName: string, writeOutput: (bytes: Uint8Array) => void):
            Promise<{ code: number, files: Tree }>,
    };
}

globalThis.glasgowToolchain = {
    available: (packageName) => packageName in packageVersions,
    version: (packageName) => packageVersions[packageName],
    build: (new Builder).build
};
