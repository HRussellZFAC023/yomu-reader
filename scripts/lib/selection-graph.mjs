// A Vite-discovered graph can be reused when every module's import topology is
// unchanged. Bodies and read targets are refreshed from current bytes. No mtime
// proof survives an invocation, and new tests/configuration invalidate discovery.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { outputHashes, readJson, repositorySnapshot, selectInputs, stageKey, writeJson } from './stage-cache.mjs';
import { readTargets } from './read-targets.mjs';
import { runtimeEnv, testEnvironment, buildEnv } from './stage-runner.mjs';

export function graphStore(root, config, ts) {
    let snapshot;
    try { snapshot = repositorySnapshot(root); } catch { return null; }
    const path = join(root, 'artifacts/check-logs', config ? 'graph-academy.json' : 'graph-reader.json');
    const key = stageKey({ command: 'test-import-graph-v1', inputs: selectInputs(snapshot, [
        'package*.json', 'config/**', '!config/ci/content-addressed-retention.json', 'vite.config.ts', 'tsconfig*.json',
        'scripts/lib/test-selection.mjs', 'scripts/lib/read-targets.mjs', 'scripts/lib/selection-graph.mjs',
    ]), env: Object.fromEntries([...runtimeEnv, ...testEnvironment, ...buildEnv].map(name => [name, process.env[name] ?? null])),
    extra: [config, Object.keys(snapshot).filter(path => /\.(?:[cm]?[jt]sx?|json|vue)$/.test(path)), outputHashes(root, ['node_modules/.package-lock.json'])] });
    const inspect = file => {
        const source = readFileSync(file, 'utf8');
        const hash = createHash('sha256').update(source).digest('hex');
        const reads = /\.[cm]?[jt]sx?$/.test(file) ? readTargets(source, file, root, ts) : { targets: [], modules: [], unknown: [] };
        const shape = /\.[cm]?[jt]sx?$/.test(file) ? JSON.stringify({
            imports: ts.preProcessFile(source, true, true).importedFiles.map(entry => entry.fileName), modules: reads.modules, targets: reads.targets,
        }) : hash;
        return { hash, shape, reads };
    };
    return {
        inspect,
        load() {
            const saved = readJson(path);
            if (!saved || saved.key !== key) return null;
            try {
                for (const [file, previous] of Object.entries(saved.modules)) {
                    const source = readFileSync(join(root, file), 'utf8');
                    const hash = createHash('sha256').update(source).digest('hex');
                    if (hash === previous.hash) continue;
                    const current = inspect(join(root, file));
                    if (current.shape !== previous.shape) return null;
                    saved.modules[file] = current;
                }
                this.modules = saved.modules;
                return saved.graph;
            } catch { return null; }
        },
        save(graph, modules) { writeJson(path, { key, graph, modules: Object.fromEntries([...modules].map(([file, data]) => [relative(root, file), data])) }); },
    };
}
