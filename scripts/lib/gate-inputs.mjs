// Input ownership for stages that do not read every product source byte.
import { buildSync } from 'esbuild';
import { isAbsolute, relative, resolve } from 'node:path';

export function hostedSyncSourceInputs(root) {
    // Ask the same bundler as the three sync helpers. Type-only imports do not
    // become runtime inputs; new runtime imports are rediscovered every time.
    const { metafile } = buildSync({
        absWorkingDir: root,
        entryPoints: [
            'src/reader/core/hosted-appearance-boot.ts',
            'src/reader/settings/hosted-appearance-settings.ts',
            'src/reader/app/site-nav.ts',
        ],
        bundle: true, write: false, metafile: true, packages: 'external',
        outdir: 'artifacts/gate-input-discovery', logLevel: 'silent',
    });
    return Object.keys(metafile.inputs).map(file => {
        const path = relative(root, resolve(root, file));
        if (isAbsolute(path) || path.startsWith('../') || /(^|\/)\.env(?:\.|$)/.test(path)) {
            throw new Error(`Undeclared hosted sync dependency: ${file}`);
        }
        return path;
    }).sort();
}

export function toolingStageContract(snapshot, compilerInputs) {
    // Tooling tests inspect their own implementation/configuration, literal
    // paths in tests, repository membership and the compiler's resolved file
    // list. They do not assert the bodies of arbitrary product source files.
    return {
        inputs: ['tests/**', 'scripts/**', 'config/**', 'vite.config.ts', 'tsconfig*.json'],
        extra: { repositoryPaths: Object.keys(snapshot), compilerInputs },
    };
}
