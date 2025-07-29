import { Terminal as Xterm } from '@xterm/xterm';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { FitAddon } from '@xterm/addon-fit';
import { openpty } from 'xterm-pty';

export class Terminal {
    #element: HTMLElement;

    #xterm: Xterm;
    #ptyAddon: ReturnType<typeof openpty>['master'];
    #ptyHandle: ReturnType<typeof openpty>['slave'];

    #readBuffer: number[];
    #readPromise: Promise<void>;
    #readResolve: () => void;

    constructor(element: HTMLElement) {
        this.#element = element;

        let parentContainerStyles = getComputedStyle(element);

        if (!/^[\d.]+px$/.test(parentContainerStyles.fontSize)) {
            throw new Error(`Unexpected font-size value`);
        }

        const xterm = new Xterm({
            scrollback: 10000,
            screenReaderMode: true,

            // Read the desired font-family and font-size from CSS and apply it here.
            // We cannot override these properties on .xterm-rows in CSS
            // because xterm.js relies on these for calculating other metrics
            // like line-height.
            fontFamily: parentContainerStyles.fontFamily,
            fontSize: Number(parentContainerStyles.fontSize.replace(/px$/, '')),
        });
        xterm.open(element);
        this.#xterm = xterm;

        xterm.loadAddon(new WebLinksAddon());

        const fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);

        fitAddon.fit();
        const resizeObserver = new ResizeObserver(() => fitAddon.fit());
        resizeObserver.observe(element);

        const { master: ptyAddon, slave: ptyHandle } = openpty();
        xterm.loadAddon(ptyAddon);
        this.#ptyAddon = ptyAddon;
        this.#ptyHandle = ptyHandle;

        this.#readBuffer = [];
        const { promise: readPromise, resolve: readResolve } = Promise.withResolvers<void>();
        this.#readPromise = readPromise;
        this.#readResolve = readResolve;
        ptyHandle.onReadable(() => {
            this.#readBuffer.splice(this.#readBuffer.length, 0, ...ptyHandle.read());
            this.#readResolve();
        });
    }

    focus() {
        this.#xterm.focus();
    }

    endSession() {
        this.#ptyAddon.dispose();
        this.#element.classList.add('session-ended');
    }

    write(bytes: Uint8Array) {
        this.#ptyHandle.write(Array.from(bytes));
    }

    async read(): Promise<Uint8Array> {
        await this.#readPromise;
        this.#readPromise = new Promise((resolve, _reject) => this.#readResolve = resolve);
        return Uint8Array.from(this.#readBuffer.splice(0));
    }

    onInterrupt(handler: () => void) {
        this.#ptyHandle.onSignal((signal) => {
            if (signal === 'SIGINT') {
                handler();
            }
        });
    }
}
