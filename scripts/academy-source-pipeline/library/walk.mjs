import { lstatSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { compareUtf8 } from '../io.mjs';

/**
 * Deterministic, symlink-safe walk of the authorized library root.
 *
 * Every filesystem entry — including dotfiles, directories, symlinks and
 * special files — yields exactly one record, so the ledger can account for
 * the whole tree. Symlinks are NEVER followed: they are recorded with an
 * explicit confinement state instead, so no walk can escape the root or
 * loop through a link cycle. Directory hard-link cycles are detected via
 * (dev, inode) identity.
 */
export function walkLibrary(libraryRoot) {
    const realRoot = realpathSync(libraryRoot);
    const visitedDirectories = new Set();
    const entries = [];
    walkDirectory(realRoot, '', visitedDirectories, entries);
    return entries;
}

function walkDirectory(realRoot, relativeDir, visitedDirectories, entries) {
    const absoluteDir = relativeDir === '' ? realRoot : path.join(realRoot, relativeDir);
    const stats = lstatSync(absoluteDir);
    const identity = `${stats.dev}:${stats.ino}`;
    if (visitedDirectories.has(identity)) {
        entries.push(record(relativeDir, 'directory', stats, { state: 'excluded:directory-cycle-detected' }));
        return;
    }
    visitedDirectories.add(identity);
    if (relativeDir !== '') entries.push(record(relativeDir, 'directory', stats, { state: 'directory' }));

    const children = readdirSync(absoluteDir, { withFileTypes: true })
        .map(child => child.name)
        .sort(compareUtf8);
    for (const name of children) {
        const relativePath = relativeDir === '' ? name : `${relativeDir}/${name}`;
        const absolutePath = path.join(realRoot, relativePath);
        const childStats = lstatSync(absolutePath);
        if (childStats.isSymbolicLink()) {
            entries.push(describeSymlink(realRoot, relativePath, absolutePath, childStats));
        } else if (childStats.isDirectory()) {
            walkDirectory(realRoot, relativePath, visitedDirectories, entries);
        } else if (childStats.isFile()) {
            entries.push(record(relativePath, 'file', childStats, { state: 'unclassified' }));
        } else {
            entries.push(record(relativePath, 'special', childStats, { state: 'excluded:special-file' }));
        }
    }
}

function describeSymlink(realRoot, relativePath, absolutePath, stats) {
    let confinement;
    try {
        const resolved = realpathSync(absolutePath);
        confinement = resolved === realRoot || resolved.startsWith(realRoot + path.sep)
            ? 'symlink-inside-root-not-followed'
            : 'symlink-escapes-root-not-followed';
    } catch {
        confinement = 'symlink-broken';
    }
    let targetShape = 'unreadable';
    try {
        targetShape = path.isAbsolute(readlinkSync(absolutePath)) ? 'absolute' : 'relative';
    } catch { /* recorded as unreadable */ }
    return record(relativePath, 'symlink', stats, { state: `excluded:${confinement}`, symlinkTargetShape: targetShape });
}

function record(relativePath, entryKind, stats, extra) {
    return {
        relativePath,
        entryKind,
        byteLength: entryKind === 'file' ? stats.size : null,
        mtimeMs: stats.mtimeMs,
        ...extra,
    };
}
