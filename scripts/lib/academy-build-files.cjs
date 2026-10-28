// Filesystem access is separate from pure manifest/graph transformations.
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { academyBuildManifest, academyBuildCode, renderAcademyTemplate } = require('./academy-build-manifest.cjs');

function readAcademyBuildCode(directory) {
    return academyBuildCode(file => {
        const target = path.join(directory, file);
        return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
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

module.exports = { readAcademyBuildCode, academyBuildFile, academyProofTemplate };
