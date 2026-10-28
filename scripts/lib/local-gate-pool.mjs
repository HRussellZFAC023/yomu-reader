// Bounded Vitest 1.6 fork scheduler using its public worker/RPC APIs. Reader
// files own fresh processes; reviewed Academy files may share modules, with a
// fresh environment per file, as in test:academy. No worker budget is doubled.
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { relative, matchesGlob, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';
import { runSlotQueue } from './slot-queue.mjs';
import { createMethodsRPC } from 'vitest/node';

const require = createRequire(import.meta.url);
const runtimeRequire = createRequire(require.resolve('vitest/package.json'));
const { default: Tinypool } = runtimeRequire('tinypool');
const { createBirpc } = runtimeRequire('birpc');
const { academyIsolatedFiles } = require('../../config/vite/academy-test.ts');
const worker = fileURLToPath(new URL('./local-gate-worker.mjs', import.meta.url));

function bridge(project) {
    const bus = new EventEmitter();
    const rpc = createBirpc(createMethodsRPC(project), {
        eventNames: ['onCancel'], serialize: v8.serialize,
        deserialize: bytes => v8.deserialize(Buffer.from(bytes)),
        post: bytes => bus.emit('to-worker', bytes), on: callback => bus.on('from-worker', callback),
        onTimeoutError: method => { throw new Error(`Local gate RPC timed out: ${method}`); },
    });
    project.ctx.onCancel(reason => rpc.onCancel(reason));
    return {
        channel: { onMessage: callback => bus.on('to-worker', callback), postMessage: bytes => bus.emit('from-worker', bytes) },
        close: () => bus.removeAllListeners(),
    };
}
function environment(project, file) {
    const source = readFileSync(file, 'utf8');
    let name = source.match(/@(?:vitest|jest)-environment\s+([\w-]+)\b/)?.[1];
    const local = relative(project.config.root, file).replaceAll('\\', '/');
    name ??= project.config.environmentMatchGlobs?.find(([glob]) => (matchesGlob(local, glob) || matchesGlob(file, glob)))?.[1];
    name ??= project.config.environment ?? 'node';
    const options = JSON.parse(source.match(/@(?:vitest|jest)-environment-options\s+(.+)/)?.[1] ?? 'null');
    return { name, transformMode: 'ssr', options: options ? { [name === 'happy-dom' ? 'happyDOM' : name]: options } : null };
}
function jobs(specs, budget) {
    const single = [];
    const shared = new Map();
    for (const [project, file] of specs) {
        const env = environment(project, file);
        const local = relative(project.config.root, file).replaceAll('\\', '/');
        const reusable = local.startsWith('tests/academy/') && !academyIsolatedFiles.includes(local);
        if (!reusable) single.push({ project, files: [file], environment: env, shared: false });
        else {
            const key = `${project.getName()}:${JSON.stringify(env)}`;
            if (!shared.has(key)) shared.set(key, { project, files: [], environment: env, shared: true });
            shared.get(key).files.push(file);
        }
    }
    const grouped = [];
    for (const group of shared.values()) {
        const count = Math.min(3, budget, Math.max(1, Math.ceil(group.files.length / 20)));
        for (let index = 0; index < count; index++) grouped.push({ ...group, files: group.files.filter((_, i) => i % count === index) });
    }
    return [...grouped, ...single];
}
export default function localGatePool(ctx, options) {
    const budget = Number(ctx.config.maxWorkers);
    if (!Number.isInteger(budget) || budget < 1) throw new Error('Missing local worker budget');
    const pool = new Tinypool({
        runtime: 'child_process', filename: worker, minThreads: 1, maxThreads: budget,
        isolateWorkers: true, concurrentTasksPerWorker: 1,
        env: options.env, execArgv: [...(ctx.config.poolOptions?.forks?.execArgv ?? []), ...options.execArgv],
        terminateTimeout: ctx.config.teardownTimeout,
    });
    ctx.onCancel(() => pool.cancelPendingTasks());
    let nextId = 0;
    return {
        name: 'local-gate', close: () => pool.destroy(),
        async runTests(specs, invalidates = []) {
            const tasks = jobs(specs, budget);
            console.log(`[local-pool] ${specs.length} files; ${tasks.length} jobs; ${budget} total forks`);
            const capacity = () => {
                if (!process.env.YOMU_CHECK_SESSION) return budget;
                try {
                    const state = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'artifacts/check-logs/compiler-budget.json'), 'utf8'));
                    if (state.session === process.env.YOMU_CHECK_SESSION) return budget - state.reserved;
                } catch { /* an unknown reservation cannot authorize extra workers */ }
                return budget - 4;
            };
            const results = await runSlotQueue(tasks, capacity, async task => {
                const { project, files } = task;
                ctx.state.clearFiles(project, files);
                const config = project.getSerializableConfig();
                const current = { ...config, pool: 'forks', poolOptions: { ...config.poolOptions, forks: { ...config.poolOptions?.forks, isolate: !task.shared } } };
                const link = bridge(project);
                const ids = files.map(() => ++nextId);
                try {
                    await pool.run({
                        pool: 'forks', worker, configBytes: v8.serialize(current).toString('base64'), files, invalidates,
                        environment: task.environment, workerIds: ids, projectName: project.getName(), providedContext: project.getProvidedContext(),
                    }, { name: 'run', channel: link.channel });
                } finally { link.close(); }
            });
            const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
            if (failures.length) throw new AggregateError(failures, 'Local test jobs did not finish');
        },
    };
}
