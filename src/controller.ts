import * as Comlink from 'comlink';
import './comlink-transfer-handlers';
import memoize from 'lodash/memoize';

import type { ExposedMethods } from './controller/proto';

const getWorkerExports = memoize(() => {
    return Comlink.wrap<ExposedMethods>(
        new Worker(new URL('./controller/controller-worker.ts', import.meta.url), { type: 'module' }),
    );
});

export function loadToolchain() {
    return getWorkerExports().loadToolchain();
}

export async function createController(...args: Parameters<ExposedMethods['createController']>) {
    const remoteController = await getWorkerExports().createController(...args);
    return remoteController as unknown as Comlink.Remote<typeof remoteController>;
}
