import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectInputs, readJson } from './stage-cache.mjs';
import { readTargets } from './read-targets.mjs';
import { graphStore } from './selection-graph.mjs';

export async function selectAffectedTests(root, changed, { config, createContext } = {}) {
    if (!changed.length) return { full: false, tests: [], reason: 'zero tests: no changed inputs since the full pass' };
    if (createContext) return discover(root, changed, { config, createContext });
    // Vite mutates NODE_ENV and caches config. Discovery owns a child process.
    return new Promise(resolve => {
        const child = fork(fileURLToPath(import.meta.url), ['--discover'], { cwd: root, env: { ...process.env, VITEST_ISOLATE: '1' }, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        let result;
        let diagnostic = '';
        const timeout = setTimeout(() => { diagnostic = 'dependency discovery timed out'; child.kill(); }, 60_000);
        child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4096); });
        child.on('message', message => { result = message; });
        child.on('error', error => { diagnostic = error.message; });
        child.on('close', code => {
            clearTimeout(timeout);
            resolve(code === 0 && result ? result : { full: true, reason: `dependency discovery could not prove selection: ${diagnostic || `exit ${code}`}` });
        });
        child.send({ root, changed, config });
    });
}

async function discover(root, changed, { config, createContext } = {}) {
    let ctx;
    try {
        const require = createRequire(join(root, 'package.json'));
        const ts = require('typescript');
        const store = createContext ? null : graphStore(root, config, ts);
        const modules = new Map();
        const inspect = file => {
            if (!modules.has(file)) modules.set(file, store ? store.inspect(file) : { reads: /\.[cm]?[jt]sx?$/.test(file)
                ? readTargets(readFileSync(file, 'utf8'), file, root, ts) : { targets: [], modules: [], unknown: [] } });
            return modules.get(file).reads;
        };
        let graph = store?.load();
        const reused = Boolean(graph);
        if (graph) for (const [file, data] of Object.entries(store.modules)) modules.set(join(root, file), data);
        if (!graph) {
            const create = createContext ?? (await import('vitest/node')).createVitest;
            ctx = await create('test', { root, config, watch: false, isolate: true }, { envFile: false, server: { hmr: { port: 0 } } });
            const specs = await ctx.globTestFiles();
            graph = { shared: [], setup: [], tests: {} };
            const dependencyCache = new Map();
            const dependencies = async (project, file) => {
                const key = `${project.config.name}:${file}`;
                if (!dependencyCache.has(key)) dependencyCache.set(key, await ctx.getTestDependencies([project, file]));
                return dependencyCache.get(key);
            };
            const moduleFile = path => [path, ...['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '/index.ts', '/index.js'].map(suffix => path + suffix)].find(file => existsSync(file) && statSync(file).isFile());
            for (const project of new Set(specs.map(([project]) => project))) {
                graph.shared.push(...project.server.config.configFileDependencies ?? []);
                for (const setup of project.config.setupFiles ?? []) {
                    const inputs = [setup, ...await dependencies(project, setup)];
                    graph.shared.push(...inputs);
                    graph.setup.push(...inputs);
                }
            }
            for (const [project, test] of specs) {
                const deps = new Set([test, ...await dependencies(project, test)]);
                for (const file of deps) {
                    for (const path of inspect(file).modules) {
                        const target = moduleFile(path);
                        if (!target) throw new Error(`unresolved module read: ${path}`);
                        if (deps.has(target)) continue;
                        deps.add(target);
                        for (const dep of await dependencies(project, target)) deps.add(dep);
                    }
                }
                graph.tests[relative(root, test)] = [...deps];
            }
            for (const file of new Set([...graph.shared, ...graph.setup])) inspect(file);
            store?.save(graph, modules);
        }
        return { ...selectFromGraph(root, changed, graph, inspect), graphReused: reused };
    } catch (error) {
        return { full: true, reason: `dependency discovery could not prove selection: ${error.message}` };
    } finally {
        await ctx?.close();
    }
}

function selectFromGraph(root, changed, graph, inspect) {
    const changes = new Set(changed.map(file => join(root, file)));
    const touches = targets => changed.some(path => Object.keys(selectInputs({ [path]: true }, targets)).length);
    if (graph.shared.some(file => changes.has(file))) return { full: true, reason: 'resolved config/setupFiles dependency changed' };
    if (graph.setup.some(file => inspect(file).unknown.length || touches(inspect(file).targets))) return { full: true, reason: 'setupFiles has changed or unbounded filesystem inputs' };
    const contracts = readJson(join(root, 'config/ci/local-contract-tests.json')) ?? {};
    const tests = [];
    const unresolved = {};
    const readIndex = {};
    let readSelected = 0;
    for (const [test, deps] of Object.entries(graph.tests)) {
        if (contracts[test]) continue;
        const declared = inspect(join(root, test)).declared;
        const targets = new Set();
        let precaution = false;
        for (const file of deps) {
            const reads = inspect(file);
            for (const target of reads.targets) targets.add(target);
            if (reads.unknown.length && !declared) {
                unresolved[relative(root, file)] = reads.unknown;
                precaution = true;
            }
        }
        readIndex[test] = [...targets].sort();
        const read = touches([...targets]);
        if (precaution || read || deps.some(file => changes.has(file))) {
            tests.push(test);
            if (read) readSelected++;
        }
    }
    return { full: false, tests: tests.sort(), unresolved, readIndex, contracts: Object.keys(contracts), reason: tests.length
        ? `${tests.length} selected files; ${readSelected} match filesystem targets; ${Object.keys(unresolved).length} unresolved modules`
        : 'zero tests: no import dependants or matching filesystem targets' };
}

if (process.argv[2] === '--discover') {
    process.once('message', async ({ root, changed, config }) => {
        const result = await discover(root, changed, { config });
        process.send(result, () => process.disconnect());
    });
}
