import * as Comlink from 'comlink';

Comlink.transferHandlers.set('function', {
    canHandle: (value): value is (...args: unknown[]) => unknown =>
        typeof value === 'function' && !(Comlink.proxyMarker in value),
    serialize(value) {
        const { port1, port2 } = new MessageChannel();
        Comlink.expose(value, port1);
        return [port2, [port2]];
    },
    deserialize(port) {
        port.start();
        return Comlink.wrap<(...args: unknown[]) => unknown>(port);
    },
} satisfies Comlink.TransferHandler<(...args: unknown[]) => unknown, MessagePort>);
