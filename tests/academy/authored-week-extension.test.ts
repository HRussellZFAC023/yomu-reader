import type {
    AuthoredChoiceEvaluation,
    LearnerAuthoredChoice,
    LearnerAuthoredWeek,
} from '../../src/academy/content/authored-week-adapter';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../src/academy/domain/activity-runtime';
import type { KanjiWritingService, PronunciationService } from '../../src/academy/integration/yomu-bridge';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { createLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';
import { createLessonLanguageSupport } from '../../src/academy/ui/lesson-activity-support';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => document.body.replaceChildren());

describe('grounded authored week story activity integration', () => {
    it('keeps a production response behind its teaching screen and reuses the one global readings control', async () => {
        const chapter = (await loadLessonActivityChapter('l1-l23', { lookup: async () => null } satisfies KanjiWritingService))!;
        const extension = createLessonActivityExtension({
            language: 'en',
            chapter,
            runtime: createAcademyActivityRuntime(),
            pronunciation: { play: async () => ({ dispose() {} }) },
            onEvaluation() {},
        });
        const screen = createAuthoredWeekScreen({ language: 'en', week: week(), extension });
        document.body.append(screen.element);

        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        screen.element.querySelector<HTMLButtonElement>('[data-choice-id="right"]')!.click();
        await flush();
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        screen.element.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')!.click();

        const beat = screen.element.querySelector<HTMLElement>('[data-chapter-beat]')!;
        expect(beat.dataset.activityStage).toBe('teaching');
        expect(beat.querySelector('.academy-lesson-teaching-support')?.textContent)
            .toContain('Take a moment to look at this.');
        expect(beat.querySelector('.academy-typed-response-input')).toBeNull();
        expect(screen.element.querySelectorAll('[aria-label="Show readings"]')).toHaveLength(1);

        beat.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')!.click();
        expect(beat.dataset.activityStage).toBe('question');
        expect(beat.querySelector('.academy-lesson-teaching-support')).toBeNull();
        expect(beat.querySelector('.academy-katakana-sort-signal')).not.toBeNull();
        expect(screen.element.querySelectorAll('[aria-label="Show readings"]')).toHaveLength(1);
    });

    it('does not add a duplicate global readings control for the same lesson host', () => {
        const host = document.createElement('section');
        const first = createLessonLanguageSupport(host, 'en');
        const second = createLessonLanguageSupport(host, 'en');
        document.body.append(first.element);

        expect(second).toBe(first);
        const readings = document.querySelector<HTMLButtonElement>('[aria-label="Show readings"]')!;
        expect(readings).not.toBeNull();
        expect(readings.title).toBe('Show readings');
        expect(readings.dataset.tooltip).toBe('Show readings');

        first.dispose();
        const replacement = createLessonLanguageSupport(host, 'en');
        expect(replacement).not.toBe(first);
        replacement.dispose();
    });

    it('cannot complete the week until the canonical playable chapter is passed', async () => {
        const chapter = (await loadLessonActivityChapter('l1-l23', { lookup: async () => null } satisfies KanjiWritingService))!;
        const onActivityEvaluation = vi.fn();
        const pronunciation: PronunciationService = { play: async () => ({ dispose() {} }) };
        const extension = createLessonActivityExtension({
            language: 'en',
            chapter,
            runtime: createAcademyActivityRuntime(),
            pronunciation,
            onEvaluation: onActivityEvaluation,
        });
        const onComplete = vi.fn();
        const screen = createAuthoredWeekScreen({ language: 'en', week: week(), extension, onComplete });
        document.body.append(screen.element);

        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        screen.element.querySelector<HTMLButtonElement>('[data-choice-id="right"]')!.click();
        await flush();
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        expect(onComplete).not.toHaveBeenCalled();
        expect(screen.element.querySelector('[data-canonical-episode-id="s1e16-the-night-the-map-went-dark"]')).not.toBeNull();
        expect(screen.element.textContent).toContain('Atlas control desk');

        screen.element.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')!.click();
        expect(screen.element.querySelector('.academy-lesson-teaching-support')).not.toBeNull();
        screen.element.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')!.click();
        const placements = [
            ['sensei-katakana-ka-ka', 'a'],
            ['sensei-katakana-ka-ki', 'i'],
            ['sensei-katakana-ka-ku', 'u'],
            ['sensei-katakana-ka-ke', 'e'],
            ['sensei-katakana-ka-ko', 'o'],
        ] as const;
        for (const [kanaId, columnId] of placements) {
            screen.element.querySelector<HTMLButtonElement>(`[data-kana-id="${kanaId}"]`)!.click();
            screen.element.querySelector<HTMLButtonElement>(`[data-column-id="${columnId}"]`)!.click();
        }
        screen.element.querySelector<HTMLButtonElement>('.academy-katakana-sort-submit')!.click();
        await vi.waitFor(() => expect(onActivityEvaluation).toHaveBeenCalledOnce());
        expect(onComplete).not.toHaveBeenCalled();

        screen.element.querySelector<HTMLButtonElement>('.academy-activity-chapter-action .academy-activity-chapter-next')!.click();
        screen.element.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')!.click();
        await flush();

        expect(onComplete).toHaveBeenCalledOnce();
        expect(screen.element.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('2 / 2');
        expect(screen.element.querySelector('[data-week-complete="true"]')).not.toBeNull();
    });
});

function week(): LearnerAuthoredWeek {
    const activity: LearnerAuthoredChoice = {
        id: 'activity:source-katakana',
        kind: 'choice',
        sourceQuestionId: 'l1-l23/source-katakana',
        conceptIds: ['concept:katakana-a-ka'],
        responseKind: 'choice',
        curriculumPhase: 'assessed-recognition',
        prompt: { ja: 'カはどれですか。', en: 'Which one is カ?' },
        options: [
            { id: 'wrong', label: { ja: 'か', en: 'か' } },
            { id: 'right', label: { ja: 'カ', en: 'カ' } },
        ],
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'context',
            title: { ja: 'この問題の前に', en: 'Before this question' },
            entries: [{ japanese: 'カ', translation: 'ka' }],
        },
        provenance: { packageId: 'l1-l23', sourceQuestionId: 'l1-l23/source-katakana' },
    };
    return {
        id: 'l1-l23',
        activities: [activity],
        media: [],
        provenance: {
            source: { path: '/fixture/l1-l23.json', sha256: '0'.repeat(64) },
            packageId: 'l1-l23',
            packageProvenance: {},
        },
        evaluate(_activityId, responseId): AuthoredChoiceEvaluation {
            const passed = responseId === 'right';
            return {
                result: {
                    outcome: passed ? 'pass' : 'lapse',
                    score: passed ? 1 : 0,
                    errorTags: passed ? [] : ['katakana-source'],
                    feedback: {
                        explanation: { ja: passed ? '正解です。' : '形を確認しましょう。', en: passed ? 'Correct.' : 'Check the shape.' },
                        ...(passed ? {} : {
                            repairPrompt: { ja: '角のある形を選びます。', en: 'Choose the angular shape.' },
                            nearbyExample: { ja: 'カメラ', en: 'カメラ' },
                        }),
                    },
                },
                reviewSeeds: [],
            };
        },
    };
}
