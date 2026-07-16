import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalN1SoundDiscriminationSourceLocus,
    createN1SoundDiscriminationPackage,
    createN1SoundDiscriminationRuntime,
    N1_SOUND_DISCRIMINATION_PACKAGES,
    N1_SOUND_DISCRIMINATION_PROVENANCE,
    resolveN1SoundDiscriminationPackage,
} from '../../src/academy/content/n1-sound-discrimination';
import { ACADEMY_ACTIVITY_PLUGINS, createAcademyActivityRuntime } from '../../src/academy/minigames';

const LIBRARY_ROOT = process.env.ACADEMY_LIBRARY_ROOT ?? '/Users/heru/Documents/Japanese';

afterEach(() => document.body.replaceChildren());

describe('N1 multimodal sound-discrimination package', () => {
    it('pins the permitted Shin Kanzen listening locus and local source media without delivering it', () => {
        const sourceFile = path.join(LIBRARY_ROOT, N1_SOUND_DISCRIMINATION_PROVENANCE.relativePath);
        const sourceAudio = path.join(LIBRARY_ROOT, N1_SOUND_DISCRIMINATION_PROVENANCE.sourceAudioRelativePath);
        expect(sha256(canonicalN1SoundDiscriminationSourceLocus())).toBe(
            N1_SOUND_DISCRIMINATION_PROVENANCE.sourceLocusSha256,
        );
        expect(N1_SOUND_DISCRIMINATION_PROVENANCE).toMatchObject({
            sourceScope: 'japanese-library',
            sourceFamily: 'shin-kanzen',
            sourceTitle: '新完全マスター聴解 N1',
            sourceDocumentSha256: 'cb9872226b092bc48b4f6c070247b15ea64e2ce9e250df555ac8898eab1d1ecf',
            sourceDocumentByteLength: 21196731,
            sourcePageImageSha256: '20e80db140403c64fdf813ab9d2dbc72cf94a3e65321f3890be4df722f55383e',
            sourceAudioSha256: 'c1d18d224b6036ae0fbe6beb63a6e705969fa38b4df2bac84cddc3a0df4ef72c',
            sourceLocus: { pdfPage: 23, printedPage: 14, item: '1 似ている音の聞き分け', track: 'A07' },
            rights: {
                state: 'user-permitted-local-reference-only',
                sourceTextDelivery: 'not-delivered',
                sourceImageDelivery: 'not-delivered',
                sourceAudioDelivery: 'not-delivered',
                learnerActivityText: 'original-yomu-authored',
            },
            sourceMediaState: 'local-reference-not-delivered',
        });
        expect(JSON.stringify(N1_SOUND_DISCRIMINATION_PROVENANCE)).not.toContain('/Users/');
        if (existsSync(sourceFile)) {
            expect(sha256(readFileSync(sourceFile))).toBe(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceDocumentSha256);
            expect(statSync(sourceFile).size).toBe(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceDocumentByteLength);
        }
        if (existsSync(sourceAudio)) {
            expect(sha256(readFileSync(sourceAudio))).toBe(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceAudioSha256);
            expect(statSync(sourceAudio).size).toBe(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceAudioByteLength);
        }
    });

    it('is N1, disjoint from reading inference, and reachable from package and runtime registries', () => {
        const lesson = createN1SoundDiscriminationPackage();
        expect(lesson.band).toBe('N1');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'listening:n2-mora-boundaries',
            'listening:n2-context-selection',
            'reader:n2-audio-transcript-repair',
        ]);
        expect(lesson.activity.kind).toBe('academy-n1-sound-discrimination');
        expect(lesson.activity.conceptIds).not.toContain('reading:n1-contrast-structure');
        expect(N1_SOUND_DISCRIMINATION_PACKAGES).toEqual([lesson]);
        expect(resolveN1SoundDiscriminationPackage(lesson.id)).toBe(N1_SOUND_DISCRIMINATION_PACKAGES[0]);
        expect(() => resolveN1SoundDiscriminationPackage('unknown')).toThrow(/Unknown N1 sound-discrimination package/);
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toContain(lesson.activity.kind);
        expect(createAcademyActivityRuntime().validate(lesson.activity)).toEqual([]);
    });

    it('grades exact listening retrieval and projects only missed repairs on a lapse', () => {
        const runtime = createN1SoundDiscriminationRuntime();
        const { activity } = createN1SoundDiscriminationPackage();
        expect(runtime.validate(activity)).toEqual([]);
        const pass = runtime.evaluate(activity, response(activity.payload.questions.map(question => [question.id, question.correctOptionId])));
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(4);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const lapse = runtime.evaluate(activity, response(activity.payload.questions.map(question => [
            question.id,
            question.id === 'reference' ? 'sanpo' : question.correctOptionId,
        ])));
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0.75, errorTags: ['medial-consonant'] });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([['参考', 'repair']]);
        expect(() => runtime.evaluate(activity, { answers: [], production: '' })).toThrow(/Every N1 sound-discrimination question/);
    });

    it('enforces teaching before retrieval, varies modality, and reveals Reader transcripts only after attempt', async () => {
        const runtime = createN1SoundDiscriminationRuntime();
        const { activity } = createN1SoundDiscriminationPackage();
        const host = document.createElement('main');
        document.body.append(host);
        const registered: HTMLElement[] = [];
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        const onEvaluation = vi.fn();
        const controller = runtime.mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) {
                registered.push(surface);
                return () => undefined;
            },
            playPronunciation,
        }, onEvaluation);

        expect(host.querySelector('[data-lesson-phase="instruction"]')).not.toBeNull();
        expect(host.querySelectorAll('[data-sound-pair]')).toHaveLength(4);
        expect(host.querySelectorAll('fieldset')).toHaveLength(0);
        expect(host.querySelector('[data-transcript-reveal]')).toBeNull();
        expect(registered).toHaveLength(0);
        expect(host.textContent).toContain('reference text, page image, and A07 audio are not delivered');
        expect(host.textContent).not.toContain(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceTitle);

        host.querySelector<HTMLButtonElement>('[data-begin-retrieval]')?.click();
        expect(host.querySelectorAll('fieldset')).toHaveLength(4);
        expect(host.querySelector('textarea[data-production="ungraded"]')).not.toBeNull();
        expect(host.textContent).toContain('not automatically scored');
        host.querySelector<HTMLButtonElement>('[data-play-question="cost"]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(activity.payload.questions[0].playbackText));

        host.querySelector<HTMLTextAreaElement>('textarea')!.value = '語頭の子音を先に確認した。';
        for (const question of activity.payload.questions) {
            host.querySelector<HTMLInputElement>(
                `input[name="${question.id}"][value="${question.correctOptionId}"]`,
            )!.checked = true;
        }
        host.querySelector<HTMLFormElement>('form')?.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        expect(onEvaluation.mock.calls[0][0].attempt.responseKind).toBe('n1-sound-discrimination-v1');
        await vi.waitFor(() => expect(host.querySelector('[data-transcript-reveal="after-attempt"]')).not.toBeNull());
        expect(registered.map(surface => surface.dataset.readerSurfaceId)).toEqual(activity.payload.questions.map((_, index) =>
            `reader:n1-sound-discrimination-01:transcript:${index + 1}`,
        ));
        expect(host.textContent).toContain(activity.payload.questions[0].playbackText);
        expect(host.textContent).not.toContain(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceTitle);
        controller.dispose();
    });

    it('projects only original practice lines to Reader and SRS', () => {
        const lesson = createN1SoundDiscriminationPackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:n1-sound-discrimination-01:transcript:1',
            'reader:n1-sound-discrimination-01:transcript:2',
            'reader:n1-sound-discrimination-01:transcript:3',
            'reader:n1-sound-discrimination-01:transcript:4',
        ]);
        expect(lesson.readerSrs.miningRequests).toEqual([
            expect.objectContaining({ expression: '費用', conceptIds: ['listening:n1-near-sound-boundaries', 'listening:n1-contextual-lexical-selection'] }),
            expect.objectContaining({ expression: '遠慮なく', conceptIds: ['listening:n1-mora-and-consonant-cues', 'production:n1-phonetic-noticing'] }),
        ]);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
        expect(JSON.stringify(lesson.readerSrs)).not.toContain(N1_SOUND_DISCRIMINATION_PROVENANCE.relativePath);
        expect(JSON.stringify(lesson.readerSrs)).not.toContain(N1_SOUND_DISCRIMINATION_PROVENANCE.sourceAudioRelativePath);
    });

    it('publishes an honest package manifest that the offline shell precaches', () => {
        const manifestPath = path.resolve('public/academy/content/n1-sound-discrimination/package.v1.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const worker = readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        expect(manifest).toMatchObject({
            package: {
                id: 'n1-sound-discrimination-01',
                activityKind: 'academy-n1-sound-discrimination',
                pedagogy: 'instruction-gated-before-listening-retrieval',
            },
            source: {
                rights: 'user-permitted-local-reference-only',
                sourceText: 'not-delivered',
                sourceImage: 'not-delivered',
                sourceAudio: 'local-reference-not-delivered',
            },
            offline: {
                requiredNetworkRequests: 0,
                sourceMediaBundled: false,
                activityData: 'embedded-in-academy-app',
            },
        });
        expect(JSON.stringify(manifest)).not.toContain('/Users/');
        expect(worker).toContain("'/academy/content/n1-sound-discrimination/package.v1.json'");
        expect(worker).toContain("'/academy/app.js?v=__ACADEMY_REVISION__'");
    });
});

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}
function response(items: readonly (readonly [string, string])[]) {
    return { answers: items.map(([questionId, optionId]) => ({ questionId, optionId })), production: '聞こえ方のメモ。' };
}
