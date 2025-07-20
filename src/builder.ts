import { Tree } from '@yowasp/runtime';

import * as builderProto from './builder/proto';

export class Builder {
    #worker: Worker = new Worker(
        new URL('./builder/worker.ts', import.meta.url),
        { type: 'module' }
    );
    #busy: boolean = false;

    build(
        files: Tree,
        scriptName: string,
        writeOutput: (bytes: Uint8Array) => void
    ): Promise<{ code: number, files: Tree }> {
        if (this.#busy) {
            throw new Error("Builder is busy");
        }
        return new Promise((resolve, reject) => {
            this.#busy = true;
            this.#worker.onmessage = (event: MessageEvent<builderProto.BuilderToAppMessage>) => {
                const message = event.data;
                if (message.type === 'output') {
                    writeOutput(message.bytes);
                } else if (message.type === 'result') {
                    resolve({ code: message.code, files: message.files });
                    this.#busy = false;
                } else if (message.type === 'error') {
                    reject(message.error);
                    this.#busy = false;
                } else {
                    (message satisfies never);
                }
            };
            this.#worker.postMessage({
                type: 'build', files, scriptName
            } as builderProto.AppToBuilderMessage);
        });
    }
}
