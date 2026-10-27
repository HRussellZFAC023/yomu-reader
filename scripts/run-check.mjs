#!/usr/bin/env node
// Content-addressed local gate. CI always forces the full graph.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StageRunner, buildEnv, cacheOptions } from './lib/stage-runner.mjs';
import { git, stageKey } from './lib/stage-cache.mjs';
import { testPlan, testInputs } from './lib/affected-tests.mjs';
import { captureRetentionInputs } from './lib/content-addressed-retention.mjs';
import { artifactDrift, describeArtifactDrift, hasUncommittedSourceEdits } from './lib/artifact-drift.mjs';
import { offLockfilePackages } from './lib/dependency-tree-drift.mjs';

const ROOT = join(import.meta.dirname, '..');
const LOG_DIR = join(ROOT, 'artifacts/check-logs');
mkdirSync(LOG_DIR, { recursive: true });
const options = cacheOptions();
const runner = new StageRunner(ROOT, options);
let artifactDriftAdvisory = false;
const startedWithSourceEdits = hasUncommittedSourceEdits(ROOT);
if (startedWithSourceEdits) console.log('[check] tree has uncommitted edits; artifact drift is advisory. A clean-tree pass is required to prove committed output.');
const releaseCheck = process.env.YOMU_CHECK_RELEASE === '1';
const common = ['scripts/run-check.mjs', 'scripts/lib/affected-tests.mjs'];
const stage = (name, command, inputs, extra = {}) => ({ name, command, inputs: [...common, ...inputs], ...extra });
const run = (...args) => runner.run(stage(...args));
const all = ['**', '!docs/.vitepress/dist/**', '!docs/.vitepress/cache/**', '!docs/.vitepress/.temp/**'];
const source = ['src/**', 'tests/**', 'workers/**', 'config/**', 'scripts/**', 'vite.config.ts', 'tsconfig*.json'];
const buildInputs = ['src/**', 'public/**', 'config/**', 'scripts/**', '!scripts/fixtures/**', 'vite.config.ts', 'tsconfig*.json'];
const testEnv = ['VITEST_ISOLATE', 'VITEST_MAX_FORKS', 'YOMU_VITEST_FORK_HEAP_MB', 'YOMU_HASH_MEMO', 'YOMU_CHECK_RELEASE', 'YOMU_CI_MAX_WORKERS', 'YOMU_CI_SHARDED', 'YOMU_CI_TEST_TIMEOUT_MS'];
const retention = captureRetentionInputs(ROOT);
writeFileSync(join(LOG_DIR, 'retention-inputs.json'), JSON.stringify(retention));
const history = [
    git(ROOT, ['rev-parse', '--is-shallow-repository']),
    git(ROOT, ['for-each-ref', '--merged=HEAD', '--format=%(refname) %(objectname)', 'refs/tags/v*']),
    git(ROOT, ['log', '-80', '--format=%H', '--', 'docs/public/yomu.user.js']),
];
const committed = git(ROOT, ['ls-tree', '-r', process.env.YOMU_COMMIT_TO_CHECK ?? 'HEAD', '--', 'package.json', 'dist', 'docs/public', 'public/academy']);
const readerPlan = testPlan(ROOT, runner.snapshot, { noCache: options.noCache });
writeFileSync(join(LOG_DIR, 'affected-tests-reader.json'), JSON.stringify(readerPlan));

// Retention receives frozen working-tree headers/inventory; committed-artifacts
// already reads Git. Neither can race dist's replacement in the build lane.
const preflights = [
    run('repository-hygiene', 'npm run -s check:repository', all),
    run('content-addressed-retention', 'node scripts/prune-content-addressed-assets.mjs --check --snapshot=artifacts/check-logs/retention-inputs.json', ['scripts/lib/content-addressed-retention.mjs', 'scripts/prune-content-addressed-assets.mjs', 'config/ci/content-addressed-retention.json'], { extra: stageKey({ command: 'retention-inputs', inputs: retention, extra: history }) }),
    run('committed-artifacts', 'npm run -s check:artifacts', ['scripts/check-committed-artifacts.mjs', 'scripts/lib/**'], { extra: committed, env: ['YOMU_COMMIT_TO_CHECK'] }),
    run('smoke-workflow-coverage', 'node scripts/check-smoke-workflow-coverage.mjs', ['scripts/check-smoke-workflow-coverage.mjs', '.github/workflows/**']),
    run('css-has-invalidation', 'npm run -s check:css-has', ['src/**/*.css', 'scripts/check-css-has-invalidation.mjs', 'scripts/lib/css-has-invalidation.mjs']),
    run('recorded-pages', 'npm run -s check:recorded-pages', ['scripts/fixtures/recorded/**', 'scripts/check-recorded-pages.mjs', 'scripts/lib/recorded-*.mjs']),
];
const docsPre = run('docs-prechecks', 'node scripts/run-docs-build.mjs --precheck-only', [], { uncached: true });
const build = (async () => {
    await run('build', 'npm run -s build', buildInputs, {
        env: buildEnv,
        outputs: ['dist/**', '!dist/academy/**', '!dist/newtab/index.html', '!dist/newtab/sw.js', '!dist/newtab/version.json', '!dist/newtab/manifest.webmanifest'],
    });
    runner.refresh();
    const sync = run('sync-docs-userscript', 'node scripts/sync-docs-userscript.cjs', [...source, 'docs/public/pdf-reader/**', 'docs/public/video-player/**', 'docs/public/hosted-reader-worker.js'], {
        extra: runner.key(stage('build-inputs', 'npm run -s build', buildInputs, { env: buildEnv })),
        diskInputs: ['dist/yomu.user.js', 'dist/yomu.css', 'dist/greasyfork/**', 'dist/newtab/app.js', 'dist/newtab/styles.css'],
        outputs: ['dist/newtab/**', 'docs/public/yomu*', 'docs/public/greasyfork/**', 'docs/public/study/**', 'docs/public/newtab/**', 'docs/public/hosted-runtime-graph.js', 'docs/public/hosted-appearance-settings.js', 'docs/public/pdf-reader/index.html', 'docs/public/pdf-reader/sw.js', 'docs/public/video-player/index.html', 'docs/public/video-player/sw.js'],
    });
    const academy = run('build-academy', 'npm run -s build:academy:prevalidated', buildInputs, {
        outputs: ['dist/academy/**', 'docs/public/academy/**'],
        env: ['YOMU_CHECK_RELEASE', 'YOMU_SYNC_ACADEMY_FORCE', 'YOMU_ACADEMY_OUTPUT_DIR', 'YOMU_ACADEMY_BUILD_DIR'],
    });
    await Promise.all([sync, academy]);
})();
const tests = (async () => {
    await run('test-reader', readerPlan.full ? 'npm run -s test:ci' : 'node scripts/run-affected-tests.mjs reader', testInputs, {
        test: true, extra: readerPlan.full ? 'full' : readerPlan, env: testEnv,
    });
    if (readerPlan.full) readerPlan.saveFullPass();
    if (!releaseCheck) {
        await build;
        runner.refresh();
        const academyPlan = testPlan(ROOT, runner.snapshot, { noCache: options.noCache, suite: 'academy' });
        writeFileSync(join(LOG_DIR, 'affected-tests-academy.json'), JSON.stringify(academyPlan));
        await run('test-academy', academyPlan.full ? 'npm run -s test:academy' : 'node scripts/run-affected-tests.mjs academy', [...testInputs], { test: true, env: testEnv, extra: academyPlan.full ? 'full' : academyPlan });
        if (academyPlan.full) academyPlan.saveFullPass();
    }
})();
const diagnostics = (async () => {
    await run('typecheck', 'npm run -s typecheck', source);
    await run('test-workers', 'npm run -s test:workers', [...source], { test: true, env: testEnv });
    await run('tooling-tests', 'node --test tests/tooling/*.test.mjs', ['tests/tooling/**', 'scripts/lib/**'], { test: true });
    await run('complexity-ratchet', 'node scripts/complexity-audit.mjs', source, { env: ['YOMU_COMPLEXITY_MAX'] });
    await run('file-size-ratchet', 'node scripts/file-size-audit.mjs', source, { env: ['YOMU_FILE_SIZE_THRESHOLD'] });
    await run('dead-code-ratchet', 'npm run -s quality:dead-code', all);
})();
const docs = (async () => {
    await Promise.all([build, docsPre]);
    runner.refresh();
    await run('userscript-weight', 'node scripts/check-userscript-weight.cjs', ['scripts/check-userscript-weight.cjs', 'scripts/lib/**'], { diskInputs: ['dist/yomu.user.js', 'dist/greasyfork/**'] });
    // docs:build's own cache verifies both pre-checks and the rendered outputs.
    await run('docs-build', 'node scripts/run-docs-build.mjs --render-only', [], { uncached: true });
})();
const results = await Promise.allSettled([...preflights, tests, diagnostics, docs]);
const failures = results.filter(result => result.status === 'rejected');
try {
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'check stages failed');
    runner.refresh();
    // verify always runs last, including its untracked/ignored disk products.
    await run('verify', 'npm run -s verify', [], { uncached: true });
    if (!reportArtifactDrift()) throw new Error('artifact drift');
    runner.summary(true);
    if (artifactDriftAdvisory) console.log('[check] artifact-drift advisory only, NOT enforced');
} catch (error) {
    console.error(error);
    runner.summary(false);
    process.exitCode = 1;
}

function reportArtifactDrift() {
    const drifted = artifactDrift(ROOT);
    const { ok, lines, advisory = false } = describeArtifactDrift({
        drifted,
        sourceEdits: startedWithSourceEdits,
        // Only asked when there is drift to explain: walking the lockfile stats
        // ~750 package.json files, which is wasted work on the common path
        // where the gate rewrote nothing.
        offLockfile: drifted.length > 0 ? offLockfilePackages(ROOT) : [],
    });
    artifactDriftAdvisory = advisory;
    for (const line of lines) (ok ? console.log : console.error)(line);
    return ok;
}
