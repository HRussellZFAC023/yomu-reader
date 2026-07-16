import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    adaptAuthoredWeek,
    AUTHORED_WEEK_HASHES,
    type AuthoredWeekId,
} from '../../src/academy/content/authored-week-adapter';
import { parseChoiceExercise } from '../../src/academy/content/authored-week-schema';
import { auditAuthoredActivityContracts } from '../../src/academy/content/cold-production-audit';

const FIXTURES = [
    ['002-l1-l01.json', 'l1-l01', 9, 1],
    ['003-l1-l02.json', 'l1-l02', 10, 1],
    ['004-l1-l03.json', 'l1-l03', 11, 1],
    ['005-l1-l04.json', 'l1-l04', 9, 1],
    ['006-l1-l05.json', 'l1-l05', 9, 1],
    ['007-l1-l06.json', 'l1-l06', 11, 1],
    ['008-l1-l07.json', 'l1-l07', 9, 1],
    ['009-l1-l08.json', 'l1-l08', 25, 1],
    ['010-l1-l09.json', 'l1-l09', 25, 1],
    ['011-l1-l10.json', 'l1-l10', 10, 1],
    ['012-l1-l11.json', 'l1-l11', 11, 0],
    ['013-l1-l12.json', 'l1-l12', 12, 0],
    ['014-l1-l13.json', 'l1-l13', 13, 0],
    ['015-l1-l14.json', 'l1-l14', 12, 0],
    ['016-l1-l15.json', 'l1-l15', 9, 1],
    ['017-l1-l16.json', 'l1-l16', 31, 1],
    ['018-l1-l17.json', 'l1-l17', 19, 1],
    ['019-l1-l18.json', 'l1-l18', 9, 1],
] as const;

function fixture(file: string, id: AuthoredWeekId) {
    const fixturePath = path.resolve('public/academy/content/lessons', file);
    const bytes = fs.readFileSync(fixturePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return {
        json: JSON.parse(bytes.toString('utf8')) as unknown,
        source: { path: fixturePath, sha256 },
        expectedHash: AUTHORED_WEEK_HASHES[id],
    };
}

describe('authored week recovery adapter', () => {
    it('uses the Japanese option as the fallback when a source omits an English gloss', () => {
        const exercise = parseChoiceExercise({
            id: 'japanese-only-choice',
            kind: 'choice',
            prompt: { en: 'Choose the natural sentence.', ja: '自然な文を選んでください。' },
            explanation: 'The source deliberately leaves option glosses blank.',
            autoGraded: true,
            options: [
                { id: 'a', label: { en: '', ja: '一週間に一回勉強します。' }, correct: true },
                { id: 'b', label: { en: '', ja: '一週間一時間勉強します。' }, correct: false },
            ],
        }, 'exercise');

        expect(exercise?.options.map(option => option.label)).toEqual([
            { en: '一週間に一回勉強します。', ja: '一週間に一回勉強します。' },
            { en: '一週間一時間勉強します。', ja: '一週間一時間勉強します。' },
        ]);
    });

    it('accepts all registered canonical packages and preserves their hashes and provenance', () => {
        for (const [file, id, activityCount, mediaCount] of FIXTURES) {
            const loaded = fixture(file, id);
            expect(loaded.source.sha256).toBe(loaded.expectedHash);
            const week = adaptAuthoredWeek(loaded.json, loaded.source);
            expect(week).toMatchObject({
                id,
                provenance: {
                    source: loaded.source,
                    packageId: id,
                    packageProvenance: expect.any(Object),
                },
            });
            expect(week.activities, `${id} activity count`).toHaveLength(activityCount);
            expect(week.media, `${id} media count`).toHaveLength(mediaCount);
            week.media.forEach(media => expect(media).toEqual(expect.objectContaining({
                status: 'unavailable', reason: 'unresolved-academy-locator',
            })));
        }
    });

    it('exposes only bilingual assessed learner views without answer material', () => {
        for (const [file, id] of FIXTURES) {
            const loaded = fixture(file, id);
            const week = adaptAuthoredWeek(loaded.json, loaded.source);
            const serialized = JSON.stringify(week);
            expect(serialized).not.toMatch(/"correct"|"answer"|"modelAnswer"/i);
            expect(week.activities.every(activity => (
                activity.kind === 'choice'
                || activity.kind === 'text'
                || activity.kind === 'academy-source-vocabulary-sheet'
            ))).toBe(true);
            expect(week.activities.filter(activity => activity.kind === 'choice' || activity.kind === 'text')
                .every(activity => activity.options.every(option => (
                option.label.en.trim() && option.label.ja.trim()
            )))).toBe(true);
        }
    });

    it('grades normalized exact answers without serializing accepted answers into the learner view', () => {
        const loaded = fixture('013-l1-l12.json', 'l1-l12');
        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        const activity = week.activities.find(candidate => candidate.sourceQuestionId.endsWith('/l12-like-q1-1'))!;
        expect(activity.kind).toBe('text');
        expect(JSON.stringify(activity)).not.toContain('わたしはテニスがすきです');
        expect(week.evaluate(activity.id, 'わたしは テニスが すきです。').result.outcome).toBe('pass');
        expect(week.evaluate(activity.id, 'コーヒーがすきです').result.outcome).toBe('lapse');
    });

    it('keeps constrained listening retrieval out of production and exposes the l1-l20 comparison ladder', () => {
        const loaded = fixture('021-l1-l20.json', 'l1-l20');
        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        const phaseFor = (suffix: string) => week.activities.find(activity =>
            activity.kind !== 'academy-source-vocabulary-sheet'
            && activity.sourceQuestionId.endsWith(`/${suffix}`))?.curriculumPhase;

        expect([
            'ex-l20-hw-conversation-1',
            'ex-l20-hw-conversation-2',
            'ex-l20-hw-conversation-3',
            'ex-l20-hw-conversation-4',
        ].map(phaseFor)).toEqual([
            'guided-practice',
            'guided-practice',
            'guided-practice',
            'guided-practice',
        ]);
        expect([
            'ex-l20-post-office-price-context',
            'ex-l20-post-office-comparison-form',
            'ex-l20-post-office-comparison-guided',
            'ex-l20-post-office-comparison-transfer',
        ].map(phaseFor)).toEqual([
            'context',
            'instruction',
            'guided-practice',
            'assessed-production',
        ]);
        expect(auditAuthoredActivityContracts('authored-week:l1-l20', week.activities)).toEqual([]);
    });

    it('normalizes only the four known l1-l10 unwrapped option-label exercises', () => {
        const loaded = fixture('011-l1-l10.json', 'l1-l10');
        const source = loaded.json as {
            components: Array<{ exercises?: Array<{ id: string; options?: Array<{ en?: string; ja?: string; label?: unknown }> }> }>;
        };
        const malformed = source.components.flatMap(component => component.exercises ?? [])
            .filter(exercise => exercise.options?.some(option => option.label === undefined && option.en && option.ja));
        expect(malformed.map(exercise => exercise.id)).toEqual([
            'ex-listen-gist',
            'ex-listen-detail',
            'ex-read-wake',
            'ex-read-weekend',
        ]);

        const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: loaded.expectedHash });
        for (const exercise of malformed) {
            const activity = week.activities.find(candidate => candidate.sourceQuestionId.endsWith(`/${exercise.id}`));
            expect(activity?.kind === 'choice' ? activity.options : undefined).toEqual(exercise.options?.map(option => ({
                id: expect.any(String),
                label: { en: option.en, ja: option.ja },
            })));
        }
        expect(malformed.every(exercise => exercise.options?.every(option => option.label === undefined))).toBe(true);
    });

    it('uses explicit concept overlays rather than donor review tags and reveals feedback only on evaluation', () => {
        const loaded = fixture('002-l1-l01.json', 'l1-l01');
        const changedTag = structuredClone(loaded.json) as {
            components: Array<{ exercises?: Array<{ id: string; reviewTag?: string }> }>;
        };
        const donorExercise = changedTag.components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.id === 'ex-grammar-particle')!;
        donorExercise.reviewTag = 'deliberately-unrelated';

        const week = adaptAuthoredWeek(changedTag, loaded.source);
        const activity = week.activities.find(candidate => candidate.sourceQuestionId.endsWith('/ex-grammar-particle'))!;
        expect(activity.conceptIds).toEqual(['concept:grammar:particle-wa']);
        expect(activity).not.toHaveProperty('feedback');

        const donor = (loaded.json as { components: Array<{ exercises?: Array<{ id: string; options?: Array<{ id: string; correct: boolean }> }> }> })
            .components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.id === 'ex-grammar-particle')!;
        const wrong = donor.options!.find(option => !option.correct)!.id;
        const evaluation = week.evaluate(activity.id, wrong);
        expect(evaluation).toMatchObject({
            result: {
                outcome: 'lapse',
                feedback: {
                    explanation: { en: expect.any(String), ja: expect.any(String) },
                    repairPrompt: { en: expect.any(String), ja: expect.any(String) },
                },
            },
            reviewSeeds: [{
                conceptId: 'concept:grammar:particle-wa',
                reason: 'repair',
                content: { expression: 'わたしは トムです', meanings: ['topic は'] },
            }],
        });
    });

    it('rejects hash drift, duplicate exercise and option ids, and unresolved audio as playable', () => {
        const loaded = fixture('002-l1-l01.json', 'l1-l01');
        expect(() => adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: '0'.repeat(64) }))
            .toThrow(/hash mismatch/i);

        const duplicateExercise = structuredClone(loaded.json) as { components: Array<{ exercises?: unknown[] }> };
        const exercises = duplicateExercise.components.find(component => component.exercises?.length)?.exercises!;
        exercises.push(structuredClone(exercises[0]));
        expect(() => adaptAuthoredWeek(duplicateExercise, loaded.source)).toThrow(/duplicate exercise id/i);

        const duplicateOption = structuredClone(loaded.json) as {
            components: Array<{ exercises?: Array<{ kind?: string; options?: Array<{ id: string }> }> }>;
        };
        const choice = duplicateOption.components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.kind === 'choice' && exercise.options?.length)!;
        choice.options![1]!.id = choice.options![0]!.id;
        expect(() => adaptAuthoredWeek(duplicateOption, loaded.source)).toThrow(/duplicate option id/i);

        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        expect(week.media).toEqual([expect.objectContaining({
            status: 'unavailable',
            reason: 'unresolved-academy-locator',
            sourceLocator: expect.stringMatching(/^academy:\/\//),
        })]);
        expect(JSON.stringify(week.media)).not.toMatch(/playable|https?:\/\//);
    });

    it('activates only exact packaged Soya tasks and keeps their transcripts gated by the activity UI', () => {
        const loaded = fixture('019-l1-l18.json', 'l1-l18');
        const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: AUTHORED_WEEK_HASHES['l1-l18'] });
        const sourceTask = week.activities.find(candidate => candidate.sourceQuestionId.endsWith('/ex-soya-n5_listening_official_002'));
        const secondSourceTask = week.activities.find(candidate => candidate.sourceQuestionId.endsWith('/ex-soya-n5_mock1_l_04'));

        expect(sourceTask).toMatchObject({
            kind: 'choice',
            listening: {
                sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_listening_official_002.mp3',
                url: '/academy/content/listening/media/academy-listening-f1c2bbdb7c54893a.mp3',
                transcriptReveal: 'after-attempt',
            },
        });
        expect(secondSourceTask).toMatchObject({
            kind: 'choice',
            listening: {
                sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_04.mp3',
                url: '/academy/content/listening/media/academy-listening-da546db7dbceaf3ea.mp3',
                transcriptReveal: 'after-attempt',
            },
        });
        expect(JSON.stringify(sourceTask)).not.toMatch(/"correct"|"answer"/i);
        expect(JSON.stringify(secondSourceTask)).not.toMatch(/"correct"|"answer"/i);
    });

    it('projects exact Moodle vocabulary rows in source order with immutable provenance', () => {
        const loaded = fixture('009-l1-l08.json', 'l1-l08');
        const source = loaded.json as {
            components: Array<{
                id?: string;
                type: string;
                items?: Array<{ source: { itemId: string; locus: { page: number; row: number }; exact: unknown } }>;
            }>;
        };
        const component = source.components.find(candidate => candidate.type === 'source-vocabulary-reference')!;
        const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: loaded.expectedHash });
        const rows = week.activities.filter(activity => activity.kind === 'academy-source-vocabulary-sheet');

        expect(rows).toHaveLength(component.items!.length);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(component.items!.map(item => item.source.itemId));
        expect(rows.map(row => row.provenance.locus)).toEqual(component.items!.map(item => item.source.locus));
        expect(rows[0]).toMatchObject({
            sourceQuestionId: component.items![0].source.itemId,
            provenance: {
                packageId: 'l1-l08',
                componentId: component.id,
                payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
                locus: { page: 1, row: 1 },
            },
            payload: { exact: component.items![0].source.exact },
        });
        expect(week.evaluate(rows[0].id, 'reveal').reviewSeeds[0].sourceQuestionId)
            .toBe(component.items![0].source.itemId);
    });

    it('projects every exact row-based Moodle vocabulary sheet currently in the authored corpus', () => {
        const sourceWeeks = [
            ['009-l1-l08.json', 'l1-l08', 12],
            ['010-l1-l09.json', 'l1-l09', 14],
            ['017-l1-l16.json', 'l1-l16', 24],
            ['018-l1-l17.json', 'l1-l17', 12],
            ['020-l1-l19.json', 'l1-l19', 39],
        ] as const;
        let sheetCount = 0;
        for (const [file, id, expectedRows] of sourceWeeks) {
            const loaded = fixture(file, id);
            const source = loaded.json as { components: Array<{ type: string; items?: unknown[] }> };
            const components = source.components.filter(component => component.type === 'source-vocabulary-reference');
            sheetCount += components.length;
            const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: loaded.expectedHash });
            expect(
                week.activities.filter(activity => activity.kind === 'academy-source-vocabulary-sheet'),
                id,
            ).toHaveLength(expectedRows);
        }
        expect(sheetCount).toBe(6);
    });

    it('rejects reordered or duplicate exact Moodle vocabulary rows', () => {
        const loaded = fixture('009-l1-l08.json', 'l1-l08');
        const reordered = structuredClone(loaded.json) as {
            components: Array<{ type: string; items?: unknown[] }>;
        };
        const reorderedRows = reordered.components.find(component => component.type === 'source-vocabulary-reference')!.items!;
        [reorderedRows[0], reorderedRows[1]] = [reorderedRows[1], reorderedRows[0]];
        const pinnedSource = { ...loaded.source, sha256: loaded.expectedHash };
        expect(() => adaptAuthoredWeek(reordered, pinnedSource)).toThrow(/exact increasing source page and row order/i);

        const duplicate = structuredClone(loaded.json) as {
            components: Array<{ type: string; items?: Array<{ source: { itemId: string } }> }>;
        };
        const duplicateRows = duplicate.components.find(component => component.type === 'source-vocabulary-reference')!.items!;
        duplicateRows[1].source.itemId = duplicateRows[0].source.itemId;
        expect(() => adaptAuthoredWeek(duplicate, pinnedSource)).toThrow(/must be unique in the package/i);
    });
});
