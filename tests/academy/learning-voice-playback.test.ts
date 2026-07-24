import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioDirector } from '../../src/academy/audio/director';
import {
    LEARNING_VOICE_BINDING_IDENTITIES,
    StaticLearningVoiceService,
    loadLearningVoiceCatalog,
    parseLearningVoiceCatalog,
    playLearningVoiceBinding,
    resolveLearningVoiceEntry,
    resolveLearningVoiceLine,
    type LearningVoiceCatalog,
    type LearningVoiceMedia,
} from '../../src/academy/audio/learning-voice';
import type { PronunciationService } from '../../src/academy/integration/yomu-bridge';

const root = process.cwd();
const publicCatalogPath = resolve(root, 'public/academy/audio/learning-voice-playback.json');
const docsCatalogPath = resolve(root, 'docs/public/academy/audio/learning-voice-playback.json');

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>(next => { resolve = next; });
    return { promise, resolve };
}

class FakeMedia implements LearningVoiceMedia {
    preload = '';
    volume = 1;
    currentTime = 12;
    readonly play = vi.fn(async () => undefined);
    readonly pause = vi.fn();
    private readonly listeners = new Map<'ended' | 'error', Set<EventListener>>();

    addEventListener(type: 'ended' | 'error', listener: EventListener): void {
        const listeners = this.listeners.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type: 'ended' | 'error', listener: EventListener): void {
        this.listeners.get(type)?.delete(listener);
    }

    emit(type: 'ended' | 'error'): void {
        for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
    }

    listenerCount(): number {
        return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
    }
}

function director() {
    const release = vi.fn();
    return {
        target: {
            unlock: vi.fn(async () => undefined),
            beginExternalLesson: vi.fn(() => release),
            settings: {
                muted: false,
                volumes: { music: 0.7, ambience: 0.6, lesson: 0.63, sfx: 0.8 },
            },
        } as unknown as AudioDirector,
        release,
    };
}

function loadCatalog(): LearningVoiceCatalog {
    return parseLearningVoiceCatalog(JSON.parse(readFileSync(publicCatalogPath, 'utf8')));
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Academy static learning voices', () => {
    it('does not fetch its catalog until a learner asks for pronunciation', async () => {
        const catalog = loadCatalog();
        const catalogLoader = vi.fn(async () => catalog);
        const service = new StaticLearningVoiceService(director().target, { loadCatalog: catalogLoader });
        expect(catalogLoader).not.toHaveBeenCalled();
        await expect(service.playExact('未収録の語')).resolves.toEqual({ status: 'miss' });
        expect(catalogLoader).toHaveBeenCalledOnce();
    });

    it('retries a transient catalog failure and treats unlock failure as a fallback miss', async () => {
        const catalog = loadCatalog();
        const catalogLoader = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(catalog);
        const audioDirector = director();
        vi.mocked(audioDirector.target.unlock).mockRejectedValueOnce(new Error('locked'));
        const media = new FakeMedia();
        const service = new StaticLearningVoiceService(audioDirector.target, {
            loadCatalog: catalogLoader,
            createMedia: () => media,
        });

        expect(await service.playExact(catalog.entries[0].japanese)).toEqual({ status: 'miss' });
        expect(await service.playExact(catalog.entries[0].japanese)).toEqual({ status: 'miss' });
        expect((await service.playExact(catalog.entries[0].japanese)).status).toBe('playing');
        expect(catalogLoader).toHaveBeenCalledTimes(2);
        expect(media.play).toHaveBeenCalledOnce();
    });

    it('ships mirrored, hash-verified, exact Yomu-authored assets for every catalog entry', () => {
        expect(readFileSync(docsCatalogPath, 'utf8')).toBe(readFileSync(publicCatalogPath, 'utf8'));
        const catalog = loadCatalog();
        const production = JSON.parse(readFileSync(
            resolve(root, 'docs/academy/audio/learning-voice-production.json'),
            'utf8',
        ));
        expect(catalog.entries).toHaveLength(production.triage.acceptedVoiceLineIds.length);
        expect(catalog.batchId).toBe('academy-learning-native-20260720-01');
        expect(catalog.qualityApproval).toEqual({
            codexQualityAccepted: true,
            scope: 'AivisSpeech + Style-Bert-VITS2 JP-Extra output quality',
            ownerLineByLineReviewed: false,
            humanReviewed: false,
        });
        expect((catalog as unknown as { acceptancePolicy: Record<string, unknown> }).acceptancePolicy).toEqual({
            acceptedBy: 'Codex',
            humanReviewed: false,
            ownerLineByLineReviewed: false,
            independentAudioReviewRequired: true,
            blanketCharacterErrorRateAllowed: false,
            criticalMorphemeNumeralParticleMismatch: 'hard-fail',
        });
        expect(catalog.encoder).toMatchObject({
            name: 'ffmpeg/libopus',
            bitrateKbps: 64,
            application: 'voip',
        });
        expect(catalog.entries.filter(entry => entry.role === 'textbook-character')).toHaveLength(1);
        expect(catalog.entries.filter(entry => entry.role === 'academy-character')).toHaveLength(14);
        for (const entry of catalog.entries) {
            const relative = entry.url.replace('/academy/audio/', '');
            expect(relative).toContain(`__${entry.cacheKey.slice(0, 16)}.opus`);
            const publicAsset = resolve(root, 'public/academy/audio', relative);
            const docsAsset = resolve(root, 'docs/public/academy/audio', relative);
            expect(statSync(publicAsset).size).toBe(entry.bytes);
            expect(readFileSync(docsAsset)).toEqual(readFileSync(publicAsset));
            expect(createHash('sha256').update(readFileSync(publicAsset)).digest('hex')).toBe(entry.assetSha256);
            expect(createHash('sha256').update(entry.japanese).digest('hex')).toBe(entry.sourceSha256);
            expect(entry.sourceRevision).toBe(entry.sourceSha256);
            expect(entry.locale).toBe('ja-JP');
            expect(entry.band).toBe('native');
            expect(entry.intent.trim()).toBe(entry.intent);
            expect(entry.audioQuerySha256).toMatch(/^[a-f0-9]{64}$/u);
            expect(Object.keys(entry.queryOverrides).sort()).toEqual([
                'intonationScale',
                'pauseLengthScale',
                'pitchScale',
                'postPhonemeLength',
                'prePhonemeLength',
                'speedScale',
                'volumeScale',
            ]);
            expect(entry.durationSeconds).toBeGreaterThan(0.5);
            expect(entry.provenance).toBe('Yomu-authored');
            expect(entry.modelSourceUrl).toContain(entry.modelUuid);
            expect(entry.modelVersion).toBe('1.0.0');
            expect(['ACML-1.0', 'CC-BY-SA-4.0']).toContain(entry.modelLicense);
            expect(entry.modelPayloadSha256).toMatch(/^[a-f0-9]{64}$/u);
            expect(entry.reviewStatus).toBe('accepted');
            expect(entry.qualityApprovalStatus).toBe('codex-accepted');
            expect(entry.disclosure).toEqual({
                synthetic: true,
                officialCharacterVoice: false,
                livingPersonSource: true,
            });
            expect(entry.bindings.length).toBeGreaterThan(0);
            expect(entry.review).toMatchObject({
                naturalness: { status: 'reviewed-text' },
                accent: { status: 'validated-query-plan' },
                pause: { status: 'validated-query-plan' },
                listening: {
                    status: 'codex-accepted-objective-and-independent-audio-review',
                    codexAccepted: true,
                    ownerLineByLineReviewed: false,
                    audioModelReviewed: true,
                    humanReviewed: false,
                    independentAudioModelReviews: 2,
                },
            });
            for (const binding of entry.bindings) {
                expect(binding.accessibleReplayLabel.en.trim()).toBe(binding.accessibleReplayLabel.en);
                expect(binding.accessibleReplayLabel.ja.trim()).toBe(binding.accessibleReplayLabel.ja);
                expect(Object.isFrozen(binding.accessibleReplayLabel)).toBe(true);
            }
        }
    });

    it('resolves only exact text and rejects an incompatible explicit reading', () => {
        const catalog = loadCatalog();
        const line = catalog.entries[0];
        expect(resolveLearningVoiceEntry(catalog, line.japanese)).toEqual(line);
        expect(resolveLearningVoiceEntry(catalog, ` ${line.japanese} `)).toEqual(line);
        expect(resolveLearningVoiceEntry(catalog, `${line.japanese}ね`)).toBeNull();
        expect(resolveLearningVoiceEntry(catalog, line.japanese, 'べつのよみ')).toBeNull();
    });

    it('resolves a stable line binding only with exact text and source hash', () => {
        const catalog = loadCatalog();
        const line = catalog.entries.at(-1)!;
        const identity = {
            lineId: line.bindings[0].lineId,
            japanese: line.japanese,
            sourceSha256: line.sourceSha256,
        };
        expect(resolveLearningVoiceLine(catalog, identity)).toEqual(line);
        expect(resolveLearningVoiceLine(catalog, { ...identity, lineId: `${identity.lineId}:stale` })).toBeNull();
        expect(resolveLearningVoiceLine(catalog, { ...identity, japanese: `${identity.japanese}ね` })).toBeNull();
        expect(resolveLearningVoiceLine(catalog, { ...identity, sourceSha256: '0'.repeat(64) })).toBeNull();
    });

    it('plays on the lesson bus, ducks music, and releases cleanly', async () => {
        const catalog = loadCatalog();
        const audio = new FakeMedia();
        const audioDirector = director();
        const service = new StaticLearningVoiceService(audioDirector.target, {
            catalog,
            createMedia: () => audio,
        });
        const playback = await service.playExact(catalog.entries[0].japanese);

        expect(playback.status).toBe('playing');
        expect(audioDirector.target.unlock).toHaveBeenCalledOnce();
        expect(audioDirector.target.beginExternalLesson).toHaveBeenCalledOnce();
        expect(audio.preload).toBe('auto');
        expect(audio.volume).toBe(0.63);
        expect(audio.play).toHaveBeenCalledOnce();
        audio.emit('ended');
        expect(audioDirector.release).toHaveBeenCalledOnce();
        if (playback.status === 'playing') playback.playback.dispose();
        expect(audioDirector.release).toHaveBeenCalledOnce();
    });

    it('lets only the newest concurrent request begin playback', async () => {
        const catalog = loadCatalog();
        let releaseCatalog: (catalog: LearningVoiceCatalog) => void = () => undefined;
        const pendingCatalog = new Promise<LearningVoiceCatalog>(resolve => { releaseCatalog = resolve; });
        const audioDirector = director();
        const media = new FakeMedia();
        const createMedia = vi.fn(() => media);
        const service = new StaticLearningVoiceService(audioDirector.target, { catalog: pendingCatalog, createMedia });

        const first = service.playExact(catalog.entries[0].japanese);
        const second = service.playExact(catalog.entries[0].japanese);
        releaseCatalog(catalog);
        expect((await second).status).toBe('playing');
        expect(await first).toEqual({ status: 'superseded' });
        expect(createMedia).toHaveBeenCalledOnce();
        expect(media.play).toHaveBeenCalledOnce();
    });

    it('aborts pending catalog ownership immediately without unlocking or creating media', async () => {
        const catalog = loadCatalog();
        const pending = deferred<LearningVoiceCatalog>();
        let catalogSignal: AbortSignal | undefined;
        const createMedia = vi.fn(() => new FakeMedia());
        const audioDirector = director();
        const service = new StaticLearningVoiceService(audioDirector.target, {
            loadCatalog: signal => {
                catalogSignal = signal;
                return pending.promise;
            },
            createMedia,
        });
        const owner = new AbortController();

        const result = service.playExact(catalog.entries[0].japanese, undefined, owner.signal);
        await vi.waitFor(() => expect(catalogSignal).toBeDefined());
        owner.abort();

        await expect(result).resolves.toEqual({ status: 'superseded' });
        expect(catalogSignal?.aborted).toBe(true);
        expect(audioDirector.target.unlock).not.toHaveBeenCalled();
        expect(createMedia).not.toHaveBeenCalled();
        pending.resolve(catalog);
    });

    it('does not invoke stale static media when its unlock resolves after newer playback', async () => {
        const catalog = loadCatalog();
        const staleUnlock = deferred<undefined>();
        const audioDirector = director();
        vi.mocked(audioDirector.target.unlock)
            .mockReturnValueOnce(staleUnlock.promise)
            .mockResolvedValueOnce(undefined);
        const media = new FakeMedia();
        const createMedia = vi.fn(() => media);
        const service = new StaticLearningVoiceService(audioDirector.target, { catalog, createMedia });

        const stale = service.playExact(catalog.entries[0].japanese);
        await vi.waitFor(() => expect(audioDirector.target.unlock).toHaveBeenCalledOnce());
        const newest = await service.playExact(catalog.entries[0].japanese);
        staleUnlock.resolve(undefined);

        expect(newest.status).toBe('playing');
        await expect(stale).resolves.toEqual({ status: 'superseded' });
        expect(createMedia).toHaveBeenCalledOnce();
        expect(createMedia).toHaveBeenCalledWith(catalog.entries[0].url);
        expect(media.play).toHaveBeenCalledOnce();
    });

    it('cancels pending media startup and removes listeners before play resolves', async () => {
        const catalog = loadCatalog();
        const pendingPlay = deferred<undefined>();
        const audio = new FakeMedia();
        audio.play.mockReturnValueOnce(pendingPlay.promise);
        const audioDirector = director();
        const owner = new AbortController();
        const service = new StaticLearningVoiceService(audioDirector.target, {
            catalog,
            createMedia: () => audio,
        });

        const result = service.playExact(catalog.entries[0].japanese, undefined, owner.signal);
        await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
        owner.abort();

        await expect(result).resolves.toEqual({ status: 'superseded' });
        expect(audio.pause).toHaveBeenCalledOnce();
        expect(audio.currentTime).toBe(0);
        expect(audio.listenerCount()).toBe(0);
        expect(audioDirector.release).toHaveBeenCalledOnce();
        pendingPlay.resolve(undefined);
        await Promise.resolve();
        expect(audio.play).toHaveBeenCalledOnce();
    });

    it('replays a line-addressed binding by stopping and releasing the active take first', async () => {
        const catalog = loadCatalog();
        const line = catalog.entries.at(-1)!;
        const identity = {
            lineId: line.bindings[0].lineId,
            japanese: line.japanese,
            sourceSha256: line.sourceSha256,
        };
        const first = new FakeMedia();
        const second = new FakeMedia();
        const createMedia = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
        const audioDirector = director();
        const service = new StaticLearningVoiceService(audioDirector.target, { catalog, createMedia });

        expect((await service.playLine(identity)).status).toBe('playing');
        expect((await service.playLine(identity)).status).toBe('playing');
        expect(first.pause).toHaveBeenCalledOnce();
        expect(first.currentTime).toBe(0);
        expect(audioDirector.release).toHaveBeenCalledOnce();
        expect(second.play).toHaveBeenCalledOnce();
    });

    it('rejects remote, unreviewed, duplicate, and arbitrary-query catalog data', () => {
        const catalog = JSON.parse(readFileSync(publicCatalogPath, 'utf8')) as Record<string, unknown> & {
            entries: Array<Record<string, unknown>>;
        };
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [{ ...catalog.entries[0], url: 'https://audio.yomureader.com/voice/line' }],
        })).toThrow('Invalid learning voice playback entry');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [{ ...catalog.entries[0], url: '/academy/audio/learning-lines/a/../../../x.opus' }],
        })).toThrow('Invalid learning voice playback entry');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [{ ...catalog.entries[0], reviewStatus: 'pending' }],
        })).toThrow('Invalid learning voice playback entry');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [{
                ...catalog.entries[0],
                reviewStatus: 'technical-candidate',
                qualityApprovalStatus: 'pending',
            }],
        })).toThrow('Invalid learning voice playback entry');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [{ ...catalog.entries[0], queryOverrides: { arbitrary: 1 } }],
        })).toThrow('Invalid learning voice playback entry');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [catalog.entries[0], catalog.entries[0]],
        })).toThrow('Duplicate learning voice asset line');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [
                catalog.entries[0],
                {
                    ...catalog.entries[0],
                    lineId: 'miller-cafe-price-copy',
                    bindings: catalog.entries[0].bindings,
                },
            ],
        })).toThrow('Duplicate learning voice binding');
        expect(() => parseLearningVoiceCatalog({
            ...catalog,
            entries: [{
                ...catalog.entries[0],
                bindings: [{
                    ...(catalog.entries[0].bindings as Array<Record<string, unknown>>)[0],
                    accessibleReplayLabel: { en: ' ', ja: '再生' },
                }],
            }],
        })).toThrow('Invalid learning voice playback entry');
    });

    it('requires explicit Codex acceptance without claiming human line review', () => {
        const catalog = JSON.parse(readFileSync(publicCatalogPath, 'utf8')) as {
            entries: Array<Record<string, unknown> & { review: Record<string, unknown> }>;
        };
        const entry = catalog.entries[0];
        const accepted = parseLearningVoiceCatalog({
            ...catalog,
            entries: [{
                ...entry,
                reviewStatus: 'accepted',
                qualityApprovalStatus: 'codex-accepted',
                review: {
                    ...entry.review,
                    listening: {
                        status: 'codex-accepted-objective-and-independent-audio-review',
                        codexAccepted: true,
                        ownerLineByLineReviewed: false,
                        audioModelReviewed: true,
                        humanReviewed: false,
                        independentAudioModelReviews: 2,
                    },
                },
            }],
        });
        expect(accepted.entries[0]).toMatchObject({
            reviewStatus: 'accepted',
            qualityApprovalStatus: 'codex-accepted',
            review: {
                listening: {
                    codexAccepted: true,
                    ownerLineByLineReviewed: false,
                    audioModelReviewed: true,
                    humanReviewed: false,
                },
            },
        });
    });

    it('reports a late media error after releasing the lesson duck exactly once', async () => {
        const catalog = loadCatalog();
        const audio = new FakeMedia();
        const audioDirector = director();
        const service = new StaticLearningVoiceService(audioDirector.target, {
            catalog,
            createMedia: () => audio,
        });
        const result = await service.playExact(catalog.entries[0].japanese);
        expect(result.status).toBe('playing');
        if (result.status !== 'playing') return;
        const failed = vi.fn();
        void result.playback.failure.then(failed);

        audio.emit('error');
        await Promise.resolve();
        expect(failed).toHaveBeenCalledOnce();
        expect(audioDirector.release).toHaveBeenCalledOnce();
        result.playback.dispose();
        expect(audioDirector.release).toHaveBeenCalledOnce();
    });

    it('aborts a pending catalog load and prevents late media startup after disposal', async () => {
        const catalog = loadCatalog();
        const pendingCatalog = deferred<LearningVoiceCatalog>();
        let catalogSignal: AbortSignal | undefined;
        const audioDirector = director();
        const createMedia = vi.fn(() => new FakeMedia());
        const service = new StaticLearningVoiceService(audioDirector.target, {
            loadCatalog: signal => {
                catalogSignal = signal;
                return pendingCatalog.promise;
            },
            createMedia,
        });

        const pending = service.playExact(catalog.entries[0].japanese);
        await vi.waitFor(() => expect(catalogSignal).toBeDefined());
        service.dispose();
        pendingCatalog.resolve(catalog);

        await expect(pending).resolves.toEqual({ status: 'superseded' });
        expect(catalogSignal?.aborted).toBe(true);
        expect(audioDirector.target.unlock).not.toHaveBeenCalled();
        expect(createMedia).not.toHaveBeenCalled();
        await expect(service.playExact(catalog.entries[0].japanese)).resolves.toEqual({ status: 'superseded' });
    });

    it('does not synthesize a binding whose exact request was superseded', async () => {
        const fallback = vi.fn(async () => ({ dispose: vi.fn() }));
        const pronunciation = {
            play: fallback,
            playExact: vi.fn(async () => ({ status: 'miss' as const })),
            playLine: vi.fn(async () => ({ status: 'superseded' as const })),
        } as PronunciationService & {
            playExact: ReturnType<typeof vi.fn>;
            playLine: ReturnType<typeof vi.fn>;
        };
        const result = await playLearningVoiceBinding(
            pronunciation,
            'world-practice:cafe-coffee-price',
            'コーヒーは三百円です。',
        );
        expect(result).toBeNull();
        expect(fallback).not.toHaveBeenCalled();
    });

    it('locks accepted assets to archived licence, model, QA, and built-route evidence', () => {
        const locks = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/learning-voice-locks.json'), 'utf8'));
        const modelEvidence = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/learning-voice-model-evidence.json'), 'utf8'));
        const production = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/learning-voice-production.json'), 'utf8'));
        const modelReviews = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/learning-voice-model-reviews.json'), 'utf8'));
        const acceptance = JSON.parse(readFileSync(resolve(root, 'docs/academy/audio/learning-voice-acceptance.json'), 'utf8'));
        expect(locks).toMatchObject({
            schema: 'yomu-academy.learning-voice-locks.v5',
            acceptedBy: 'Codex',
            humanReviewed: false,
            acceptedEntries: 15,
            rejectedEntries: 2,
            acceptedBindings: 16,
        });
        expect(locks.entries).toHaveLength(15);
        expect(locks.rejected).toHaveLength(2);
        expect(locks.entries.flatMap((entry: { bindingIds: string[] }) => entry.bindingIds)).toHaveLength(16);
        for (const [sourcePath, sourceHash] of Object.entries(locks.toolchain) as Array<[string, string]>) {
            expect(createHash('sha256').update(readFileSync(resolve(root, sourcePath))).digest('hex'))
                .toBe(sourceHash);
        }
        for (const value of Object.values(locks.evidence) as Array<{ path: string; sha256: string }>) {
            expect(createHash('sha256').update(readFileSync(resolve(root, value.path))).digest('hex')).toBe(value.sha256);
        }
        for (const license of modelEvidence.licenses) {
            expect(createHash('sha256').update(license.text).digest('hex')).toBe(license.sha256);
        }
        expect(modelEvidence.schema).toBe('yomu-academy.learning-voice-model-evidence.v4');
        expect(modelEvidence.models).toHaveLength(5);
        expect(modelEvidence.models.every((model: { distribution: { authority: string } }) => (
            model.distribution.authority === 'exact-distribution-bytes'
        ))).toBe(true);
        expect(modelEvidence.engineStyleMappings).toHaveLength(5);
        const productionMappings = new Map<string, Record<string, unknown>>(
            production.voiceMappings.map((mapping: Record<string, unknown>) => (
                [String(mapping.mappingId), mapping]
            )),
        );
        for (const evidence of modelEvidence.engineStyleMappings) {
            const mapping = productionMappings.get(evidence.mappingId)!;
            expect(evidence).toMatchObject({
                mappingId: mapping.mappingId,
                speakerId: mapping.speakerId,
                surfaceClasses: mapping.surfaceClasses,
                engineFamily: mapping.engineFamily,
                modelUuid: mapping.modelUuid,
                modelName: mapping.modelName,
                modelVersion: mapping.modelVersion,
                modelPayloadSha256: mapping.modelPayloadSha256,
                styleId: mapping.styleId,
                styleName: mapping.styleName,
            });
        }
        expect(modelReviews).toMatchObject({
            audioModelReviewed: true,
            humanReviewed: false,
            overallVerdict: 'mixed-15-accepted-two-rejected',
        });
        expect(new Set(modelReviews.reviews.map((review: { reviewer: { modelFamily: string } }) => review.reviewer.modelFamily)).size).toBe(2);
        expect(acceptance).toMatchObject({
            schema: 'yomu-academy.learning-voice-acceptance.v5',
            complete: true,
            codexAcceptance: { acceptedBy: 'Codex', humanReviewed: false },
            counts: { reviewedCandidates: 17, accepted: 15, rejected: 2, bindings: 16 },
        });
        expect(acceptance.entries.every((entry: { verdict: string }) => entry.verdict === 'pass')).toBe(true);
        expect(acceptance.rejectedCandidates.every((entry: { shipped: boolean }) => entry.shipped === false)).toBe(true);
        expect(acceptance.archivedLicenceEvidence.modelEvidenceSha256).toBe(locks.evidence.modelEvidence.sha256);
        expect(production.triage).toMatchObject({
            acceptedVoiceLineIds: [
                'miller-cafe-price',
                'rie-lesson-zero-repeat',
                'rie-lesson-zero-greeting',
                'xingyu-lesson-zero-vowel-a',
                'xingyu-lesson-zero-vowel-i',
                'xingyu-lesson-zero-vowel-u',
                'xingyu-lesson-zero-vowel-e',
                'xingyu-lesson-zero-vowel-o',
                'rie-classroom-begin',
                'rie-classroom-finish',
                'rie-classroom-break',
                'rie-classroom-look',
                'rie-classroom-say-together',
                'rie-classroom-listen',
                'rie-classroom-write',
            ],
            rejectedVoiceLineIds: ['lesson-textbook-pair-prompt', 'mary-cafe-order'],
        });
    });

    it('skips one malformed runtime entry without invalidating the usable catalog', async () => {
        const source = JSON.parse(readFileSync(publicCatalogPath, 'utf8')) as {
            entries: Array<Record<string, unknown>>;
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const catalog = await loadLearningVoiceCatalog('/academy/audio/learning-voice-playback.json', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                ...source,
                entries: [
                    ...source.entries,
                    { ...source.entries[0], lineId: 'malformed-copy', role: 'invalid-role' },
                ],
            }),
        })) as unknown as typeof fetch);

        expect(catalog.entries.map(entry => entry.lineId)).toEqual(source.entries.map(entry => entry.lineId));
        expect(warn).toHaveBeenCalledOnce();
    });

    it('skips duplicate identities without invalidating earlier usable entries', async () => {
        const source = JSON.parse(readFileSync(publicCatalogPath, 'utf8')) as {
            entries: Array<Record<string, unknown>>;
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const catalog = await loadLearningVoiceCatalog('/academy/audio/learning-voice-playback.json', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                ...source,
                entries: [source.entries[0], source.entries[0], ...source.entries.slice(1)],
            }),
        })) as unknown as typeof fetch);

        expect(catalog.entries).toHaveLength(source.entries.length);
        expect(catalog.entries.map(entry => entry.lineId)).toEqual(source.entries.map(entry => entry.lineId));
        expect(warn).toHaveBeenCalledOnce();
    });

    it('ships the accepted-only v3 parser and academy-character role in the built Academy runtime', () => {
        const builtRuntime = readFileSync(resolve(root, 'docs/public/academy/app.js'), 'utf8');
        expect(builtRuntime).toContain('yomu-academy.learning-voice-playback.v3');
        expect(builtRuntime).toContain('value.role === "academy-character"');
        expect(builtRuntime).toContain('options.invalidEntry === "skip"');
    });

    it('validates exact cast mappings, native identities, full controls, and cache keys', () => {
        const production = JSON.parse(readFileSync(
            resolve(root, 'docs/academy/audio/learning-voice-production.json'),
            'utf8',
        ));
        expect(production.qualityApproval).toMatchObject({
            codexQualityAccepted: true,
            ownerLineByLineReviewed: false,
            humanReviewed: false,
        });
        expect(production.acceptancePolicy).toMatchObject({
            acceptedBy: 'Codex',
            humanReviewed: false,
            blanketCharacterErrorRateAllowed: false,
            criticalMorphemeNumeralParticleMismatch: 'hard-fail',
        });
        expect(production.voiceMappings.map((mapping: { speakerId: string }) => mapping.speakerId)).toEqual([
            'narrator',
            'textbook-miller',
            'textbook-mary',
            'rie',
            'xingyu',
        ]);
        expect(production.voiceMappings[0].surfaceClasses).toEqual(expect.arrayContaining([
            'ui-prompt',
            'learning-prompt',
            'lesson-instruction',
            'minigame-prompt',
            'worksheet-prompt',
        ]));
        const validation = spawnSync('python3', ['scripts/academy-voice/render-learning-voice.py'], {
            cwd: root,
            encoding: 'utf8',
        });
        expect(validation.stderr).toBe('');
        expect(validation.status).toBe(0);
        expect(JSON.parse(validation.stdout)).toEqual({
            reviewedCandidates: 17,
            accepted: 15,
            rejected: 2,
            bindings: 16,
            nativeBand: 15,
            archivedQueries: 17,
            acceptedBy: 'Codex',
            humanReviewed: false,
        });
    });

    it('keeps every exact prompt and binding on reachable learner surfaces', () => {
        const worldScreen = readFileSync(resolve(root, 'src/academy/ui/world-screen.ts'), 'utf8');
        const worldLocations = readFileSync(resolve(root, 'src/academy/domain/world-locations.ts'), 'utf8');
        const greetingScreen = readFileSync(resolve(root, 'src/academy/ui/lesson-zero-greeting-screen.ts'), 'utf8');
        const vowelAnchors = readFileSync(resolve(root, 'src/academy/content/lesson-zero-vowel-anchors.ts'), 'utf8');
        const vowelScreen = readFileSync(resolve(root, 'src/academy/ui/lesson-zero-vowel-screen.ts'), 'utf8');
        const vowelWritingScreen = readFileSync(resolve(root, 'src/academy/ui/lesson-zero-vowel-writing-screen.ts'), 'utf8');
        const classroomInstructionContent = readFileSync(
            resolve(root, 'src/academy/content/lesson-zero-follow-instructions.ts'),
            'utf8',
        );
        const classroomInstructionScreen = readFileSync(
            resolve(root, 'src/academy/ui/classroom-instruction-screen.ts'),
            'utf8',
        );
        const speakingLines = loadCatalog().entries;
        expect(worldScreen).toContain('`world-practice:${practice.id}`');
        expect(Object.keys(LEARNING_VOICE_BINDING_IDENTITIES)).toEqual([
            'lesson-zero:greeting-rie-model',
            'lesson-zero:vowel:hira-a',
            'lesson-zero:vowel:hira-i',
            'lesson-zero:vowel:hira-u',
            'lesson-zero:vowel:hira-e',
            'lesson-zero:vowel:hira-o',
            'lesson-zero:classroom-instruction:begin',
            'lesson-zero:classroom-instruction:finish',
            'lesson-zero:classroom-instruction:break',
            'lesson-zero:classroom-instruction:look',
            'lesson-zero:classroom-instruction:say-together',
            'lesson-zero:classroom-instruction:listen',
            'lesson-zero:classroom-instruction:write',
            'lesson-screen:textbook-pair-prompt',
            'world-practice:cafe-coffee-price',
            'world-practice:cafe-coffee-counter',
            'world-practice:lab-classroom-repair',
            'world-practice:lab-classroom-repeat',
        ]);
        expect(speakingLines.map(line => line.lineId)).toEqual([
            'miller-cafe-price',
            'rie-lesson-zero-repeat',
            'rie-lesson-zero-greeting',
            'xingyu-lesson-zero-vowel-a',
            'xingyu-lesson-zero-vowel-i',
            'xingyu-lesson-zero-vowel-u',
            'xingyu-lesson-zero-vowel-e',
            'xingyu-lesson-zero-vowel-o',
            'rie-classroom-begin',
            'rie-classroom-finish',
            'rie-classroom-break',
            'rie-classroom-look',
            'rie-classroom-say-together',
            'rie-classroom-listen',
            'rie-classroom-write',
        ]);
        for (const binding of speakingLines.flatMap(line => line.bindings)) {
            if (binding.lineId.startsWith('world-practice:')) {
                const sourceId = binding.lineId.replace(/^world-practice:/u, '');
                expect(worldLocations).toContain(`id: '${sourceId}'`);
            } else if (binding.lineId.startsWith('lesson-zero:vowel:')) {
                expect(vowelAnchors).toContain(`bindingId: '${binding.lineId}'`);
                expect(vowelScreen).toContain('playLearningVoiceBinding');
                expect(vowelWritingScreen).toContain('playLearningVoiceBinding');
            } else if (binding.lineId.startsWith('lesson-zero:classroom-instruction:')) {
                expect(classroomInstructionContent).toContain(`'${binding.lineId}'`);
                expect(classroomInstructionScreen).toContain('playLearningVoiceBinding');
            } else {
                expect(binding.lineId).toBe('lesson-zero:greeting-rie-model');
                expect(greetingScreen).toContain(`'${binding.lineId}'`);
            }
            expect(binding.accessibleReplayLabel.en).not.toBe('');
            expect(binding.accessibleReplayLabel.ja).not.toBe('');
        }
        for (const line of speakingLines.filter(line => line.bindings.some(binding => (
            binding.lineId.startsWith('world-practice:')
        )))) {
            expect(worldLocations).toContain(`audioLine: '${line.japanese}'`);
        }
    });
});
