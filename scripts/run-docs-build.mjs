#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StageRunner, cacheOptions } from './lib/stage-runner.mjs';
import { dependencyInputs } from './lib/dependency-inputs.mjs';
import { git } from './lib/stage-cache.mjs';

const root = join(import.meta.dirname, '..');
const sourceInputs = ['docs/**', '!docs/.vitepress/dist/**', '!docs/.vitepress/cache/**', '!docs/.vitepress/.temp/**', 'src/**', 'scripts/**', 'config/**', 'README.md', 'CHANGELOG.md'];
const prechecks = [
    { name: 'og-image', command: 'node scripts/generate-og-image.mjs', inputs: ['docs/public/og-image.*', 'scripts/generate-og-image.mjs'], outputs: ['docs/public/og-image.png', 'docs/public/og-image.generated.json'], restoreOutputs: true },
    { name: 'openapi', command: 'node scripts/build-openapi.mjs', inputs: ['scripts/openapi/**', 'scripts/build-openapi.mjs'], outputs: ['docs/public/api/**'], restoreOutputs: true },
    { name: 'settings-reference', command: 'node scripts/settings-reference.mjs --check', inputs: sourceInputs },
    { name: 'locales', command: 'node node_modules/vite-node/vite-node.mjs scripts/generate-reviewed-docs-locale-routes.mts --check', inputs: sourceInputs },
    { name: 'locale-coverage', command: 'node node_modules/vitest/vitest.mjs run tests/reader/docs-website-locales.test.ts tests/reader/i18n.test.ts', inputs: [...sourceInputs, 'tests/reader/**', 'vite.config.ts'], env: ['VITEST_MAX_FORKS', 'YOMU_VITEST_FORK_HEAP_MB'], test: true },
];
export async function buildDocs(runner, phase = 'all') {
    const results = phase === 'render' ? [] : await Promise.allSettled(prechecks.map(stage => runner.run(stage)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (phase !== 'precheck') {
        runner.refresh();
        const renderInputs = sourceInputs.filter(pattern => pattern !== 'src/**');
        renderInputs.push(...dependencyInputs(root, Object.keys(runner.snapshot).filter(path => path.startsWith('docs/.vitepress/') && /\.(?:[cm]?[jt]s|vue)$/.test(path))));
        await runner.run({
            name: 'render',
            command: 'node node_modules/vitepress/bin/vitepress.js build docs && node node_modules/vite-node/vite-node.mjs scripts/check-rendered-docs-locales.mts && node node_modules/vite-node/vite-node.mjs scripts/check-homepage-ssr.mts && node scripts/check-public-docs.mjs',
            inputs: renderInputs,
            outputs: ['docs/.vitepress/dist/**'],
            restoreOutputs: true,
            diskInputs: ['docs/public/**'],
            // VitePress lastUpdated reads commit dates, beyond source bytes.
            extra: git(root, ['log', '-1', '--format=%H', '--', 'docs']),
            env: ['YOMU_PATREON_ENABLED', 'YOMU_PATREON_URL', 'YOMU_KOFI_URL', 'YOMU_GOOGLE_SITE_VERIFICATION', 'YOMU_BING_SITE_VERIFICATION', 'YOMU_YANDEX_SITE_VERIFICATION', 'YOMU_BAIDU_SITE_VERIFICATION'],
        });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const runner = new StageRunner(root, { ...cacheOptions(), prefix: 'docs' });
    try {
        await buildDocs(runner, process.argv.includes('--precheck-only') ? 'precheck' : process.argv.includes('--render-only') ? 'render' : 'all');
        runner.summary(true);
    } catch (error) {
        console.error(error);
        runner.summary(false);
        process.exitCode = 1;
    }
}
