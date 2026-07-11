import { describe, expect, it } from 'vitest';
import {
    academyFoundationRoute,
    type FoundationLesson,
    type PracticeItem,
} from '../../src/academy/foundation-course';
import {
    createFoundationPlayerState,
    renderFoundationPlayer,
} from '../../src/academy/foundation-player';

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const REQUIRED_ROUTE_NUMBERS = Array.from({ length: 10 }, (_, index) => index);

const EXPECTED_MAPPINGS = [
    ['Welcome and Level 1 entry', 'Lesson 0', 'Pre-lesson kana', 'Pre-N5 readiness'],
    ['Level 1 Lesson 1', 'Lesson 1', 'Lessons 1–2', 'N5 foundations'],
    ['Level 1 Lesson 2', 'Lesson 2', 'Lessons 3–4', 'N5 places and prices'],
    ['Level 1+ food sequence', 'Lessons 3–6', 'Lessons 5–10', 'N5 actions and invitations'],
    ['Level 1+ consolidation', 'Lessons 7–12', 'Lessons 11–20', 'N5 secure'],
    ['Level 2+ bridge', 'Lessons 13–18', 'Lessons 21–27', 'N4 emerging'],
    ['Current course Lessons 1–2', 'Lessons 19–20 review', 'Lesson 28', 'N4 grammar connections'],
    ['Current course Lessons 3–4', 'Lessons 20–21 review', 'Lesson 29', 'N4 states and completion'],
    ['Current course Lessons 5–6', 'Lesson 21 review', 'Lesson 30', 'N4 preparation and states'],
    ['Level 3+ Lesson 9', 'Lessons 22–23', 'Lessons 35–36', 'N4 secure / N3 on-ramp'],
] as const;

function normalized(value: string): string {
    return value.normalize('NFKC').replace(/[\s。、！？,.!?「」『』（）()〜～＿_…“”"']/g, '').toLocaleLowerCase('ja');
}

function practiceInput(item: PracticeItem): string {
    return [item.prompt, item.japanese ?? '', ...(item.options ?? [])].join(' ');
}

function expectNonBlank(values: readonly string[], context: string): void {
    values.forEach((value, index) => {
        expect(value.trim(), `${context}[${index}] must not be blank`).not.toBe('');
    });
}

function lessonLabel(lesson: FoundationLesson): string {
    return lesson.routeNumber === 0 ? 'Foundation' : `Lesson ${lesson.routeNumber}`;
}

describe('Foundation through Lesson 9 quality gates', () => {
    it('keeps the complete Foundation-to-Lesson-9 route in teaching order', () => {
        expect(academyFoundationRoute.map(lesson => lesson.routeNumber)).toEqual(REQUIRED_ROUTE_NUMBERS);
        expect(new Set(academyFoundationRoute.map(lesson => lesson.id)).size).toBe(academyFoundationRoute.length);

        const state = createFoundationPlayerState();
        const html = renderFoundationPlayer(academyFoundationRoute[0], state);
        const sectionOrder = ['scene', 'words', 'grammar', 'practice', 'kanji', 'mission']
            .map(section => html.indexOf(`data-foundation-section="${section}"`));
        expect(sectionOrder.every(index => index >= 0)).toBe(true);
        expect(sectionOrder).toEqual([...sectionOrder].sort((left, right) => left - right));
    });

    it('provides explanations and examples before learners reach exercises', () => {
        for (const lesson of academyFoundationRoute) {
            const label = lessonLabel(lesson);
            expect(lesson.vocabulary.length, `${label} vocabulary`).toBeGreaterThanOrEqual(12);
            expect(lesson.grammar.length, `${label} grammar`).toBeGreaterThanOrEqual(2);

            for (const [index, word] of lesson.vocabulary.entries()) {
                expectNonBlank(
                    [word.japanese, word.reading, word.meaning, word.example, word.exampleMeaning],
                    `${label} vocabulary ${index}`,
                );
                expect(JAPANESE.test(word.example), `${label} vocabulary ${index} needs a Japanese example`).toBe(true);
            }

            for (const [index, point] of lesson.grammar.entries()) {
                expectNonBlank(
                    [point.pattern, point.meaning, point.explanation, point.watchFor],
                    `${label} grammar ${index}`,
                );
                expect(point.explanation.length, `${label} grammar ${index} explanation`).toBeGreaterThanOrEqual(30);
                expect(point.examples.length, `${label} grammar ${index} examples`).toBeGreaterThanOrEqual(2);
                point.examples.forEach((example, exampleIndex) => {
                    expectNonBlank([example.japanese, example.meaning], `${label} grammar ${index} example ${exampleIndex}`);
                });
            }
        }
    });

    it('covers vocabulary, grammar, kanji, practice, and a final task in every lesson', () => {
        for (const lesson of academyFoundationRoute) {
            const label = lessonLabel(lesson);
            expect(lesson.objectives.length, `${label} objectives`).toBeGreaterThanOrEqual(4);
            expect(lesson.vocabulary.length, `${label} vocabulary`).toBeGreaterThanOrEqual(12);
            expect(lesson.grammar.length, `${label} grammar`).toBeGreaterThanOrEqual(2);
            expect(lesson.kanji.length, `${label} kanji`).toBeGreaterThanOrEqual(4);
            expect(lesson.practice.length, `${label} practice`).toBeGreaterThanOrEqual(6);
            expect(new Set(lesson.practice.map(item => item.reviewTag)).size, `${label} practiced concepts`).toBeGreaterThanOrEqual(2);
            expectNonBlank(
                [lesson.finalTask.title, lesson.finalTask.prompt, lesson.finalTask.model],
                `${label} final task`,
            );
            expect(lesson.finalTask.success.length, `${label} final-task checks`).toBeGreaterThanOrEqual(4);
            expect(JAPANESE.test(lesson.finalTask.model), `${label} needs a Japanese model`).toBe(true);
        }
    });

    it('pins the audited UCL, Genki, Minna, and JLPT crosswalk', () => {
        expect(academyFoundationRoute.map(lesson => [
            lesson.mapping.ucl,
            lesson.mapping.genki,
            lesson.mapping.minna,
            lesson.mapping.jlpt,
        ])).toEqual(EXPECTED_MAPPINGS);
    });

    it('keeps input Japanese-first while allowing a small number of meaning checks', () => {
        for (const lesson of academyFoundationRoute) {
            const label = lessonLabel(lesson);
            expect(lesson.opening.length, `${label} opening`).toBeGreaterThanOrEqual(3);
            lesson.opening.forEach((line, index) => {
                expect(JAPANESE.test(line.japanese), `${label} opening line ${index} needs Japanese first`).toBe(true);
                expectNonBlank([line.meaning], `${label} opening meaning ${index}`);
            });

            const japaneseLedItems = lesson.practice.filter(item => JAPANESE.test(practiceInput(item)));
            expect(
                japaneseLedItems.length / lesson.practice.length,
                `${label} must keep at least 75% of practice input in Japanese`,
            ).toBeGreaterThanOrEqual(0.75);
        }
    });

    it('makes every automatically graded answer structurally deterministic', () => {
        const allIds = academyFoundationRoute.flatMap(lesson => lesson.practice.map(item => item.id));
        expect(new Set(allIds).size, 'practice IDs must be globally unique').toBe(allIds.length);

        for (const lesson of academyFoundationRoute) {
            for (const item of lesson.practice) {
                const context = `${lessonLabel(lesson)} ${item.id}`;
                expectNonBlank([item.prompt, item.explanation, item.reviewTag], context);
                expect(item.explanation.length, `${context} feedback must explain the answer`).toBeGreaterThan(12);

                if (item.kind === 'choice') {
                    expect(item.options?.length, `${context} options`).toBeGreaterThanOrEqual(3);
                    expect(new Set(item.options?.map(normalized)).size, `${context} options must be unique`).toBe(item.options?.length);
                    expect(item.options?.filter(option => normalized(option) === normalized(item.answer as string))).toHaveLength(1);
                } else if (item.kind === 'text') {
                    expect(typeof item.answer, `${context} text answer`).toBe('string');
                    expect(normalized(item.answer as string), `${context} text answer`).not.toBe('');
                } else {
                    expect(Array.isArray(item.answer), `${context} order answer`).toBe(true);
                    expect(item.options?.length, `${context} order tokens`).toBeGreaterThanOrEqual(2);
                    expect((item.answer as readonly string[]).map(normalized).sort()).toEqual(item.options?.map(normalized).sort());
                    expect(new Set(item.options?.map(normalized)).size, `${context} order tokens must be unique`).toBe(item.options?.length);
                }
            }
        }
    });

    it('does not reveal generated answers before checking or opening the model', () => {
        const leakedOrderAnswers: string[] = [];

        for (const lesson of academyFoundationRoute) {
            for (const [practiceIndex, item] of lesson.practice.entries()) {
                const state = createFoundationPlayerState();
                state.section = 'practice';
                state.practiceIndex = practiceIndex;
                const html = renderFoundationPlayer(lesson, state);

                expect(html, `${item.id} must not render feedback before submission`).not.toContain(item.explanation);

                if (item.kind === 'text') {
                    const visibleQuestion = normalized(`${item.prompt} ${item.japanese ?? ''}`);
                    expect(visibleQuestion, `${item.id} prompt contains its accepted answer`).not.toContain(normalized(item.answer as string));
                }

                if (item.kind === 'order' && JSON.stringify(item.options) === JSON.stringify(item.answer)) {
                    leakedOrderAnswers.push(item.id);
                }
            }

            const missionState = createFoundationPlayerState();
            missionState.section = 'mission';
            const missionHtml = renderFoundationPlayer(lesson, missionState);
            expect(missionHtml).toContain('data-foundation-model-body');
            expect(missionHtml).not.toContain('<details class="foundation-model" open');
            expect(missionHtml, `${lesson.id} serializes the mission model answer before the first check`).not.toContain(lesson.finalTask.model);
        }

        expect(
            leakedOrderAnswers,
            'order tokens render in source order, so options must not equal the accepted sequence',
        ).toEqual([]);
    });
});
