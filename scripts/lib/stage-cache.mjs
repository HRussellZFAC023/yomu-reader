// A pass belongs to bytes, a command and its runtime, never to a timestamp.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { OutputStore } from './cache-outputs.mjs';

const VERSION = 1;
const forbidden = path => /(^|\/)(?:\.env(?:\..*)?|secrets?)(?:\/|$)/i.test(path);
const digest = value => createHash('sha256').update(value).digest('hex');
// Invocation-local only: reused bytes were read or restored in this process.
// No mtime-based hash decisions survive a gate invocation.
const byteProofs = new Map();
const fingerprint = info => [info.dev, info.ino, info.size, info.mode, info.mtimeNs, info.ctimeNs].join(':');
export function git(root, args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}

function compilePatterns(patterns) {
    const exact = new Set();
    const predicates = [];
    const magic = /[?*{[]/;
    const visible = value => value.replace(/(^|\/)\./g, '$1__dot__');
    for (const pattern of patterns) {
        if (!magic.test(pattern)) exact.add(pattern);
        else if (pattern === '**') predicates.push(() => true);
        else if (pattern.endsWith('/**') && !magic.test(pattern.slice(0, -3))) {
            const prefix = pattern.slice(0, -2);
            predicates.push(path => path.startsWith(prefix) || path === prefix.slice(0, -1));
        } else {
            // Node's globstar omits dotfiles. Input declarations include them.
            const normalized = visible(pattern);
            predicates.push(path => matchesGlob(visible(path), normalized));
        }
    }
    return path => exact.has(path) || predicates.some(predicate => predicate(path));
}

function inputMatcher(patterns) {
    const included = compilePatterns(patterns.filter(pattern => !pattern.startsWith('!')));
    const excluded = compilePatterns(patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1)));
    return path => included(path) && !excluded(path);
}

function fileHash(root, path, algorithm = 'sha256', gitObject = false) {
    if (forbidden(path)) throw new Error(`Refusing to read a secret input: ${path}`);
    const absolute = join(root, path);
    if (!existsSync(absolute)) return null;
    const info = lstatSync(absolute, { bigint: true });
    const identity = fingerprint(info);
    const kind = `${gitObject ? 'git' : 'raw'}_${algorithm}`;
    const previous = byteProofs.get(absolute);
    if (previous?.identity === identity && previous[kind]) return previous[kind];
    const bytes = info.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
    const header = `blob ${bytes.length}\0`;
    const proof = {
        identity,
        raw_sha256: createHash('sha256').update(bytes).digest('hex'),
        git_sha1: createHash('sha1').update(header).update(bytes).digest('hex'),
        git_sha256: createHash('sha256').update(header).update(bytes).digest('hex'),
    };
    byteProofs.set(absolute, proof);
    return proof[kind];
}

export function repositorySnapshot(root) {
    const entries = new Map();
    for (const row of git(root, ['ls-files', '-s', '-z']).split('\0').filter(Boolean)) {
        const separator = row.indexOf('\t');
        const metadata = row.slice(0, separator);
        const path = row.slice(separator + 1);
        const [mode, oid, stage] = metadata.split(' ');
        if (stage !== '0') throw new Error('Resolve the index conflict before checking.');
        entries.set(path, { mode, oid });
    }
    const format = git(root, ['rev-parse', '--show-object-format']).trim();
    const dirty = new Set(git(root, ['ls-files', '-m', '-d', '-o', '--exclude-standard', '-z']).split('\0').filter(Boolean));
    for (const path of dirty) {
        if (forbidden(path)) continue;
        const oid = fileHash(root, path, format, true);
        if (oid === null) entries.delete(path);
        else {
            const info = lstatSync(join(root, path));
            const mode = info.isSymbolicLink() ? '120000' : (info.mode & 0o111) ? '100755' : '100644';
            entries.set(path, { mode, oid });
        }
    }
    return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
}

export function selectInputs(snapshot, patterns) {
    const matches = inputMatcher(patterns);
    return Object.fromEntries(Object.entries(snapshot).filter(([path]) => matches(path)));
}

export function stageKey({ command, inputs, env = {}, extra = null, node = process.version }) {
    return digest(JSON.stringify({ version: VERSION, command, inputs, env, extra, node, platform: process.platform, arch: process.arch }));
}

// Output paths deliberately use the filesystem, including ignored/untracked
// products. Git's index cannot prove that a previous build is still on disk.
function outputPaths(root, patterns) {
    const files = new Set();
    const matches = inputMatcher(patterns);
    function walk(path) {
        if (forbidden(path) || !existsSync(join(root, path))) return;
        const info = lstatSync(join(root, path));
        if (!info.isDirectory()) {
            if (matches(path)) files.add(path);
            return;
        }
        for (const name of readdirSync(join(root, path)).sort()) walk(path === '.' ? name : `${path}/${name}`);
    }
    const roots = new Set(patterns.filter(pattern => !pattern.startsWith('!')).map(pattern => {
        const prefix = pattern.split(/[?*{[]/)[0];
        if (prefix === pattern) return pattern;
        return prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix);
    }));
    for (const path of roots) walk(path);
    return [...files].sort();
}

export function outputHashes(root, patterns) {
    return Object.fromEntries(outputPaths(root, patterns).map(path => [path, fileHash(root, path)]));
}

export function writeJson(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(temporary, JSON.stringify(value));
    renameSync(temporary, path);
}

export function readJson(path) {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export class StageCache {
    constructor(root, { noCache = false, directory } = {}) {
        this.root = root;
        this.noCache = noCache;
        this.directory = directory ?? join(resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim()), 'yomu-check-cache', `v${VERSION}`);
        this.outputStore = new OutputStore(root, this.directory);
    }
    markerPath(name, key) { return join(this.directory, 'passes', name.replace(/[^\w-]/g, '_'), `${key}.json`); }
    hit(name, key, outputs = [], restoreOutputs = false) {
        if (this.noCache) return false;
        const marker = readJson(this.markerPath(name, key));
        if (!marker || marker.key !== key) return false;
        if (restoreOutputs) {
            const matches = inputMatcher(outputs);
            if (!Object.keys(marker.outputs).every(path => matches(path) && !forbidden(path))) return false;
            if (!this.outputStore.restore(marker.outputs, marker.files, outputPaths(this.root, outputs))) return false;
            for (const [path, hash] of Object.entries(marker.outputs)) {
                const absolute = join(this.root, path);
                byteProofs.set(absolute, {
                    identity: fingerprint(lstatSync(absolute, { bigint: true })), raw_sha256: hash,
                    git_sha1: marker.files[path].git?.sha1, git_sha256: marker.files[path].git?.sha256,
                });
            }
            return true;
        }
        return JSON.stringify(marker.outputs) === JSON.stringify(outputHashes(this.root, outputs));
    }
    async run({ name, key, outputs = [], finalKey, restoreOutputs = false }, execute) {
        if (this.hit(name, key, outputs, restoreOutputs)) return { cached: true };
        rmSync(this.markerPath(name, key), { force: true });
        // Throwing/rejecting never reaches the only marker write.
        await execute();
        const hashes = outputHashes(this.root, outputs);
        if (outputs.length && Object.keys(hashes).length === 0) throw new Error(`${name} produced no declared outputs`);
        const passedKey = finalKey ? finalKey() : key;
        const files = restoreOutputs && !process.env.CI ? this.outputStore.capture(hashes, path => ({
            sha1: fileHash(this.root, path, 'sha1', true), sha256: fileHash(this.root, path, 'sha256', true),
        })) : undefined;
        writeJson(this.markerPath(name, passedKey), { key: passedKey, outputs: hashes, files });
        return { cached: false };
    }
}
