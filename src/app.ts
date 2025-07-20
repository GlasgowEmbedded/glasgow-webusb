import { } from './toolchain';
import { Terminal } from './terminal';

const xterm = new Terminal(<HTMLDivElement>document.getElementById('terminal'));
xterm.focus();
xterm.write(new TextEncoder().encode('hello world\n'));
xterm.read().then((data) => {
    xterm.write(data);
});
