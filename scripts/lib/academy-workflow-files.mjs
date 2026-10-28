// Filesystem capabilities stay outside the pure workflow model.
import fs from 'node:fs';
import path from 'node:path';

export function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pathIsInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function canonicalizeReservationPath(repoRoot, candidate) {
    const realRoot = fs.realpathSync.native(repoRoot);
    const lexical = path.resolve(repoRoot, candidate);
    let existing = lexical;
    const suffix = [];
    while (!fs.existsSync(existing)) {
        const parent = path.dirname(existing);
        if (parent === existing) throw new Error(`Reserved path has no existing parent: ${candidate}`);
        suffix.unshift(path.basename(existing));
        existing = parent;
    }
    const physical = path.resolve(fs.realpathSync.native(existing), ...suffix);
    const relative = path.relative(realRoot, physical);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Reserved file resolves outside the repository: ${candidate}`);
    }
    return relative.split(path.sep).join('/').normalize('NFC');
}

export function resolveConfinedFile(candidate, roots) {
    const lexical = path.resolve(candidate);
    const root = roots.map(value => path.resolve(value)).find(value => pathIsInside(value, lexical));
    if (!root) throw new Error(`Path is outside its allowed roots: ${candidate}`);
    if (!fs.existsSync(lexical) || !fs.statSync(lexical).isFile()) throw new Error(`File does not exist: ${candidate}`);
    if (fs.lstatSync(lexical).isSymbolicLink()) throw new Error(`File cannot be a symbolic link: ${candidate}`);
    const realRoot = fs.realpathSync.native(root);
    const absolute = fs.realpathSync.native(lexical);
    if (!pathIsInside(realRoot, absolute)) throw new Error(`Path resolves outside its allowed root: ${candidate}`);
    return { absolute, root, realRoot };
}

