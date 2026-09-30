// Runs one capture stage INSIDE a read-only reference checkout of an older
// release, with that release's own vite config, defines and test setup, so the
// bytes a stage records are the ones that release's writers produce.
//
// Driven by scripts/upgrade-corpus/capture.mjs; not part of any test suite.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile, mergeConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required; run node scripts/upgrade-corpus/capture.mjs.`);
    return value;
}

function includedFiles() {
    // self-check.mjs runs the v2 corpus test against the reference source.
    if (process.env.YOMU_CAPTURE_INCLUDE) return [process.env.YOMU_CAPTURE_INCLUDE];
    return [path.join(here, 'stages', `${requiredEnv('YOMU_CAPTURE_STAGE')}.capture.ts`)];
}

export default async function captureConfig() {
    const root = requiredEnv('YOMU_CAPTURE_ROOT');
    const loaded = await loadConfigFromFile(
        { command: 'serve', mode: 'test' },
        path.join(root, 'vite.config.ts'),
        root,
    );
    const merged = mergeConfig(loaded?.config ?? {}, {
        root,
        resolve: { alias: [{ find: /^@yomu-ref\//, replacement: `${root}/` }] },
        server: { fs: { strict: false } },
    });
    // mergeConfig concatenates arrays; the reference's own include list would
    // run its whole suite, so the stage list replaces it outright.
    merged.test = {
        ...merged.test,
        include: includedFiles(),
        exclude: [],
        retry: 0,
        minWorkers: 1,
        maxWorkers: 1,
        fileParallelism: false,
        testTimeout: 60_000,
    };
    return merged;
}
