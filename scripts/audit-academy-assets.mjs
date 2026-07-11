#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSET_USAGE_SCHEMA = 'yomu-academy-asset-usage/v1';
export const GENERATED_BY = 'scripts/audit-academy-assets.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(scriptDirectory, '..');
export const MANIFEST_PATH = join(REPO_ROOT, 'public', 'academy', 'art', 'asset-usage.json');

export const ASSET_ROOTS = Object.freeze({
    public: 'public/academy',
    references: 'references-academy',
});

export const RUNTIME_SOURCE_INPUTS = Object.freeze([
    'src/academy',
    'academy-studio.html',
    'public/academy/index.html',
]);

export const RASTER_EXTENSIONS = Object.freeze([
    '.ani', '.apng', '.avif', '.bmp', '.cur', '.dib', '.gif', '.heic', '.heif',
    '.ico', '.j2c', '.j2k', '.jfif', '.jp2', '.jpe', '.jpeg', '.jpg', '.jxl',
    '.png', '.tga', '.tif', '.tiff', '.webp',
]);
export const VECTOR_EXTENSIONS = Object.freeze([
    '.ai', '.emf', '.eps', '.ps', '.svg', '.svgz', '.wmf',
]);
export const AUDIO_EXTENSIONS = Object.freeze([
    '.aac', '.ac3', '.aif', '.aiff', '.alac', '.amr', '.ape', '.au', '.caf',
    '.flac', '.m4a', '.mid', '.midi', '.mka', '.mp3', '.oga', '.ogg', '.opus',
    '.ra', '.snd', '.wav', '.weba', '.wma',
]);
export const EXTENSIONS = Object.freeze({
    raster: RASTER_EXTENSIONS,
    vector: VECTOR_EXTENSIONS,
    audio: AUDIO_EXTENSIONS,
});

export const DEFAULT_HASH_CONCURRENCY = 16;

const SCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const TEXT_SOURCE_EXTENSIONS = new Set(['.css', '.htm', '.html']);
const WILDCARD = '*';
const EXTENSION_TO_KIND = new Map([
    ...RASTER_EXTENSIONS.map((extension) => [extension, 'raster']),
    ...VECTOR_EXTENSIONS.map((extension) => [extension, 'vector']),
    ...AUDIO_EXTENSIONS.map((extension) => [extension, 'audio']),
]);
const MEDIA_EXTENSION_PATTERN = [...EXTENSION_TO_KIND.keys()]
    .map((extension) => escapeRegex(extension.slice(1)))
    .sort((left, right) => right.length - left.length || compareStrings(left, right))
    .join('|');
const ASSET_TOKEN_PATTERN =
    "(?:https?:\\/\\/[^\\s\"'`<>]+\\/academy\\/|public\\/academy\\/|\\/academy\\/|(?:\\.\\.\\/|\\.\\/)?(?:art|audio|media)\\/)" +
    "[^\\s\"'`<>()\\\\]*?\\.(?:" + MEDIA_EXTENSION_PATTERN + ")" +
    "(?:[?#][^\\s\"'`<>)]*)?";

const USAGE = [
    'Usage: node scripts/audit-academy-assets.mjs [--check] [--output <file>]',
    '',
    'Without --check, writes the deterministic Academy asset manifest.',
    'With --check, exits nonzero when the existing manifest is missing or stale.',
].join('\n');

export class AssetAuditError extends Error {}

export function classifyExtension(fileName) {
    const extension = extname(fileName).toLowerCase();
    const kind = EXTENSION_TO_KIND.get(extension);
    return kind === undefined ? null : { extension, kind };
}

export function toRepoPosix(absolutePath, repoRoot = REPO_ROOT) {
    return relative(repoRoot, absolutePath).split(sep).join('/');
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertDirectory(absolutePath, label) {
    let metadata;
    try {
        metadata = await stat(absolutePath);
    } catch {
        throw new AssetAuditError(`Required directory is missing or unreadable: ${label}`);
    }
    if (!metadata.isDirectory()) {
        throw new AssetAuditError(`Required directory is not a directory: ${label}`);
    }
}

async function walkFiles(rootAbsolutePath) {
    const rootRealPath = await realpath(rootAbsolutePath);
    const directories = [{
        absolutePath: rootAbsolutePath,
        ancestorRealPaths: new Set([rootRealPath]),
    }];
    const files = [];

    while (directories.length > 0) {
        const directory = directories.pop();
        const entries = await readdir(directory.absolutePath, { withFileTypes: true });
        entries.sort((left, right) => compareStrings(left.name, right.name));

        for (const entry of entries) {
            const absolutePath = join(directory.absolutePath, entry.name);
            if (entry.isDirectory()) {
                const childRealPath = await realpath(absolutePath);
                directories.push({
                    absolutePath,
                    ancestorRealPaths: new Set(directory.ancestorRealPaths).add(childRealPath),
                });
                continue;
            }
            if (entry.isFile()) {
                files.push(absolutePath);
                continue;
            }
            if (entry.isSymbolicLink()) {
                try {
                    const metadata = await stat(absolutePath);
                    if (metadata.isFile()) {
                        files.push(absolutePath);
                    } else if (metadata.isDirectory()) {
                        const targetRealPath = await realpath(absolutePath);
                        if (!directory.ancestorRealPaths.has(targetRealPath)) {
                            directories.push({
                                absolutePath,
                                ancestorRealPaths: new Set(directory.ancestorRealPaths).add(targetRealPath),
                            });
                        }
                    }
                } catch {
                    // A broken link has no asset bytes to inventory.
                }
            }
        }
    }

    return files.sort(compareStrings);
}

export function hashFile(absolutePath) {
    return new Promise((resolveHash, reject) => {
        const hash = createHash('sha256');
        const input = createReadStream(absolutePath);
        let bytes = 0;

        input.on('data', (chunk) => {
            bytes += chunk.byteLength;
            hash.update(chunk);
        });
        input.on('error', reject);
        input.on('end', () => resolveHash({ bytes, sha256: hash.digest('hex') }));
    });
}

async function mapWithConcurrency(values, concurrency, worker) {
    const results = new Array(values.length);
    let nextIndex = 0;

    async function runWorker() {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await worker(values[index], index);
        }
    }

    const workerCount = Math.min(values.length, concurrency);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
}

export async function inventoryAssets(
    rootAbsolutePath,
    rootRelativePath,
    repoRoot = REPO_ROOT,
    hashConcurrency = DEFAULT_HASH_CONCURRENCY,
) {
    await assertDirectory(rootAbsolutePath, rootRelativePath);
    if (!Number.isInteger(hashConcurrency) || hashConcurrency < 1) {
        throw new AssetAuditError('Hash concurrency must be a positive integer.');
    }

    const assetFiles = (await walkFiles(rootAbsolutePath))
        .filter((absolutePath) => classifyExtension(absolutePath) !== null);

    return mapWithConcurrency(assetFiles, hashConcurrency, async (absolutePath) => {
        const media = classifyExtension(absolutePath);
        const payload = await hashFile(absolutePath);
        return {
            path: toRepoPosix(absolutePath, repoRoot),
            root: rootRelativePath,
            kind: media.kind,
            extension: media.extension,
            bytes: payload.bytes,
            sha256: payload.sha256,
        };
    });
}

function extractAssetMatches(value) {
    const matcher = new RegExp(ASSET_TOKEN_PATTERN, 'gi');
    const matches = [];
    let match;
    while ((match = matcher.exec(value)) !== null) {
        matches.push({ index: match.index, token: match[0] });
    }
    return matches;
}

function normalizeRuntimePattern(token) {
    let value = token.trim()
        .replace(/\$\{[^}]+\}/g, WILDCARD)
        .split(/[?#]/, 1)[0]
        .replaceAll('\\', '/');

    const academyMarker = value.indexOf('/academy/');
    if (/^https?:\/\//i.test(value)) {
        if (academyMarker === -1) return null;
        value = value.slice(academyMarker + '/academy/'.length);
    } else if (value.startsWith('public/academy/')) {
        value = value.slice('public/academy/'.length);
    } else if (value.startsWith('/academy/')) {
        value = value.slice('/academy/'.length);
    } else {
        value = value.replace(/^\.\//, '');
        if (value.startsWith('../')) return null;
        if (!/^(?:art|audio|media)\//.test(value)) return null;
    }

    const normalized = value.split('/').filter((segment) => segment !== '.').join('/');
    if (normalized.length === 0 || normalized.split('/').includes('..')) return null;
    return `public/academy/${normalized}`;
}

function patternToRegex(pattern) {
    let regex = '^';
    for (const character of pattern) {
        regex += character === WILDCARD ? '[^/]*' : escapeRegex(character);
    }
    return new RegExp(`${regex}$`);
}

function scriptKindFor(filePath, ts) {
    const extension = extname(filePath).toLowerCase();
    if (extension === '.tsx') return ts.ScriptKind.TSX;
    if (extension === '.jsx') return ts.ScriptKind.JSX;
    if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}

function collectStringBindings(sourceFile, ts) {
    const bindings = new Map();
    function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
            bindings.set(node.name.text, node.initializer);
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return bindings;
}

function evaluateStringPattern(node, bindings, ts, resolving = new Set()) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
        return evaluateStringPattern(node.expression, bindings, ts, resolving);
    }
    if (ts.isIdentifier(node)) {
        const initializer = bindings.get(node.text);
        if (initializer === undefined || resolving.has(node.text)) return WILDCARD;
        const nextResolving = new Set(resolving).add(node.text);
        return evaluateStringPattern(initializer, bindings, ts, nextResolving);
    }
    if (ts.isTemplateExpression(node)) {
        let value = node.head.text;
        for (const span of node.templateSpans) {
            value += evaluateStringPattern(span.expression, bindings, ts, resolving);
            value += span.literal.text;
        }
        return value;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        return evaluateStringPattern(node.left, bindings, ts, resolving)
            + evaluateStringPattern(node.right, bindings, ts, resolving);
    }
    return WILDCARD;
}

function isInspectableStringNode(node, ts) {
    return ts.isStringLiteral(node)
        || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateExpression(node)
        || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken);
}

async function scanScriptFile(absolutePath, sourcePath, ts) {
    const source = await readFile(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        absolutePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(absolutePath, ts),
    );
    const bindings = collectStringBindings(sourceFile, ts);
    const references = [];

    function visit(node) {
        if (isInspectableStringNode(node, ts)) {
            const value = evaluateStringPattern(node, bindings, ts);
            for (const match of extractAssetMatches(value)) {
                const pattern = normalizeRuntimePattern(match.token);
                if (pattern === null) continue;
                references.push({
                    source: sourcePath,
                    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                    match: pattern.includes(WILDCARD) ? 'pattern' : 'literal',
                    expression: match.token,
                    pattern,
                });
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return references;
}

function blankMatchedText(value) {
    return value.replace(/[^\r\n]/g, ' ');
}

function sourceLineAt(value, index) {
    let line = 1;
    for (let position = 0; position < index; position += 1) {
        if (value.charCodeAt(position) === 10) line += 1;
    }
    return line;
}

async function scanTextSourceFile(absolutePath, sourcePath) {
    const source = await readFile(absolutePath, 'utf8');
    let searchable = source.replace(/\/\*[\s\S]*?\*\//g, blankMatchedText);
    if (/\.html?$/i.test(absolutePath)) {
        searchable = searchable.replace(/<!--[\s\S]*?-->/g, blankMatchedText);
    }

    return extractAssetMatches(searchable).flatMap((match) => {
        const pattern = normalizeRuntimePattern(match.token);
        if (pattern === null) return [];
        return [{
            source: sourcePath,
            line: sourceLineAt(searchable, match.index),
            match: pattern.includes(WILDCARD) ? 'pattern' : 'literal',
            expression: match.token,
            pattern,
        }];
    });
}

async function loadTypeScript(providedTypeScript) {
    if (providedTypeScript !== undefined) return providedTypeScript.default ?? providedTypeScript;
    try {
        const module = await import('typescript');
        return module.default ?? module;
    } catch {
        throw new AssetAuditError('The TypeScript package is required to scan Academy runtime source.');
    }
}

export async function scanRuntimeReferences(repoRoot = REPO_ROOT, options = {}) {
    const sourceRootRelativePath = options.sourceRootRelativePath ?? RUNTIME_SOURCE_INPUTS[0];
    const entrypointRelativePaths = options.entrypointRelativePaths ?? RUNTIME_SOURCE_INPUTS.slice(1);
    const sourceRootAbsolutePath = join(repoRoot, sourceRootRelativePath);
    await assertDirectory(sourceRootAbsolutePath, sourceRootRelativePath);

    const sourceFiles = (await walkFiles(sourceRootAbsolutePath)).filter((absolutePath) => {
        const extension = extname(absolutePath).toLowerCase();
        return SCRIPT_EXTENSIONS.has(extension) || TEXT_SOURCE_EXTENSIONS.has(extension);
    });

    for (const relativePath of entrypointRelativePaths) {
        const absolutePath = join(repoRoot, relativePath);
        try {
            if ((await stat(absolutePath)).isFile()) sourceFiles.push(absolutePath);
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
    }

    sourceFiles.sort(compareStrings);
    const ts = await loadTypeScript(options.ts);
    const references = [];
    for (const absolutePath of sourceFiles) {
        const sourcePath = toRepoPosix(absolutePath, repoRoot);
        const extension = extname(absolutePath).toLowerCase();
        const fileReferences = SCRIPT_EXTENSIONS.has(extension)
            ? await scanScriptFile(absolutePath, sourcePath, ts)
            : await scanTextSourceFile(absolutePath, sourcePath);
        references.push(...fileReferences);
    }

    const uniqueReferences = new Map();
    for (const reference of references) {
        const key = JSON.stringify(reference);
        if (!uniqueReferences.has(key)) uniqueReferences.set(key, reference);
    }
    return [...uniqueReferences.values()].sort(compareReferences);
}

function compareReferences(left, right) {
    return compareStrings(left.source, right.source)
        || left.line - right.line
        || compareStrings(left.match, right.match)
        || compareStrings(left.expression, right.expression)
        || compareStrings(left.pattern, right.pattern);
}

function manifestReference(reference) {
    return {
        source: reference.source,
        line: reference.line,
        match: reference.match,
        expression: reference.expression,
    };
}

function selectCanonical(members, runtimeReferencesByPath, publicRootRelativePath) {
    return [...members].sort((left, right) => {
        const leftUsed = left.root === publicRootRelativePath && runtimeReferencesByPath.has(left.path);
        const rightUsed = right.root === publicRootRelativePath && runtimeReferencesByPath.has(right.path);
        const leftRank = leftUsed ? 0 : left.root === publicRootRelativePath ? 1 : 2;
        const rightRank = rightUsed ? 0 : right.root === publicRootRelativePath ? 1 : 2;
        return leftRank - rightRank || compareStrings(left.path, right.path);
    })[0];
}

function metric() {
    return { assets: 0, bytes: 0 };
}

function summarize(assets, publicRootRelativePath, referencesRootRelativePath, duplicateGroups) {
    const summary = {
        assetCount: assets.length,
        byteCount: 0,
        runtimeReferencedAssetCount: 0,
        byRoot: {
            [publicRootRelativePath]: metric(),
            [referencesRootRelativePath]: metric(),
        },
        byKind: { raster: metric(), vector: metric(), audio: metric() },
        byClassification: {
            used: metric(),
            candidate: metric(),
            archive: metric(),
            duplicate: metric(),
        },
        duplicateGroupCount: duplicateGroups.length,
        duplicateAssetCount: 0,
        duplicateBytes: 0,
        shippedDuplicateAssetCount: 0,
        shippedDuplicateBytes: 0,
    };

    for (const asset of assets) {
        summary.byteCount += asset.bytes;
        summary.byRoot[asset.root].assets += 1;
        summary.byRoot[asset.root].bytes += asset.bytes;
        summary.byKind[asset.kind].assets += 1;
        summary.byKind[asset.kind].bytes += asset.bytes;
        summary.byClassification[asset.classification].assets += 1;
        summary.byClassification[asset.classification].bytes += asset.bytes;
        if (asset.runtimeReferences.length > 0) summary.runtimeReferencedAssetCount += 1;
        if (asset.classification === 'duplicate') {
            summary.duplicateAssetCount += 1;
            summary.duplicateBytes += asset.bytes;
            if (asset.root === publicRootRelativePath) {
                summary.shippedDuplicateAssetCount += 1;
                summary.shippedDuplicateBytes += asset.bytes;
            }
        }
    }
    return summary;
}

export async function buildManifest(options = {}) {
    const repoRoot = resolve(options.repoRoot ?? REPO_ROOT);
    const publicRootRelativePath = options.publicRootRelativePath ?? ASSET_ROOTS.public;
    const referencesRootRelativePath = options.referencesRootRelativePath ?? ASSET_ROOTS.references;
    const sourceRootRelativePath = options.sourceRootRelativePath ?? RUNTIME_SOURCE_INPUTS[0];
    const entrypointRelativePaths = options.entrypointRelativePaths ?? RUNTIME_SOURCE_INPUTS.slice(1);
    const hashConcurrency = options.hashConcurrency ?? DEFAULT_HASH_CONCURRENCY;

    await Promise.all([
        assertDirectory(join(repoRoot, publicRootRelativePath), publicRootRelativePath),
        assertDirectory(join(repoRoot, referencesRootRelativePath), referencesRootRelativePath),
        assertDirectory(join(repoRoot, sourceRootRelativePath), sourceRootRelativePath),
    ]);

    const runtimeReferencesPromise = scanRuntimeReferences(repoRoot, {
        sourceRootRelativePath,
        entrypointRelativePaths,
        ts: options.ts,
    });
    const publicAssets = await inventoryAssets(
        join(repoRoot, publicRootRelativePath),
        publicRootRelativePath,
        repoRoot,
        hashConcurrency,
    );
    const referencesAssets = await inventoryAssets(
        join(repoRoot, referencesRootRelativePath),
        referencesRootRelativePath,
        repoRoot,
        hashConcurrency,
    );
    const runtimeReferences = await runtimeReferencesPromise;
    const assets = [...publicAssets, ...referencesAssets].sort((left, right) => compareStrings(left.path, right.path));

    const publicPaths = new Set(publicAssets.map((asset) => asset.path));
    const runtimeReferencesByPath = new Map();
    for (const reference of runtimeReferences) {
        const matcher = reference.match === 'pattern' ? patternToRegex(reference.pattern) : null;
        const matchingPaths = reference.match === 'literal'
            ? (publicPaths.has(reference.pattern) ? [reference.pattern] : [])
            : publicAssets
                .filter((asset) => matcher.test(asset.path))
                .map((asset) => asset.path);
        for (const assetPath of matchingPaths) {
            const existing = runtimeReferencesByPath.get(assetPath) ?? [];
            existing.push(manifestReference(reference));
            runtimeReferencesByPath.set(assetPath, existing);
        }
    }
    for (const [assetPath, references] of runtimeReferencesByPath) {
        const unique = new Map(references.map((reference) => [JSON.stringify(reference), reference]));
        runtimeReferencesByPath.set(assetPath, [...unique.values()].sort(compareReferences));
    }

    const membersByHash = new Map();
    for (const asset of assets) {
        const members = membersByHash.get(asset.sha256) ?? [];
        members.push(asset);
        membersByHash.set(asset.sha256, members);
    }

    const duplicateOfByPath = new Map();
    const duplicateGroups = [];
    for (const [sha256, members] of membersByHash) {
        if (members.length < 2) continue;
        const canonical = selectCanonical(members, runtimeReferencesByPath, publicRootRelativePath);
        const memberPaths = members.map((member) => member.path).sort(compareStrings);
        for (const memberPath of memberPaths) {
            if (memberPath !== canonical.path) duplicateOfByPath.set(memberPath, canonical.path);
        }
        duplicateGroups.push({
            sha256,
            bytes: canonical.bytes,
            canonicalPath: canonical.path,
            memberPaths,
        });
    }
    duplicateGroups.sort((left, right) => compareStrings(left.canonicalPath, right.canonicalPath));

    const manifestAssets = assets.map((asset) => {
        const runtimeAssetReferences = runtimeReferencesByPath.get(asset.path) ?? [];
        const duplicateOf = duplicateOfByPath.get(asset.path);
        const classification = duplicateOf !== undefined
            ? 'duplicate'
            : asset.root === referencesRootRelativePath
                ? 'candidate'
                : runtimeAssetReferences.length > 0 ? 'used' : 'archive';
        return {
            ...asset,
            classification,
            runtimeReferences: runtimeAssetReferences,
            ...(duplicateOf === undefined ? {} : { duplicateOf }),
        };
    });

    return {
        schema: ASSET_USAGE_SCHEMA,
        generatedBy: GENERATED_BY,
        determinism: {
            timestamps: 'omitted',
            pathOrder: 'repository-relative POSIX UTF-16 code-unit order',
            duplicateCanonicalization: [
                'runtime-referenced public asset',
                'other public asset',
                'references asset',
                'repository-relative path',
            ],
        },
        scope: {
            assetRoots: [publicRootRelativePath, referencesRootRelativePath],
            runtimeSources: [sourceRootRelativePath, ...entrypointRelativePaths],
            extensions: {
                raster: [...RASTER_EXTENSIONS],
                vector: [...VECTOR_EXTENSIONS],
                audio: [...AUDIO_EXTENSIONS],
            },
        },
        summary: summarize(manifestAssets, publicRootRelativePath, referencesRootRelativePath, duplicateGroups),
        duplicateGroups,
        assets: manifestAssets,
    };
}

export function serializeManifest(manifest) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseArguments(argv, repoRoot = REPO_ROOT) {
    const options = { check: false, help: false, output: join(repoRoot, 'public/academy/art/asset-usage.json') };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--help' || argument === '-h') {
            options.help = true;
        } else if (argument === '--check') {
            if (options.check) throw new AssetAuditError('--check may only be supplied once.');
            options.check = true;
        } else if (argument === '--output') {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new AssetAuditError('--output requires a file path.');
            }
            options.output = resolve(repoRoot, value);
            index += 1;
        } else {
            throw new AssetAuditError(`Unsupported option: ${argument}`);
        }
    }
    return options;
}

function formatSummary(summary) {
    const classifications = summary.byClassification;
    return [
        `assets=${summary.assetCount}`,
        `used=${classifications.used.assets}`,
        `candidate=${classifications.candidate.assets}`,
        `archive=${classifications.archive.assets}`,
        `duplicate=${classifications.duplicate.assets}`,
        `duplicateGroups=${summary.duplicateGroupCount}`,
        `shippedDuplicates=${summary.shippedDuplicateAssetCount}`,
    ].join(' ');
}

export async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout }) {
    const options = parseArguments(argv);
    if (options.help) {
        io.stdout.write(`${USAGE}\n`);
        return null;
    }

    const manifest = await buildManifest();
    const serialized = serializeManifest(manifest);
    if (options.check) {
        let existing;
        try {
            existing = await readFile(options.output, 'utf8');
        } catch {
            throw new AssetAuditError(`Manifest is missing or unreadable: ${toRepoPosix(options.output)}`);
        }
        if (existing !== serialized) {
            throw new AssetAuditError(`Academy asset manifest is stale: ${toRepoPosix(options.output)}`);
        }
        io.stdout.write(`Academy asset manifest is current. ${formatSummary(manifest.summary)}\n`);
        return manifest;
    }

    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, 'utf8');
    io.stdout.write(`Wrote ${toRepoPosix(options.output)}. ${formatSummary(manifest.summary)}\n`);
    return manifest;
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
    runCli().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
