import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { trimCommonWrapperIndent } = require('./trim-userscript-indent.cjs');
const artifacts = path.join(root, 'artifacts/offline-starter-boundary');
const baselineRef = process.argv.find(value => value.startsWith('--baseline-ref='))?.split('=')[1] ?? 'HEAD';
const baselineSource = execFileSync('git', ['show', `${baselineRef}:src/reader/dictionaries/offline-setup.ts`], { cwd: root, encoding: 'utf8' });
assert.ok(baselineSource.includes("from './recommended'"), 'Choose a baseline ref whose installer predates the starter projection.');

const targets = [
    { id: 'aggregate', config: 'config/vite/greasyfork-library.config.ts', library: 'runtime', format: 'runtime', provider: 'projection' },
    { id: 'settings', config: 'config/vite/greasyfork-library.config.ts', library: 'settings-surface', format: 'library', provider: 'catalog' },
    { id: 'study', config: 'config/vite/newtab.config.ts', format: 'study', provider: 'catalog' },
    { id: 'study-self-contained', config: 'config/vite/newtab.config.ts', mode: 'self-contained', provider: 'catalog' },
    { id: 'study-extension', config: 'config/vite/newtab-extension.config.ts', provider: 'packaged-catalog' },
    { id: 'reader-self-contained', config: 'vite.config.ts', mode: 'self-contained', provider: 'packaged-catalog' },
    { id: 'reader-split', config: 'vite.config.ts', provider: 'none' },
] as const;
type Target = typeof targets[number];
const selected = process.argv.find(value => value.startsWith('--surface='))?.split('=')[1];
assert.ok(!selected || targets.some(target => target.id === selected), `Unknown surface: ${selected}`);
const report: unknown[] = [];
const sourceSnapshots = new Map<string, Map<string, string>>();
const originalMode = process.env.YOMU_USERSCRIPT_BUNDLE_MODE;
const originalLibrary = process.env.YOMU_GREASYFORK_LIBRARY_ID;
try {
    for (const target of targets.filter(target => !selected || target.id === selected)) {
        setEnvironment('YOMU_USERSCRIPT_BUNDLE_MODE', 'mode' in target ? target.mode : undefined);
        setEnvironment('YOMU_GREASYFORK_LIBRARY_ID', 'library' in target ? target.library : undefined);
        const before = await measure(target, true);
        const after = await measure(target, false);
        const sharedSource = assertSameSharedSource(target.id);
        const row = { surface: target.id, before, after, deltaBytes: after.bytes - before.bytes, sharedSource };
        report.push(row);
        console.log(JSON.stringify(row));
    }
} finally {
    setEnvironment('YOMU_USERSCRIPT_BUNDLE_MODE', originalMode);
    setEnvironment('YOMU_GREASYFORK_LIBRARY_ID', originalLibrary);
}
mkdirSync(artifacts, { recursive: true });
writeFileSync(path.join(artifacts, selected ? `report-${selected}.json` : 'report.json'), `${JSON.stringify({
    baselineRef,
    baselineInstallerSha256: createHash('sha256').update(baselineSource).digest('hex'),
    comparison: 'Same current configurations and source; before substitutes only the pre-projection offline-setup.ts. No hosted artifact baseline.',
    report,
}, null, 2)}\n`);

async function measure(target: Target, baseline: boolean) {
    const outDir = path.join(artifacts, target.id, baseline ? 'before' : 'after');
    const modules = new Map<string, number>();
    const sourceHashes = new Map<string, string>();
    const proof: Plugin = {
        name: 'yomu-offline-starter-bundle-proof',
        enforce: 'pre',
        load(id) {
            if (baseline && id === path.join(root, 'src/reader/dictionaries/offline-setup.ts')) return baselineSource;
        },
        transform(code, id) {
            const relative = path.relative(root, id).split(path.sep).join('/');
            if (relative.startsWith('src/') || relative.startsWith('config/')) {
                sourceHashes.set(relative, createHash('sha256').update(code).digest('hex'));
            }
            return null;
        },
        renderChunk(_code, chunk) {
            for (const [id, module] of Object.entries(chunk.modules)) {
                if (module.renderedLength > 0) modules.set(path.relative(root, id).split(path.sep).join('/'), module.renderedLength);
            }
            return null;
        },
    };
    await build({ configFile: path.join(root, target.config), publicDir: false, logLevel: 'warn', plugins: [proof], build: { outDir, emptyOutDir: true } });
    const has = (suffix: string) => [...modules.keys()].some(id => id.endsWith(suffix));
    const graph = {
        projection: has('config/dictionaries/published/v1/offline-starters.json'),
        catalog: has('config/dictionaries/published/v1/runtime-catalog.json'),
        packagedCatalog: has('catalog/runtime-catalog-extension-page.ts') || has('catalog/runtime-catalog-extension-content.ts'),
        packagedAdapter: has('catalog/runtime-catalog-extension-page.ts') ? 'page' : has('catalog/runtime-catalog-extension-content.ts') ? 'content' : null,
        fullProvider: has('dictionaries/offline-starters-catalog.ts'),
        projectedProvider: has('dictionaries/offline-starters-projection.ts'),
        installer: has('dictionaries/offline-setup.ts'),
    };
    const expectation = baseline && target.provider === 'projection' ? 'catalog' : target.provider;
    assert.equal(graph.projection, !baseline && expectation === 'projection', `${target.id}: projection payload`);
    assert.equal(graph.catalog, expectation === 'catalog', `${target.id}: catalogue payload`);
    assert.equal(graph.packagedCatalog, expectation === 'packaged-catalog', `${target.id}: packaged catalogue loader`);
    assert.equal(graph.installer, expectation !== 'none', `${target.id}: offline capability`);
    assert.equal(graph.fullProvider, !baseline && ['catalog', 'packaged-catalog'].includes(expectation), `${target.id}: full provider`);
    assert.equal(graph.projectedProvider, !baseline && expectation === 'projection', `${target.id}: projected provider`);
    let viteRawBytes = 0;
    const files = javascriptFiles(outDir).map(file => {
        let code = readFileSync(file, 'utf8');
        viteRawBytes += Buffer.byteLength(code);
        const format = 'format' in target ? target.format : undefined;
        if (format === 'runtime' || format === 'library') code = trimCommonWrapperIndent(code, format === 'runtime');
        if (format) code = code.replace(/^([A-Za-z][A-Za-z0-9_]*)\t[ \t]*$/gm, '$1');
        writeFileSync(file, code);
        return { file: path.relative(outDir, file), bytes: Buffer.byteLength(code), sha256: createHash('sha256').update(code).digest('hex') };
    });
    assert.ok(files.length, `${target.id}: no JavaScript output`);
    sourceSnapshots.set(`${target.id}/${baseline ? 'before' : 'after'}`, sourceHashes);
    writeFileSync(path.join(outDir, 'module-graph.json'), `${JSON.stringify({ graph, modules: Object.fromEntries(modules), sourceHashes: Object.fromEntries(sourceHashes) }, null, 2)}\n`);
    return { bytes: files.reduce((sum, file) => sum + file.bytes, 0), viteRawBytes, formatting: 'format' in target ? target.format : 'vite-raw', graph, files };
}

function assertSameSharedSource(surface: string) {
    const before = sourceSnapshots.get(`${surface}/before`)!;
    const after = sourceSnapshots.get(`${surface}/after`)!;
    const common = [...before.keys()].filter(id => after.has(id) && id !== 'src/reader/dictionaries/offline-setup.ts').sort();
    assert.ok(common.length, `${surface}: no source fingerprint evidence`);
    for (const id of common) assert.equal(after.get(id), before.get(id), `${surface}: source changed during comparison: ${id}`);
    return { modules: common.length, sha256: createHash('sha256').update(common.map(id => `${id}:${before.get(id)}`).join('\n')).digest('hex') };
}

function javascriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? javascriptFiles(file) : file.endsWith('.js') ? [file] : [];
    });
}

function setEnvironment(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
}
