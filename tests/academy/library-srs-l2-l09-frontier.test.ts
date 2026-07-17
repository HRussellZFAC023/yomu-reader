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
import { publicLookupFallbackCards } from '../../src/reader/lookup/public-fallback-cards';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { committedAuthoredWeekFetcher } from './helpers/authored-week-package';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';

const PAYLOAD = 'ccd43883779254dcb24807ec490f07ca47224b7b41b3f3260e99171d98687dc6';
const SOURCE_ID = `moodle-vocabulary:6974657:${PAYLOAD}`;
const SOURCE_PAGES = [
    ['public/academy/content/lessons/l2-l09/moodle-chapter-22-2-vocabulary-page-1.png', 'a9dc72fe58ec7e8b89164d91181fcbb9077f61158772446121606a00fa902496'],
    ['public/academy/content/lessons/l2-l09/moodle-chapter-22-2-vocabulary-page-2.png', 'd26ad5a5f72edccdfea82625c592715489d7be97d735497573b7d853981b4659'],
] as const;

describe('Library SRS l2-l09 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => document.body.replaceChildren());

    it('anchors Moodle, Minna 22, and Genki 15 while preserving all 20 source rows', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l09', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l09');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);
        const crosswalk = JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/curriculum-crosswalk.v1.json',
            'utf8',
        )) as { lessons: Array<Record<string, unknown>> };

        expect(crosswalk.lessons.find(lesson => lesson.lessonId === 'l2-l09')).toMatchObject({
            moodle: { moduleId: 6974657 },
            minna: { range: [22, 22] },
            genki: { range: [15, 15] },
            status: 'anchored',
            gaps: [],
        });
        expect(definition).toMatchObject({
            packageId: 'l2-l09',
            packageOrder: 36,
            moduleId: 6974657,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
            layoutOnlyRows: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        });
        expect(sheet.items).toHaveLength(20);
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual([
            ...Array.from({ length: 16 }, (_, index) => [1, index + 1]),
            ...Array.from({ length: 4 }, (_, index) => [2, index + 17]),
        ]);
        expect(sheet.items.map(item => item.expression)).toEqual([
            'すきな（好きな）', 'ほしい（欲しい）', 'わかります', 'いります（要ります）', 'ロボット',
            'ユーモア', 'つごう（都合）', 'つごうが わるい（都合が悪い）', 'せいじんしき（成人式）',
            'せいじん（成人）', 'おめでとう ございます', 'しょうらい（将来）',
            'おさがしですか。（お探しですか）', 'では、', 'こちら', 'やちん（家賃）',
            'ダイニングキッチン', 'わしつ（和室）', 'おしいれ（押し入れ）', 'ふとん（布団）',
        ]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap')
            .map(item => item.source.row)).toEqual([1, 2, 3, 4, 5, 9, 10]);
        expect(study).toHaveLength(13);
        expect(study[0]).toMatchObject({ expression: 'ユーモア', meaning: 'humor' });
        expect(study.at(-1)).toMatchObject({ expression: '布団', reading: 'ふとん', meaning: 'Japanese –style mattress and quilt' });
        expect(seeds).toHaveLength(13);
        expect(seeds.map(seed => seed.sourceQuestionId)).toEqual(
            sheet.items.filter(item => item.studyStatus === 'canonical').map(item => item.source.id),
        );

        const pages = sourcePages(input);
        expect(String(pages[0]?.verbatimText)).toContain('Chapter 22-2 Vocabulary Sheet');
        expect(String(pages[0]?.verbatimText)).toContain('6    ユーモア                                             humor');
        expect(String(pages[1]?.verbatimText)).toContain('20   ふとん（布団）');
        expect(String(pages[1]?.verbatimText)).toContain('21\n\n\n22');
        for (const [path, digest] of SOURCE_PAGES) {
            const source = readFileSync(path);
            expect(createHash('sha256').update(source).digest('hex')).toBe(digest);
            expect(readFileSync(`docs/${path}`)).toEqual(source);
            expect(readFileSync('public/academy/sw.js', 'utf8'))
                .toContain(`/${path.replace(/^public\//u, '')}`);
        }
    });

    it('requires the source rows before the varied assessment chapter can begin', async () => {
        const input = lessonPackage();
        const prerequisite = await loadSenseiVocabularyPrerequisite(
            'authored-week:l2-l09',
            committedAuthoredWeekFetcher(getAuthoredWeekRegistration('l2-l09')),
        );
        const onContinue = vi.fn();
        const screen = renderLessonVocabularyPrerequisiteScreen({
            language: 'en',
            prerequisite,
            onContinue,
        });
        document.body.append(screen);
        screen.querySelector<HTMLButtonElement>('[data-vocabulary-prerequisite-open]')!.click();

        expect(screen.dataset.sourceStatus).toBe('exact-source');
        expect(screen.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(20);
        expect(onContinue).not.toHaveBeenCalled();
        screen.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')!.click();
        expect(onContinue).toHaveBeenCalledOnce();

        const sourceComponent = array(record(input).components).map(record)
            .find(component => component.type === 'vocabulary')!;
        expect(array(sourceComponent.exercises).map(record)).toContainEqual(expect.objectContaining({
            kind: 'match',
            curriculumPhase: 'assessed-recognition',
        }));
        const chapter = await loadLessonActivityChapter('l2-l09', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual([
            'academy-particle-signal-mixer',
            'academy-conversation-listening-check',
        ]);
        expect(chapter?.beats[0]?.activity).toMatchObject({
            curriculumPhase: 'assessed-production',
            provenance: { answerVisibility: 'after-attempt' },
            answerSupport: { earnedHintPolicy: 'explicit-after-attempt' },
        });
    });

    it('routes only source-glossed rows through Reader, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l09');
        const supported = sheet.items[15]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'やちん（家賃）',
            reading: 'やちん',
            source: 'fallback',
            fallbackLookupTerms: ['家賃'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('家賃');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('家賃');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[9]!]) {
            const unsupportedSurface = document.createElement('span');
            unsupportedSurface.textContent = unsupported.expression;
            attachLibraryReaderVocabulary(unsupportedSurface, unsupported);
            expect(unsupportedSurface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
            expect(applyAuthoredVocabularyOverrides({
                text: unsupported.expression,
                parent: unsupportedSurface,
            }, [])).toEqual([]);
        }
    });

    it('revisits l2-l09 without duplicating provenance or resetting its schedule', async () => {
        const startedAt = Date.parse('2026-07-16T10:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l09'),
        )[0]!;
        const provenanceId = `academy:study-syllabus:${word.id}`;
        const collect = () => repository.collectAcademyVocabulary({
            expression: word.expression,
            reading: word.reading,
            meanings: [word.meaning],
            provenance: {
                id: provenanceId,
                kind: 'study-encounter' as const,
                sourceId: word.source,
            },
        });

        expect(await collect()).toMatchObject({ cardCreated: true, provenanceAdded: true, provenanceCount: 1 });
        expect(await collect()).toMatchObject({ cardCreated: false, provenanceAdded: false, provenanceCount: 1 });
        const first = (await repository.queue(1)).cards[0]!;
        await repository.review({ card: first, grade: 'good' });
        now += 1;
        expect(await collect()).toMatchObject({ cardCreated: false, provenanceAdded: false, provenanceCount: 1 });
        expect((await repository.queue(1)).cards).toEqual([]);

        now = startedAt + 2 * 86_400_000;
        const revisited = (await repository.queue(1)).cards[0]!;
        expect(revisited).toMatchObject({ dueAt: now, state: ['due'] });
        expect((revisited.raw as { reviews?: number }).reviews).toBe(1);
        expect(Object.keys((revisited.raw as { academyProvenance?: object }).academyProvenance ?? {}))
            .toEqual([provenanceId]);
    });

    it('rejects ownership, row, gloss, page, layout, and provenance mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974656;
        expect(() => exactLibraryVocabularyDefinition('l2-l09', wrongOwner)).toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[0]!)).words = '好き';
        expect(() => exactLibraryVocabularyDefinition('l2-l09', wrongWords))
            .toThrow(/exact source words changed at row 1/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'liked; favourite';
        expect(() => exactLibraryVocabularyDefinition('l2-l09', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[5]!)).meaning = 'humour';
        expect(() => exactLibraryVocabularyDefinition('l2-l09', reframedGloss))
            .toThrow(/exact source meaning changed at row 6/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[1]).sourceItemId = `moodle:${PAYLOAD}:page:1`;
        expect(() => exactLibraryVocabularyDefinition('l2-l09', wrongPage))
            .toThrow(/source-page ownership changed/i);

        const lostLayoutRow = structuredClone(lessonPackage());
        const layout = mutableRecord(vocabularyComponent(lostLayoutRow).preStudyVocabulary);
        const secondPage = mutableRecord(array(layout.sheets)[1]);
        secondPage.verbatimText = String(secondPage.verbatimText).replace('\n21\n', '\n21 invented\n');
        expect(() => exactLibraryVocabularyDefinition('l2-l09', lostLayoutRow))
            .toThrow(/layout-only rows changed/i);

        const relabeledProvenance = structuredClone(lessonPackage());
        const source = mutableRecord(record(vocabularyRows(relabeledProvenance)[5]!).source);
        mutableRecord(source.fieldProvenance).meaning = 'yomu-support';
        expect(() => exactLibraryVocabularyDefinition('l2-l09', relabeledProvenance))
            .toThrow(/field provenance changed at row 6/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/036-l2-l09.json', 'utf8')) as unknown;
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
