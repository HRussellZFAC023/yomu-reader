import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type VoiceEntry = {
    key: string;
    surface: 'story' | 'ui';
    sourceSha256: string;
    status: 'draft' | 'locked' | 'stale' | 'remote-ready';
    pilotOutput?: string;
};

const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/voice-production-manifest.json'), 'utf8')) as {
    schema: string;
    counts: Record<string, number>;
    entries: VoiceEntry[];
};
const locks = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/voice-line-locks.json'), 'utf8')) as Record<
    string,
    { status: string; sourceSha256: string }
>;

describe('Academy voice production manifest', () => {
    it('keeps every production key unique and every reviewed source lock current', () => {
        expect(manifest.schema).toBe('yomu-academy.voice-production.v1');
        expect(new Set(manifest.entries.map(entry => entry.key)).size).toBe(manifest.entries.length);
        expect(manifest.entries.filter(entry => entry.status === 'stale')).toEqual([]);

        for (const [key, lock] of Object.entries(locks)) {
            const entry = manifest.entries.find(candidate => candidate.key === key);
            expect(entry, key).toBeDefined();
            expect(entry?.status, key).toBe('locked');
            expect(entry?.sourceSha256, key).toBe(lock.sourceSha256);
        }
    });

    it('binds every pilot lock to a real local Opus file', () => {
        const pilots = manifest.entries.filter(entry => entry.status === 'locked');
        expect(pilots).toHaveLength(4);
        for (const entry of pilots) {
            expect(entry.pilotOutput, entry.key).toMatch(/^\/academy\/audio\//);
            const relative = entry.pilotOutput?.replace(/^\/academy\/audio\//, '') ?? '';
            expect(existsSync(resolve(root, 'public/academy/audio', relative)), entry.key).toBe(true);
        }
    });

    it('keeps manifest counts derived from its entries', () => {
        expect(manifest.counts.entries).toBe(manifest.entries.length);
        expect(manifest.counts.storyVariants).toBe(
            manifest.entries.filter(entry => entry.surface === 'story').length,
        );
        expect(manifest.counts.uiLines).toBe(
            manifest.entries.filter(entry => entry.surface === 'ui').length,
        );
        expect(manifest.counts.locked).toBe(
            manifest.entries.filter(entry => entry.status === 'locked').length,
        );
        expect(manifest.counts.staleLocks).toBe(0);
    });
});
