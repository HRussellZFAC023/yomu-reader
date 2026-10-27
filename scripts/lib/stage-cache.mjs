// A pass belongs to bytes, a command and its runtime, never to a timestamp.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, matchesGlob, resolve } from 'node:path';

const VERSION = 1;
const forbidden = path => /(^|\/)(?:\.env(?:\..*)?|secrets?)(?:\/|$)/i.test(path);
const digest = value => createHash('sha256').update(value).digest('hex');
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
    const info = lstatSync(absolute);
    const bytes = info.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
    const hash = createHash(algorithm);
    if (gitObject) hash.update(`blob ${bytes.length}\0`);
    return hash.update(bytes).digest('hex');
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
export function outputHashes(root, patterns) {
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
    return Object.fromEntries([...files].sort().map(path => [path, fileHash(root, path)]));
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
    }
    markerPath(name, key) { return join(this.directory, 'passes', name.replace(/[^\w-]/g, '_'), `${key}.json`); }
    hit(name, key, outputs = []) {
        if (this.noCache) return false;
        const marker = readJson(this.markerPath(name, key));
        if (!marker || marker.key !== key) return false;
        return JSON.stringify(marker.outputs) === JSON.stringify(outputHashes(this.root, outputs));
    }
    async run({ name, key, outputs = [], finalKey }, execute) {
        if (this.hit(name, key, outputs)) return { cached: true };
        rmSync(this.markerPath(name, key), { force: true });
        // Throwing/rejecting never reaches the only marker write.
        await execute();
        const hashes = outputHashes(this.root, outputs);
        if (outputs.length && Object.keys(hashes).length === 0) throw new Error(`${name} produced no declared outputs`);
        const passedKey = finalKey ? finalKey() : key;
        writeJson(this.markerPath(name, passedKey), { key: passedKey, outputs: hashes });
        return { cached: false };
    }
}
