import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalN1OpeningSequenceAuthoredContent,
    canonicalN1OpeningSequenceDeliveredSource,
    canonicalN1OpeningSequenceSourceSet,
    createN1OpeningSequencePackage,
    createN1OpeningSequenceRuntime,
    evaluateN1OpeningSequenceProduction,
    N1_OPENING_SEQUENCE_AUTHORED,
    N1_OPENING_SEQUENCE_DELIVERED_SOURCE,
    N1_OPENING_SEQUENCE_PACKAGES,
    N1_OPENING_SEQUENCE_PROVENANCE,
    resolveN1OpeningSequencePackage,
} from '../../src/academy/content/n1-opening-sequence';

const LIBRARY_ROOT = process.env.ACADEMY_LIBRARY_ROOT ?? path.join(homedir(), 'Documents/Japanese');
const SOYA_GAP_FILE = path.resolve(process.cwd(), '../..', N1_OPENING_SEQUENCE_PROVENANCE.gapEvidence.repoRelativePath);
const PACKAGE_AUDIO_FILE = path.resolve(N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.packageRelativePath);

afterEach(() => document.body.replaceChildren());

describe('N1 opening-sequence exact-source package', () => {
    it('pins three disjoint canonical domains and every local document/audio payload', () => {
        const provenance = N1_OPENING_SEQUENCE_PROVENANCE;
        expect(sha256(canonicalN1OpeningSequenceSourceSet())).toBe(provenance.sourceSetSha256);
        expect(sha256(canonicalN1OpeningSequenceDeliveredSource())).toBe(provenance.deliveredSourceSha256);
        expect(sha256(canonicalN1OpeningSequenceAuthoredContent())).toBe(provenance.authoredContentSha256);
        expect(provenance).toMatchObject({
            sourceScope: 'japanese-library',
            sourceFamily: 'mixed',
            sourceMediaState: 'mixed-short-source-excerpts-and-package-local-audio',
            rights: {
                state: 'user-directed-package-local-short-excerpts-and-exact-track',
                sourceTextDelivery: 'delivered-short-excerpts',
                sourceImageDelivery: 'not-delivered',
                sourceAudioDelivery: 'delivered-exact-track',
                learnerActivityText: 'mixed-exact-source-excerpt-and-yomu-transfer',
                playback: 'exact-source-audio-and-tts-transfer',
            },
        });
        expect(provenance.sources.map(source => [source.role, source.sourceFamily, source.sourceDocumentSha256])).toEqual([
            ['reading-anchor', 'shin-kanzen', '392f34d1e235ff89109ab1f71426737aeeb33a570d6f7373b05bd0d5eba9c139'],
            ['grammar-anchor', 'shin-kanzen', '4fe2ce35f8fd92b9059d03dc38d37cb49f7811f96abee4367262ce7322fd2512'],
            ['listening-anchor', 'so-matome', '1ca85d234d05887627ed1e4c6ce4dc86d4d50762ae6fb0e65d5692039ecf92c4'],
            ['transfer-bridge-reference', 'tobira', '954dfd010fa9c77e5f276fdc42021c6305cc8d9e7c3ae9009825c302cc420d52'],
        ]);
        expect(provenance.sources.map(source => [source.sourceLocus.pdfPage, source.sourceLocus.printedPage])).toEqual([
            [15, 5], [19, 8], [43, 41], [27, 5],
        ]);
        expect(provenance.sources[2]).toMatchObject({
            secondaryPageImageSha256: 'd852bc911ec11d4ae01061c30fe1230ee4e5eb1a080bc739752546e3c9752186',
            secondaryPageImageByteLength: 157034,
            secondaryLocus: { pdfPage: 110, printedPage: 108 },
        });
        for (const source of provenance.sources) {
            expect(sha256(sourceExcerptFor(source.role))).toBe(source.sourceExcerptSha256);
        }
        expect(JSON.stringify(provenance)).not.toContain('/Users/');
        expect(readFileSync(path.resolve('src/academy/content/n1-opening-sequence/source.ts'), 'utf8'))
            .not.toContain("from 'node:crypto'");

        const localLibraryPresent = existsSync(LIBRARY_ROOT);
        for (const source of provenance.sources) {
            const sourceFile = path.join(LIBRARY_ROOT, source.relativePath);
            if (localLibraryPresent) expect(existsSync(sourceFile), source.relativePath).toBe(true);
            if (existsSync(sourceFile)) {
                expect(sha256(readFileSync(sourceFile))).toBe(source.sourceDocumentSha256);
                expect(statSync(sourceFile).size).toBe(source.sourceDocumentByteLength);
            }
        }

        const deliveredAudio = provenance.deliveredAudio;
        expect(deliveredAudio).toMatchObject({
            track: 'CD1-55',
            sha256: 'cd51361d718bc376d09ae3fd360f95719238cd2081fb3b6e8c2999acdb09081a',
            byteLength: 1175094,
            durationSeconds: 73.139375,
            packageUrl: '/academy/content/n1-opening-sequence/audio/nihongo-somatome-n1-cd1-track-55.mp3',
            codec: { format: 'mp3', sampleRateHz: 44100, channels: 2, bitrateKbps: 128 },
            state: 'package-local-exact-source',
        });
        const localAudio = path.join(LIBRARY_ROOT, deliveredAudio.relativePath);
        if (localLibraryPresent) expect(existsSync(localAudio), deliveredAudio.relativePath).toBe(true);
        if (existsSync(localAudio)) {
            expect(sha256(readFileSync(localAudio))).toBe(deliveredAudio.sha256);
            expect(statSync(localAudio).size).toBe(deliveredAudio.byteLength);
        }
        expect(existsSync(PACKAGE_AUDIO_FILE)).toBe(true);
        expect(sha256(readFileSync(PACKAGE_AUDIO_FILE))).toBe(deliveredAudio.sha256);
        expect(statSync(PACKAGE_AUDIO_FILE).size).toBe(deliveredAudio.byteLength);
    });

    it('pins the empty Soya N1 pool as gap evidence, never a learning source', () => {
        expect(N1_OPENING_SEQUENCE_PROVENANCE.gapEvidence).toMatchObject({
            sha256: '30e2bfbe3630bfd8a62045bf4883e551855737beed21ef7cc6b1f90c0436be49',
            byteLength: 76,
            state: 'inspected-empty-not-used',
        });
        expect(N1_OPENING_SEQUENCE_PROVENANCE.sources).toHaveLength(4);
        expect(N1_OPENING_SEQUENCE_PROVENANCE.sources.every(source => !source.sourceId.includes('soya'))).toBe(true);
        if (existsSync(SOYA_GAP_FILE)) {
            expect(sha256(readFileSync(SOYA_GAP_FILE))).toBe(N1_OPENING_SEQUENCE_PROVENANCE.gapEvidence.sha256);
            expect(statSync(SOYA_GAP_FILE).size).toBe(N1_OPENING_SEQUENCE_PROVENANCE.gapEvidence.byteLength);
        }
    });

    it('validates a source-anchor to transfer sequence with 11 judgments and 4 production checks', () => {
        const lesson = createN1OpeningSequencePackage();
        expect(lesson.band).toBe('N1');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'grammar:n2-immediate-totan',
            'reading:n2-contrast-ippou',
            'listening:n2-task-order',
        ]);
        expect(lesson.activity.kind).toBe('academy-n1-opening-sequence');
        expect(N1_OPENING_SEQUENCE_PACKAGES).toEqual([lesson]);
        expect(resolveN1OpeningSequencePackage(lesson.id)).toBe(N1_OPENING_SEQUENCE_PACKAGES[0]);
        expect(() => resolveN1OpeningSequencePackage('unknown')).toThrow(/Unknown N1 opening-sequence package/);
        expect(createN1OpeningSequenceRuntime().validate(lesson.activity)).toEqual([]);

        const payload = lesson.activity.payload;
        expect(payload.prerequisiteRefresh).toHaveLength(3);
        expect(payload.prerequisiteRefresh[1]).toMatchObject({ exampleSource: 'exact-source-tobira' });
        expect(payload.prerequisiteRefresh[1].example).toBe(N1_OPENING_SEQUENCE_DELIVERED_SOURCE.tobiraBridgeSentence);
        expect(payload.reading.sourceAnchor).toMatchObject({ authorship: 'exact-source-shin-kanzen-reading' });
        expect(payload.reading.sourceAnchor.paragraphs).toEqual(N1_OPENING_SEQUENCE_DELIVERED_SOURCE.readingAnchorParagraphs);
        expect(payload.reading.transfer).toMatchObject({ authorship: 'original-yomu-n1-reading' });
        expect(payload.reading.transfer.paragraphs).toEqual(N1_OPENING_SEQUENCE_AUTHORED.readingParagraphs);
        expect(payload.grammar.forms.map(form => form.form)).toEqual(['〜が早いか', '〜や／〜や否や', '〜なり']);
        expect(payload.grammar.forms.map(form => form.example)).toEqual(N1_OPENING_SEQUENCE_DELIVERED_SOURCE.grammarExamples);
        expect(payload.listening.sourceAudio).toMatchObject({
            authorship: 'exact-source-somatome-listening',
            track: 'CD1-55',
            packageUrl: N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.packageUrl,
        });
        expect(payload.listening.transfer).toMatchObject({ authorship: 'original-yomu-n1-listening' });
        expect(payload.questions).toHaveLength(11);
        expect(roleCounts(payload.questions)).toEqual({
            'source-reading': 2,
            'transfer-reading': 3,
            grammar: 3,
            'source-listening': 1,
            'transfer-listening': 2,
        });
        expect(payload.questions.filter(question => question.modality === 'reading')).toHaveLength(5);
        expect(payload.questions.filter(question => question.modality === 'grammar')).toHaveLength(3);
        expect(payload.questions.filter(question => question.modality === 'listening')).toHaveLength(3);
        expect(payload.questions.find(question => question.id === 'ls1')?.options).toHaveLength(4);
        expect(payload.production.checks).toHaveLength(4);
        expect(payload.passScore).toBe(13 / 15);
        expect(payload.modalityFloors).toEqual({ reading: 4, grammar: 2, listening: 2, production: 3 });
        expect(evaluateN1OpeningSequenceProduction(lesson.activity, payload.production.modelAnswer)
            .every(result => result.met)).toBe(true);

        const delivered = JSON.stringify(N1_OPENING_SEQUENCE_DELIVERED_SOURCE);
        const authored = JSON.stringify(N1_OPENING_SEQUENCE_AUTHORED);
        for (const example of N1_OPENING_SEQUENCE_DELIVERED_SOURCE.grammarExamples) {
            expect(delivered).toContain(example);
            expect(authored).not.toContain(example);
        }
        expect(delivered).not.toContain(N1_OPENING_SEQUENCE_AUTHORED.readingParagraphs[0]);
    });

    it('grades 15 deterministic checks with modality floors and source-aware repair seeds', () => {
        const runtime = createN1OpeningSequenceRuntime();
        const { activity } = createN1OpeningSequencePackage();
        const modelAnswer = activity.payload.production.modelAnswer;

        const pass = runtime.evaluate(activity, response(activity, modelAnswer));
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(8);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const scoreLapse = runtime.evaluate(activity, response(activity, modelAnswer, {
            rs1: 'info-scarcity-vs-overload', g1: 'nari-intention', ls1: 'okinawa-shindo-4',
        }));
        expect(scoreLapse.result).toMatchObject({ outcome: 'lapse', score: 12 / 15 });
        expect([...scoreLapse.result.errorTags].sort()).toEqual([
            'grammar-nari', 'listening-source-tsunami-mismatch', 'reading-source-contrast',
        ]);
        expect(scoreLapse.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
        expect(scoreLapse.reviewSeeds.map(seed => seed.id).sort()).toEqual([
            'review:n1-opening-sequence-01:nari',
            'review:n1-opening-sequence-01:source-contrast',
            'review:n1-opening-sequence-01:tsunami-mismatch',
        ]);

        const floorLapse = runtime.evaluate(activity, response(activity, modelAnswer, {
            l1: 'anonymise-first', l2: 'printing-tomorrow',
        }));
        expect(floorLapse.result.score).toBe(13 / 15);
        expect(floorLapse.result.score).toBeGreaterThanOrEqual(activity.payload.passScore);
        expect(floorLapse.result.outcome).toBe('lapse');
        expect([...floorLapse.result.errorTags].sort()).toEqual([
            'floor-listening', 'listening-first-priority', 'listening-merge-reason',
        ]);
        expect(floorLapse.reviewSeeds.map(seed => seed.id).sort()).toEqual([
            'review:n1-opening-sequence-01:mazu-kijun',
            'review:n1-opening-sequence-01:tsunami-mismatch',
        ]);

        const productionLapse = runtime.evaluate(activity, response(activity, '短すぎる。'));
        expect(productionLapse.result).toMatchObject({ outcome: 'lapse', score: 11 / 15 });
        expect(productionLapse.result.errorTags).toEqual(expect.arrayContaining([
            'production-length-band', 'production-evidence-balance',
            'production-qualification-marker', 'production-provisional-no-overclaim',
            'floor-production',
        ]));
        expect(productionLapse.reviewSeeds.map(seed => seed.id)).toEqual(['review:n1-opening-sequence-01:nozomashii']);

        expect(() => runtime.evaluate(activity, { answers: [], production: '' }))
            .toThrow(/Every N1 opening-sequence question/);
        expect(() => runtime.evaluate(activity, {
            answers: activity.payload.questions.map(() => ({ questionId: 'r1', optionId: 'pilot-failed' })),
            production: '',
        })).toThrow(/each assessed question once/);
    });

    it('gates both transcripts and the key until an attempt, then preserves their nodes through retry', async () => {
        const runtime = createN1OpeningSequenceRuntime();
        const { activity } = createN1OpeningSequencePackage();
        const host = document.createElement('main');
        document.body.append(host);
        const registered: HTMLElement[] = [];
        let readerDisposals = 0;
        const playbackDispose = vi.fn();
        const playPronunciation = vi.fn(async () => ({ dispose: playbackDispose }));
        const onEvaluation = vi.fn();
        const controller = runtime.mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) {
                registered.push(surface);
                return () => { readerDisposals += 1; };
            },
            playPronunciation,
        }, onEvaluation);

        expect(host.querySelector('[data-prerequisite-refresh="unassessed"]')).not.toBeNull();
        expect(host.querySelector('[data-prerequisite-refresh] input')).toBeNull();
        expect(host.querySelectorAll('fieldset')).toHaveLength(11);
        expect(host.querySelectorAll('[data-stimulus-role="source-listening"] input')).toHaveLength(4);
        const sourceArticle = host.querySelector('[data-source-role="reading-source-anchor"]')!;
        const transferArticle = host.querySelector('[data-source-role="reading-transfer"]')!;
        expect(sourceArticle.compareDocumentPosition(transferArticle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.textContent).toContain(N1_OPENING_SEQUENCE_DELIVERED_SOURCE.readingAnchorParagraphs[0]);
        expect(host.textContent).toContain(N1_OPENING_SEQUENCE_AUTHORED.readingParagraphs[0]);

        const exactAudio = host.querySelector<HTMLAudioElement>('audio[data-source-audio-track="CD1-55"]')!;
        expect(exactAudio).not.toBeNull();
        expect(exactAudio.getAttribute('src')).toBe(N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.packageUrl);
        expect(exactAudio.preload).toBe('none');
        expect(host.querySelector('[data-source-transcript-reveal]')).toBeNull();
        expect(host.querySelector('[data-transfer-transcript-reveal]')).toBeNull();
        expect(host.querySelector('[data-answer-key]')).toBeNull();
        expect(host.textContent).not.toContain('該当する地域の方々');
        expect(host.textContent).not.toContain('予想される津波の高さは1m');
        expect(host.textContent).not.toContain('放送では予想される津波の高さは1m');
        expect(host.textContent).not.toContain('田中さん');
        expect(host.textContent).not.toContain('送迎の小規模な試行');
        expect(host.textContent).toContain('constrained deterministic check');
        expect(registered.map(surface => surface.dataset.readerSurfaceId)).toEqual([
            'reader:n1-opening-sequence-01:reading:source-paragraph-1',
            'reader:n1-opening-sequence-01:reading:source-paragraph-2',
            'reader:n1-opening-sequence-01:reading:source-paragraph-3',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-1',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-2',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-3',
            'reader:n1-opening-sequence-01:grammar:example-1',
            'reader:n1-opening-sequence-01:grammar:example-2',
            'reader:n1-opening-sequence-01:grammar:example-3',
        ]);

        host.querySelector<HTMLButtonElement>('[data-play-listening]')!.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(activity.payload.listening.transfer.script));

        const wrongFirstAttempt: Record<string, string> = { l1: 'anonymise-first', l2: 'printing-tomorrow' };
        for (const question of activity.payload.questions) {
            const optionId = wrongFirstAttempt[question.id] ?? question.correctOptionId;
            host.querySelector<HTMLInputElement>(`input[name="${question.id}"][value="${optionId}"]`)!.checked = true;
        }
        host.querySelector<HTMLTextAreaElement>('textarea[name="production"]')!.value = activity.payload.production.modelAnswer;
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        expect(onEvaluation.mock.calls[0][0].result.outcome).toBe('lapse');
        await vi.waitFor(() => expect(host.querySelector('[data-answer-key]')).not.toBeNull());

        const key = host.querySelector<HTMLElement>('[data-answer-key]')!;
        const sourceReveal = host.querySelector<HTMLElement>('[data-source-transcript-reveal="after-attempt"]')!;
        const transferReveal = host.querySelector<HTMLElement>('[data-transfer-transcript-reveal="after-attempt"]')!;
        expect(key.dataset.attemptCount).toBe('1');
        expect(sourceReveal.textContent).toContain('該当する地域の方々');
        expect(sourceReveal.textContent).toContain('予想される津波の高さは1m');
        expect(sourceReveal.textContent).toContain('does not match the 3m named in this option');
        expect(transferReveal.textContent).toContain('田中さん');
        expect(host.textContent).toContain('送迎の小規模な試行');
        expect(host.querySelectorAll('[data-key-question-id]')).toHaveLength(11);
        expect(host.querySelectorAll('[data-production-check][data-met="true"]')).toHaveLength(4);
        expect(registered.at(-2)?.dataset.readerSurfaceId).toBe('reader:n1-opening-sequence-01:listening:source-transcript-1');
        expect(registered.at(-1)?.dataset.readerSurfaceId).toBe('reader:n1-opening-sequence-01:listening:transfer-transcript-1');
        expect(registered).toHaveLength(11);

        const l1Wrong = host.querySelector<HTMLInputElement>('input[name="l1"][value="anonymise-first"]')!;
        expect(l1Wrong.checked).toBe(true);
        expect(l1Wrong.disabled).toBe(false);
        expect(host.querySelector<HTMLTextAreaElement>('textarea[name="production"]')!.value)
            .toBe(activity.payload.production.modelAnswer);

        for (const questionId of ['l1', 'l2']) {
            const question = activity.payload.questions.find(candidate => candidate.id === questionId)!;
            host.querySelector<HTMLInputElement>(`input[name="${questionId}"][value="${question.correctOptionId}"]`)!.checked = true;
        }
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledTimes(2));
        expect(onEvaluation.mock.calls[1][0].result.outcome).toBe('pass');
        await vi.waitFor(() => expect(key.dataset.attemptCount).toBe('2'));

        expect(host.querySelector('[data-answer-key]')).toBe(key);
        expect(host.querySelector('[data-source-transcript-reveal]')).toBe(sourceReveal);
        expect(host.querySelector('[data-transfer-transcript-reveal]')).toBe(transferReveal);
        expect(host.querySelectorAll('[data-source-transcript-reveal]')).toHaveLength(1);
        expect(host.querySelectorAll('[data-transfer-transcript-reveal]')).toHaveLength(1);
        expect(host.querySelectorAll('[data-answer-key]')).toHaveLength(1);
        expect(key.dataset.outcome).toBe('pass');
        expect(registered).toHaveLength(11);
        expect(host.querySelector<HTMLInputElement>('input[name="ls1"]:checked')!.disabled).toBe(true);

        controller.dispose();
        expect(readerDisposals).toBe(11);
        expect(playbackDispose).toHaveBeenCalled();
        expect(exactAudio.getAttribute('src')).toBeNull();
        expect(exactAudio.isConnected).toBe(false);
    });

    it('disposes a transfer-playback handle that resolves after the activity is gone', async () => {
        const runtime = createN1OpeningSequenceRuntime();
        const { activity } = createN1OpeningSequencePackage();
        const host = document.createElement('main');
        document.body.append(host);
        const lateDispose = vi.fn();
        let resolvePlayback!: (value: { dispose(): void }) => void;
        const playbackPending = new Promise<{ dispose(): void }>(resolve => { resolvePlayback = resolve; });
        const controller = runtime.mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            playPronunciation: vi.fn(() => playbackPending),
        }, vi.fn());

        host.querySelector<HTMLButtonElement>('[data-play-listening]')!.click();
        controller.dispose();
        resolvePlayback({ dispose: lateDispose });

        await vi.waitFor(() => expect(lateDispose).toHaveBeenCalledOnce());
        expect(host.children).toHaveLength(0);
    });

    it('projects exact and authored expressions to Reader/SRS with honest attribution and no media paths', () => {
        const lesson = createN1OpeningSequencePackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:n1-opening-sequence-01:reading:source-paragraph-1',
            'reader:n1-opening-sequence-01:reading:source-paragraph-2',
            'reader:n1-opening-sequence-01:reading:source-paragraph-3',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-1',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-2',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-3',
            'reader:n1-opening-sequence-01:grammar:example-1',
            'reader:n1-opening-sequence-01:grammar:example-2',
            'reader:n1-opening-sequence-01:grammar:example-3',
            'reader:n1-opening-sequence-01:listening:source-transcript-1',
            'reader:n1-opening-sequence-01:listening:transfer-transcript-1',
        ]);
        expect(lesson.readerSrs.miningRequests.map(request => request.expression)).toEqual([
            '目にみえない情報', '並べられたが早いか', '入ってくるなり', '扉を開けるや否や', 'その数字が含まない人',
        ]);
        expect(lesson.readerSrs.miningRequests.slice(0, 3).every(request => request.sourceTitle.includes('exact source'))).toBe(true);
        expect(lesson.readerSrs.miningRequests.slice(3).every(request => request.sourceTitle.startsWith('Yomu original'))).toBe(true);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
        const serialized = JSON.stringify(lesson.readerSrs);
        expect(serialized).not.toContain('.mp3');
        expect(serialized).not.toContain('.pdf');
        expect(serialized).not.toContain('/Users/');
        for (const request of lesson.readerSrs.miningRequests) {
            const inAuthored = JSON.stringify(N1_OPENING_SEQUENCE_AUTHORED).includes(request.sentence);
            const inDelivered = JSON.stringify(N1_OPENING_SEQUENCE_DELIVERED_SOURCE).includes(request.sentence);
            expect(inAuthored || inDelivered, request.expression).toBe(true);
        }
    });

    it('publishes answer-free descriptors that report current registration while deferring SW caching', () => {
        const manifest = JSON.parse(readFileSync(path.resolve('public/academy/content/n1-opening-sequence/package.v1.json'), 'utf8'));
        const provenanceDoc = JSON.parse(readFileSync(path.resolve('public/academy/content/n1-opening-sequence/source-provenance.v1.json'), 'utf8'));
        expect(manifest).toMatchObject({
            revision: 'n1-opening-sequence-01/2026-07-18.2',
            package: {
                id: 'n1-opening-sequence-01',
                activityKind: 'academy-n1-opening-sequence',
                assessment: {
                    mcqJudgments: { reading: 5, grammar: 3, listening: 3 },
                    totalChecks: 15,
                    passThreshold: { passChecks: 13, totalChecks: 15 },
                    modalityFloors: { reading: 4, grammar: 2, listening: 2, production: 3 },
                    floorFailureIsLapse: true,
                    productionGrading: 'constrained-deterministic-check-not-general-writing-assessment',
                },
            },
            rights: {
                state: 'user-directed-package-local-short-excerpts-and-exact-track',
                sourceAudio: 'exact-track-delivered',
            },
            audio: {
                track: 'CD1-55',
                packageUrl: N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.packageUrl,
                sha256: N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.sha256,
                byteLength: N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.byteLength,
            },
            offline: {
                packageAudioRequestsOnPlay: 1,
                sourceMediaBundled: true,
                audioAvailability: 'network-or-browser-cache',
                serviceWorker: 'deferred-not-registered',
            },
            registration: {
                sharedActivityRegistry: 'registered',
                trancheBoundary: 'the N1 source-package tranche does not own or modify the shared registry',
            },
        });
        expect(provenanceDoc).toMatchObject({
            packageId: 'n1-opening-sequence-01',
            sourceSetId: N1_OPENING_SEQUENCE_PROVENANCE.sourceSetId,
            sourceFamily: 'mixed',
            deliveredAudio: {
                track: 'CD1-55',
                sha256: N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio.sha256,
                state: 'package-local-exact-source',
            },
            gapEvidence: { state: 'inspected-empty-not-used', byteLength: 76 },
            canonicalHashes: {
                sourceSetSha256: N1_OPENING_SEQUENCE_PROVENANCE.sourceSetSha256,
                deliveredSourceSha256: N1_OPENING_SEQUENCE_PROVENANCE.deliveredSourceSha256,
                authoredContentSha256: N1_OPENING_SEQUENCE_PROVENANCE.authoredContentSha256,
            },
        });
        expect(provenanceDoc.sources.map((source: { documentSha256: string }) => source.documentSha256)).toEqual(
            N1_OPENING_SEQUENCE_PROVENANCE.sources.map(source => source.sourceDocumentSha256),
        );
        for (const serialized of [JSON.stringify(manifest), JSON.stringify(provenanceDoc)]) {
            expect(serialized).not.toContain('/Users/');
            expect(serialized).not.toContain('Resource Packs/');
            expect(serialized).not.toContain('田中さん');
            expect(serialized).not.toContain('該当する地域の方々');
            expect(serialized).not.toContain('予想される津波の高さは1m');
            expect(serialized).not.toContain('correctOptionId');
            expect(serialized).not.toContain('tsunami-height-3m');
            expect(serialized).not.toContain('送迎の小規模な試行');
        }
    });
});

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function sourceExcerptFor(role: string): string {
    const source = N1_OPENING_SEQUENCE_DELIVERED_SOURCE;
    if (role === 'reading-anchor') return source.readingAnchorParagraphs.join('\n');
    if (role === 'grammar-anchor') return source.grammarExamples.join('\n');
    if (role === 'listening-anchor') return source.listeningSourceTranscript;
    if (role === 'transfer-bridge-reference') return source.tobiraBridgeSentence;
    throw new TypeError(`Unknown exact-source role: ${role}`);
}

function roleCounts(questions: ReturnType<typeof createN1OpeningSequencePackage>['activity']['payload']['questions']) {
    return Object.fromEntries([...new Set(questions.map(question => question.stimulusRole))]
        .map(role => [role, questions.filter(question => question.stimulusRole === role).length]));
}

function response(
    activity: ReturnType<typeof createN1OpeningSequencePackage>['activity'],
    production: string,
    overrides: Record<string, string> = {},
) {
    return {
        answers: activity.payload.questions.map(question => ({
            questionId: question.id,
            optionId: overrides[question.id] ?? question.correctOptionId,
        })),
        production,
    };
}
