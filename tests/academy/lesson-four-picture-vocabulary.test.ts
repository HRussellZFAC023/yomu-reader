import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFourPictureVocabularyModel } from '../../src/academy/content/lesson-four-picture-vocabulary';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    pictureVocabularyBoardPlugin,
    type PictureVocabularyBoardModel,
    type PictureVocabularyBoardResponse,
} from '../../src/academy/minigames/picture-vocabulary-board';

const runtime = createActivityRuntime([pictureVocabularyBoardPlugin]);

function model(): PictureVocabularyBoardModel {
    return createLessonFourPictureVocabularyModel();
}

function perfectResponse(): PictureVocabularyBoardResponse {
    return { answers: model().payload.items.map(item => ({ itemId: item.id, optionId: item.correctOptionId })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 4 Moodle picture vocabulary', () => {
    it('pins the original image and exact first eight Word Sensei rows before mapped support', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l04',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5822243,
                pictureHandout: {
                    payloadSha256: '37dc9a453a0dfe5a42ac8f6f29e07136266aeca503aa1edd7a669091e2b9e524',
                    title: 'Chapter 2 pics for vocabulary',
                    locus: { page: 1, pictureNumbers: [1, 2, 3, 4, 5, 6, 7, 8] },
                },
                vocabularySheet: {
                    payloadSha256: 'a267243216a4c999d8733ed6febeeed938c47b593f0d1841b1dc8c244f37b253',
                    title: 'Chapter 2-1 Vocabulary Sheet',
                    rows: [1, 2, 3, 4, 5, 6, 7, 8],
                },
                sourceImage: {
                    url: '/academy/content/lessons/l1-l04/moodle-chapter-2-pics-for-vocabulary-page-1.png',
                    sha256: '535b1b844e63c0a7a347f0a1756c354c672eeaaca881a3704009db7ba9a2710b',
                },
            },
            support: {
                phase: 'after-moodle-picture-vocabulary',
                minna: { reference: 'Minna no Nihongo I · Lessons 1–2', reuse: 'sequence-only' },
                genki: { relation: 'post-instruction-guided-fill' },
            },
        });
        expect(activity.payload.items.map(item => [item.sourceOrder, item.sourceRow, item.correctOptionId])).toEqual([
            [1, '1）ほん', 'ほん'], [2, '2）じしょ', 'じしょ'], [3, '3）ざっし', 'ざっし'], [4, '4）しんぶん', 'しんぶん'],
            [5, '5）ノート', 'ノート'], [6, '6）てちょう', 'てちょう'], [7, '7）めいし', 'めいし'], [8, '8）カード', 'カード'],
        ]);
    });

    it('grades every source-numbered picture deterministically and repairs only the missed item', () => {
        expect(runtime.evaluate(model(), perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const perfect = perfectResponse();
        const lapse: PictureVocabularyBoardResponse = {
            answers: perfect.answers.map((answer, index) => index === 0 ? { ...answer, optionId: 'じしょ' } : answer),
        };
        const evaluation = runtime.evaluate(model(), lapse);
        expect(evaluation.result).toMatchObject({
            outcome: 'lapse', score: 7 / 8, errorTags: ['l1-l04-picture-vocabulary-book'],
        });
        expect(evaluation.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l04:picture-vocabulary:book', reason: 'repair' }),
        ]);
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every exact source picture');
    });

    it('shows source rows and image before the no-typing picture selection, then reveals the key after attempt', async () => {
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const controller = runtime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, onEvaluation);
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const reference = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(reference.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(teaching.textContent).toContain('1）ほん');
        expect(teaching.textContent).toContain('8）カード');
        expect(reference.querySelector('img')?.getAttribute('src')).toContain('moodle-chapter-2-pics-for-vocabulary-page-1.png');
        expect(host.querySelectorAll('select')).toHaveLength(8);
        expect(host.querySelector('input[type="text"], textarea')).toBeNull();
        expect(key.hidden).toBe(true);

        for (const answer of perfectResponse().answers) {
            const select = form.elements.namedItem(`activity:l1-l04-source-picture-vocabulary:${answer.itemId}`) as HTMLSelectElement;
            select.value = answer.optionId;
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(key.textContent).toContain('ほん');
        controller.dispose();
    });

    it('keeps the source image byte-pinned and the Moodle slice before the Genki board', async () => {
        const asset = path.resolve('public/academy/content/lessons/l1-l04/moodle-chapter-2-pics-for-vocabulary-page-1.png');
        expect(createHash('sha256').update(readFileSync(asset)).digest('hex')).toBe(model().provenance.moodle.sourceImage.sha256);
        const chapter = await loadLessonActivityChapter('l1-l04', { lookup: vi.fn(async () => null) });
        expect(chapter?.beats.map(beat => beat.activity.id)).toEqual([
            'activity:l1-l04-source-picture-vocabulary',
            'activity:l1-l04-object-distance-board',
        ]);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; claims: Record<string, number> }> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l04');
        expect(slice?.claims).toEqual({
            sourceVocabularyRowsPreserved: 42,
            worksheetPagesRendered: 1,
            numberedSourcePicturesDelivered: 8,
            sourceAnswerKeysVerified: 0,
            sourceCrossDocumentKeys: 8,
            yomuContextualAnswerKeys: 0,
            listeningLinksVerified: 0,
        });
    });
});
