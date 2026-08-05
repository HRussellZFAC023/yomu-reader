import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const CORE_CAST_FILES = [
    '/academy/art/ACADEMY-ASSET-REGISTRY.json',
    '/academy/art/ASSET-USAGE.json',
    '/academy/art/SPRITE-BATCH-MANIFEST.json',
];

export async function refreshAcademyRuntimeArtPrecache(repoRoot) {
    const runtimeAssets = await loadAcademyRuntimeAssets(repoRoot);
    const artPaths = [...new Set(Object.values(runtimeAssets)
        .flatMap(asset => Object.values(asset.files ?? {}))
        .filter(assetPath => assetPath.startsWith('/academy/art/')))]
        .sort();
    const paths = [...CORE_CAST_FILES, ...artPaths];
    if (new Set(paths).size !== paths.length) {
        throw new Error('Academy runtime-art precache contains duplicate paths.');
    }

    // public/academy/sw.js is the TEMPLATE, and the only file to edit. The
    // committed docs/public/academy/sw.js is rendered from it by
    // scripts/sync-academy.cjs, which substitutes the content-derived revision
    // token that check:artifacts recomputes from HEAD. Writing the rendered copy
    // here was worse than redundant: it re-stamped the precache list while
    // leaving the OLD revision in place, which is exactly the staleness the
    // committed-artifacts gate fails on. Run build:academy to regenerate it.
    const relative = 'public/academy/sw.js';
    const serviceWorkerFile = path.join(repoRoot, relative);
    let source = fs.readFileSync(serviceWorkerFile, 'utf8');
    const replacement = [
        'const RUNTIME_ART_PRECACHE = [',
        ...paths.map(assetPath => `    '${assetPath}',`),
        '];',
    ].join('\n');
    const marker = /const (?:CAST_SPRITE|RUNTIME_ART)_PRECACHE = \[[\s\S]*?\n\];/u;
    if (!marker.test(source)) {
        throw new Error(`Missing runtime-art precache in ${relative}.`);
    }
    source = source
        .replace(marker, replacement)
        .replace('...CAST_SPRITE_PRECACHE,', '...RUNTIME_ART_PRECACHE,');
    fs.writeFileSync(serviceWorkerFile, replaceCoreWithoutHandMaintainedArt(source, relative));
}

async function loadAcademyRuntimeAssets(repoRoot) {
    const result = await build({
        entryPoints: [path.join(repoRoot, 'src/academy/assets.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        write: false,
    });
    const compiled = { exports: {} };
    Function('module', 'exports', result.outputFiles[0].text)(compiled, compiled.exports);
    return compiled.exports.ACADEMY_RUNTIME_ASSET_REGISTRY;
}

function replaceCoreWithoutHandMaintainedArt(source, relative) {
    const marker = /const CORE = \[([\s\S]*?)\n\];/u;
    const match = source.match(marker);
    if (!match) throw new Error(`Missing CORE precache in ${relative}.`);
    const body = match[1]
        .split('\n')
        .filter(line => !/^\s+'\/academy\/art\/[^']+',?\s*$/u.test(line))
        .join('\n');
    return source.replace(marker, `const CORE = [${body}\n];`);
}
