import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThreeMoodleListeningModel } from '../../src/academy/content/lesson-three-moodle-listening';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    moodleListeningChoicePlugin,
    type MoodleListeningChoiceModel,
    type MoodleListeningChoiceResponse,
} from '../../src/academy/minigames/moodle-listening-choice';
import { sha256File } from './helpers/hash-memo';

const runtime = createActivityRuntime([moodleListeningChoicePlugin]);

function model(): MoodleListeningChoiceModel {
    return createLessonThreeMoodleListeningModel();
}

function perfectResponse(): MoodleListeningChoiceResponse {
    return {
        answers: model().payload.tracks.flatMap(track => track.prompts.map(prompt => ({
            promptId: prompt.id,
            optionId: prompt.correctOptionId,
        }))),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 3 Moodle listening A/B worksheet', () => {
    it('pins the page-one handout, both original audio tracks, and mapped secondary support', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l03',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5804931,
                handout: {
                    payloadSha256: 'b694cbef8eb74e1c59120effde033a49d886be29ea0efcbe940fb4b460ec9095',
                    title: 'Chapter 1 listening',
                    locus: { page: 1, sections: [1, 2] },
                },
                sourceImage: {
                    url: '/academy/content/lessons/l1-l03/moodle-chapter-1-listening-page-1.png',
                    sha256: '6c6b2dd4436da26a0c7d51021cd843b41b90e83e0b493d7480df3cb2955aedc9',
                },
                answerKeyBasis: 'source-audio-verified-selections',
            },
            support: {
                phase: 'after-moodle-listening',
                minna: { reference: 'Minna no Nihongo I, Lesson 1', reuse: 'sequence-only' },
                genki: { relation: 'post-instruction-supported-transfer' },
            },
        });
        expect(activity.payload.tracks.map(track => [track.id, track.audio.payloadSha256, track.audio.durationSeconds])).toEqual([
            ['names', 'b601a7681c2ff12d68f4e8bf769319b855f0570dec6a5cfb14e3ee722bed7444', 45.88],
            ['countries', '4fac34dc313c88ab75c802462f98f80530831faa93f3a3d0736134f24060573c', 75.453333],
        ]);
        expect(activity.payload.tracks.every(track => track.audio.transcriptStatus === 'not-provided-do-not-invent')).toBe(true);
    });

    it('retains the six exact A/B worksheet choices in source-track order', () => {
        const prompts = model().payload.tracks.flatMap(track => track.prompts);
        expect(prompts.map(prompt => [prompt.id, prompt.options.map(option => option.label), prompt.correctOptionId])).toEqual([
            ['sano', ['さの', 'さろ'], 'a'],
            ['suzuki', ['すずき', 'つづき'], 'a'],
            ['kudo', ['ぐとう', 'くどう'], 'b'],
            ['sen', ['インド', 'インドネシア'], 'a'],
            ['jan', ['ブラジル', 'フランス'], 'b'],
            ['koru', ['インド', 'ドイツ'], 'b'],
        ]);
        expect(prompts.map(prompt => prompt.sourceQuestionId)).toEqual([
            'moodle:5804931:chapter-1-listening:p1:1-a-1:sano',
            'moodle:5804931:chapter-1-listening:p1:1-a-1:suzuki',
            'moodle:5804931:chapter-1-listening:p1:1-a-1:kudo',
            'moodle:5804931:chapter-1-listening:p1:2-a-2:sen',
            'moodle:5804931:chapter-1-listening:p1:2-a-2:jan',
            'moodle:5804931:chapter-1-listening:p1:2-a-2:koru',
        ]);
    });

    it('grades all source-audio selections deterministically and returns only missed repairs', () => {
        expect(runtime.evaluate(model(), perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const response = perfectResponse();
        const lapse: MoodleListeningChoiceResponse = {
            answers: response.answers.map((answer, index) => index === 0 ? { ...answer, optionId: 'b' } : answer),
        };
        const evaluation = runtime.evaluate(model(), lapse);
        expect(evaluation.result).toMatchObject({
            outcome: 'lapse', score: 5 / 6, errorTags: ['l1-l03-moodle-listening-sano'],
        });
        expect(evaluation.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l03:moodle-listening:sano', reason: 'repair' }),
        ]);
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every exact Moodle listening prompt');
    });

    it('teaches and shows the original image before audio practice, then reveals choices only after attempting', async () => {
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const controller = runtime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, onEvaluation);
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const reference = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const answerKey = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(reference.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(teaching.textContent).toContain('なまえは a ですか、b ですか');
        expect(reference.querySelector('img')?.getAttribute('src')).toContain('moodle-chapter-1-listening-page-1.png');
        expect(host.querySelectorAll('audio')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(12);
        expect(answerKey.hidden).toBe(true);

        for (const answer of perfectResponse().answers) {
            host.querySelector<HTMLInputElement>(`input[value="${answer.optionId}"][name$=":${answer.promptId}"]`)!.click();
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(answerKey.hidden).toBe(false));
        expect(answerKey.textContent).toContain('さの');
        controller.dispose();
    });

    it('keeps source bytes and the Moodle-first lesson route available', async () => {
        const files = [
            ['moodle-chapter-1-listening-page-1.png', model().provenance.moodle.sourceImage.sha256],
            ['moodle-1-a-1.mp3', model().payload.tracks[0].audio.payloadSha256],
            ['moodle-2-a-2.mp3', model().payload.tracks[1].audio.payloadSha256],
        ] as const;
        files.forEach(([file, sha256]) => {
            expect(sha256File(path.resolve('public/academy/content/lessons/l1-l03', file))).toBe(sha256);
        });
        const chapter = await loadLessonActivityChapter('l1-l03', {} as never);
        expect(chapter?.beats.map(beat => beat.activity.id).slice(0, 2)).toEqual([
            'activity:l1-l03-moodle-listening-a-or-b',
            'activity:l1-l03-profile-question-match',
        ]);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; claims: Record<string, number> }> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l03');
        expect(slice?.claims).toEqual({
            sourceVocabularyRowsPreserved: 16,
            worksheetPagesRendered: 1,
            originalAudioTracksDelivered: 2,
            sourceAudioChoicePromptsDelivered: 6,
            sourceAnswerKeysVerified: 0,
            sourceAudioDerivedKeys: 6,
            yomuContextualAnswerKeys: 0,
            listeningLinksVerified: 2,
        });
    });
});
