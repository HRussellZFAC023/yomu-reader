import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ADVANCED_IMMERSION_PACKAGES,
    ADVANCED_IMMERSION_PROVENANCE,
    ADVANCED_IMMERSION_QUARANTINE,
    ADVANCED_IMMERSION_SOURCE_SEGMENTS,
    canonicalAdvancedImmersionSourceItemPayload,
    createAdvancedImmersionPackage,
    createAdvancedImmersionRuntime,
    resolveAdvancedImmersionPackage,
} from '../../src/academy/content/advanced-immersion';

const SOYA_ROOT = path.resolve(process.cwd(), '../..', 'references/soya-research/extracted-src-all');

afterEach(() => document.body.replaceChildren());

describe('N3-N1 advanced evidence-boundary immersion package', () => {
    it('pins an exact permitted local Soya source item without publishing a machine-local path', () => {
        const sourceFile = path.join(SOYA_ROOT, ADVANCED_IMMERSION_PROVENANCE.relativePath);
        expect(sha256(canonicalAdvancedImmersionSourceItemPayload())).toBe(ADVANCED_IMMERSION_PROVENANCE.sourceItemSha256);
        expect(ADVANCED_IMMERSION_PROVENANCE).toMatchObject({
            sourceScope: 'soya-research',
            relativePath: 'data/courses/jlpt_n3/mock1_reading.js',
            payloadSha256: 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
            sourceItemId: 'mock1_r_03',
            originalMediaState: 'not-paired-not-delivered',
        });
        expect(JSON.stringify(ADVANCED_IMMERSION_PROVENANCE)).not.toContain('/Users/');

        if (existsSync(sourceFile)) {
            const bytes = readFileSync(sourceFile);
            const source = bytes.toString('utf8');
            expect(sha256(bytes)).toBe(ADVANCED_IMMERSION_PROVENANCE.payloadSha256);
            expect(source).toContain('id: "mock1_r_03"');
            for (const segment of ADVANCED_IMMERSION_SOURCE_SEGMENTS) expect(source).toContain(segment.text);
        }
    });

    it('declares explicit N3 prerequisites, package-local registry wiring, and honest non-playable quarantines', () => {
        const lesson = createAdvancedImmersionPackage();
        expect(lesson.band).toBe('N3-to-N1');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'grammar:contrast-keredomo',
            'grammar:inference-youdesu',
            'reading:claim-evidence',
        ]);
        expect(lesson.prerequisites.every(item => item.minimumEvidence === 'introduced-and-attempted')).toBe(true);
        expect(ADVANCED_IMMERSION_PACKAGES).toEqual([lesson]);
        expect(resolveAdvancedImmersionPackage(lesson.id)).toBe(ADVANCED_IMMERSION_PACKAGES[0]);
        expect(() => resolveAdvancedImmersionPackage('unknown')).toThrow(/Unknown advanced immersion package/);

        expect(ADVANCED_IMMERSION_QUARANTINE.map(item => item.sourceFamily)).toEqual([
            'tobira', 'shin-kanzen', 'sou-matome', 'soya-audio',
        ]);
        for (const item of ADVANCED_IMMERSION_QUARANTINE) {
            expect(item).toMatchObject({ state: 'quarantined-not-playable' });
            expect(item.gaps).toEqual([
                'rights-review-required',
                'item-locus-unverified',
                'transcript-audio-pairing-unverified',
            ]);
        }
        expect(JSON.stringify(lesson.quarantine)).not.toMatch(/https?:|\.(?:mp3|wav|pdf)/u);
    });

    it('grades every source and N1 judgment deterministically and emits targeted SRS repair', () => {
        const runtime = createAdvancedImmersionRuntime();
        const { activity } = createAdvancedImmersionPackage();
        expect(runtime.validate(activity)).toEqual([]);

        const correct = response(activity.payload.questions.map(question => [question.id, question.correctOptionId]));
        const pass = runtime.evaluate(activity, correct);
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(4);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const withMissedSynthesis = response(activity.payload.questions.map(question => [
            question.id,
            question.id === 'transfer-synthesis' ? 'certain' : question.correctOptionId,
        ]));
        const lapse = runtime.evaluate(activity, withMissedSynthesis);
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 0.8,
            errorTags: ['transfer-qualified-synthesis'],
        });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([
            ['断定するには', 'repair'],
        ]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow(/Every advanced immersion question/);
    });

    it('mounts a playable rehearsal and Reader slice while withholding source text until commitment', async () => {
        const runtime = createAdvancedImmersionRuntime();
        const { activity } = createAdvancedImmersionPackage();
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

        expect(host.textContent).toContain('Playback is synthesized rehearsal from hash-verified N3 source text');
        expect(host.querySelector('[data-source-transcript]')).toBeNull();
        expect(host.textContent).not.toContain(ADVANCED_IMMERSION_SOURCE_SEGMENTS[0].text);
        expect(host.querySelectorAll('fieldset')).toHaveLength(5);
        expect(host.querySelectorAll('.academy-advanced-immersion-transfer-passage p')).toHaveLength(2);
        expect(registered).toHaveLength(5);

        host.querySelector<HTMLButtonElement>('[data-source-segment-id="source-qualified-consequence"]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(ADVANCED_IMMERSION_SOURCE_SEGMENTS[2].text));
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
        expect(host.textContent).toContain(ADVANCED_IMMERSION_SOURCE_SEGMENTS[0].text);
        expect(registered).toHaveLength(8);
        controller.dispose();
    });

    it('projects exact Reader surfaces and canonical mining requests without a media URL', () => {
        const lesson = createAdvancedImmersionPackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:advanced-immersion-n3-n1-01:source-before-electricity',
            'reader:advanced-immersion-n3-n1-01:source-change-after-electricity',
            'reader:advanced-immersion-n3-n1-01:source-qualified-consequence',
            'reader:advanced-immersion-n3-n1-01:n1-transfer:paragraph-1',
            'reader:advanced-immersion-n3-n1-01:n1-transfer:paragraph-2',
        ]);
        expect(lesson.readerSrs.miningRequests).toEqual([
            expect.objectContaining({
                expression: '〜ようだ',
                sentence: ADVANCED_IMMERSION_SOURCE_SEGMENTS[2].text,
                conceptIds: ['grammar:inference-youdesu', 'reading:contrast-with-evidence'],
            }),
            expect.objectContaining({
                expression: '〜とまでは言えない',
                conceptIds: ['reading:evidence-ceiling', 'reading:qualified-synthesis'],
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
