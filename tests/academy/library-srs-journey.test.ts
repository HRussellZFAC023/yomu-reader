import {
    createLibraryVocabularySheet,
    createLibraryVocabularySheetFromPackage,
    loadLibraryVocabularySheet,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { createLessonOneSourceVocabularyActivities } from '../../src/academy/content/lesson-one-greeting-worksheet';
import { createLessonTwoSourceVocabularyActivities } from '../../src/academy/content/lesson-two-profile-board';
import { createLessonSixSourceVocabularyActivities } from '../../src/academy/content/lesson-six-place-and-owner';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardIdentity } from '../../src/reader/srs/shared';
import { readFileSync } from 'node:fs';

describe('Library source sheet to SRS journey', () => {
    beforeEach(() => localStorage.clear());

    it('projects one complete teacher sheet without collapsing source cells into Yomu support', () => {
        const sourceRows = createLessonOneSourceVocabularyActivities();
        const sheet = createLibraryVocabularySheet();

        expect(sheet).toMatchObject({
            id: 'l1-l01:sensei-chapter-1-1-vocabulary',
            title: 'Chapter 1-1 Vocabulary Sheet',
        });
        expect(sheet.items).toHaveLength(27);
        expect(sheet.items.map(item => item.source.id)).toEqual(sourceRows.map(row => row.sourceQuestionId));
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual(
            sourceRows.map(row => [row.provenance.locus.page, row.provenance.locus.row]),
        );
        expect(sheet.items.map(item => item.sourcePronunciation)).toEqual(
            sourceRows.map(row => row.payload.exact.pronunciation),
        );
        expect(sheet.items.map(item => item.sourceMeaning)).toEqual(
            sourceRows.map(row => row.payload.exact.meaning),
        );
        expect(sheet.items.map(item => item.fieldProvenance)).toEqual(
            sourceRows.map(row => row.payload.fieldProvenance),
        );
        expect(Object.isFrozen(sheet)).toBe(true);
        expect(Object.isFrozen(sheet.items)).toBe(true);
        expect(Object.isFrozen(sheet.items[0])).toBe(true);
    });

    it('hands support fields to Study with stable row provenance and no due date', () => {
        const sheet = createLibraryVocabularySheet();
        const study = libraryStudyVocabulary(sheet);
        const sourceRows = createLessonOneSourceVocabularyActivities();

        expect(study).toHaveLength(sheet.items.length);
        expect(study[0]).toEqual({
            id: sourceRows[0].id,
            expression: sourceRows[0].payload.support.words,
            meaning: sourceRows[0].payload.exact.meaning,
            source: sourceRows[0].sourceQuestionId,
            audioAvailable: true,
        });
        expect(study.every(item => !('dueAt' in item))).toBe(true);
    });

    it('projects pre-study seeds with the same source-row identity as the playable sheet activities', () => {
        const sourceRows = createLessonOneSourceVocabularyActivities();
        const seeds = libraryVocabularyReviewSeeds(createLibraryVocabularySheet());

        expect(seeds).toHaveLength(sourceRows.length);
        expect(seeds.map(seed => seed.id)).toEqual(sourceRows.map(row =>
            `review:${row.provenance.packageId}:${row.provenance.componentId}:p${row.provenance.locus.page}:r${row.provenance.locus.row}`));
        expect(seeds.map(seed => seed.conceptId)).toEqual(sourceRows.map(row => row.conceptIds[0]));
        expect(seeds.map(seed => seed.sourceQuestionId)).toEqual(sourceRows.map(row => row.sourceQuestionId));
    });

    it.each([
        ['l1-l02', createLessonTwoSourceVocabularyActivities],
        ['l1-l06', createLessonSixSourceVocabularyActivities],
    ] as const)('projects the revisited %s sheet in its exact source order', (lessonId, sourceRows) => {
        const rows = sourceRows();
        const sheet = createLibraryVocabularySheet(rows);

        expect(sheet.lessonId).toBe(lessonId);
        expect(sheet.sourceStatus).toBe('exact-source');
        expect(sheet.items.map(item => item.source.id)).toEqual(rows.map(row => row.sourceQuestionId));
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual(
            rows.map(row => [row.provenance.locus.page, row.provenance.locus.row]),
        );
        expect(libraryStudyVocabulary(sheet).every(item => !('dueAt' in item))).toBe(true);
    });

    it('projects a later lesson shard without sorting or replacing exact source cells', () => {
        const input = JSON.parse(readFileSync('public/academy/content/lessons/008-l1-l07.json', 'utf8')) as unknown;
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l1-l07');
        const vocabulary = (input as { components: Array<{ type: string; items?: Array<{ source: { itemId: string; exact: { words: string } } }> }> })
            .components.find(component => component.type === 'vocabulary')!;

        expect(sheet).toMatchObject({ lessonId: 'l1-l07', sourceStatus: 'exact-source' });
        expect(sheet.items).toHaveLength(28);
        expect(sheet.items.map(item => item.source.id)).toEqual(vocabulary.items?.map(item => item.source.itemId));
        expect(sheet.items.map(item => item.expression)).toEqual(vocabulary.items?.map(item => item.source.exact.words));
    });

    it('loads and validates only the requested later lesson shard', async () => {
        const input = JSON.parse(readFileSync('public/academy/content/lessons/008-l1-l07.json', 'utf8')) as unknown;
        const fetcher = vi.fn(async () => ({ ok: true, json: async () => input }) as Response);

        const sheet = await loadLibraryVocabularySheet('authored-week:l1-l07', fetcher as typeof fetch);

        expect(fetcher).toHaveBeenCalledWith('/academy/content/lessons/008-l1-l07.json');
        expect(sheet).toMatchObject({ lessonId: 'l1-l07', sourceStatus: 'exact-source' });
    });

    it('rejects an accidental reorder instead of silently sorting teacher rows', () => {
        const rows = [...createLessonTwoSourceVocabularyActivities()];
        [rows[0], rows[1]] = [rows[1]!, rows[0]!];

        expect(() => createLibraryVocabularySheet(rows)).toThrow(/exact source order/);
    });

    it('projects the fourteen exact Sensei Chapter 19-1 rows into the current library sheet', () => {
        const input = JSON.parse(readFileSync('public/academy/content/lessons/029-l2-l02.json', 'utf8')) as unknown;
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l02');

        expect(sheet).toMatchObject({ lessonId: 'l2-l02', sourceStatus: 'exact-source' });
        expect(sheet.items).toHaveLength(14);
        expect(sheet.items.map(item => item.expression)).toEqual([
            'のぼります（登ります）', 'のぼります（上ります）', 'とまります（泊まります）', 'かぶき（歌舞伎）', 'すもう（相撲）', 'なっとう（納豆）',
            'いちど（一度）', 'いっかい（一回）', 'いちども 〜ない（一度も 〜ない）', 'いっかいも 〜ない（一回も 〜ない）', 'ぜひ', 'はじめて（初めて）', 'なんども（何度も）', 'なんかいも（何回も）',
        ]);
        expect(sheet.items.slice(0, 6).every(item => item.studyStatus === 'quarantined-source-gap')).toBe(true);
        expect(libraryStudyVocabulary(sheet)).toHaveLength(8);
    });

    it.each([
        ['l2-l03', '030-l2-l03.json', 20, 9, 'そうじ（掃除）', '日', 'ひ', 'day, date'],
        ['l2-l04', '031-l2-l04.json', 29, 15, '（ビザが）いります（要ります）', '要る', 'いる', 'need, require (a visa)'],
        ['l2-l05', '032-l2-l05.json', 19, 11, '(ビザが)いります（要ります）', '要る', 'いる', 'need, require (a visa)'],
        ['l2-l06', '033-l2-l06.json', 35, 18, 'おもいます（思います）', '最近', 'さいきん', 'recently, these days'],
        ['l2-l07', '034-l2-l07.json', 15, 1, 'こうつう（交通）', '動く', 'うごく', 'to move'],
        ['l2-l08', '035-l2-l08.json', 18, 1, 'きょうかしょ（教科書）', 'よく', undefined, 'often'],
        ['l2-l09', '036-l2-l09.json', 20, 13, 'すきな（好きな）', 'ユーモア', undefined, 'humor'],
    ] as const)(
        'keeps %s source vocabulary exact while handing Study a dictionary-facing surface',
        (lessonId, filename, count, studyCount, exactFirst, studyFirst, reading, meaning) => {
            const input = JSON.parse(readFileSync(`public/academy/content/lessons/${filename}`, 'utf8')) as unknown;
            const sheet = createLibraryVocabularySheetFromPackage(input, lessonId);
            const study = libraryStudyVocabulary(sheet);
            const seeds = libraryVocabularyReviewSeeds(sheet);

            expect(sheet).toMatchObject({ lessonId, sourceStatus: 'exact-source' });
            expect(sheet.items).toHaveLength(count);
            expect(sheet.items[0]?.expression).toBe(exactFirst);
            expect(study).toHaveLength(studyCount);
            expect(study[0]).toMatchObject({ expression: studyFirst, meaning });
            if (reading) expect(study[0]?.reading).toBe(reading);
            else expect(study[0]).not.toHaveProperty('reading');
            expect(seeds).toHaveLength(studyCount);
            expect(seeds[0]?.content.expression).toBe(studyFirst);
            expect(seeds.every(seed => seed.reason === 'new-learning')).toBe(true);
            expect(seeds.every(seed => seed.sourceQuestionId?.startsWith('moodle-vocabulary:'))).toBe(true);
            expect(seeds.every(seed => seed.content.sentence === undefined)).toBe(true);
        },
    );

    it('keeps the l2-l07 source typo in preview while Study receives its lemma, reading, and definition', () => {
        const input = JSON.parse(readFileSync('public/academy/content/lessons/034-l2-l07.json', 'utf8')) as {
            components: Array<{ type: string; preStudyVocabulary?: { sheets: Array<{ verbatimText: string }> } }>;
        };
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l07');
        const sourceRow = sheet.items[8]!;
        const studyRow = libraryStudyVocabulary(sheet)[0]!;
        const previewCells = sheet.items.map(item => item.expression);
        const verbatimPage = input.components.find(component => component.type === 'vocabulary')
            ?.preStudyVocabulary?.sheets[0]?.verbatimText ?? '';

        expect(previewCells).toEqual([
            'こうつう（交通）', 'いいます（⾔います）', 'りゅうがくします（留学します）', 'ゆめ（夢）',
            'てんさい（天才）', 'ちきゅう（地球）', 'つき（⽉）', 'じどうしゃ（⾃動⾞）',
            'うごきま（動きます）', 'ほうそう（放送）', 'おやしらず（親知らず）', 'ぬきます（抜きます）',
            'ぎおんまつり（祇園祭）', 'はも りょうり（鱧 料理）', 'よしのやま（吉野⼭）',
        ]);
        for (const previewCell of previewCells) {
            expect(verbatimPage.replace(/\s/gu, ''), previewCell).toContain(previewCell.replace(/\s/gu, ''));
        }

        expect(sourceRow).toMatchObject({
            expression: 'うごきま（動きます）',
            sourceMeaning: 'to move',
            source: { page: 1, row: 9 },
        });
        expect(studyRow).toMatchObject({ expression: '動く', reading: 'うごく', meaning: 'to move' });
        expect(libraryVocabularyReviewSeeds(sheet)[0]?.content)
            .toEqual({ expression: '動く', reading: 'うごく', meanings: ['to move'] });
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap'))
            .toHaveLength(14);
    });

    it('keeps the l2-l08 preview verbatim and quarantines rows without source glosses', () => {
        const input = JSON.parse(readFileSync('public/academy/content/lessons/035-l2-l08.json', 'utf8')) as {
            components: Array<{ type: string; preStudyVocabulary?: { sheets: Array<{ verbatimText: string }> } }>;
        };
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l08');
        const previewCells = sheet.items.map(item => item.expression);
        const study = libraryStudyVocabulary(sheet);
        const verbatimPage = input.components.find(component => component.type === 'vocabulary')
            ?.preStudyVocabulary?.sheets[0]?.verbatimText ?? '';

        expect(previewCells).toEqual([
            'きょうかしょ（教科書）', 'ケーキ', 'コート', 'セーター', 'スーツ', 'ドレス',
            'きます（着ます）', 'ずぼん', 'はきます（履きます）', 'ぼうし（帽子）',
            'かぶります（被ります）', 'めがね（眼鏡）', 'かけます（掛けます）',
            '[ネクタイを]します', 'うまれます（生まれます）', 'おべんとう（お弁当）', 'わたしたち', 'よく',
        ]);
        for (const previewCell of previewCells.filter((_, index) => index !== 0 && index !== 14)) {
            expect(verbatimPage.replace(/\s/gu, ''), previewCell).toContain(previewCell.replace(/\s/gu, ''));
        }
        expect(verbatimPage).toContain('きょうかしょ\n1\n     （教科書）');
        expect(verbatimPage).toContain('うまれます\n15\n     （生まれます）');
        expect(sheet.items.map(item => [item.studyExpression, item.reading, item.studyMeaning])).toEqual([
            ['教科書', 'きょうかしょ', 'textbook'], ['ケーキ', 'ケーキ', 'cake'], ['コート', 'コート', 'coat'],
            ['セーター', 'セーター', 'sweater'], ['スーツ', 'スーツ', 'suit'], ['ドレス', 'ドレス', 'dress'],
            ['着る', 'きる', 'to wear; to put on (upper body)'], ['ズボン', 'ズボン', 'trousers; pants'],
            ['履く', 'はく', 'to wear; to put on (lower body)'], ['帽子', 'ぼうし', 'hat; cap'],
            ['被る', 'かぶる', 'to wear; to put on (head)'], ['眼鏡', 'めがね', 'glasses'],
            ['掛ける', 'かける', 'to wear; to put on (glasses)'],
            ['ネクタイをする', 'ネクタイをする', 'to wear a tie'], ['生まれる', 'うまれる', 'to be born'],
            ['お弁当', 'おべんとう', 'boxed lunch'], ['私たち', 'わたしたち', 'we; us'], ['よく', 'よく', 'often'],
        ]);
        expect(study.map(item => item.expression)).toEqual(['よく']);
        expect(sheet.items.slice(0, -1).every(item => item.studyStatus === 'quarantined-source-gap')).toBe(true);
        expect(sheet.items.slice(0, -1).every(item => item.sourceMeaning === null)).toBe(true);
        expect(sheet.items.at(-1)?.sourceMeaning).toBe('often');
        expect(libraryVocabularyReviewSeeds(sheet)).toHaveLength(1);
        expect(libraryVocabularyReviewSeeds(sheet).every(seed =>
            seed.reason === 'new-learning'
            && seed.sourceQuestionId?.startsWith('moodle-vocabulary:')
            && seed.content.sentence === undefined)).toBe(true);
    });

    it('keeps the l2-l09 two-page preview verbatim and hands Study separate lemmas, readings, and definitions', () => {
        const input = JSON.parse(readFileSync('public/academy/content/lessons/036-l2-l09.json', 'utf8')) as {
            components: Array<{ type: string; preStudyVocabulary?: { sheets: Array<{ page: number; verbatimText: string }> } }>;
        };
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l09');
        const previewCells = sheet.items.map(item => item.expression);
        const study = libraryStudyVocabulary(sheet);
        const pages = input.components.find(component => component.type === 'vocabulary')
            ?.preStudyVocabulary?.sheets ?? [];

        expect(previewCells).toEqual([
            'すきな（好きな）', 'ほしい（欲しい）', 'わかります', 'いります（要ります）', 'ロボット',
            'ユーモア', 'つごう（都合）', 'つごうが わるい（都合が悪い）', 'せいじんしき（成人式）',
            'せいじん（成人）', 'おめでとう ございます', 'しょうらい（将来）',
            'おさがしですか。（お探しですか）', 'では、', 'こちら', 'やちん（家賃）',
            'ダイニングキッチン', 'わしつ（和室）', 'おしいれ（押し入れ）', 'ふとん（布団）',
        ]);
        for (const item of sheet.items.filter((_, index) => ![7, 8, 10, 12].includes(index))) {
            const verbatimPage = pages.find(page => page.page === item.source.page)?.verbatimText ?? '';
            expect(verbatimPage.replace(/\s/gu, ''), item.expression)
                .toContain(item.expression.replace(/\s/gu, ''));
        }
        const pageOne = pages.find(page => page.page === 1)?.verbatimText ?? '';
        expect(pageOne).toContain('つごうが わるい');
        expect(pageOne).toContain('（都合が悪い）');
        expect(pageOne).toContain('せいじんしき');
        expect(pageOne).toContain('（成人式）');
        expect(pageOne).toContain('おめでとう');
        expect(pageOne).toContain('ございます');
        expect(pageOne).toContain('おさがしですか。');
        expect(pageOne).toContain('（お探しですか）');
        expect(sheet.items.map(item => [item.studyExpression, item.reading, item.studyMeaning])).toEqual([
            ['好き', 'すき', 'liked; favourite'], ['欲しい', 'ほしい', 'wanted; desired'],
            ['分かる', 'わかる', 'to understand'], ['要る', 'いる', 'to need; to require'],
            ['ロボット', 'ロボット', 'robot'], ['ユーモア', 'ユーモア', 'humor'],
            ['都合', 'つごう', 'personal reasons, one’s\nconvenience'],
            ['都合が悪い', 'つごうがわるい', 'inconvenient, bad day/time and\netc (it depends on context)'],
            ['成人式', 'せいじんしき', 'coming-of-age ceremony'], ['成人', 'せいじん', 'adult'],
            ['おめでとうございます', 'おめでとうございます', 'Congratulations (used on\nbirthdays, at weddings, New\nYear’s Day, etc)'],
            ['将来', 'しょうらい', 'the future, times/days to come'],
            ['探す', 'さがす', 'Are you looking for 〜？'], ['では', 'では', 'Well then,'],
            ['こちら', 'こちら', 'this (polite equivalent of これ)'], ['家賃', 'やちん', 'rent'],
            ['ダイニングキッチン', 'ダイニングキッチン', 'kitchen with a dining area'],
            ['和室', 'わしつ', 'Japanese –style room'], ['押し入れ', 'おしいれ', 'Japanese –style closet'],
            ['布団', 'ふとん', 'Japanese –style mattress and quilt'],
        ]);
        expect(study.map(item => [item.expression, item.reading ?? item.expression, item.meaning]))
            .toEqual(sheet.items
                .filter(item => item.studyStatus === 'canonical')
                .map(item => [item.studyExpression, item.reading, item.sourceMeaning]));
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap')
            .map(item => item.source.row)).toEqual([1, 2, 3, 4, 5, 9, 10]);
        expect(sheet.items.map(item => item.sourceMeaning !== null)).toEqual([
            false, false, false, false, false, true, true, true, false, false,
            true, true, true, true, true, true, true, true, true, true,
        ]);
        expect(libraryVocabularyReviewSeeds(sheet)).toHaveLength(13);
        expect(libraryVocabularyReviewSeeds(sheet).every(seed =>
            seed.reason === 'new-learning'
            && seed.sourceQuestionId?.startsWith('moodle-vocabulary:')
            && seed.content.sentence === undefined)).toBe(true);
    });

    it('lets the repository schedule the next retrieval and never resets it on sheet re-entry', async () => {
        let now = Date.parse('2026-07-15T08:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const first = libraryStudyVocabulary(createLibraryVocabularySheet())[0]!;
        const identity = canonicalStudyCardIdentity(first.expression, first.reading);
        const collect = () => repository.collectAcademyVocabulary({
            expression: first.expression,
            reading: first.reading,
            meanings: [first.meaning],
            provenance: {
                id: `academy:study-syllabus:${first.id}`,
                kind: 'study-encounter',
                sourceId: first.source,
            },
        });

        await collect();
        const card = (await repository.queue(1)).cards[0]!;
        expect(card).toMatchObject({ expression: identity.expression, dueAt: now, state: ['new'] });

        await repository.review({ card, grade: 'good' });
        now += 1;
        await collect();
        expect((await repository.queue(1)).cards).toEqual([]);

        now += 2 * 86_400_000 - 1;
        const next = (await repository.queue(1)).cards[0]!;
        expect(next).toMatchObject({ expression: identity.expression, state: ['due'] });
        expect(next.dueAt).toBe(Date.parse('2026-07-17T08:00:00.000Z'));
        expect(Object.keys((next.raw as { academyProvenance?: object }).academyProvenance ?? {})).toEqual([
            `academy:study-syllabus:${first.id}`,
        ]);
    });
});
