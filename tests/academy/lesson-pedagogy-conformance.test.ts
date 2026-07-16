import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult } from '../../src/academy/domain/activity-runtime';
import {
    MAX_PROGRESSIVE_REPAIR_HINTS,
    assertActivityPedagogy,
    assertBoundedRepairHints,
} from '../../src/academy/domain/lesson-pedagogy';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';
import { loadClassWeekDeliveryCatalog } from '../../src/academy/content/class-week-delivery-catalog';
import type { ClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import {
    PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS,
    isPlayableSenseiVocabularyLessonId,
    loadSenseiVocabularyPrerequisite,
} from '../../src/academy/content/lesson-vocabulary-prerequisite';
import {
    LESSON_ACTIVITY_CHAPTER_PACKAGES,
    loadReachableLessonActivityChapter,
} from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import type { KanjiWritingModel, KanjiWritingService } from '../../src/academy/integration/yomu-bridge';
import { createReachableLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import type {
    AuthoredChoiceEvaluation,
    LearnerAuthoredChoice,
    LearnerAuthoredWeek,
} from '../../src/academy/content/authored-week-adapter';
import { lessonCompletionReturn } from '../../src/academy/routing/lesson-return';

const LESSON_ROOT = path.resolve('public/academy/content/lessons');
const PLAN = JSON.parse(fs.readFileSync('public/academy/content/curriculum/class-week-cast.v1.json', 'utf8')) as ClassWeekCastPlan;
const TRACE: KanjiWritingModel = {
    character: '一',
    svg: '<svg viewBox="0 0 109 109"><path d="M10 50 L99 50"/></svg>',
    strokeCount: 1,
    strokeShapes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
    source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'test' },
};
const kanjiWriting: KanjiWritingService = { lookup: async character => character === '一' ? TRACE : null };

afterEach(() => document.body.replaceChildren());

describe('reachable lesson pedagogy gate', () => {
    it('admits exactly route-reachable authored weeks after prerequisite and activity conformance', async () => {
        const catalog = await loadClassWeekDeliveryCatalog(PLAN, lessonFetcher());
        const reachable = catalog.weeks
            .filter(week => week.state === 'grounded-playable')
            .map(week => week.lessonId);
        const registered = ACADEMY_LESSON_CONTENT_REGISTRY.flatMap(registration =>
            registration.kind === 'authored-week' ? [`authored-week:${registration.packageId}`] : []);

        expect(reachable).toEqual(registered);
        expect(PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS.slice(1)).toEqual(reachable);

        for (const lessonId of reachable) {
            if (!isPlayableSenseiVocabularyLessonId(lessonId)) {
                throw new TypeError(`Reachable lesson ${lessonId} has no prerequisite registration.`);
            }
            const prerequisite = await loadSenseiVocabularyPrerequisite(lessonId, lessonFetcher());
            expect(prerequisite.lessonId).toBe(lessonId);
            expect(prerequisite.evidence.gaps.length + prerequisite.evidence.sourceSheets.length).toBeGreaterThan(0);
        }
    });

    it('constructs every reachable extension only after shared activity pedagogy validation', async () => {
        const runtime = createAcademyActivityRuntime();
        const reachablePackages = new Set(PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS
            .filter(lessonId => lessonId.startsWith('authored-week:'))
            .map(lessonId => lessonId.slice('authored-week:'.length)));

        for (const packageId of LESSON_ACTIVITY_CHAPTER_PACKAGES) {
            expect(reachablePackages.has(packageId)).toBe(true);
            const chapter = await loadReachableLessonActivityChapter(packageId, kanjiWriting);
            if (!chapter) continue;
            const extension = createReachableLessonActivityExtension({
                language: 'en',
                chapter: chapter!,
                runtime,
                pronunciation: { async play() { return { dispose() {} }; } },
                onEvaluation() {},
            });
            expect(extension?.activityCount, packageId).toBe(chapter.beats.length);
        }
    });

    it('teaches before assessment, bounds post-attempt hints, conceals outcomes, and supports revisit and return', async () => {
        const onBack = vi.fn();
        const onComplete = vi.fn();
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: weekFixture(),
            onBack,
            onComplete,
        });
        document.body.append(screen.element);

        expect(screen.element.querySelector('.academy-lesson-teaching-support')).not.toBeNull();
        expect(screen.element.querySelector('.academy-authored-week-prompt')).toBeNull();
        expect(screen.element.textContent).not.toContain('SECRET ANSWER');
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-back')!.click();
        expect(onBack).toHaveBeenCalledOnce();

        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        expect(screen.element.innerHTML).not.toMatch(/data-(?:answer|correct)|modelAnswer|answer-key/iu);
        screen.element.querySelector<HTMLButtonElement>('[data-choice-id="wrong"]')!.click();
        await vi.waitFor(() => expect(screen.element.querySelector('.academy-progressive-hint-button')).not.toBeNull());
        expect(screen.element.textContent).not.toContain('SECRET ANSWER');
        for (let index = 0; index < MAX_PROGRESSIVE_REPAIR_HINTS; index += 1) {
            screen.element.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')?.click();
        }
        expect(screen.element.querySelectorAll('.academy-progressive-hints-revealed > *'))
            .toHaveLength(MAX_PROGRESSIVE_REPAIR_HINTS);
        expect(screen.element.querySelector('.academy-progressive-hint-button')).toBeNull();

        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        screen.element.querySelector<HTMLButtonElement>('[data-choice-id="right"]')!.click();
        await vi.waitFor(() => expect(screen.element.querySelector('.academy-authored-week-next')).not.toBeNull());
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        expect(onComplete).toHaveBeenCalledOnce();
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-back')!.click();
        expect(screen.element.querySelector('.academy-lesson-teaching-support')).not.toBeNull();

        expect(lessonCompletionReturn({ routeHistory: [{ route: 'campus' }, { route: 'class' }] }))
            .toEqual({ route: 'campus' });
    });

    it('rejects unbounded repair, pre-commit correctness metadata, and missing teaching', () => {
        const activity = choiceActivity();
        expect(() => assertActivityPedagogy({ ...activity, teachingSupport: undefined }, undefined))
            .toThrow('needs teaching before assessment');
        expect(() => assertActivityPedagogy({
            ...activity,
            options: [{ id: 'right', correct: true }],
        })).toThrow('exposes correctness metadata');
        expect(() => assertBoundedRepairHints(activity.id, {
            explanation: localized('Explanation'),
        })).toThrow(`needs 1-${MAX_PROGRESSIVE_REPAIR_HINTS}`);
    });
});

function lessonFetcher(): typeof fetch {
    return (async input => {
        const filename = String(input).replace('/academy/content/lessons/', '');
        const filepath = path.join(LESSON_ROOT, filename);
        return fs.existsSync(filepath)
            ? new Response(fs.readFileSync(filepath), { status: 200, headers: { 'content-type': 'application/json' } })
            : new Response(null, { status: 404 });
    }) as typeof fetch;
}

function weekFixture(): LearnerAuthoredWeek {
    const activity = choiceActivity();
    return {
        id: 'l1-l01',
        activities: [activity],
        media: [],
        provenance: {
            source: { path: '/fixture.json', sha256: '0'.repeat(64) },
            packageId: 'l1-l01',
            packageProvenance: {},
        },
        evaluate(_activityId, responseId) {
            return evaluation(responseId === 'right' ? 'pass' : 'lapse');
        },
    };
}

function choiceActivity(): LearnerAuthoredChoice {
    return {
        id: 'activity:pedagogy-gate',
        kind: 'choice',
        sourceQuestionId: 'source:pedagogy-gate',
        conceptIds: ['concept:pedagogy-gate'],
        responseKind: 'choice',
        curriculumPhase: 'assessed-recognition',
        prompt: localized('Choose the taught pattern.'),
        options: [
            { id: 'wrong', label: localized('Wrong') },
            { id: 'right', label: localized('Right') },
        ],
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'pattern',
            title: localized('Pattern before assessment'),
            entries: [{ japanese: '〜です', translation: 'copula pattern' }],
        },
        provenance: { packageId: 'l1-l01', sourceQuestionId: 'source:pedagogy-gate' },
    };
}

function evaluation(outcome: GradeResult['outcome']): AuthoredChoiceEvaluation {
    return {
        result: {
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : ['concept:pedagogy-gate:repair'],
            feedback: {
                explanation: localized(outcome === 'pass' ? 'Correct.' : 'Try once more.'),
                ...(outcome === 'lapse' ? {
                    repairPrompt: localized('Look for the taught form.'),
                    nearbyExample: localized('SECRET ANSWER'),
                } : {}),
            },
        },
        reviewSeeds: [],
    };
}

function localized(en: string) {
    return { en, ja: `JA ${en}` };
}
