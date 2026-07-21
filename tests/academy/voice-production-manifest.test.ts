import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type VoiceEntry = {
    key: string;
    surface: 'story' | 'ui';
    sourceSha256: string;
    status: 'draft' | 'locked' | 'stale' | 'remote-ready';
    pilotOutput?: string;
    lineId?: string;
    speakerId?: string;
    japanese?: string;
    band?: string;
};

type PlaybackEntry = {
    lineId: string;
    speakerId: string;
    japanese: string;
    band: string;
    sourceSha256: string;
    assetSha256: string;
    bytes: number;
    url: string;
    reviewStatus: 'locked';
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
const playback = JSON.parse(readFileSync(resolve(root, 'public/academy/audio/story-voice-playback.json'), 'utf8')) as {
    schema: string;
    entries: PlaybackEntry[];
};

describe('Academy voice production manifest', () => {
    it('keeps every production key unique and marks a changed source lock stale', () => {
        expect(manifest.schema).toBe('yomu-academy.voice-production.v1');
        expect(new Set(manifest.entries.map(entry => entry.key)).size).toBe(manifest.entries.length);
        expect(manifest.entries.filter(entry => entry.status === 'stale').map(entry => entry.key)).toEqual([
            'line:lanterns-return:mira-arrives::n4',
        ]);

        for (const [key, lock] of Object.entries(locks)) {
            const entry = manifest.entries.find(candidate => candidate.key === key);
            expect(entry, key).toBeDefined();
            expect(entry?.status, key).toBe(entry?.sourceSha256 === lock.sourceSha256 ? 'locked' : 'stale');
        }
    });

    it('publishes only exact locked pilot assets and excludes the stale Opus output', () => {
        const pilots = manifest.entries.filter(entry => entry.status === 'locked');
        expect(pilots).toHaveLength(3);
        expect(playback.schema).toBe('yomu-academy.story-voice-playback.v1');
        expect(playback.entries).toHaveLength(3);
        for (const entry of pilots) {
            expect(entry.pilotOutput, entry.key).toMatch(/^\/academy\/audio\//);
            const relative = entry.pilotOutput?.replace(/^\/academy\/audio\//, '') ?? '';
            expect(existsSync(resolve(root, 'public/academy/audio', relative)), entry.key).toBe(true);
            const playable = playback.entries.find(candidate => (
                candidate.lineId === entry.lineId
                && candidate.speakerId === entry.speakerId
                && candidate.japanese === entry.japanese
                && candidate.band === entry.band
                && candidate.sourceSha256 === entry.sourceSha256
            ));
            expect(playable, entry.key).toBeDefined();
            const asset = readFileSync(resolve(root, 'public', playable!.url.replace(/^\//, '')));
            expect(playable?.assetSha256).toBe(createHash('sha256').update(asset).digest('hex'));
            expect(playable?.bytes).toBe(asset.byteLength);
            expect(playable?.reviewStatus).toBe('locked');
        }
        expect(playback.entries.some(entry => entry.lineId === 'line:lanterns-return:mira-arrives')).toBe(false);
        expect(playback.entries.every(entry => entry.url.startsWith('/academy/audio/story-pilot/'))).toBe(true);
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
        expect(manifest.counts.staleLocks).toBe(
            manifest.entries.filter(entry => entry.status === 'stale').length,
        );
    });
});
