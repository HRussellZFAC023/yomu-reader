import { existsSync, mkdirSync, statSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { insideRoot } from './paths.mjs';
import { sha256File } from './io.mjs';

/**
 * Content-addressed store holding exactly one extracted copy of every unique
 * payload: `payloads/<sha256>`. The extension deliberately does not participate
 * in identity: identical bytes seen under two names still produce one file.
 */
export function createPayloadStore(privateRoot) {
    const storeRoot = insideRoot(privateRoot, 'payloads');
    mkdirSync(storeRoot, { recursive: true });
    return {
        pathFor(sha256) {
            return insideRoot(storeRoot, sha256);
        },
        has(sha256) {
            const target = this.pathFor(sha256);
            return existsSync(target) && sha256File(target) === sha256;
        },
        put(sha256, _extension, bytes) {
            const target = this.pathFor(sha256);
            if (existsSync(target) && statSync(target).size === bytes.length && sha256File(target) === sha256) return target;
            const temp = `${target}.tmp-${process.pid}`;
            try {
                writeFileSync(temp, bytes);
                renameSync(temp, target);
            } catch (error) {
                rmSync(temp, { force: true });
                throw error;
            }
            return target;
        },
    };
}
