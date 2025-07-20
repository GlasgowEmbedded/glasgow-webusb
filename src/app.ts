import { Builder } from './builder';

(new Builder).build(
    {
        'build_top.json': JSON.stringify({
            commands: [
                ["yosys", "--help"],
                ["nextpnr-ice40", "--help"]
            ]
        })
    },
    'build_top.json',
    (bytes) => {}
);
