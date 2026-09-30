// Corpus output for the upgrade-corpus capture: reproducible ids and clock,
// provenance, and the fixture files under tests/reader/fixtures/upgrade-v1.9.3.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import type { RecordedWrite, RecordingStore } from './realm-stubs';

const CAPTURE_EPOCH_MS = Date.UTC(2026, 8, 20, 9, 0, 0);

let uuidCount = 0;
let clockMs = CAPTURE_EPOCH_MS;

// Distinct per stage so ids minted by a later stage never collide with ids
// already inside the store it upgrades.
function uuidNamespace(): string {
    const stage = process.env.YOMU_CAPTURE_STAGE ?? '';
    let hash = 0;
    for (const char of stage) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash.toString(16).padStart(8, '0').slice(-8);
}

/**
 * Makes commit ids, lease ids and timestamps reproducible so a re-capture of
 * the same release produces byte-identical fixtures. Ids and time keep
 * increasing across the cases of one stage, as they would across page loads.
 */
export function installDeterministicClock(stepMs = 60_000): () => void {
    if (!vi.isMockFunction(crypto.randomUUID)) {
        const namespace = uuidNamespace();
        vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
            uuidCount += 1;
            return `${namespace}-0000-4000-8000-${String(uuidCount).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
        });
    }
    clockMs += stepMs;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clockMs);
    return () => {
        clockMs += stepMs;
        vi.setSystemTime(clockMs);
    };
}

function outDir(): string {
    const dir = process.env.YOMU_CAPTURE_OUT;
    if (!dir) throw new Error('YOMU_CAPTURE_OUT is required (run scripts/upgrade-corpus/capture.mjs).');
    return dir;
}

export function referenceCommit(): string {
    return process.env.YOMU_CAPTURE_COMMIT ?? 'unknown';
}

export function writeCorpusFile(relative: string, value: unknown): void {
    const file = path.join(outDir(), relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readCorpusFile<T = Record<string, unknown>>(relative: string): T {
    return JSON.parse(readFileSync(path.join(outDir(), relative), 'utf8')) as T;
}

export function pick<T extends object>(value: T, keys: readonly string[]): Record<string, unknown> {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(keys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
}

export interface ScenarioFixture {
    readonly channel: 'userscript' | 'extension' | 'hosted' | 'backup' | 'indexeddb';
    readonly story: string;
    readonly [field: string]: unknown;
}

/** Writes one scenario with the provenance every fixture carries. */
export function writeScenario(name: string, fixture: ScenarioFixture, inputs: readonly string[] = []): void {
    writeCorpusFile(`${name}.json`, {
        scenario: name,
        producedBy: {
            tag: process.env.YOMU_CAPTURE_TAG ?? 'unknown',
            commit: referenceCommit(),
            stage: process.env.YOMU_CAPTURE_STAGE ?? 'unknown',
            ...(inputs.length ? { inputs } : {}),
        },
        ...fixture,
    });
}

/** The write log without lease bookkeeping, which every write brackets. */
export function persistentWrites(...stores: RecordingStore[]): RecordedWrite[] {
    return stores.flatMap(store => store.writes).filter(write => !write.key.includes('yomu:lease:'));
}

/** Writes exact file bytes (a backup file as the learner saved it). */
export function writeCorpusText(relative: string, text: string): void {
    const file = path.join(outDir(), relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
}

