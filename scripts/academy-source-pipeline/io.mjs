import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function sha256Hex(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(filePath) {
    return sha256Hex(readFileSync(filePath));
}

export function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function readJsonIfPresent(filePath) {
    return existsSync(filePath) ? readJson(filePath) : undefined;
}

/**
 * Atomic write: emit to a sibling temp file, then rename. Rename is atomic on
 * one volume, so a crash never leaves a truncated ledger/catalog behind.
 */
export function writeFileAtomic(filePath, contents) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.tmp-${process.pid}`;
    try {
        writeFileSync(temp, contents);
        renameSync(temp, filePath);
    } catch (error) {
        rmSync(temp, { force: true });
        throw error;
    }
}

export function writeJsonAtomic(filePath, value) {
    writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Deterministic UTF-8 code-point ordering, independent of locale collation. */
export function compareUtf8(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

export function ordinalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(6, '0')}`;
}
