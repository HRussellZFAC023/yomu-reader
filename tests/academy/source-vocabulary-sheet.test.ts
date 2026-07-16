import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../src/academy/domain/activity-runtime';
import { adaptAuthoredWeek, AUTHORED_WEEK_HASHES } from '../../src/academy/content/authored-week-adapter';
import {
    ACADEMY_ACTIVITY_PLUGINS,
    createAcademyActivityRuntime,
    type SourceVocabularySheetModel,
} from '../../src/academy/minigames';

afterEach(() => document.body.replaceChildren());

describe('source vocabulary sheet activity plugin', () => {
    it('is registered centrally and preserves source item evidence', () => {
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toContain('academy-source-vocabulary-sheet');
        const evaluation = createAcademyActivityRuntime().evaluate(model(), 'reveal');
        expect(evaluation).toMatchObject({
            result: { outcome: 'lapse', score: 0 },
            attempt: {
                activityId: 'authored:l1-l08/source-time:p1:r1',
                sourceQuestionId: 'moodle-vocabulary:source:p1:row-1',
                responseKind: 'source-vocabulary-recall',
            },
            reviewSeeds: [{
                id: 'review:l1-l08:source-time:p1:r1',
                sourceQuestionId: 'moodle-vocabulary:source:p1:row-1',
                reason: 'repair',
                content: { expression: 'きょう', meanings: ['today'] },
            }],
        });
    });

    it('conceals support fields until commitment, labels fallback provenance, and retries a reveal', async () => {
        const runtime = createAcademyActivityRuntime();
        const host = document.createElement('div');
        document.body.append(host);
        const evaluations: string[] = [];
        const controller = runtime.mount(model(), {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, evaluation => { evaluations.push(evaluation.result.outcome); });

        expect(host.textContent).toContain('きょう');
        expect(host.textContent).not.toContain('today');
        expect(host.textContent).not.toContain('Yomu meaning support');
        host.querySelector<HTMLButtonElement>('[data-source-vocabulary-response="reveal"]')!.click();
        await vi.waitFor(() => expect(host.textContent).toContain('today'));

        expect(evaluations).toEqual(['lapse']);
        expect(host.textContent).toContain('today');
        expect(host.textContent).toContain('Yomu meaning support');
        expect(host.querySelector('[data-field-provenance="yomu-support"]')).not.toBeNull();
        expect(host.querySelector<HTMLButtonElement>('[data-source-vocabulary-response="reveal"]')?.disabled).toBe(true);

        host.querySelector<HTMLButtonElement>('[data-source-vocabulary-response="remembered"]')!.click();
        await vi.waitFor(() => expect(host.querySelector('.academy-source-vocabulary-sheet')?.getAttribute('data-outcome')).toBe('pass'));
        expect(evaluations).toEqual(['lapse', 'pass']);
        controller.dispose();
    });

    it('adapts exact rows without rewriting source order or item provenance', () => {
        const week = adaptAuthoredWeek(sourcePackage(), {
            path: '/fixture/l1-l08.json',
            sha256: AUTHORED_WEEK_HASHES['l1-l08'],
        });
        const rows = week.activities.filter(activity => activity.kind === 'academy-source-vocabulary-sheet');
        expect(rows.map(row => row.sourceQuestionId)).toEqual([
            'moodle-vocabulary:source:p1:row-1',
            'moodle-vocabulary:source:p1:row-2',
        ]);
        expect(rows.map(row => row.payload.exact.words)).toEqual(['きょう', 'あした']);
        expect(rows[1].provenance).toMatchObject({
            packageId: 'l1-l08',
            componentId: 'source-time',
            sourceId: 'moodle-vocabulary:source',
            locus: { page: 1, row: 2 },
        });
        expect(week.evaluate(rows[1].id, 'reveal').reviewSeeds[0].sourceQuestionId)
            .toBe('moodle-vocabulary:source:p1:row-2');
    });

    it('fails closed when exact source rows are reordered or duplicated', () => {
        const reordered = sourcePackage();
        [reordered.components[0].items[0], reordered.components[0].items[1]] = [
            reordered.components[0].items[1],
            reordered.components[0].items[0],
        ];
        expect(() => adaptAuthoredWeek(reordered, {
            path: '/fixture/l1-l08.json',
            sha256: AUTHORED_WEEK_HASHES['l1-l08'],
        })).toThrow(/exact increasing source page and row order/i);

        const duplicate = sourcePackage();
        duplicate.components[0].items[1].source.itemId = duplicate.components[0].items[0].source.itemId;
        expect(() => adaptAuthoredWeek(duplicate, {
            path: '/fixture/l1-l08.json',
            sha256: AUTHORED_WEEK_HASHES['l1-l08'],
        })).toThrow(/must be unique in the package/i);
    });
});

function model(): SourceVocabularySheetModel {
    return {
        id: 'authored:l1-l08/source-time:p1:r1',
        kind: 'academy-source-vocabulary-sheet',
        sourceQuestionId: 'moodle-vocabulary:source:p1:row-1',
        conceptIds: ['concept:l1-l08:source-time:p1:r1'],
        responseKind: 'source-vocabulary-recall',
        prompt: { ja: 'ことばの いみを 思い出しましょう。', en: 'Recall the source row before checking it.' },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        provenance: {
            packageId: 'l1-l08',
            componentId: 'source-time',
            sourceId: 'moodle-vocabulary:source',
            sourceQuestionId: 'moodle-vocabulary:source:p1:row-1',
            payloadSha256: 'a'.repeat(64),
            sourceTitle: 'HW Vocabulary time expression1+ days',
            locus: { page: 1, row: 1 },
        },
        payload: {
            exact: { words: 'きょう', pronunciation: null, meaning: null },
            support: { words: 'きょう', reading: 'きょう', meaning: 'today' },
            fieldProvenance: { words: 'source-provided', reading: 'yomu-support', meaning: 'yomu-support' },
        },
    };
}

function sourcePackage() {
    const payloadSha256 = 'a'.repeat(64);
    const source = (row: number, words: string, meaning: string) => ({
        ja: words,
        reading: words,
        en: meaning,
        source: {
            itemId: `moodle-vocabulary:source:p1:row-${row}`,
            payloadSha256,
            title: 'HW Vocabulary time expression1+ days',
            locus: { page: 1, row },
            exact: { words, pronunciation: null, meaning: null },
            fieldProvenance: { words: 'source-provided', reading: 'yomu-support', meaning: 'yomu-support' },
            answerVisibility: 'after-attempt',
        },
    });
    return {
        schema: 'yomu-academy.week.v1',
        id: 'l1-l08',
        identity: {},
        provenance: { authorship: 'source-normalized' },
        components: [{
            id: 'source-time',
            type: 'source-vocabulary-reference',
            order: 21,
            title: { ja: '時間のことば', en: 'Time words' },
            sourceInstructions: { ja: 'ことばの いみを 思い出しましょう。', en: 'Recall each source row.' },
            provenance: { sourceId: 'moodle-vocabulary:source', payloadSha256, title: 'HW Vocabulary time expression1+ days' },
            items: [source(1, 'きょう', 'today'), source(2, 'あした', 'tomorrow')],
        }],
    };
}
