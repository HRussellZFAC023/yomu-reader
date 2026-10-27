#!/usr/bin/env node
// Content-addressed local gate. CI always forces the full graph.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StageRunner, buildEnv, testEnvironment, cacheOptions } from './lib/stage-runner.mjs';
import { git, stageKey } from './lib/stage-cache.mjs';
import { testPlan, testInputs } from './lib/affected-tests.mjs';
import { typecheckInputs } from './lib/typecheck-inputs.mjs';
import { selectAffectedTests } from './lib/test-selection.mjs';
import { captureRetentionInputs } from './lib/content-addressed-retention.mjs';
import { buildDocs } from './run-docs-build.mjs';
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
const source = ['src/**', 'tests/**', 'workers/**', 'config/**', '!config/ci/content-addressed-retention.json', 'scripts/**', 'vite.config.ts', 'tsconfig*.json'];
const buildInputs = ['src/**', 'public/**', 'config/**', '!config/ci/content-addressed-retention.json', 'scripts/**', '!scripts/fixtures/**', 'vite.config.ts', 'tsconfig*.json'];
const testEnv = [...testEnvironment, 'VITEST_MAX_FORKS', 'YOMU_VITEST_FORK_HEAP_MB', 'YOMU_CHECK_RELEASE', 'YOMU_CI_MAX_WORKERS', 'YOMU_CI_SHARDED', 'YOMU_CI_TEST_TIMEOUT_MS'];
const retention = captureRetentionInputs(ROOT);
writeFileSync(join(LOG_DIR, 'retention-inputs.json'), JSON.stringify(retention));
const history = [
    git(ROOT, ['rev-parse', '--is-shallow-repository']),
    git(ROOT, ['for-each-ref', '--merged=HEAD', '--format=%(refname) %(objectname)', 'refs/tags/v*']),
    git(ROOT, ['log', '-80', '--format=%H', '--', 'docs/public/yomu.user.js']),
];
const committed = git(ROOT, ['ls-tree', '-r', process.env.YOMU_COMMIT_TO_CHECK ?? 'HEAD', '--', 'package.json', 'dist', 'docs/public', 'public/academy']);
async function planTests(suite) {
    runner.refresh();
    const plan = testPlan(ROOT, runner.snapshot, { noCache: options.noCache, suite });
    if (!plan.full) Object.assign(plan, await selectAffectedTests(ROOT, plan.changed, { config: suite === 'academy' ? 'config/vite/academy.config.ts' : undefined }));
    writeFileSync(join(LOG_DIR, `affected-tests-${suite}.json`), JSON.stringify(plan));
    console.log(`[check] ${suite}: ${plan.full ? 'full suite' : 'affected selection'}; ${plan.reason}`);
    return plan;
}

// Retention receives frozen working-tree headers/inventory; committed-artifacts
// already reads Git. Neither can race dist's replacement in the build lane.
const preflights = [
    run('repository-hygiene', 'npm run -s check:repository', all),
    run('content-addressed-retention', 'node scripts/prune-content-addressed-assets.mjs --check --snapshot=artifacts/check-logs/retention-inputs.json', ['scripts/lib/content-addressed-retention.mjs', 'scripts/prune-content-addressed-assets.mjs', 'config/ci/content-addressed-retention.json'], { extra: stageKey({ command: 'retention-inputs', inputs: retention, extra: history }) }),
    run('committed-artifacts', 'npm run -s check:artifacts', ['scripts/check-committed-artifacts.mjs', 'scripts/lib/**'], { extra: committed, env: ['YOMU_COMMIT_TO_CHECK'] }),
    run('smoke-workflow-coverage', 'node scripts/check-smoke-workflow-coverage.mjs', ['scripts/**', '.github/workflows/**']),
    run('css-has-invalidation', 'npm run -s check:css-has', ['src/**/*.css', 'scripts/check-css-has-invalidation.mjs', 'scripts/lib/css-has-invalidation.mjs']),
    run('recorded-pages', 'npm run -s check:recorded-pages', ['scripts/fixtures/recorded/**', 'scripts/check-recorded-pages.mjs', 'scripts/lib/recorded-*.mjs']),
];
const build = (async () => {
    await run('build', 'npm run -s build', buildInputs, {
        env: buildEnv,
        restoreOutputs: true,
        outputs: ['dist/**', '!dist/academy/**', '!dist/newtab/index.html', '!dist/newtab/sw.js', '!dist/newtab/version.json', '!dist/newtab/manifest.webmanifest'],
    });
    runner.refresh();
    const sync = run('sync-docs-userscript', 'node scripts/sync-docs-userscript.cjs', [...source, 'docs/public/pdf-reader/**', 'docs/public/video-player/**', 'docs/public/hosted-reader-worker.js'], {
        extra: [runner.key(stage('build-inputs', 'npm run -s build', buildInputs, { env: buildEnv })), history],
        canonicalizesOutputs: true,
        restoreOutputs: true,
        diskInputs: ['dist/yomu.user.js', 'dist/yomu.css', 'dist/greasyfork/**', 'dist/newtab/app.js', 'dist/newtab/styles.css'],
        outputs: ['config/ci/content-addressed-retention.json', 'dist/newtab/index.html', 'dist/newtab/sw.js', 'dist/newtab/version.json', 'dist/newtab/manifest.webmanifest', 'docs/public/yomu.user.js', 'docs/public/yomu.css', 'docs/public/yomu.*.css', 'docs/public/greasyfork/**', 'docs/public/study/**', 'docs/public/newtab/**', 'docs/public/hosted-runtime-graph.js', 'docs/public/hosted-appearance-settings.js', 'docs/public/pdf-reader/index.html', 'docs/public/pdf-reader/sw.js', 'docs/public/video-player/index.html', 'docs/public/video-player/sw.js'],
    });
    await sync;
    await run('build-academy', 'npm run -s build:academy:prevalidated', buildInputs, {
        restoreOutputs: true,
        diskInputs: ['docs/public/hosted-runtime-graph.js', 'docs/public/yomu.css'],
        outputs: ['dist/academy/**', 'docs/public/academy/**'],
        env: ['YOMU_CHECK_RELEASE', 'YOMU_SYNC_ACADEMY_FORCE', 'YOMU_ACADEMY_OUTPUT_DIR', 'YOMU_ACADEMY_BUILD_DIR'],
    });
})();
// Bound the heavy lanes on the shared Mac and the 4-core/16-GiB release VM.
// Builds retain their internal parallelism; no compiler/full suite/docs test
// competes with another heavy gate stage. Keys see finished writer outputs.
const typecheck = (async () => {
    await build;
    runner.refresh();
    const inputs = typecheckInputs(ROOT);
    await run('typecheck', 'npm run -s typecheck', inputs, { diskInputs: inputs });
})();
const tests = (async () => {
    // Readers inspect shipped bytes through fs. Plan/key them after writers,
    // never against an old snapshot while build/sync replace their inputs.
    await typecheck;
    const readerPlan = await planTests('reader');
    await run('test-reader', readerPlan.full ? 'npm run -s test:ci' : 'node scripts/run-affected-tests.mjs reader', testInputs, {
        test: true, extra: readerPlan.full ? 'full' : readerPlan, env: testEnv, diskInputs: ['dist/**', 'docs/public/**'],
    });
    if (readerPlan.full) readerPlan.saveFullPass();
    if (!releaseCheck) {
        await build;
        runner.refresh();
        const academyPlan = await planTests('academy');
        await run('test-academy', academyPlan.full ? 'npm run -s test:academy' : 'node scripts/run-affected-tests.mjs academy', [...testInputs], { test: true, env: testEnv, extra: academyPlan.full ? 'full' : academyPlan, diskInputs: ['dist/**', 'docs/public/**'] });
        if (academyPlan.full) academyPlan.saveFullPass();
    }
})();
const diagnostics = (async () => {
    await tests;
    runner.refresh();
    await run('test-workers', 'npm run -s test:workers', testInputs, { test: true, env: testEnv, diskInputs: ['dist/**', 'docs/public/**'] });
    await run('tooling-tests', 'node --test --test-concurrency=1 tests/tooling/*.test.mjs', all, { test: true });
    await run('complexity-ratchet', 'node scripts/complexity-audit.mjs', source, { env: ['YOMU_COMPLEXITY_MAX'] });
    await run('file-size-ratchet', 'node scripts/file-size-audit.mjs', source, { env: ['YOMU_FILE_SIZE_THRESHOLD'] });
    await run('dead-code-ratchet', 'npm run -s quality:dead-code', all);
})();
const docs = (async () => {
    await diagnostics;
    await buildDocs(runner, 'precheck');
    runner.refresh();
    await run('userscript-weight', 'node scripts/check-userscript-weight.cjs', ['scripts/check-userscript-weight.cjs', 'scripts/lib/**'], { diskInputs: ['dist/yomu.user.js', 'dist/greasyfork/**'] });
    // docs:build's own cache verifies both pre-checks and the rendered outputs.
    await buildDocs(runner, 'render');
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
