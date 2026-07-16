import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createN1ContrastInferencePackage,
    N1_CONTRAST_INFERENCE_PROVENANCE,
} from '../../src/academy/content/n1-contrast-inference';
import {
    createN2PolicyScopePackage,
    N2_POLICY_SCOPE_PROVENANCE,
} from '../../src/academy/content/n2-policy-scope';
import {
    ACADEMY_ACTIVITY_PLUGINS,
    canonicalN2EventInformationSourceLocus,
    createAcademyActivityRuntime,
    createN2EventInformationPackage,
    createN2EventInformationRuntime,
    N2_EVENT_INFORMATION_PACKAGES,
    N2_EVENT_INFORMATION_PROVENANCE,
    n2EventInformationPlugin,
    resolveN2EventInformationPackage,
} from '../../src/academy/minigames';

const SOYA_ROOT = path.resolve(process.cwd(), '../..', 'references/soya-research/extracted-src-all');

afterEach(() => document.body.replaceChildren());

describe('N2 event-information plugin', () => {
    it('pins a disjoint permitted Soya file and exact source item without delivering either', () => {
        const sourceFile = path.join(SOYA_ROOT, N2_EVENT_INFORMATION_PROVENANCE.relativePath);
        expect(sha256(canonicalN2EventInformationSourceLocus())).toBe(
            N2_EVENT_INFORMATION_PROVENANCE.sourceLocusSha256,
        );
        expect(N2_EVENT_INFORMATION_PROVENANCE).toMatchObject({
            sourceScope: 'soya-research',
            sourceFamily: 'soya-jlpt',
            sourceDocumentSha256: '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5',
            sourceDocumentByteLength: 292617,
            sourceItemId: 'n2_m1_reading_info_0_1',
            sourceItemJsonSha256: '3e8263fd4d20f2da4d5aa20b5e6496bc7e08b48830cfcad696e57332f4835c22',
            rights: {
                state: 'user-permitted-local-reference-only',
                sourceTextDelivery: 'not-delivered',
                sourceAnswerDelivery: 'not-delivered',
                sourceMediaDelivery: 'not-delivered',
                learnerActivityText: 'original-yomu-authored',
            },
        });
        expect(N2_EVENT_INFORMATION_PROVENANCE.sourceId).not.toBe(N1_CONTRAST_INFERENCE_PROVENANCE.sourceId);
        expect(N2_EVENT_INFORMATION_PROVENANCE.sourceId).not.toBe(N2_POLICY_SCOPE_PROVENANCE.sourceId);
        expect(JSON.stringify(N2_EVENT_INFORMATION_PROVENANCE)).not.toContain('/Users/');

        if (existsSync(sourceFile)) {
            const source = readFileSync(sourceFile, 'utf8');
            expect(sha256(source)).toBe(N2_EVENT_INFORMATION_PROVENANCE.sourceDocumentSha256);
            expect(statSync(sourceFile).size).toBe(N2_EVENT_INFORMATION_PROVENANCE.sourceDocumentByteLength);
            const items = JSON.parse(source
                .replace(/^\/\/[^\n]*\nexport const n2_mock_no1_pool = /u, '')
                .replace(/;\s*$/u, '')) as readonly Readonly<{ id: string }>[];
            const item = items.find(candidate => candidate.id === N2_EVENT_INFORMATION_PROVENANCE.sourceItemId);
            expect(item).toBeDefined();
            expect(sha256(JSON.stringify(item))).toBe(N2_EVENT_INFORMATION_PROVENANCE.sourceItemJsonSha256);
        }

        const serialized = JSON.stringify(createN2EventInformationPackage());
        expect(serialized).not.toContain('緑町');
        expect(serialized).not.toContain('国際交流フェア');
        expect(serialized).not.toMatch(/https?:|\/assets\//u);
        const existingConcepts = new Set([
            ...createN1ContrastInferencePackage().activity.conceptIds,
            ...createN2PolicyScopePackage().activity.conceptIds,
        ]);
        expect(createN2EventInformationPackage().activity.conceptIds
            .filter(conceptId => existingConcepts.has(conceptId))).toEqual([]);
    });

    it('resolves from its package registry and the Academy runtime registry without a network dependency', () => {
        const lesson = createN2EventInformationPackage();
        expect(lesson.band).toBe('N2');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'reading:n3-notice-layout',
            'reading:n3-time-and-quantity',
            'reading:n3-condition-exception',
        ]);
        expect(lesson.prerequisites.every(item => item.minimumEvidence === 'introduced-and-attempted')).toBe(true);
        expect(N2_EVENT_INFORMATION_PACKAGES).toEqual([lesson]);
        expect(resolveN2EventInformationPackage(lesson.id)).toBe(N2_EVENT_INFORMATION_PACKAGES[0]);
        expect(() => resolveN2EventInformationPackage('unknown')).toThrow(/Unknown N2 event-information package/u);
        expect(ACADEMY_ACTIVITY_PLUGINS).toContain(n2EventInformationPlugin);
        expect(createAcademyActivityRuntime().validate(lesson.activity)).toEqual([]);
        expect(lesson.readerSrs.networkDependencies).toEqual([]);

        const serviceWorker = readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        expect(serviceWorker).toContain("'/academy/app.js?v=__ACADEMY_REVISION__'");
    });

    it('grades choices and action order deterministically with narrow repair SRS', () => {
        const runtime = createN2EventInformationRuntime();
        const { activity } = createN2EventInformationPackage();
        const correct = response(
            activity.payload.questions.map(question => [question.id, question.correctOptionId]),
            activity.payload.actionSequence.correctOrder,
        );
        const pass = runtime.evaluate(activity, correct);
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(4);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const wrongOrder = [...activity.payload.actionSequence.correctOrder].reverse();
        const lapse = runtime.evaluate(activity, response(
            activity.payload.questions.map(question => [
                question.id,
                question.id === 'weather' ? 'all-rain-cancel' : question.correctOptionId,
            ]),
            wrongOrder,
        ));
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 0.5,
            errorTags: ['action-sequence', 'weather-exception'],
        });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([
            ['15時30分まで', 'repair'],
            ['3か所以上', 'repair'],
            ['ただし、荒天で中止する場合', 'repair'],
        ]);
        expect(() => runtime.evaluate(activity, response([], []))).toThrow(/exactly one answer/u);
    });

    it('teaches before retrieval and combines Reader, grid, synthesized audio, choices, and ordering', async () => {
        const runtime = createN2EventInformationRuntime();
        const { activity } = createN2EventInformationPackage();
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

        const phases = [...host.querySelectorAll<HTMLElement>('[data-lesson-phase]')]
            .map(element => element.dataset.lessonPhase);
        expect(phases).toEqual(['instruction', 'source-inspection', 'assessed-retrieval', 'assessed-sequencing']);
        expect(host.textContent).toContain('referenced Soya text, answers, and media are not delivered');
        expect(host.querySelector('[data-modality="visual-constraint-grid"]')).not.toBeNull();
        expect(host.querySelectorAll('fieldset')).toHaveLength(3);
        expect(host.querySelectorAll('select')).toHaveLength(4);
        expect(registered.map(surface => surface.dataset.readerSurfaceId)).toEqual(activityReaderSurfaceIds());

        host.querySelector<HTMLButtonElement>('[data-notice-playback]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(activity.payload.notice.playbackText));
        activity.payload.questions.forEach(question => {
            host.querySelector<HTMLInputElement>(
                `input[name="${question.id}"][value="${question.correctOptionId}"]`,
            )!.checked = true;
        });
        activity.payload.actionSequence.correctOrder.forEach((actionId, index) => {
            host.querySelector<HTMLSelectElement>(`select[name="action-order-${index + 1}"]`)!.value = actionId;
        });
        host.querySelector<HTMLFormElement>('form')?.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        expect(onEvaluation.mock.calls[0][0].attempt.responseKind).toBe('n2-event-information-v1');
        controller.dispose();
    });

    it('projects only original Yomu Reader surfaces and URL-free mining requests', () => {
        const lesson = createN2EventInformationPackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual(activityReaderSurfaceIds());
        expect(lesson.readerSrs.miningRequests).toEqual([
            expect.objectContaining({
                expression: '3か所以上',
                conceptIds: ['reading:n2-threshold-and-capacity', 'reading:n2-deadline-backsolve'],
            }),
            expect.objectContaining({
                expression: 'ただし、荒天で中止する場合',
                conceptIds: ['reading:n2-condition-exception', 'listening:n2-operational-sequence'],
            }),
        ]);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
        expect(JSON.stringify(lesson.readerSrs)).not.toContain(N2_EVENT_INFORMATION_PROVENANCE.relativePath);
    });
});

function activityReaderSurfaceIds(): string[] {
    return [
        'reader:n2-event-information-01:teaching:1',
        'reader:n2-event-information-01:teaching:2',
        'reader:n2-event-information-01:teaching:3',
        'reader:n2-event-information-01:grid:1',
        'reader:n2-event-information-01:grid:2',
        'reader:n2-event-information-01:grid:3',
        'reader:n2-event-information-01:grid:4',
        'reader:n2-event-information-01:grid:5',
        'reader:n2-event-information-01:notice:paragraph-1',
        'reader:n2-event-information-01:notice:paragraph-2',
        'reader:n2-event-information-01:notice:paragraph-3',
    ];
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function response(items: readonly (readonly [string, string])[], actionOrder: readonly string[]) {
    return {
        answers: items.map(([questionId, optionId]) => ({ questionId, optionId })),
        actionOrder,
    };
}
