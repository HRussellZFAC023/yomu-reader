import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createN2ApartmentMovingPackage,
    createN2ApartmentMovingRuntime,
    n2ApartmentMovingPlugin,
} from '../../src/academy/content/n2-apartment-moving';
import {
    N2_HOME_LIFE_OPENING_SEQUENCE,
    resolveN2HomeLifeOpeningSequencePackage,
} from '../../src/academy/content/n2-home-life-opening-sequence';
import {
    createN2HomeLifeReaderPackage,
    createN2HomeLifeReaderRuntime,
    n2HomeLifeReaderPlugin,
} from '../../src/academy/content/n2-home-life-reader';
import {
    createN2MovingCouponPackage,
    createN2MovingCouponRuntime,
    n2MovingCouponPlugin,
} from '../../src/academy/content/n2-moving-coupon';
import {
    createN2MovingPriorityListeningPackage,
    createN2MovingPriorityListeningRuntime,
    N2_MOVING_PRIORITY_ANSWER,
    N2_MOVING_PRIORITY_TRANSCRIPT,
    n2MovingPriorityListeningPlugin,
} from '../../src/academy/content/n2-moving-priority-listening';
import type {
    N2OpeningActivityModel,
    N2OpeningAnswer,
    N2OpeningQuestion,
    N2OpeningResponse,
} from '../../src/academy/content/n2-opening-kit';
import {
    createN2PpoiImpressionPackage,
    createN2PpoiImpressionRuntime,
    n2PpoiImpressionPlugin,
} from '../../src/academy/content/n2-ppoi-impression';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';

afterEach(() => document.body.replaceChildren());

const runtimes = [
    createN2ApartmentMovingRuntime(),
    createN2PpoiImpressionRuntime(),
    createN2MovingCouponRuntime(),
    createN2HomeLifeReaderRuntime(),
    createN2MovingPriorityListeningRuntime(),
];

const plugins = [
    n2ApartmentMovingPlugin,
    n2PpoiImpressionPlugin,
    n2MovingCouponPlugin,
    n2HomeLifeReaderPlugin,
    n2MovingPriorityListeningPlugin,
];

describe('N2 home-life opening sequence', () => {
    it('forms one five-step n+1 chain with a single new concept at every step', () => {
        expect(N2_HOME_LIFE_OPENING_SEQUENCE.map(record => record.id)).toEqual([
            'n2-home-life-opening-01-apartment-moving',
            'n2-home-life-opening-02-ppoi',
            'n2-home-life-opening-03-coupon',
            'n2-home-life-opening-04-reader',
            'n2-home-life-opening-05-listening',
        ]);
        expect(N2_HOME_LIFE_OPENING_SEQUENCE.map(record => record.activity.kind)).toEqual([
            'academy-n2-apartment-moving',
            'academy-n2-ppoi-impression',
            'academy-n2-moving-coupon',
            'academy-n2-home-life-reader',
            'academy-n2-moving-priority-listening',
        ]);

        const introduced = new Set<string>();
        N2_HOME_LIFE_OPENING_SEQUENCE.forEach((record, index) => {
            const previous = N2_HOME_LIFE_OPENING_SEQUENCE[index - 1];
            const next = N2_HOME_LIFE_OPENING_SEQUENCE[index + 1];
            const sequence = record.activity.payload.sequence;
            expect(record.band).toBe('N2');
            expect(record.sequence).toMatchObject({ order: index + 1, total: 5 });
            expect(record.sequence.previousPackageId).toBe(previous?.id);
            expect(record.sequence.nextPackageId).toBe(next?.id);
            expect(sequence.recycles).not.toContain(sequence.introduces);
            expect(introduced.has(sequence.introduces)).toBe(false);
            expect(new Set(sequence.recycles)).toEqual(new Set(index === 0
                ? ['vocabulary:n3-home-and-distance']
                : [...introduced]));
            if (previous) {
                expect(record.prerequisites).toEqual([
                    expect.objectContaining({
                        conceptId: previous.activity.payload.sequence.introduces,
                        fromPackageId: previous.id,
                        minimumEvidence: 'introduced-and-attempted',
                    }),
                ]);
            } else {
                expect(record.prerequisites).toEqual([
                    expect.objectContaining({
                        conceptId: 'vocabulary:n3-home-and-distance',
                        minimumEvidence: 'introduced-and-attempted',
                    }),
                ]);
            }
            introduced.add(sequence.introduces);
            expect(runtimes[index].validate(record.activity)).toEqual([]);
            expect(resolveN2HomeLifeOpeningSequencePackage(record.id)).toBe(record);
        });
        expect(() => resolveN2HomeLifeOpeningSequencePackage('unknown')).toThrow(/Unknown N2 home-life/u);
    });

    it('exposes and registers all five concrete package plugins', () => {
        expect(plugins.map(plugin => plugin.kind)).toEqual(
            N2_HOME_LIFE_OPENING_SEQUENCE.map(record => record.activity.kind),
        );
        expect(new Set(plugins.map(plugin => plugin.kind))).toHaveLength(5);
        const sharedKinds = ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind);
        plugins.forEach(plugin => expect(sharedKinds).toContain(plugin.kind));
    });

    it('mixes choice, typed retrieval, and fixed-shuffle ordering with deterministic repair', () => {
        const questionKinds = new Set(
            N2_HOME_LIFE_OPENING_SEQUENCE.flatMap(record => record.activity.payload.questions.map(question => question.kind)),
        );
        expect(questionKinds).toEqual(new Set(['choice', 'typed', 'ordering']));

        N2_HOME_LIFE_OPENING_SEQUENCE.forEach((record, index) => {
            const runtime = runtimes[index];
            const pass = runtime.evaluate(record.activity, responseFor(record.activity, true));
            expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
            expect(pass.reviewSeeds).toHaveLength(record.activity.payload.reviewTargets.length);
            expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

            const missed = record.activity.payload.questions[0];
            const lapse = runtime.evaluate(record.activity, responseFor(record.activity, false));
            expect(lapse.result.outcome).toBe('lapse');
            expect(lapse.result.score).toBe((record.activity.payload.questions.length - 1)
                / record.activity.payload.questions.length);
            expect(lapse.result.errorTags).toEqual([missed.errorTag]);
            const expectedRepairIds = record.activity.payload.reviewTargets
                .filter(target => target.repairFor.includes(missed.errorTag))
                .map(target => target.id);
            expect(lapse.reviewSeeds.map(seed => seed.id)).toEqual(expectedRepairIds);
            expect(lapse.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);

            expect(() => runtime.evaluate(record.activity, { answers: [] }))
                .toThrow(/Every N2 opening question/u);
        });

        for (const record of [createN2MovingCouponPackage(), createN2HomeLifeReaderPackage()]) {
            const ordering = record.activity.payload.questions.find(question => question.kind === 'ordering');
            expect(ordering?.kind).toBe('ordering');
            if (ordering?.kind !== 'ordering') throw new TypeError('Expected an ordering question.');
            expect(ordering.presentationOrder).not.toEqual(ordering.correctOrder);
            expect(new Set(ordering.presentationOrder)).toEqual(new Set(ordering.correctOrder));
        }
    });

    it('applies NFKC while keeping kana acceptance explicit rather than guessing', () => {
        const apartment = createN2ApartmentMovingPackage();
        const apartmentRuntime = createN2ApartmentMovingRuntime();
        expect(apartmentRuntime.evaluate(apartment.activity,
            replaceTyped(responseFor(apartment.activity, true), 'housing-direction', '南向き。')).result.outcome).toBe('pass');
        expect(apartmentRuntime.evaluate(apartment.activity,
            replaceTyped(responseFor(apartment.activity, true), 'housing-direction', 'みなみむき')).result.outcome).toBe('pass');
        expect(apartmentRuntime.evaluate(apartment.activity,
            replaceTyped(responseFor(apartment.activity, true), 'housing-direction', 'ミナミムキ')).result.outcome).toBe('lapse');

        const ppoi = createN2PpoiImpressionPackage();
        const ppoiRuntime = createN2PpoiImpressionRuntime();
        expect(ppoiRuntime.evaluate(ppoi.activity,
            replaceTyped(responseFor(ppoi.activity, true), 'ppoi-form', `やすっほ\u309aい`)).result.outcome).toBe('pass');
        expect(ppoiRuntime.evaluate(ppoi.activity,
            replaceTyped(responseFor(ppoi.activity, true), 'ppoi-form', 'ヤスッポイ')).result.outcome).toBe('lapse');
    });

    it('keeps the exact listening transcript, English option support, and answer key behind commitment', async () => {
        const lesson = createN2MovingPriorityListeningPackage();
        const runtime = createN2MovingPriorityListeningRuntime();
        const host = document.createElement('main');
        document.body.append(host);
        const registered: HTMLElement[] = [];
        let disposedSurfaces = 0;
        const announce = vi.fn();
        const onEvaluation = vi.fn();
        const controller = runtime.mount(lesson.activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce,
            registerReadingSurface(surface) {
                registered.push(surface);
                return () => { disposedSurfaces += 1; };
            },
        }, onEvaluation);

        const instruction = host.querySelector<HTMLElement>('[data-lesson-phase="instruction"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(instruction.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelector('[data-answer-reveal]')).toBeNull();
        expect(host.querySelector('[data-transcript-reveal]')).toBeNull();
        expect(host.querySelector('[data-source-answer]')).toBeNull();
        expect(host.querySelector('[data-correct]')).toBeNull();
        expect(host.textContent).not.toContain('Arrange bulky-waste collection');
        expect(host.textContent).not.toContain(N2_MOVING_PRIORITY_TRANSCRIPT[0].text);
        expect(host.textContent).not.toContain('日本語総まとめ');
        expect(host.textContent).not.toContain('新完全マスター');
        expect(host.textContent).not.toContain('/Users/');
        expect(host.querySelector<HTMLAudioElement>('audio')?.getAttribute('src')).toBe(
            '/academy/content/n2-moving-priority-listening/soya-n2-m1-listening-task-0-3.mp3',
        );
        expect(host.querySelector<HTMLImageElement>('img')?.getAttribute('src')).toBe(
            '/academy/content/n2-moving-priority-listening/soya-n2-m1-task-home.png',
        );
        expect(host.querySelector<HTMLImageElement>('img')?.alt).toBe('A couple talking beside moving boxes');
        expect(registered.map(surface => surface.dataset.readerSurfaceId)).toEqual([
            'reader:n2-home-life-opening-05-listening:content:1',
        ]);

        host.querySelector('audio')?.dispatchEvent(new Event('error'));
        expect(announce).toHaveBeenCalledWith('The source audio could not load. Reopen this activity when connected.');

        host.querySelector<HTMLInputElement>('input[name="listening-priority"][value="bulky-waste"]')!.checked = true;
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-transcript-reveal="after-attempt"]')).not.toBeNull());

        expect(onEvaluation.mock.calls[0][0].result).toMatchObject({ outcome: 'pass', score: 1 });
        expect(host.querySelectorAll('[data-answer-reveal="after-attempt"]')).toHaveLength(1);
        expect(host.querySelectorAll('[data-transcript-reveal="after-attempt"]')).toHaveLength(1);
        expect(host.querySelector('[data-source-answer="after-attempt"]')?.textContent).toContain(N2_MOVING_PRIORITY_ANSWER);
        expect(host.textContent).toContain('Arrange bulky-waste collection');
        expect(host.textContent).toContain(N2_MOVING_PRIORITY_TRANSCRIPT[0].text);
        expect(registered).toHaveLength(1 + N2_MOVING_PRIORITY_TRANSCRIPT.length);
        expect(registered.at(-1)?.dataset.readerSurfaceId).toBe(
            'reader:n2-home-life-opening-05-listening:transcript:10',
        );

        controller.dispose();
        expect(disposedSurfaces).toBe(1 + N2_MOVING_PRIORITY_TRANSCRIPT.length);
        expect(host.children).toHaveLength(0);
    });

    it('projects only package-authored context and gated transcript surfaces to Reader/SRS', () => {
        N2_HOME_LIFE_OPENING_SEQUENCE.forEach(record => {
            expect(record.readerSrs.readerSurfaceIds).toHaveLength(
                record.activity.payload.content.paragraphs.length + (record.activity.payload.media?.transcript.length ?? 0),
            );
            expect(record.readerSrs.readerSurfaceIds.every(id => id.startsWith(`reader:${record.id}:`))).toBe(true);
            expect(record.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
            expect(JSON.stringify(record.readerSrs)).not.toContain('/Users/');
            expect(JSON.stringify(record.readerSrs)).not.toContain('.pdf');
        });
        const listening = createN2MovingPriorityListeningPackage();
        expect(listening.readerSrs.miningRequests).toEqual([]);
        expect(JSON.stringify(listening.readerSrs)).not.toContain(N2_MOVING_PRIORITY_TRANSCRIPT[0].text);
    });
});

function responseFor(activity: N2OpeningActivityModel, correct: boolean): N2OpeningResponse {
    return {
        answers: activity.payload.questions.map((question, index) => answerFor(question, correct || index > 0)),
    };
}

function answerFor(question: N2OpeningQuestion, correct: boolean): N2OpeningAnswer {
    if (question.kind === 'choice') {
        return {
            questionId: question.id,
            kind: 'choice',
            optionId: correct
                ? question.correctOptionId
                : question.options.find(option => option.id !== question.correctOptionId)!.id,
        };
    }
    if (question.kind === 'typed') {
        return { questionId: question.id, kind: 'typed', value: correct ? question.acceptedAnswers[0] : '不正解' };
    }
    return {
        questionId: question.id,
        kind: 'ordering',
        order: correct ? question.correctOrder : [...question.correctOrder].reverse(),
    };
}

function replaceTyped(response: N2OpeningResponse, questionId: string, value: string): N2OpeningResponse {
    return {
        answers: response.answers.map(answer => answer.questionId === questionId
            ? { questionId, kind: 'typed' as const, value }
            : answer),
    };
}
