import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { exactLibraryVocabularyDefinition } from '../../src/academy/content/lesson-27-31-library-vocabulary';
import { loadSenseiVocabularyPrerequisite } from '../../src/academy/content/lesson-vocabulary-prerequisite';
import { attachLibraryReaderVocabulary } from '../../src/academy/integration/library-reader-vocabulary';
import { renderLessonVocabularyPrerequisiteScreen } from '../../src/academy/ui/lesson-vocabulary-prerequisite';
import {
    applyAuthoredVocabularyOverrides,
    AUTHORED_VOCABULARY_ATTRIBUTE,
} from '../../src/reader/lookup/authored-vocabulary';
import { fallbackLookupTermsForCard } from '../../src/reader/lookup/japanese-segments';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';

const PAYLOAD = '40568a1fe04d69eb9454ad6718e1f1b33a9d0e0036bcc5c3c6970532d4a28707';
const SOURCE_ID = `moodle-vocabulary:8121266:${PAYLOAD}`;
const SOURCE_PAGES = [
    ['moodle-new-chapter-28-2-vocabulary-page-1.png', '0cb48f1ff679332f139f56a731402547539cc6c6cdd70dcc500a98541ccb0daa'],
    ['moodle-new-chapter-28-2-vocabulary-page-2.png', '1f6e44b353c867935b7ffd9c7e74ad7c6e2c2ec63aae57f43097ba5f1c1eaf95'],
    ['moodle-new-chapter-28-2-vocabulary-page-3.png', '8f62482f437edab0d66165c57daa9389c24c6987a3cd69cac4552ea49d2c9657'],
] as const;

describe('Library SRS l2-l13 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => document.body.replaceChildren());

    it('preserves the source numbering and admits only fifteen usable printed glosses', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l13', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l13');
        const study = libraryStudyVocabulary(sheet);
        const crosswalk = JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/curriculum-crosswalk.v1.json',
            'utf8',
        )) as { lessons: Array<Record<string, unknown>> };

        expect(crosswalk.lessons.find(lesson => lesson.lessonId === 'l2-l13')).toMatchObject({
            moodle: { moduleId: 8121266 },
            minna: { range: [28, 28] },
            genki: null,
            status: 'gap-declared',
            gaps: ['missing-genki-prerequisite-anchor'],
        });
        expect(definition).toMatchObject({
            packageId: 'l2-l13',
            packageOrder: 40,
            moduleId: 8121266,
            payloadSha256: PAYLOAD,
            title: 'Handouts/New_Chapter 28-2 Vocabulary Sheet.pdf',
            requireSourceMeaning: true,
            ambiguousSourceMeaningRows: [2, 6],
            layoutOnlyRows: [28, 29, 31, 32],
        });
        expect(sheet.items).toHaveLength(27);
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual([
            ...Array.from({ length: 10 }, (_, index) => [1, index + 1]),
            ...Array.from({ length: 5 }, (_, index) => [1, index + 12]),
            ...Array.from({ length: 11 }, (_, index) => [2, index + 17]),
            [3, 26],
        ]);
        expect(sheet.items.filter(item => item.studyStatus === 'canonical').map(item => [item.source.page, item.source.row]))
            .toEqual([[1, 4], [1, 5], [1, 7], [1, 8], [1, 9], [1, 10],
                [2, 20], [2, 21], [2, 22], [2, 23], [2, 24], [2, 25], [2, 26], [2, 27], [3, 26]]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-ambiguity').map(item => item.source.row))
            .toEqual([2, 6]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap').map(item => item.source.row))
            .toEqual([1, 3, 12, 13, 14, 15, 16, 17, 18, 19]);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['人気', 'popularity'], ['人気がある', 'be popular'], ['経験', 'experience'],
            ['経験がある', 'be experienced'], ['経験をする', 'to experience'],
            ['ちょうどいい', 'proper, just right'], ['ボーナス', 'bouns'],
            ['しばらく', 'a little while'], ['それに', 'in addition'], ['それで', 'and so'],
            ['ちょっとお願いがあるんですが', 'I have a (small) favour to ask,'],
            ['実は', 'as a matter of fact, in fact, actually'], ['会話', 'conversation'],
            ['うーん', 'well,,, let me see,,, hmmm,,,'], ['一生懸命', 'with all one’s effort'],
        ]);
        expect(libraryVocabularyReviewSeeds(sheet)).toHaveLength(15);

        const pages = sourcePages(input);
        expect(String(pages[0]?.verbatimText)).toContain('Chapter 28-2 Vocabulary Sheet');
        expect(String(pages[0]?.verbatimText)).toContain('usually, mostly');
        expect(String(pages[1]?.verbatimText)).toContain('20 ボーナス                               bouns');
        expect(String(pages[2]?.verbatimText)).toContain('with all one’s effort');
        for (const row of [28, 29, 31, 32]) {
            expect(String(pages[1]?.verbatimText)).toMatch(new RegExp(`\\n${row}\\n\\n`));
        }
    });

    it('teaches the preserved rows before the two varied, repairable assessments', async () => {
        const input = lessonPackage();
        const prerequisite = await loadSenseiVocabularyPrerequisite(
            'authored-week:l2-l13',
            (async () => ({ ok: true, json: async () => input }) as Response) as typeof fetch,
        );
        const onContinue = vi.fn();
        const screen = renderLessonVocabularyPrerequisiteScreen({ language: 'en', prerequisite, onContinue });
        document.body.append(screen);
        screen.querySelector<HTMLButtonElement>('[data-vocabulary-prerequisite-open]')!.click();

        expect(screen.dataset.sourceStatus).toBe('exact-source');
        expect(screen.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(27);
        expect(onContinue).not.toHaveBeenCalled();
        screen.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')!.click();
        expect(onContinue).toHaveBeenCalledOnce();

        const sourceComponent = vocabularyComponent(input);
        expect(array(sourceComponent.exercises).map(record)).toContainEqual(expect.objectContaining({
            kind: 'match',
            curriculumPhase: 'assessed-recognition',
        }));
        const chapter = await loadLessonActivityChapter('l2-l13', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual([
            'academy-reason-chain', 'academy-meal-survey-listening',
        ]);
        const activities = chapter!.beats.map(beat => record(beat.activity));
        expect(activities.every(activity => record(activity.provenance).answerVisibility === 'after-attempt')).toBe(true);
        expect(activities.every(activity => record(activity.answerSupport).earnedHintPolicy === 'explicit-after-attempt')).toBe(true);
        expect(record(record(activities[1]!.provenance).moodle).audio).toMatchObject({
            payloadSha256: '596a4499996bd9599a169a8ae9171a0e78fe22a7f9d92bce7045203b794baf25',
            locator: 'academy/content/moodle/audio/l2-l13-a11.mp3',
        });
        expect(JSON.stringify(chapter)).not.toContain('3cbfb08e2df21c8ffb145c8ebb9228bb396ebab1d00add94254448f301c78019');
    });

    it('routes supported rows through Reader and persistent SRS while quarantine stays inert', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l13');
        const supported = sheet.items.find(item => item.source.page === 2 && item.source.row === 23)!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({ spelling: 'それで', reading: 'それで', source: 'fallback' });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('それで');
        const steps = createNewTabStudySession(token!.card, {
            mode: 'word', revealAnswer: false, renderAsKanji: false, hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[1]!, sheet.items[5]!]) {
            const unsupportedSurface = document.createElement('span');
            unsupportedSurface.textContent = unsupported.expression;
            attachLibraryReaderVocabulary(unsupportedSurface, unsupported);
            expect(unsupportedSurface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
            expect(applyAuthoredVocabularyOverrides({ text: unsupported.expression, parent: unsupportedSurface }, [])).toEqual([]);
        }

        const startedAt = Date.parse('2026-07-16T12:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(sheet)[0]!;
        const provenanceId = `academy:study-syllabus:${word.id}`;
        const collect = () => repository.collectAcademyVocabulary({
            expression: word.expression,
            reading: word.reading,
            meanings: [word.meaning],
            provenance: { id: provenanceId, kind: 'study-encounter' as const, sourceId: word.source },
        });
        expect(await collect()).toMatchObject({ cardCreated: true, provenanceAdded: true, provenanceCount: 1 });
        expect(await collect()).toMatchObject({ cardCreated: false, provenanceAdded: false, provenanceCount: 1 });
        const first = (await repository.queue(1)).cards[0]!;
        await repository.review({ card: first, grade: 'good' });
        now += 1;
        expect((await repository.queue(1)).cards).toEqual([]);
        now = startedAt + 2 * 86_400_000;
        expect((await repository.queue(1)).cards[0]).toMatchObject({ dueAt: now, state: ['due'] });
    });

    it('pins mirrors, offline assets, ledger claims, and mutation rejection', () => {
        const sourcePackage = readFileSync('public/academy/content/lessons/040-l2-l13.json');
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('7fd25568ae5a57f7ce553fedce51594edbea77c6360efaa92f8492a61af5bcfe');
        expect(readFileSync('docs/public/academy/content/lessons/040-l2-l13.json')).toEqual(sourcePackage);
        for (const [filename, sha256] of SOURCE_PAGES) {
            const page = readFileSync(`public/academy/content/lessons/l2-l13/${filename}`);
            expect(createHash('sha256').update(page).digest('hex')).toBe(sha256);
            expect(readFileSync(`docs/public/academy/content/lessons/l2-l13/${filename}`)).toEqual(page);
            for (const worker of [
                readFileSync('public/academy/sw.js', 'utf8'),
                readFileSync('docs/public/academy/sw.js', 'utf8'),
            ]) expect(worker).toContain(`/academy/content/lessons/l2-l13/${filename}`);
        }
        expect(readFileSync('docs/public/academy/content/RESOURCE-LEDGER.json'))
            .toEqual(readFileSync('public/academy/content/RESOURCE-LEDGER.json'));
        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l13'))
            .toMatchObject({
                sourcePackage: { sha256: '7fd25568ae5a57f7ce553fedce51594edbea77c6360efaa92f8492a61af5bcfe' },
                audio: {
                    sourceAudioMembers: 5,
                    sourceAudioTracksDelivered: 1,
                    deliveredPayloadSha256: '596a4499996bd9599a169a8ae9171a0e78fe22a7f9d92bce7045203b794baf25',
                },
                claims: {
                    worksheetPagesRendered: 6,
                    sourceVocabularyRowsPreserved: 27,
                    sourceVocabularyRowsRoutedToStudy: 15,
                    sourceVocabularyRowsQuarantinedForMissingGloss: 10,
                    sourceVocabularyRowsQuarantinedForAmbiguousGloss: 2,
                    sourceVocabularyLayoutOnlyRowsPreserved: 4,
                    sourceVocabularyMeaningPolicy: 'source-provided-usable-meanings-only',
                    vocabularyPrerequisite: 'required-before-lesson-assessment',
                },
            });

        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 8121267;
        expect(() => exactLibraryVocabularyDefinition('l2-l13', wrongOwner)).toThrow(/ownership changed/i);
        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'serious';
        expect(() => exactLibraryVocabularyDefinition('l2-l13', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);
        const promotedWrongGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(promotedWrongGloss)[1]!)).meaning = 'enthusiastic';
        expect(() => exactLibraryVocabularyDefinition('l2-l13', promotedWrongGloss))
            .toThrow(/exact source meaning changed at row 2/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/040-l2-l13.json', 'utf8')) as unknown;
}

function vocabularyComponent(input: unknown): Readonly<Record<string, unknown>> {
    const component = array(record(input).components).map(record).find(candidate =>
        record(candidate.provenance).sourceId === SOURCE_ID);
    return record(component);
}

function vocabularyRows(input: unknown): readonly Readonly<Record<string, unknown>>[] {
    return array(vocabularyComponent(input).items).map(record);
}

function sourcePages(input: unknown): readonly Readonly<Record<string, unknown>>[] {
    return array(record(vocabularyComponent(input).preStudyVocabulary).sheets).map(record);
}

function exact(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return record(record(row.source).exact);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object.');
    return value as Readonly<Record<string, unknown>>;
}

function mutableRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object.');
    return value as Record<string, unknown>;
}

function array(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError('Expected an array.');
    return value;
}
