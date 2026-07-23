import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type VoiceEntry = {
    key: string;
    surface: 'story' | 'ui' | 'learning';
    sourceSha256: string;
    status: 'draft' | 'locked' | 'accepted' | 'stale' | 'remote-ready';
    pilotOutput?: string;
    output?: string;
    bindingIds?: string[];
    codexAccepted?: boolean;
    ownerLineByLineReviewed?: boolean;
    humanReviewed?: boolean;
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
    learningVoiceEvidence: Record<string, { path: string; sha256: string }>;
};
const locks = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/voice-line-locks.json'), 'utf8')) as Record<
    string,
    { status: string; sourceSha256: string }
>;
const playback = JSON.parse(readFileSync(resolve(root, 'public/academy/audio/story-voice-playback.json'), 'utf8')) as {
    schema: string;
    entries: PlaybackEntry[];
};
const hostedPlayback = JSON.parse(readFileSync(resolve(root, 'docs/public/academy/audio/story-voice-playback.json'), 'utf8')) as {
    schema: string;
    entries: PlaybackEntry[];
};

describe('Academy voice production manifest', () => {
    it('keeps every production key unique and reports reviewed source-lock drift honestly', () => {
        expect(manifest.schema).toBe('yomu-academy.voice-production.v2');
        expect(new Set(manifest.entries.map(entry => entry.key)).size).toBe(manifest.entries.length);
        for (const [key, lock] of Object.entries(locks)) {
            const entry = manifest.entries.find(candidate => candidate.key === key);
            expect(entry, key).toBeDefined();
            expect(entry?.status, key).toBe(
                entry?.sourceSha256 === lock.sourceSha256 ? 'locked' : 'stale',
            );
        }
        expect(manifest.entries.filter(entry => entry.surface === 'learning' && entry.status === 'stale')).toEqual([]);
    });

    it('accounts for the accepted native-band learning slice without inflating human review', () => {
        const learning = manifest.entries.filter(entry => entry.surface === 'learning');
        expect(learning).toHaveLength(1);
        expect(learning.flatMap(entry => entry.bindingIds ?? [])).toHaveLength(1);
        expect(learning.every(entry => entry.status === 'accepted')).toBe(true);
        expect(learning.every(entry => entry.band === 'native')).toBe(true);
        expect(learning.every(entry => entry.codexAccepted === true)).toBe(true);
        expect(learning.every(entry => entry.ownerLineByLineReviewed === false)).toBe(true);
        expect(learning.every(entry => entry.humanReviewed === false)).toBe(true);
        for (const entry of learning) {
            expect(entry.output).toMatch(/^\/academy\/audio\/learning-lines\//u);
            expect(existsSync(resolve(root, 'public', entry.output?.replace(/^\//u, '') ?? ''))).toBe(true);
        }
        for (const evidence of Object.values(manifest.learningVoiceEvidence)) {
            expect(createHash('sha256').update(readFileSync(resolve(root, evidence.path))).digest('hex'))
                .toBe(evidence.sha256);
        }
    });

    it('publishes only exact locked story pilots and excludes stale output', () => {
        const pilots = manifest.entries.filter(entry => entry.status === 'locked' && entry.pilotOutput);
        expect(pilots).toHaveLength(3);
        expect(playback.schema).toBe('yomu-academy.story-voice-playback.v1');
        expect(playback.entries).toHaveLength(3);
        expect(hostedPlayback).toEqual(playback);
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
            const hostedAsset = readFileSync(resolve(root, 'docs/public', playable!.url.replace(/^\//, '')));
            expect(createHash('sha256').update(hostedAsset).digest('hex')).toBe(playable?.assetSha256);
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
        expect(manifest.counts.learningVoiceLines).toBe(
            manifest.entries.filter(entry => entry.surface === 'learning').length,
        );
        expect(manifest.counts.learningBindings).toBe(
            manifest.entries
                .filter(entry => entry.surface === 'learning')
                .flatMap(entry => entry.bindingIds ?? []).length,
        );
        expect(manifest.counts.acceptedLearningLines).toBe(
            manifest.entries.filter(entry => entry.surface === 'learning' && entry.status === 'accepted').length,
        );
        expect(manifest.counts.locked).toBe(
            manifest.entries.filter(entry => entry.status === 'locked').length,
        );
        expect(manifest.counts.productionReady).toBe(
            manifest.entries.filter(entry => entry.status === 'locked' || entry.status === 'accepted').length,
        );
        expect(manifest.counts.staleLocks).toBe(
            manifest.entries.filter(entry => entry.status === 'stale').length,
        );
    });
});
