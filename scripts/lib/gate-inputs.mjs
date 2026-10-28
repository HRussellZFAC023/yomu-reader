// Input ownership for stages that do not read every product source byte.
import { buildSync } from 'esbuild';
import { isAbsolute, relative, resolve } from 'node:path';
import { dependencyInputs } from './dependency-inputs.mjs';

export function academyBuildInputs(root) {
    return ['src/academy/**', 'public/academy/**', 'config/vite/academy*.ts',
        'scripts/sync-academy.cjs', 'scripts/lib/academy-*.cjs',
        ...bundleInputs(root, ['src/academy/entrypoint.ts'])];
}

export function readerBuildInputs(root) {
    return ['src/reader/**', 'src/vite-env.d.ts', 'public/newtab/**', 'config/**',
        '!config/ci/content-addressed-retention.json', 'scripts/**', '!scripts/fixtures/**',
        'vite.config.ts', 'tsconfig*.json',
        ...dependencyInputs(root, ['src/reader/userscript/entry.ts', 'src/reader/newtab/entrypoint.ts'])];
}

// Reader CSS is built by a separate writer. Keep code byte-exact: if any code
// entry starts consuming CSS (including value imports), retain the full key.
export function javascriptBuildInputs(root, inputs, entries) {
    try {
        return bundleInputs(root, entries).some(path => /\.css(?:$|\?)/.test(path)) ? inputs : [...inputs, '!**/*.css'];
    } catch { return inputs; } // unfamiliar loaders/inputs must never skip code
}

export function hostedSyncSourceInputs(root) {
    // Ask the same bundler as the three sync helpers. Type-only imports do not
    // become runtime inputs; new runtime imports are rediscovered every time.
    return bundleInputs(root, [
            'src/reader/core/hosted-appearance-boot.ts',
            'src/reader/settings/hosted-appearance-settings.ts',
            'src/reader/app/site-nav.ts',
        ]);
}

function bundleInputs(root, entryPoints) {
    const { metafile } = buildSync({
        absWorkingDir: root, entryPoints,
        bundle: true, write: false, metafile: true, packages: 'external',
        outdir: 'artifacts/gate-input-discovery', logLevel: 'silent',
    });
    return Object.keys(metafile.inputs).map(file => {
        const path = relative(root, resolve(root, file));
        if (isAbsolute(path) || path.startsWith('../') || /(^|\/)\.env(?:\.|$)/.test(path)) {
            throw new Error(`Undeclared bundle dependency: ${file}`);
        }
        return path;
    }).sort();
}

export function toolingStageContract(snapshot, compilerInputs) {
    // Tooling tests inspect their own implementation/configuration, literal
    // paths in tests, repository membership and the compiler's resolved file
    // list. They do not assert the bodies of arbitrary product source files.
    return {
        inputs: ['tests/tooling/**', 'scripts/**', 'config/**', '!config/ci/content-addressed-retention.json', 'vite.config.ts', 'tsconfig*.json'],
        extra: { repositoryPaths: Object.keys(snapshot).filter(path => !/^(?:dist\/|docs\/public\/|config\/ci\/content-addressed-retention\.json$)/.test(path)), compilerInputs },
    };
}

export function workerStageInputs(root, snapshot) {
    const entries = Object.keys(snapshot).filter(path => /^tests\/workers\/.*\.test\.ts$/.test(path));
    return ['tests/workers/**', 'workers/**', '.github/workflows/**', 'wrangler*.jsonc',
        'config/dictionaries/**', 'scripts/**', 'vite.config.ts', 'tsconfig*.json',
        ...dependencyInputs(root, entries)];
}
