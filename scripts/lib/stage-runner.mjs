import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StageCache, outputHashes, repositorySnapshot, selectInputs, stageKey } from './stage-cache.mjs';
import { vitestOutputIndicatesFailure } from './check-log-guard.mjs';

export const runtimeEnv = ['CI', 'NODE_ENV', 'NODE_OPTIONS', 'TZ', 'LANG', 'LC_ALL'];
export const buildEnv = ['YOMU_USERSCRIPT_BUNDLE_MODE', 'YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID', 'YOMU_GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID', 'YOMU_READER_CSS_OUT', 'YOMU_NEW_TAB_CSS_OUT'];
export const testEnvironment = [
    'VITEST_ISOLATE', 'YOMU_HASH_MEMO', 'ACADEMY_REQUIRE_N3_SOURCE_FIDELITY',
    'ACADEMY_LIBRARY_ROOT', 'ACADEMY_SOURCE_CORPUS_ROOT', 'ACADEMY_SOYA_ROOT',
    'YOMU_ACADEMY_TEST_HOSTED_DIR', 'YOMU_JAPANESE_LIBRARY_ROOT', 'YOMU_JAPANESE_ROOT',
    'YOMU_SOYA_RESEARCH_ROOT', 'YOMU_DOCS_BROWSER', 'YOMU_PLAYWRIGHT_CHANNEL',
    'YOMU_PRINT_MINING_CORPUS', 'YOMU_PROFILE_BASELINE_DIR', 'YOMU_PROFILE_CANDIDATE_DIR',
    'YOMU_PROFILE_COMPARISON_OUTPUT', 'YOMU_PROFILE_E2E',
];
const cacheImplementation = ['package.json', 'package-lock.json', 'scripts/lib/stage-cache.mjs', 'scripts/lib/cache-outputs.mjs', 'scripts/lib/stage-runner.mjs'];

export class StageRunner {
    constructor(root, options = {}) {
        this.root = root;
        this.prefix = options.prefix ?? 'check';
        this.cache = new StageCache(root, options);
        this.timings = [];
        this.started = performance.now();
        this.logDirectory = join(root, 'artifacts', `${this.prefix}-logs`);
        mkdirSync(this.logDirectory, { recursive: true });
        this.refresh();
    }
    refresh() { this.snapshot = repositorySnapshot(this.root); }
    key(stage) {
        const env = Object.fromEntries([...runtimeEnv, ...(stage.env ?? [])].map(name => [name, process.env[name] ?? null]));
        return stageKey({ command: stage.command, inputs: selectInputs(this.snapshot, [...cacheImplementation, ...stage.inputs]), env, extra: [stage.extra, outputHashes(this.root, ['node_modules/.package-lock.json', ...(stage.diskInputs ?? [])])] });
    }
    async run(stage) {
        const start = performance.now();
        const key = stage.uncached ? null : this.key(stage);
        const stableKey = stage.stableInputs ? key ?? this.key(stage) : null;
        const patterns = [...cacheImplementation, ...stage.inputs];
        const before = stage.canonicalizesOutputs ? selectInputs(this.snapshot, patterns) : null;
        const finalKey = before ? () => {
            this.refresh();
            const after = selectInputs(this.snapshot, patterns);
            const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
                .filter(path => JSON.stringify(before[path]) !== JSON.stringify(after[path]));
            const outputChanges = selectInputs(Object.fromEntries(changed.map(path => [path, true])), stage.outputs ?? []);
            if (Object.keys(outputChanges).length !== changed.length) throw new Error(`${stage.name}: input changed during execution`);
            // Opt-in contract: this writer idempotently stamps its own templates.
            // Cache its canonical input/output pair, never edits to other inputs.
            return this.key(stage);
        } : undefined;
        const execute = async () => {
            await this.execute(stage);
            if (stableKey) {
                this.refresh();
                if (this.key(stage) !== stableKey) throw new Error(`${stage.name}: inputs changed during execution; no pass cached`);
            }
        };
        const result = stage.uncached ? (await execute(), { cached: false })
            : await this.cache.run({ ...stage, key, finalKey }, execute);
        const seconds = (performance.now() - start) / 1000;
        this.timings.push({ name: stage.name, seconds, cached: result.cached });
        console.log(`[${this.prefix}] ${result.cached ? 'cached' : 'pass  '} ${stage.name} (${seconds.toFixed(2)}s)`);
        return key;
    }
    execute(stage) {
        console.log(`[${this.prefix}] start ${stage.name}`);
        return new Promise((resolve, reject) => {
            const child = spawn('sh', ['-c', stage.command], {
                cwd: this.root,
                env: { ...process.env, ...(this.cache.noCache ? { YOMU_CHECK_NO_CACHE: '1' } : {}) },
            });
            const chunks = [];
            const log = join(this.logDirectory, `${stage.name.replace(/[^\w-]/g, '_')}.log`);
            writeFileSync(log, '');
            const consume = chunk => { chunks.push(chunk); appendFileSync(log, chunk); };
            child.stdout.on('data', consume);
            child.stderr.on('data', consume);
            child.on('error', reject);
            child.on('close', (code, signal) => {
                const output = Buffer.concat(chunks);
                const guard = stage.test && vitestOutputIndicatesFailure(output.toString());
                if (code === 0 && !signal && !guard) return resolve();
                process.stderr.write(output);
                reject(new Error(`${stage.name}: ${guard ?? signal ?? `exit ${code}`}`));
            });
        });
    }
    summary(passed) {
        const seconds = (performance.now() - this.started) / 1000;
        for (const timing of [...this.timings].sort((a, b) => b.seconds - a.seconds)) {
            console.log(`  ${timing.seconds.toFixed(2).padStart(7)}s  ${timing.name}${timing.cached ? ' (cached)' : ''}`);
        }
        writeFileSync(join(this.logDirectory, 'timings.json'), JSON.stringify({ seconds, passed, timings: this.timings }, null, 2));
        console.log(`[${this.prefix}] ${passed ? 'PASS' : 'FAIL'} in ${seconds.toFixed(2)}s (wall clock)`);
    }
}

export function cacheOptions() {
    return {
        noCache: process.argv.includes('--no-cache') || process.env.YOMU_CHECK_NO_CACHE === '1' || Boolean(process.env.CI),
        persistOutputs: !process.env.CI,
    };
}
