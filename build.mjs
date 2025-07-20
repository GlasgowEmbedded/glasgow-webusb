import * as process from 'node:process';
import * as child_process from 'node:child_process';
import * as esbuild from 'esbuild';
import metaUrlPlugin from '@chialab/esbuild-plugin-meta-url';
import htmlPlugin from '@chialab/esbuild-plugin-html';

const gitCommit = child_process.execSync('git rev-parse HEAD', { encoding: 'utf-8' }).replace(/\n$/, '');

const mode = (process.argv[2] ?? 'build');
const options = {
    logLevel: 'info',
    plugins: [metaUrlPlugin(), htmlPlugin()],
    bundle: true,
    define: {
        'globalThis.GIT_COMMIT': `"${mode === 'minify' ? gitCommit : 'HEAD'}"`,
    },
    target: 'es2021',
    format: 'esm',
    sourcemap: 'linked',
    minify: (mode === 'minify'),
    outdir: 'dist',
    publicPath: '.',
    entryPoints: {
        'index': 'src/index.html',
    },
};

if (mode === 'build' || mode === 'minify') {
    await esbuild.build(options);
} else if (mode === 'watch') {
    const context = await esbuild.context(options);
    await context.watch();
} else if (mode === 'serve') {
    const context = await esbuild.context(options);
    await context.rebuild();
    await context.watch();
    // Specifying `servedir` is necessary for files built by meta URL plugin to be accessible.
    await context.serve({ servedir: 'dist', port: 8020 });
} else {
    console.error(`Usage: ${process.argv0} [build|watch|serve|minify]`);
}
