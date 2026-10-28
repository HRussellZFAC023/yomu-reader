const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const BUILD_MANIFEST = 'dist/academy/manifest.json';
const ENTRY = 'src/academy/entrypoint.ts';

function assetPath(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(value)
        || value.startsWith('/') || value.split('/').includes('..')
        || path.posix.normalize(value) !== value) {
        throw new Error(`Invalid Academy emitted asset path: ${value}`);
    }
    return value;
}

/** Vite owns selection. Follow its static and dynamic edges, CSS and assets. */
function academyBuildManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || !manifest[ENTRY]?.isEntry) {
        throw new Error('Academy Vite manifest has no entrypoint.');
    }
    const files = new Set();
    const initialStyles = new Set();
    const visited = new Set();
    function visit(key, initial) {
        const visitKey = `${key}:${initial}`;
        if (visited.has(visitKey)) return;
        visited.add(visitKey);
        const item = manifest[key];
        if (!item || typeof item !== 'object') throw new Error(`Missing Academy manifest dependency: ${key}`);
        files.add(assetPath(item.file));
        for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
            if (item[field] !== undefined && !Array.isArray(item[field])) throw new Error(`Invalid Academy manifest ${field}: ${key}`);
        }
        for (const file of item.css ?? []) {
            files.add(assetPath(file));
            if (initial) initialStyles.add(file);
        }
        for (const file of item.assets ?? []) files.add(assetPath(file));
        for (const child of item.imports ?? []) visit(child, initial);
        for (const child of item.dynamicImports ?? []) visit(child, false);
    }
    visit(ENTRY, true);
    return { entryFile: assetPath(manifest[ENTRY].file), initialStyles: [...initialStyles].sort(), files: [...files].sort() };
}

function academyBuildSources(readJson) {
    return [[BUILD_MANIFEST, 'manifest.json'], ...academyBuildManifest(readJson(BUILD_MANIFEST)).files.map(file => [`dist/academy/${file}`, file])];
}

function academyAssetUrl(file, build, revision) {
    return `/academy/${file}${file === build.entryFile || file === 'manifest.json' ? `?v=${revision}` : ''}`;
}

function renderAcademyTemplate(source, revision, manifest) {
    const build = academyBuildManifest(manifest);
    return source.replaceAll('__ACADEMY_REVISION__', revision)
        .replaceAll('__ACADEMY_ENTRY_URL__', academyAssetUrl(build.entryFile, build, revision))
        .replaceAll('<!--__ACADEMY_ENTRY_STYLES__-->', build.initialStyles.map(file => `<link rel="stylesheet" href="${academyAssetUrl(file, build, revision)}" />`).join('\n    '))
        .replaceAll('__ACADEMY_CODE_ASSETS__', JSON.stringify(['manifest.json', ...build.files].map(file => academyAssetUrl(file, build, revision))));
}

function academyHostedCounterpart(source) {
    return source.startsWith('dist/academy/')
        ? `docs/public/academy/${assetPath(source.slice('dist/academy/'.length))}` : source;
}

/** Inspect the complete code graph, never just the small entry shim. */
function academyBuildCode(readText, allowLegacy = false) {
    const source = readText('manifest.json');
    const files = source === null && allowLegacy ? ['app.js'] : academyBuildManifest(source === null ? null : JSON.parse(source)).files.filter(file => file.endsWith('.js'));
    return files.map(file => {
        const code = readText(file);
        if (code === null) throw new Error(`Missing Academy emitted code: ${file}`);
        return code;
    }).join('\n');
}

function readAcademyBuildCode(directory) {
    return academyBuildCode(file => {
        const target = path.join(directory, file);
        return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    });
}

function academyEmittedFilesMatch(manifest, readBuilt, readHosted) {
    return ['manifest.json', ...academyBuildManifest(manifest).files].every(file => {
        const built = readBuilt(file);
        const hosted = readHosted(file);
        return built !== null && hosted !== null && Buffer.from(built).equals(Buffer.from(hosted));
    });
}

function academyBuildFile(directory, pathname) {
    if (!pathname.startsWith('/academy/')) return null;
    const file = pathname.slice('/academy/'.length);
    const graph = academyBuildManifest(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')));
    return file === 'manifest.json' || graph.files.includes(file) ? path.join(directory, file) : null;
}

/** Render isolated browser-proof servers from their own build, not stale hosted files. */
function academyProofTemplate(directory, sourceDirectory, pathname) {
    const file = ['/academy', '/academy/', '/academy/index.html'].includes(pathname) ? 'index.html'
        : pathname === '/academy/sw.js' ? 'sw.js' : null;
    if (!file) return null;
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const digest = createHash('sha256');
    for (const asset of ['manifest.json', ...academyBuildManifest(manifest).files]) {
        digest.update(asset).update('\0').update(fs.readFileSync(path.join(directory, asset))).update('\0');
    }
    const revision = `s1-${digest.digest('hex').slice(0, 12)}`;
    return {
        contentType: file === 'sw.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
        body: renderAcademyTemplate(fs.readFileSync(path.join(sourceDirectory, file), 'utf8'), revision, manifest),
    };
}

module.exports = { BUILD_MANIFEST, academyBuildManifest, academyBuildSources, academyHostedCounterpart, renderAcademyTemplate, academyBuildCode, readAcademyBuildCode, academyBuildFile, academyProofTemplate, academyEmittedFilesMatch };
