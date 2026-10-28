#!/usr/bin/env node
// Content-addressed local gate. CI always forces the full graph.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StageRunner, buildEnv, testEnvironment, cacheOptions } from './lib/stage-runner.mjs';
import { git, stageKey, writeJson } from './lib/stage-cache.mjs';
import { testPlan, testInputs } from './lib/affected-tests.mjs';
import { typecheckInputsAsync } from './lib/typecheck-inputs.mjs';
import { hostedSyncSourceInputs, toolingStageContract, academyBuildInputs, readerBuildInputs, workerStageInputs } from './lib/gate-inputs.mjs';
import { selectAffectedTests } from './lib/test-selection.mjs';
import { captureRetentionInputs } from './lib/content-addressed-retention.mjs';
import { buildDocs } from './run-docs-build.mjs';
import { artifactDrift, describeArtifactDrift, hasUncommittedSourceEdits } from './lib/artifact-drift.mjs';
import { offLockfilePackages } from './lib/dependency-tree-drift.mjs';
import { hostedTemplates, hostedTemplateInputs } from './lib/hosted-template-inputs.mjs';
import { workerBudget } from './lib/test-workers.mjs';

const ROOT = join(import.meta.dirname, '..');
const LOG_DIR = join(ROOT, 'artifacts/check-logs');
mkdirSync(LOG_DIR, { recursive: true });
const options = cacheOptions();
const runner = new StageRunner(ROOT, options);
let artifactDriftAdvisory = false;
const startedWithSourceEdits = hasUncommittedSourceEdits(ROOT);
if (startedWithSourceEdits) console.log('[check] tree has uncommitted edits; artifact drift is advisory. A clean-tree pass is required to prove committed output.');
const releaseCheck = process.env.YOMU_CHECK_RELEASE === '1';
const localBudget = Number(process.env.YOMU_CI_MAX_WORKERS ?? process.env.VITEST_MAX_FORKS) || workerBudget();
const overlapCompiler = !releaseCheck && !options.noCache && localBudget >= 9;
const parallelAcademy = overlapCompiler && localBudget >= 10;
const checkSession = randomUUID();
process.env.YOMU_CHECK_SESSION = checkSession;
const reservations = { compiler: overlapCompiler ? 4 : 0, tooling: 0, audits: 0 };
const reserve = (lane, slots) => {
    reservations[lane] = slots;
    writeJson(join(LOG_DIR, 'compiler-budget.json'), { session: checkSession, reserved: Object.values(reservations).reduce((sum, value) => sum + value, 0) });
};
reserve('compiler', reservations.compiler);
const common = ['scripts/run-check.mjs', 'scripts/lib/affected-tests.mjs'];
const stage = (name, command, inputs, extra = {}) => ({ name, command, inputs: [...common, ...inputs], ...extra });
const run = (...args) => runner.run(stage(...args));
const all = ['**', '!docs/.vitepress/dist/**', '!docs/.vitepress/cache/**', '!docs/.vitepress/.temp/**'];
const source = ['src/**', 'tests/**', 'workers/**', 'config/**', '!config/ci/content-addressed-retention.json', 'scripts/**', 'vite.config.ts', 'tsconfig*.json'];
const buildInputs = readerBuildInputs(ROOT);
const testEnv = [...testEnvironment, 'VITEST_MAX_FORKS', 'YOMU_VITEST_FORK_HEAP_MB', 'YOMU_CHECK_RELEASE', 'YOMU_CI_MAX_WORKERS', 'YOMU_CI_SHARDED', 'YOMU_CI_TEST_TIMEOUT_MS'];
const syncSources = hostedSyncSourceInputs(ROOT);
const compilerInputList = typecheckInputsAsync(ROOT);
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
    run('committed-artifacts', 'npm run -s check:artifacts', ['scripts/check-committed-artifacts.mjs', 'scripts/lib/**'], { extra: committed, env: ['YOMU_COMMIT_TO_CHECK'] }),
    run('smoke-workflow-coverage', 'node scripts/check-smoke-workflow-coverage.mjs', ['scripts/**', '.github/workflows/**']),
    run('css-has-invalidation', 'npm run -s check:css-has', ['src/**/*.css', 'scripts/check-css-has-invalidation.mjs', 'scripts/lib/css-has-invalidation.mjs']),
    run('recorded-pages', 'npm run -s check:recorded-pages', ['scripts/fixtures/recorded/**', 'scripts/check-recorded-pages.mjs', 'scripts/lib/recorded-*.mjs']),
];
const readerBuild = run('build', 'npm run -s build', buildInputs, {
        env: buildEnv,
        restoreOutputs: true, canonicalizesOutputs: true,
        outputs: ['config/dictionaries/published/v1/runtime-catalog.json', 'dist/**', '!dist/academy/**', '!dist/newtab/index.html', '!dist/newtab/sw.js', '!dist/newtab/version.json', '!dist/newtab/manifest.webmanifest'],
});
const compileAcademy = async () => {
    runner.refresh();
    await run('compile-academy', 'node node_modules/vite/bin/vite.js build --config config/vite/academy.config.ts', academyBuildInputs(ROOT), {
        restoreOutputs: true, stableInputs: true,
        outputs: ['dist/academy/**'],
        env: ['YOMU_CHECK_RELEASE', 'YOMU_ACADEMY_BUILD_DIR'],
    });
};
const academyCompilation = parallelAcademy ? compileAcademy() : null;
// Observe early rejection now; build still awaits and propagates the original.
if (academyCompilation) academyCompilation.catch(() => {});
const build = (async () => {
    await readerBuild;
    runner.refresh();
    const sync = run('sync-docs-userscript', 'node scripts/sync-docs-userscript.cjs', [...syncSources, 'public/newtab/**', 'scripts/**', 'config/**', '!config/ci/content-addressed-retention.json', 'tsconfig*.json', 'docs/public/pdf-reader/**', 'docs/public/video-player/**', 'docs/public/hosted-reader-worker.js', ...hostedTemplates.map(path => `!${path}`)], {
        extra: [history, hostedTemplateInputs(ROOT)],
        canonicalizesOutputs: true,
        restoreOutputs: true,
        diskInputs: [...syncSources, 'dist/yomu.user.js', 'dist/yomu.css', 'dist/greasyfork/**', 'dist/newtab/app.js', 'dist/newtab/styles.css'],
        outputs: ['config/ci/content-addressed-retention.json', 'dist/newtab/index.html', 'dist/newtab/sw.js', 'dist/newtab/version.json', 'dist/newtab/manifest.webmanifest', 'docs/public/yomu.user.js', 'docs/public/yomu.css', 'docs/public/yomu.*.css', 'docs/public/greasyfork/**', 'docs/public/study/**', 'docs/public/newtab/**', 'docs/public/hosted-runtime-graph.js', 'docs/public/hosted-appearance-settings.js', 'docs/public/pdf-reader/index.html', 'docs/public/pdf-reader/sw.js', 'docs/public/video-player/index.html', 'docs/public/video-player/sw.js'],
    });
    await sync;
    if (academyCompilation) await academyCompilation;
    else await compileAcademy();
    runner.refresh();
    await run('build-academy', 'node scripts/sync-academy.cjs', ['public/academy/**', 'scripts/sync-academy.cjs', 'scripts/lib/academy-*.cjs'], {
        restoreOutputs: true,
        diskInputs: ['docs/public/hosted-runtime-graph.js', 'docs/public/yomu.css', 'dist/academy/**'],
        outputs: ['docs/public/academy/**'],
        env: ['YOMU_CHECK_RELEASE', 'YOMU_SYNC_ACADEMY_FORCE', 'YOMU_ACADEMY_OUTPUT_DIR', 'YOMU_ACADEMY_BUILD_DIR'],
    });
})();
// Reader build uses five slots; tsc reserves four. A tenth slot can compile
// Academy independently. Small/forced/release checks keep the serial graph.

async function sourceRatchets() {
    await run('complexity-ratchet', 'node scripts/complexity-audit.mjs', source, { env: ['YOMU_COMPLEXITY_MAX'] });
    await run('file-size-ratchet', 'node scripts/file-size-audit.mjs', source, { env: ['YOMU_FILE_SIZE_THRESHOLD'] });
    await run('dead-code-ratchet', 'RAYON_NUM_THREADS=1 npm run -s quality:dead-code', all);
}
// Academy owns the spare slot first. Audits then overlap tests and stay within
// the shared worker budget rather than holding the test lane behind the ratchets.
const audits = (async () => {
    await Promise.all([readerBuild, academyCompilation]);
    reserve('audits', overlapCompiler ? 1 : 0);
    try { await sourceRatchets(); } finally { reserve('audits', 0); }
})();
const inventory = (async () => {
    await build;
    runner.refresh();
    const retention = captureRetentionInputs(ROOT);
    writeFileSync(join(LOG_DIR, 'retention-inputs.json'), JSON.stringify(retention));
    await Promise.all([
    run('repository-hygiene', 'npm run -s check:repository', ['scripts/check-repository-hygiene.mjs', 'scripts/lib/academy-build-manifest.cjs', 'docs/**', '!docs/public/**', '!docs/.vitepress/dist/**', '!docs/.vitepress/cache/**', '!docs/.vitepress/.temp/**', 'docs/public/academy/manifest.json'], { extra: Object.keys(runner.snapshot) }),
    run('content-addressed-retention', 'node scripts/prune-content-addressed-assets.mjs --check --snapshot=artifacts/check-logs/retention-inputs.json', ['scripts/lib/content-addressed-retention.mjs', 'scripts/prune-content-addressed-assets.mjs', 'config/ci/content-addressed-retention.json'], { extra: stageKey({ command: 'retention-inputs', inputs: retention, extra: history }) }),
    ]);
})();
const tooling = (async () => {
    if (!overlapCompiler) await build;
    else await readerBuild;
    const inputs = await compilerInputList;
    runner.refresh();
    const contract = toolingStageContract(runner.snapshot, inputs);
    reserve('tooling', overlapCompiler ? 2 : 0);
    try {
        // node:test owns negative-probe output; its exit status is authoritative.
        await run('tooling-tests', 'node --test --test-concurrency=2 tests/tooling/*.test.mjs', contract.inputs, { extra: contract.extra });
    } finally { reserve('tooling', 0); }
})();
const typecheck = (async () => {
    try {
        if (!overlapCompiler) await build;
        runner.refresh();
        const inputs = await compilerInputList;
        await run('typecheck', 'npm run -s typecheck', inputs, {
            diskInputs: inputs, stableInputs: true, extra: ROOT,
            outputs: ['artifacts/typecheck/tsconfig.tsbuildinfo'], restoreOutputs: true,
        });
    } finally { reserve('compiler', 0); }
})();
const tests = (async () => {
    // Readers inspect shipped bytes through fs. Plan/key them after writers,
    // never against an old snapshot while build/sync replace their inputs.
    await build;
    const [readerPlan, academyPlan] = localBudget >= 2
        ? await Promise.all([planTests('reader'), planTests('academy')])
        : [await planTests('reader'), await planTests('academy')];
    if (!releaseCheck && !readerPlan.full && !academyPlan.full) {
        await run('test-local', 'node scripts/run-local-tests.mjs', testInputs, {
            test: true, extra: { reader: readerPlan, academy: academyPlan }, env: testEnv, diskInputs: ['dist/**', 'docs/public/**'],
        });
    } else {
        await typecheck;
        await run('test-reader', readerPlan.full || releaseCheck ? 'npm run -s test:ci' : 'node scripts/run-affected-tests.mjs reader', testInputs, {
            test: true, extra: readerPlan.full ? 'full' : readerPlan, env: testEnv, diskInputs: ['dist/**', 'docs/public/**'],
        });
        if (readerPlan.full) readerPlan.saveFullPass();
        await run('test-academy', academyPlan.full || releaseCheck ? 'npm run -s test:academy' : 'node scripts/run-affected-tests.mjs academy', testInputs, {
            test: true, env: testEnv, extra: academyPlan.full ? 'full' : academyPlan, diskInputs: ['dist/**', 'docs/public/**'],
        });
        if (academyPlan.full) academyPlan.saveFullPass();
    }
})();
const diagnostics = (async () => {
    await Promise.all([tests, typecheck]);
    runner.refresh();
    await run('test-workers', 'npm run -s test:workers', workerStageInputs(ROOT, runner.snapshot), { test: true, env: testEnv });

})();
for (const promise of [audits, inventory, tooling]) promise.catch(() => {});
const docs = (async () => {
    await Promise.all([diagnostics, tooling, audits, inventory]);
    await buildDocs(runner, 'precheck');
    runner.refresh();
    await run('userscript-weight', 'node scripts/check-userscript-weight.cjs', ['scripts/check-userscript-weight.cjs', 'scripts/lib/**'], { diskInputs: ['dist/yomu.user.js', 'dist/greasyfork/**'] });
    // docs:build's own cache verifies both pre-checks and the rendered outputs.
    await buildDocs(runner, 'render', { materialize: releaseCheck || options.noCache });
})();
const results = await Promise.allSettled([...preflights, typecheck, build, tests, diagnostics, tooling, audits, inventory, docs]);
const failures = results.filter(result => result.status === 'rejected');
try {
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'check stages failed');
    runner.refresh();
    // verify always runs last, including its untracked/ignored disk products.
    await run('verify', `npm run -s verify${releaseCheck || options.noCache ? '' : ' -- --local-gate'}`, [], { uncached: true });
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
