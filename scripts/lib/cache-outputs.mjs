// Immutable, content-addressed output bytes. Restore with filesystem clones
// where available; copying a passed blob does not trust the destination's mtime.
import { chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export class OutputStore {
    constructor(root, directory) { this.root = resolve(root); this.directory = directory; }
    blob(hash) { return join(this.directory, 'outputs', hash); }
    target(path) {
        const target = resolve(this.root, path);
        if (!target.startsWith(`${this.root}${sep}`)) throw new Error('Cached output escapes the worktree');
        return target;
    }
    capture(hashes, gitHashes) {
        const files = {};
        mkdirSync(join(this.directory, 'outputs'), { recursive: true });
        for (const [path, hash] of Object.entries(hashes)) {
            const source = this.target(path);
            const info = lstatSync(source);
            const kind = info.isSymbolicLink() ? 'symlink' : 'file';
            const size = kind === 'symlink' ? Buffer.byteLength(readlinkSync(source)) : info.size;
            const blob = this.blob(hash);
            const existing = existsSync(blob) ? lstatSync(blob) : null;
            if (!existing?.isFile() || existing.size !== size || (existing.mode & 0o222)) {
                const temporary = `${blob}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
                if (kind === 'symlink') writeFileSync(temporary, readlinkSync(source));
                else copyFileSync(source, temporary, constants.COPYFILE_FICLONE);
                chmodSync(temporary, 0o444);
                renameSync(temporary, blob);
            }
            files[path] = { kind, size, mode: info.mode & 0o777, git: gitHashes(path) };
        }
        return files;
    }
    restore(hashes, files, currentPaths) {
        if (!files || Object.keys(hashes).length !== Object.keys(files).length) return false;
        // Validate the complete inventory before changing any destination.
        for (const [path, hash] of Object.entries(hashes)) {
            if (!/^[a-f0-9]{64}$/.test(hash) || !files[path]) return false;
            const blob = this.blob(hash);
            const info = existsSync(blob) ? lstatSync(blob) : null;
            if (!info?.isFile() || info.size !== files[path].size || (info.mode & 0o222)) return false;
            const target = this.target(path);
            if (existsSync(target) && lstatSync(target).isDirectory()) return false;
        }
        for (const path of currentPaths) if (!(path in hashes)) rmSync(this.target(path), { force: true });
        for (const [path, hash] of Object.entries(hashes)) {
            const target = this.target(path);
            mkdirSync(dirname(target), { recursive: true });
            const temporary = `${target}.${process.pid}.restore`;
            rmSync(temporary, { force: true });
            if (files[path].kind === 'symlink') symlinkSync(readFileSync(this.blob(hash), 'utf8'), temporary);
            else {
                copyFileSync(this.blob(hash), temporary, constants.COPYFILE_FICLONE);
                chmodSync(temporary, files[path].mode);
            }
            renameSync(temporary, target);
        }
        return true;
    }
}
