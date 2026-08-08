import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const TOOL_PACKAGE_NAMES = Object.freeze(['playwright', 'playwright-core', 'typescript']);
const TOOL_FILES = Object.freeze(['package.json', 'package-lock.json', '.nvmrc']);

export function profileDriverProvenance(entryPath, repositoryRoot) {
    const root = resolve(repositoryRoot);
    const sourceFiles = transitiveLocalImportFiles(entryPath, root).map(path => fileDescriptor(path, root));
    const toolFiles = TOOL_FILES.map(path => resolve(root, path))
        .filter(existsSync)
        .map(path => fileDescriptor(path, root));
    const trackedPaths = [...sourceFiles, ...toolFiles].map(file => file.path);
    const runtime = runtimeVersions(root);
    const tools = Object.fromEntries(TOOL_PACKAGE_NAMES.map(name => [name, packageIdentity(root, name)]));
    const browserRegistry = browserRegistryIdentity(root);
    return {
        sourceSha256: aggregateDescriptorSha256(sourceFiles),
        environmentSha256: sha256(JSON.stringify({ toolFiles, runtime, tools, browserRegistry })),
        gitCommit: gitOutput(root, ['rev-parse', 'HEAD']),
        dirtyPaths: gitOutput(root, ['status', '--short', '--', ...trackedPaths])
            .split(/\r?\n/u)
            .filter(Boolean),
        files: sourceFiles,
        toolFiles,
        runtime,
        tools,
        browserRegistry,
    };
}

export function transitiveLocalImportFiles(entryPath, repositoryRoot) {
    const root = resolve(repositoryRoot);
    const pending = [assertInsideRoot(resolve(entryPath), root)];
    const visited = new Set();
    while (pending.length > 0) {
        visitLocalImport(pending.pop(), root, pending, visited);
    }
    return [...visited].sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

function visitLocalImport(path, root, pending, visited) {
    if (visited.has(path)) return;
    if (!existsSync(path)) throw new Error(`Profiler driver import is missing: ${path}`);
    visited.add(path);
    for (const specifier of localImportSpecifiers(path)) {
        pending.push(assertInsideRoot(resolveLocalImport(path, specifier), root));
    }
}

function localImportSpecifiers(path) {
    const source = readFileSync(path, 'utf8');
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const specifiers = [];
    function visit(node) {
        collectStaticImport(node, specifiers, path);
        collectDynamicImport(node, specifiers, path);
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return specifiers.filter(specifier => specifier.startsWith('.'));
}

function collectStaticImport(node, specifiers, path) {
    const moduleSpecifier = staticModuleSpecifier(node);
    if (moduleSpecifier) collectLiteralSpecifier(moduleSpecifier, specifiers, path);
}

function staticModuleSpecifier(node) {
    if (ts.isImportDeclaration(node)) return node.moduleSpecifier;
    if (ts.isExportDeclaration(node)) return node.moduleSpecifier;
    return null;
}

function collectDynamicImport(node, specifiers, path) {
    if (!isDynamicImport(node)) return;
    if (node.arguments.length !== 1) throw new Error(`Non-literal dynamic import in profiler closure: ${path}`);
    collectLiteralSpecifier(node.arguments[0], specifiers, path);
}

function isDynamicImport(node) {
    return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function collectLiteralSpecifier(node, specifiers, path) {
    if (!ts.isStringLiteralLike(node)) throw new Error(`Non-literal import in profiler closure: ${path}`);
    specifiers.push(node.text);
}

function resolveLocalImport(importerPath, specifier) {
    const unresolved = resolve(dirname(importerPath), specifier);
    const candidates = [unresolved, `${unresolved}.mjs`, `${unresolved}.js`, `${unresolved}.ts`];
    const resolved = candidates.find(existsSync);
    if (!resolved) throw new Error(`Unable to resolve profiler driver import ${specifier} from ${importerPath}`);
    return resolved;
}

function assertInsideRoot(path, root) {
    const relativePath = relative(root, path);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
        throw new Error(`Profiler driver import escapes repository root: ${path}`);
    }
    return path;
}

function fileDescriptor(path, root) {
    const contents = readFileSync(path);
    return {
        path: relative(root, path),
        bytes: contents.length,
        sha256: sha256(contents),
    };
}

function aggregateDescriptorSha256(files) {
    const aggregate = createHash('sha256');
    for (const file of files) aggregate.update(file.path).update('\0').update(file.sha256).update('\0');
    return aggregate.digest('hex');
}

function runtimeVersions(root) {
    const nvmrcPath = resolve(root, '.nvmrc');
    return {
        expectedNode: existsSync(nvmrcPath) ? readFileSync(nvmrcPath, 'utf8').trim() : null,
        node: process.version,
        v8: process.versions.v8,
        icu: process.versions.icu,
        uv: process.versions.uv,
        openssl: process.versions.openssl,
    };
}

function packageIdentity(root, name) {
    const manifestPath = resolve(root, 'node_modules', name, 'package.json');
    if (!existsSync(manifestPath)) return null;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
    const locked = packageLockEntry(lock, name);
    return {
        version: nullableValue(manifest.version),
        lockedVersion: nullableValue(locked.version),
        integrity: nullableValue(locked.integrity),
        manifestSha256: sha256(readFileSync(manifestPath)),
    };
}

function packageLockEntry(lock, name) {
    const packages = lock.packages || {};
    return packages[`node_modules/${name}`] || {};
}

function nullableValue(value) {
    return value === undefined ? null : value;
}

function browserRegistryIdentity(root) {
    const browsersPath = resolve(root, 'node_modules/playwright-core/browsers.json');
    if (!existsSync(browsersPath)) return null;
    const contents = readFileSync(browsersPath);
    const manifest = JSON.parse(contents.toString('utf8'));
    return {
        sha256: sha256(contents),
        browsers:
            manifest.browsers?.map(browser => ({
                name: browser.name,
                revision: browser.revision,
                browserVersion: browser.browserVersion,
                installByDefault: browser.installByDefault,
            })) ?? [],
    };
}

function gitOutput(root, args) {
    try {
        return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    } catch (error) {
        throw new Error(`Unable to record profiler Git provenance: git ${args.join(' ')}`, { cause: error });
    }
}

function sha256(contents) {
    return createHash('sha256').update(contents).digest('hex');
}
