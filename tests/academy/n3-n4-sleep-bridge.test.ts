import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalN3N4SleepBridgeSourceItemPayload,
    createN3N4SleepBridgePackage,
    createN3N4SleepBridgeRuntime,
    N3_N4_SLEEP_BRIDGE_PACKAGES,
    N3_N4_SLEEP_BRIDGE_PROVENANCE,
    N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS,
    resolveN3N4SleepBridgePackage,
} from '../../src/academy/content/n3-n4-sleep-bridge';

const SOYA_ROOT = path.resolve(process.cwd(), '../..', 'references/soya-research/extracted-src-all');

afterEach(() => document.body.replaceChildren());

describe('N3/N4 sleep bridge package', () => {
    it('pins a disjoint permitted local JLPT slice and its rights boundary', () => {
        const sourceFile = path.join(SOYA_ROOT, N3_N4_SLEEP_BRIDGE_PROVENANCE.relativePath);
        expect(sha256(canonicalN3N4SleepBridgeSourceItemPayload())).toBe(N3_N4_SLEEP_BRIDGE_PROVENANCE.sourceItemSha256);
        expect(N3_N4_SLEEP_BRIDGE_PROVENANCE).toMatchObject({
            sourceScope: 'soya-research',
            relativePath: 'data/courses/jlpt_n3/mock1_reading.js',
            payloadSha256: 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
            sourceItemId: 'mock1_r_03',
            permission: 'user-permitted-local-educational-use',
            originalMediaState: 'not-paired-not-delivered',
        });
        expect(JSON.stringify(N3_N4_SLEEP_BRIDGE_PROVENANCE)).not.toContain('/Users/');
        if (existsSync(sourceFile)) {
            const bytes = readFileSync(sourceFile);
            expect(sha256(bytes)).toBe(N3_N4_SLEEP_BRIDGE_PROVENANCE.payloadSha256);
            const source = bytes.toString('utf8');
            expect(source).toContain('id: "mock1_r_03"');
            for (const segment of N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS) expect(source).toContain(segment.text);
        }
    });

    it('teaches explicit N4 prerequisites through four distinct activity modes', () => {
        const lesson = createN3N4SleepBridgePackage();
        expect(lesson.band).toBe('N3');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'grammar:n4-time-te-kara',
            'grammar:n4-adversative-kedo',
            'reading:n4-main-claim',
        ]);
        expect(lesson.activity.payload.questions.map(question => question.activityMode)).toEqual([
            'listening-choice', 'evidence-sort', 'cloze', 'conclusion-choice',
        ]);
        expect(N3_N4_SLEEP_BRIDGE_PACKAGES).toEqual([lesson]);
        expect(resolveN3N4SleepBridgePackage(lesson.id)).toBe(N3_N4_SLEEP_BRIDGE_PACKAGES[0]);
        expect(() => resolveN3N4SleepBridgePackage('unknown')).toThrow(/Unknown N3\/N4 sleep bridge package/);
    });

    it('grades bridge activities deterministically and limits lapse review seeds to the missed concept', () => {
        const runtime = createN3N4SleepBridgeRuntime();
        const { activity } = createN3N4SleepBridgePackage();
        expect(runtime.validate(activity)).toEqual([]);
        const pass = runtime.evaluate(activity, response(activity.payload.questions.map(question => [question.id, question.correctOptionId])));
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(4);
        const lapse = runtime.evaluate(activity, response(activity.payload.questions.map(question => [
            question.id,
            question.id === 'transfer-condition' ? 'every-night' : question.correctOptionId,
        ])));
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0.75, errorTags: ['bounded-condition'] });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([['必要なら', 'repair']]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow(/Every N3\/N4 sleep-bridge activity/);
    });

    it('withholds the source until completion while mounting varied controls and Reader surfaces', async () => {
        const runtime = createN3N4SleepBridgeRuntime();
        const { activity } = createN3N4SleepBridgePackage();
        const host = document.createElement('main');
        document.body.append(host);
        const registered: HTMLElement[] = [];
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        const onEvaluation = vi.fn();
        const controller = runtime.mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) { registered.push(surface); return () => undefined; },
            playPronunciation,
        }, onEvaluation);

        expect(host.textContent).toContain('source text remain unavailable until after your attempt');
        expect(host.textContent).not.toContain(N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text);
        expect(host.querySelectorAll('[data-activity-mode]')).toHaveLength(4);
        expect(host.querySelectorAll('[data-activity-control]')).toHaveLength(2);
        expect(registered).toHaveLength(5);
        host.querySelector<HTMLButtonElement>('[data-source-segment-id="source-sleep-habits"]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text));

        for (const question of activity.payload.questions) {
            const radio = host.querySelector<HTMLInputElement>(`input[name="${question.id}"][value="${question.correctOptionId}"]`);
            const select = host.querySelector<HTMLSelectElement>(`select[name="${question.id}"]`);
            if (radio) radio.checked = true;
            if (select) select.value = question.correctOptionId;
        }
        host.querySelector<HTMLFormElement>('form')?.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-source-transcript="after-attempt"]')).not.toBeNull());
        expect(host.textContent).toContain(N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text);
        expect(registered).toHaveLength(6);
        controller.dispose();
    });

    it('projects Reader and SRS data without source URLs or local paths', () => {
        const lesson = createN3N4SleepBridgePackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:n3-n4-sleep-bridge-01:source-sleep-habits',
            'reader:n3-n4-sleep-bridge-01:original-transfer:paragraph-1',
            'reader:n3-n4-sleep-bridge-01:original-transfer:paragraph-2',
        ]);
        expect(lesson.readerSrs.miningRequests).toEqual(expect.arrayContaining([
            expect.objectContaining({ expression: '一方で', sentence: N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text }),
            expect.objectContaining({ expression: '記録を見た上で' }),
        ]));
        expect(JSON.stringify(lesson.readerSrs)).not.toMatch(/https?:|\/Users\//u);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
    });
});

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function response(items: readonly (readonly [string, string])[]) {
    return { answers: items.map(([questionId, optionId]) => ({ questionId, optionId })) };
}
