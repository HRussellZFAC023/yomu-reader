import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

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
    let ctx;
    try {
        const require = createRequire(join(root, 'package.json'));
        const ts = require('typescript');
        const create = createContext ?? (await import('vitest/node')).createVitest;
        ctx = await create('test', { root, config, watch: false, isolate: true }, { envFile: false, server: { hmr: false } });
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
