import { Terminal as Xterm } from '@xterm/xterm';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { FitAddon } from '@xterm/addon-fit';
import { openpty } from 'xterm-pty';

export class Terminal {
    #xterm: Xterm;
    #ptyHandle: ReturnType<typeof openpty>['slave'];

    #readBuffer: number[];
    #readPromise: Promise<void>;
    #readResolve: () => void;

    constructor(element: HTMLDivElement) {
        const xterm = new Xterm({
            scrollback: 10000,
            screenReaderMode: true,
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
        this.#ptyHandle = ptyHandle;

        this.#readBuffer = [];
        this.#readPromise = new Promise((resolve, _reject) => this.#readResolve = resolve);
        ptyHandle.onReadable(() => {
            this.#readBuffer.splice(this.#readBuffer.length, 0, ...ptyHandle.read());
            this.#readResolve();
        });
    }

    focus() {
        this.#xterm.focus();
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
