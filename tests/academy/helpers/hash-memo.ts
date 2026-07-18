// Content-addressed sha256 memo for large fixture files. Keyed on (path, mtimeMs,
// size) and persisted under node_modules/.cache so repeated hashing of the same
// unchanged multi-MB assets (academy art, lesson payloads, docs mirrors) is paid
// once per checkout instead of once per test file per run.
//
// Release integrity: set YOMU_HASH_MEMO=0 (check:release does) to bypass the memo
// and hash real bytes every time.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), 'node_modules', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'yomu-academy-hash-memo.json');
const memoDisabled = process.env.YOMU_HASH_MEMO === '0';

type MemoIndex = Record<string, { mtimeMs: number; size: number; sha256: string }>;

let index: MemoIndex | null = null;
let dirty = false;

function loadIndex(): MemoIndex {
    if (index) return index;
    try {
        index = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as MemoIndex;
    } catch {
        index = {};
    }
    return index;
}

function persistIndex(): void {
    if (!dirty || !index) return;
    dirty = false;
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
        // Merge with whatever another fork wrote since we loaded.
        let merged = index;
        try {
            merged = { ...(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as MemoIndex), ...index };
        } catch {
            // no existing file or unreadable — write ours
        }
        fs.writeFileSync(tmp, JSON.stringify(merged));
        fs.renameSync(tmp, CACHE_FILE);
    } catch {
        // cache persistence is best-effort; hashing still returned correct values
    }
}

process.on('exit', persistIndex);

function hashBytes(filePath: string): string {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** sha256 of a file, memoized on (path, mtimeMs, size). */
export function sha256File(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (memoDisabled) return hashBytes(resolved);
    const stat = fs.statSync(resolved);
    const idx = loadIndex();
    const entry = idx[resolved];
    if (entry && entry.mtimeMs === stat.mtimeMs && entry.size === stat.size) return entry.sha256;
    const sha256 = hashBytes(resolved);
    idx[resolved] = { mtimeMs: stat.mtimeMs, size: stat.size, sha256 };
    dirty = true;
    return sha256;
}

/** Digest-level equality of two files without re-reading unchanged bytes. */
export function filesHaveSameContent(a: string, b: string): boolean {
    const statA = fs.statSync(a);
    const statB = fs.statSync(b);
    if (statA.size !== statB.size) return false;
    return sha256File(a) === sha256File(b);
}
