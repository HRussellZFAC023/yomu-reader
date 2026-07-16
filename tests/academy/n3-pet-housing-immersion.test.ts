import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalN3PetHousingSourceItemPayload,
    createN3PetHousingPackage,
    createN3PetHousingRuntime,
    N3_PET_HOUSING_PACKAGES,
    N3_PET_HOUSING_PROVENANCE,
    N3_PET_HOUSING_QUARANTINE,
    N3_PET_HOUSING_SOURCE_SEGMENTS,
    resolveN3PetHousingPackage,
} from '../../src/academy/content/n3-pet-housing';

const SOYA_ROOT = path.resolve(process.cwd(), '../..', 'references/soya-research/extracted-src-all');

afterEach(() => document.body.replaceChildren());

describe('N3 pet-housing immersion package', () => {
    it('pins a separate permitted local Soya N3 slice without a machine-local path', () => {
        const sourceFile = path.join(SOYA_ROOT, N3_PET_HOUSING_PROVENANCE.relativePath);
        expect(sha256(canonicalN3PetHousingSourceItemPayload())).toBe(N3_PET_HOUSING_PROVENANCE.sourceItemSha256);
        expect(N3_PET_HOUSING_PROVENANCE).toMatchObject({
            sourceScope: 'soya-research',
            relativePath: 'data/courses/jlpt_n3/mock1_reading.js',
            payloadSha256: 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
            sourceItemId: 'mock1_r_04',
            originalMediaState: 'not-paired-not-delivered',
        });
        expect(JSON.stringify(N3_PET_HOUSING_PROVENANCE)).not.toContain('/Users/');

        if (existsSync(sourceFile)) {
            const bytes = readFileSync(sourceFile);
            const source = bytes.toString('utf8');
            expect(sha256(bytes)).toBe(N3_PET_HOUSING_PROVENANCE.payloadSha256);
            expect(source).toContain('id: "mock1_r_04"');
            expect(N3_PET_HOUSING_PROVENANCE.sourceItemId).not.toBe('mock1_r_03');
            for (const segment of N3_PET_HOUSING_SOURCE_SEGMENTS) expect(source).toContain(segment.text);
        }
    });

    it('owns its N4 prerequisites, local registry, and non-playable rights quarantines', () => {
        const lesson = createN3PetHousingPackage();
        expect(lesson.band).toBe('N3');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'grammar:n4-reason-kara',
            'grammar:n4-adversative-kedo',
            'reading:n4-main-claim',
        ]);
        expect(lesson.prerequisites.every(item => item.minimumEvidence === 'introduced-and-attempted')).toBe(true);
        expect(N3_PET_HOUSING_PACKAGES).toEqual([lesson]);
        expect(resolveN3PetHousingPackage(lesson.id)).toBe(N3_PET_HOUSING_PACKAGES[0]);
        expect(() => resolveN3PetHousingPackage('unknown')).toThrow(/Unknown N3 pet-housing package/);

        expect(N3_PET_HOUSING_QUARANTINE.map(item => item.sourceFamily)).toEqual([
            'tobira', 'shin-kanzen', 'sou-matome', 'soya-audio',
        ]);
        for (const item of N3_PET_HOUSING_QUARANTINE) {
            expect(item).toMatchObject({ state: 'quarantined-not-playable' });
            expect(item.gaps).toEqual([
                'rights-review-required',
                'item-locus-unverified',
                'transcript-audio-pairing-unverified',
            ]);
        }
        expect(JSON.stringify(lesson.quarantine)).not.toMatch(/https?:|\.(?:mp3|wav|pdf)/u);
    });

    it('grades all multimodal judgments deterministically and narrows repair SRS seeds', () => {
        const runtime = createN3PetHousingRuntime();
        const { activity } = createN3PetHousingPackage();
        expect(runtime.validate(activity)).toEqual([]);

        const correct = response(activity.payload.questions.map(question => [question.id, question.correctOptionId]));
        const pass = runtime.evaluate(activity, correct);
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(4);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const missed = response(activity.payload.questions.map(question => [
            question.id,
            question.id === 'transfer-limit' ? 'permission-solves-all' : question.correctOptionId,
        ]));
        const lapse = runtime.evaluate(activity, missed);
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 0.75,
            errorTags: ['transfer-scope-limit'],
        });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([
            ['契約で許されていても', 'repair'],
        ]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow(/Every N3 pet-housing question/);
    });

    it('mounts a playable synthesized rehearsal and Reader surface while withholding source text until commitment', async () => {
        const runtime = createN3PetHousingRuntime();
        const { activity } = createN3PetHousingPackage();
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

        expect(host.textContent).toContain('Playback is synthesized rehearsal from hash-verified source text');
        expect(host.querySelector('[data-source-transcript]')).toBeNull();
        expect(host.textContent).not.toContain(N3_PET_HOUSING_SOURCE_SEGMENTS[0].text);
        expect(host.querySelectorAll('fieldset')).toHaveLength(4);
        expect(host.querySelectorAll('article p')).toHaveLength(2);
        expect(registered).toHaveLength(5);

        host.querySelector<HTMLButtonElement>('[data-source-segment-id="source-pet-housing"]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(N3_PET_HOUSING_SOURCE_SEGMENTS[0].text));
        host.querySelector<HTMLButtonElement>('[data-transfer-playback]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(activity.payload.transfer.playbackText));

        for (const question of activity.payload.questions) {
            const input = host.querySelector<HTMLInputElement>(
                `input[name="${question.id}"][value="${question.correctOptionId}"]`,
            );
            expect(input).not.toBeNull();
            input!.checked = true;
        }
        host.querySelector<HTMLFormElement>('form')?.requestSubmit();

        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-source-transcript="after-attempt"]')).not.toBeNull());
        expect(host.textContent).toContain(N3_PET_HOUSING_SOURCE_SEGMENTS[0].text);
        expect(registered).toHaveLength(6);
        controller.dispose();
    });

    it('projects Reader surfaces and canonical mining requests without source media URLs', () => {
        const lesson = createN3PetHousingPackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:n3-pet-housing-01:source-pet-housing',
            'reader:n3-pet-housing-01:original-transfer:paragraph-1',
            'reader:n3-pet-housing-01:original-transfer:paragraph-2',
        ]);
        expect(lesson.readerSrs.miningRequests).toEqual([
            expect.objectContaining({
                expression: '〜ケースも少なくない',
                sentence: N3_PET_HOUSING_SOURCE_SEGMENTS[0].text,
                conceptIds: ['grammar:n3-case-mo-sukunakunai', 'reading:n3-reason-and-consequence'],
            }),
            expect.objectContaining({
                expression: '必要なら',
                conceptIds: ['reading:n3-bounded-community-response'],
            }),
        ]);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
    });
});

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function response(items: readonly (readonly [string, string])[]) {
    return { answers: items.map(([questionId, optionId]) => ({ questionId, optionId })) };
}
