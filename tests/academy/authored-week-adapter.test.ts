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
    ['002-l1-l01.json', 'l1-l01', 11, 1],
    ['003-l1-l02.json', 'l1-l02', 12, 1],
    ['004-l1-l03.json', 'l1-l03', 14, 1],
    ['005-l1-l04.json', 'l1-l04', 10, 1],
    ['006-l1-l05.json', 'l1-l05', 11, 1],
    ['007-l1-l06.json', 'l1-l06', 14, 1],
    ['008-l1-l07.json', 'l1-l07', 11, 1],
    ['009-l1-l08.json', 'l1-l08', 28, 1],
    ['010-l1-l09.json', 'l1-l09', 26, 1],
    ['011-l1-l10.json', 'l1-l10', 12, 1],
    ['012-l1-l11.json', 'l1-l11', 13, 0],
    ['013-l1-l12.json', 'l1-l12', 14, 0],
    ['014-l1-l13.json', 'l1-l13', 13, 0],
    ['015-l1-l14.json', 'l1-l14', 12, 0],
    ['016-l1-l15.json', 'l1-l15', 11, 1],
    ['017-l1-l16.json', 'l1-l16', 34, 1],
    ['018-l1-l17.json', 'l1-l17', 22, 1],
    ['019-l1-l18.json', 'l1-l18', 12, 1],
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

    it('projects authored teaching, passages, production prompts, and missions without answer payloads', () => {
        const loaded = fixture('002-l1-l01.json', 'l1-l01');
        const source = loaded.json as {
            explanation: { intro: string; grammarPoints: Array<{ examples: Array<{ ja: string }> }> };
            components: Array<{
                type: string;
                passage?: { lines: Array<{ ja: string }> };
                prompt?: string;
                modelAnswer?: { ja: string };
            }>;
            mission: { prompt: string; modelAnswer: { ja: string }; successCriteria: string[] };
        };
        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        const serialized = JSON.stringify(week.preAssessment);
        const passage = source.components.find(component => component.type === 'reading')!.passage!;
        const speaking = source.components.find(component => component.type === 'speaking')!;
        const writing = source.components.find(component => component.type === 'writing')!;

        expect(week.preAssessment.map(exposure => exposure.kind)).toEqual([
            'explanation', 'passage', 'prompt', 'prompt', 'mission',
        ]);
        expect(serialized).toContain(source.explanation.intro);
        expect(serialized).toContain(passage.lines[0].ja);
        expect(serialized).toContain(speaking.prompt);
        expect(serialized).toContain(writing.prompt);
        expect(serialized).toContain(source.mission.prompt);
        expect(serialized).not.toContain(source.explanation.grammarPoints[0].examples[0].ja);
        expect(serialized).not.toContain(source.mission.modelAnswer.ja);
        source.mission.successCriteria.forEach(criterion => expect(serialized).not.toContain(criterion));
        expect(serialized).not.toMatch(/"correct"|"answer"|"modelAnswer"|"rubric"/i);
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
                || activity.kind === 'academy-authored-cloze'
                || activity.kind === 'academy-authored-matching'
                || activity.kind === 'academy-authored-ordering'
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

    it('keeps every authored cloze blank in one answer-hidden structured activity', () => {
        const loaded = fixture('002-l1-l01.json', 'l1-l01');
        const source = loaded.json as {
            components: Array<{ exercises?: Array<{
                id: string;
                kind: string;
                prompt: { en: string; ja: string };
                japanese: string;
                blanks: Array<{ id: string; answer: { primary: string } }>;
            }> }>;
        };
        const cloze = source.components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.id === 'ex-grammar-no' && exercise.kind === 'cloze')!;
        const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: loaded.expectedHash });
        const activity = week.activities.find(candidate => candidate.sourceQuestionId === `l1-l01/${cloze.id}`)!;

        expect(activity).toMatchObject({
            kind: 'academy-authored-cloze',
            responseKind: 'authored-cloze-fields',
            curriculumPhase: 'guided-practice',
            payload: { blanks: cloze.blanks.map(blank => ({ id: blank.id })) },
            provenance: {
                packageId: 'l1-l01',
                authoredSource: { exerciseId: cloze.id },
            },
        });
        expect(activity.prompt).toEqual(cloze.prompt);
        expect(activity.kind === 'academy-authored-cloze' && activity.payload.sentence).toBe(cloze.japanese);
        expect(JSON.stringify(activity)).not.toMatch(/"correct"|"answer"|"modelAnswer"/i);
        expect(week.evaluate(activity.id, {
            kind: 'cloze',
            values: cloze.blanks.map(blank => ({ blankId: blank.id, value: blank.answer.primary })),
        }).result).toMatchObject({ outcome: 'pass', score: 1 });
        expect(week.evaluate(activity.id, {
            kind: 'cloze',
            values: cloze.blanks.map((blank, index) => ({
                blankId: blank.id,
                value: index === 0 ? blank.answer.primary : 'ちがいます',
            })),
        }).result).toMatchObject({ outcome: 'lapse', score: 0.5 });
    });

    it('preserves source matching and ordering as answer-safe structured contracts', () => {
        const loaded = fixture('021-l1-l20.json', 'l1-l20');
        const source = loaded.json as {
            components: Array<{ exercises?: Array<{
                id: string;
                kind: string;
                prompt: { en: string; ja: string };
                sourceQuestionId?: string;
                sourcePromptExact?: string;
                source?: Readonly<Record<string, unknown>>;
                sourceItemsExact?: string[];
                workedExampleExact?: string;
                tiles?: string[];
                answer?: { primary: string };
                answers?: { values: string[] };
            }> }>;
        };
        const exercises = source.components.flatMap(component => component.exercises ?? []);
        const matching = exercises.find(exercise => exercise.id === 'ex-l20-hw-review-2')!;
        const tileOrdering = exercises.find(exercise => exercise.id === 'ex-l20-sensei-frequency-1')!;
        const cueOrdering = exercises.find(exercise => exercise.id === 'ex-l20-hw-review-4')!;
        const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: loaded.expectedHash });

        const match = week.activities.find(activity =>
            activity.sourceQuestionId === 'l1-l20/ex-l20-hw-review-2')!;
        expect(match).toMatchObject({
            kind: 'academy-authored-matching',
            responseKind: 'authored-one-to-one-matching',
            curriculumPhase: 'guided-practice',
            provenance: {
                authoredSource: {
                    exerciseId: matching.id,
                    sourceQuestionId: matching.sourceQuestionId,
                    sourcePromptExact: matching.sourcePromptExact,
                    locator: matching.source,
                },
            },
        });
        if (match.kind !== 'academy-authored-matching') throw new TypeError('Expected native matching.');
        expect(match.payload.items.map(item => item.label)).toEqual(matching.sourceItemsExact);
        expect(match.payload.targets.map(target => target.label).sort()).toEqual([...matching.answers!.values].sort());
        expect(match.payload.targets.map(target => target.label)).not.toEqual(matching.answers!.values);
        const targetIdFor = (value: string) => match.payload.targets.find(target => target.label === value)!.id;
        expect(week.evaluate(match.id, {
            kind: 'matching',
            placements: match.payload.items.map((item, index) => ({
                itemId: item.id,
                targetId: targetIdFor(matching.answers!.values[index]),
            })),
        }).result.outcome).toBe('pass');
        expect(week.evaluate(match.id, {
            kind: 'matching',
            placements: match.payload.items.map((item, index) => ({
                itemId: item.id,
                targetId: targetIdFor(matching.answers!.values[(index + 1) % matching.answers!.values.length]),
            })),
        }).result.outcome).toBe('lapse');

        const sequence = week.activities.find(activity =>
            activity.sourceQuestionId === `l1-l20/${tileOrdering.id}`)!;
        expect(sequence).toMatchObject({
            kind: 'academy-authored-ordering',
            responseKind: 'authored-ordered-items',
            curriculumPhase: 'guided-practice',
            provenance: { authoredSource: { sourceQuestionId: tileOrdering.sourceQuestionId } },
        });
        if (sequence.kind !== 'academy-authored-ordering') throw new TypeError('Expected native ordering.');
        expect(sequence.payload.sequences).toHaveLength(1);
        expect(sequence.payload.sequences[0].items.map(item => item.label).sort()).toEqual([...tileOrdering.tiles!].sort());
        expect(sequence.payload.sequences[0].items.map(item => item.label)).not.toEqual(tileOrdering.tiles);
        expect(JSON.stringify(sequence)).not.toContain(tileOrdering.answer!.primary);
        expect(week.evaluate(sequence.id, {
            kind: 'ordering',
            sequences: [{
                sequenceId: 'sequence-1',
                itemIds: tileOrdering.tiles!.map((_, index) => `sequence-1-item-${index + 1}`),
            }],
        }).result.outcome).toBe('pass');

        const orderedCues = week.activities.find(activity =>
            activity.sourceQuestionId === `l1-l20/${cueOrdering.id}`)!;
        expect(orderedCues).toMatchObject({
            kind: 'academy-authored-ordering',
            payload: {
                sequences: cueOrdering.sourceItemsExact!.map((cue, index) => ({
                    id: `sequence-${index + 1}`,
                    cue,
                })),
            },
        });
        expect(JSON.stringify(orderedCues)).not.toContain(cueOrdering.answers!.values[0]);
        expect(week.activities.some(activity => activity.sourceQuestionId.includes('ex-l20-sensei-short-dialogue')))
            .toBe(false);
    });

    it('quarantines contradictory cloze metadata and redacts model answers from prompts', () => {
        const loaded = fixture('020-l1-l19.json', 'l1-l19');
        const week = adaptAuthoredWeek(loaded.json, { ...loaded.source, sha256: loaded.expectedHash });
        const particle = week.activities.find(activity =>
            activity.sourceQuestionId === 'l1-l19/ex-l1plus-l09-grammar-cloze')!;
        const copiedSentence = week.activities.find(activity =>
            activity.sourceQuestionId === 'l1-l19/ex-l1plus-l09-grammar-build')!;

        expect(week.evaluate(particle.id, {
            kind: 'cloze', values: [{ blankId: 'b1', value: 'に' }],
        }).result.outcome).toBe('pass');
        expect(week.evaluate(particle.id, {
            kind: 'cloze', values: [{ blankId: 'b1', value: 'を' }],
        }).result.outcome).toBe('lapse');
        if (copiedSentence.kind !== 'academy-authored-cloze') throw new TypeError('Expected native cloze.');
        expect(copiedSentence.payload.sentence).not.toContain('毎日 一時間 日本語を べんきょうします。');
        expect(copiedSentence.payload.sentence).toContain('＿＿＿');
    });

    it('does not redact short answers embedded inside legitimate cloze clues', () => {
        const loaded = fixture('006-l1-l05.json', 'l1-l05');
        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        const rendered = week.activities.flatMap(activity => activity.kind === 'academy-authored-cloze'
            ? [activity.prompt.ja, activity.payload.sentence]
            : [activity.prompt.ja]).join('\n');

        expect(rendered).toContain('かいしゃいん');
        expect(rendered).not.toContain('＿＿＿いしゃいん');
    });

    it('projects every supported structured exercise in the registered authored corpus', () => {
        let sourceExerciseCount = 0;
        let projectedActivityCount = 0;
        const lessonRoot = path.resolve('public/academy/content/lessons');
        for (const file of fs.readdirSync(lessonRoot).filter(candidate => /^\d{3}-.*\.json$/u.test(candidate))) {
            const fixturePath = path.join(lessonRoot, file);
            const bytes = fs.readFileSync(fixturePath);
            const source = JSON.parse(bytes.toString('utf8')) as {
                id?: string;
                components?: Array<{ exercises?: Array<{
                    id: string;
                    kind: string;
                    autoGraded?: boolean;
                    pluginTarget?: string;
                    blanks?: unknown[];
                    sourceItemsExact?: unknown[];
                    tiles?: unknown[];
                }> }>;
            };
            if (!source.id || !(source.id in AUTHORED_WEEK_HASHES)) continue;
            const supported = (source.components ?? []).flatMap(component => component.exercises ?? []).filter(exercise =>
                exercise.autoGraded === true && (
                    exercise.kind === 'cloze'
                    || (exercise.kind === 'matching' && exercise.pluginTarget === 'academy-drag-sort')
                    || (exercise.kind === 'ordering' && exercise.pluginTarget === 'academy-sequence')
                ));
            if (!supported.length) continue;
            const expectedActivities = supported.length;
            const week = adaptAuthoredWeek(source, {
                path: fixturePath,
                sha256: createHash('sha256').update(bytes).digest('hex'),
            });
            const supportedIds = new Set(supported.map(exercise => exercise.id));
            const projected = week.activities.filter(activity =>
                activity.kind !== 'academy-source-vocabulary-sheet'
                && Boolean(activity.provenance.authoredSource
                    && supportedIds.has(activity.provenance.authoredSource.exerciseId)));

            expect(projected, source.id).toHaveLength(expectedActivities);
            expect(JSON.stringify(projected), source.id).not.toMatch(/"correct"|"answer"|"modelAnswer"/i);
            sourceExerciseCount += supported.length;
            projectedActivityCount += projected.length;
        }

        expect({ sourceExerciseCount, projectedActivityCount }).toEqual({
            sourceExerciseCount: 89,
            projectedActivityCount: 89,
        });
    });

    it('rejects malformed auto-graded cloze data instead of silently dropping it', () => {
        const loaded = fixture('002-l1-l01.json', 'l1-l01');
        const malformed = structuredClone(loaded.json) as {
            components: Array<{ exercises?: Array<{ id: string; kind: string; blanks?: Array<{ id: string }> }> }>;
        };
        const cloze = malformed.components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.kind === 'cloze' && exercise.blanks!.length > 1)!;
        cloze.blanks![1].id = cloze.blanks![0].id;

        expect(() => adaptAuthoredWeek(malformed, { ...loaded.source, sha256: loaded.expectedHash }))
            .toThrow(/duplicate cloze blank id/i);
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
