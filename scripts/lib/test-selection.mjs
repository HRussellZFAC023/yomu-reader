import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Import graphs do not describe filesystem reads, subprocesses or computed
// imports. Their owning tests participate in EVERY changed-tree selection.
// This deliberately over-selects rather than guessing at dynamic fs paths.
function hasUntrackedReads(source, ts) {
    const file = ts.createSourceFile('input.ts', source, ts.ScriptTarget.Latest, true);
    let unsafe = false;
    const io = node => node && ts.isStringLiteralLike(node) && /^(?:node:)?(?:fs(?:\/promises)?|child_process|module)$/.test(node.text);
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && io(node.moduleSpecifier)) unsafe = true;
        if (ts.isCallExpression(node)) {
            const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
            const require = ts.isIdentifier(node.expression) && node.expression.text === 'require';
            if ((dynamic || require) && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]) || io(node.arguments[0]))) unsafe = true;
            if (ts.isPropertyAccessExpression(node.expression) && /^(?:importActual|importMock)$/.test(node.expression.name.text)) unsafe = true;
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    return unsafe;
}

export async function selectAffectedTests(root, changed, { config, createContext } = {}) {
    if (!changed.length) return { full: false, tests: [], reason: 'zero tests: no changed inputs since the full pass' };
    if (changed.some(file => !existsSync(join(root, file)))) return { full: true, reason: 'deleted input; previous dependency edges cannot be proved' };
    if (createContext) return discover(root, changed, { config, createContext });
    // Vite mutates NODE_ENV and loads config into Node's module cache. Give
    // discovery its own process, and release its graph memory before testing.
    return new Promise(resolve => {
        const child = fork(fileURLToPath(import.meta.url), ['--discover'], { cwd: root, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
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
        const create = createContext ?? (await import('vitest/node')).createVitest;
        ctx = await create('test', { root, config, watch: false, isolate: true }, { envFile: false, server: { hmr: { port: 0 } } });
        const specs = await ctx.globTestFiles();
        const absoluteChanges = new Set(changed.map(file => join(root, file)));
        const safety = new Map();
        const opaque = file => {
            if (!safety.has(file)) safety.set(file, hasUntrackedReads(readFileSync(file, 'utf8'), ts));
            return safety.get(file);
        };
        const tests = [];
        let precautionary = 0;
        const projects = [...new Set(specs.map(([project]) => project))];
        for (const project of projects) {
            const shared = new Set(project.server.config.configFileDependencies ?? []);
            const setupInputs = new Set();
            for (const setup of project.config.setupFiles ?? []) {
                shared.add(setup);
                setupInputs.add(setup);
                for (const dep of await ctx.getTestDependencies([project, setup])) {
                    shared.add(dep);
                    setupInputs.add(dep);
                }
            }
            if ([...shared].some(file => absoluteChanges.has(file))) return { full: true, reason: 'resolved config/setupFiles dependency changed' };
            if ([...setupInputs].some(opaque)) return { full: true, reason: 'setupFiles has filesystem/subprocess/computed-import reads' };
        }
        // Sequential traversal bounds planning memory on the shared Mac.
        for (const spec of specs) {
            const deps = new Set([spec[1], ...await ctx.getTestDependencies(spec)]);
            const precaution = [...deps].some(opaque);
            if (precaution || [...deps].some(file => absoluteChanges.has(file))) {
                tests.push(relative(root, spec[1]));
                if (precaution) precautionary++;
            }
        }
        return { full: false, tests: tests.sort(), reason: tests.length
            ? `${tests.length} selected files; ${precautionary} include filesystem/subprocess/computed-import readers conservatively`
            : 'zero tests: no import dependants and no filesystem/subprocess/computed-import readers' };
    } catch (error) {
        return { full: true, reason: `dependency discovery could not prove selection: ${error.message}` };
    } finally {
        await ctx?.close();
    }
}

if (process.argv[2] === '--discover') {
    process.once('message', async ({ root, changed, config }) => {
        const result = await discover(root, changed, { config });
        process.send(result, () => process.disconnect());
    });
}
