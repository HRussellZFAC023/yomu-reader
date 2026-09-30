import { readFileSync } from 'node:fs';
import path from 'node:path';

// Bytes v1.9.3 itself persisted, captured by scripts/upgrade-corpus/capture.mjs.
// Unit tests seed these instead of hand-shaped "old" records (ADR-0012).
const CORPUS = path.resolve(import.meta.dirname, '..', 'fixtures', 'upgrade-v1.9.3');

export function v193CorpusText(relative: string): string {
    return readFileSync(path.join(CORPUS, relative), 'utf8');
}

export function v193Corpus<T>(relative: string): T {
    return JSON.parse(v193CorpusText(relative)) as T;
}

/** The userscript GM store a v1.9.3 scenario left behind. */
export function v193UserscriptStore(scenario: string): Map<string, unknown> {
    return new Map(Object.entries(v193Corpus<{ gm: Record<string, unknown> }>(`${scenario}.json`).gm));
}

/** The settings backup file v1.9.3 exported (formatVersion 3). */
export function v193BackupFile(): Record<string, unknown> {
    return v193Corpus('files/yomu-settings-2026-09-20T09-01-00-000Z.json');
}

/** The Google Drive snapshot v1.9.3 uploaded. */
export function v193CloudSnapshot(): Record<string, unknown> {
    return v193Corpus('files/google-drive-settings-sync.json');
}
