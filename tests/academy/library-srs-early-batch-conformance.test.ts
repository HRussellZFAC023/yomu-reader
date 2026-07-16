import { readFileSync } from 'node:fs';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import {
    EARLY_LIBRARY_VOCABULARY_PACKAGE_IDS,
    earlyLibraryVocabularyStudyDefinition,
} from '../../src/academy/content/lesson-8-10-library-vocabulary';
import { attachLibraryReaderVocabulary } from '../../src/academy/integration/library-reader-vocabulary';
import { validateSenseiVocabularyLinkage } from '../../src/academy/content/lesson-vocabulary-prerequisite';
import { transitionAcademyRoute } from '../../src/academy/routing/route-history';
import {
    applyAuthoredVocabularyOverrides,
    AUTHORED_VOCABULARY_ATTRIBUTE,
} from '../../src/reader/lookup/authored-vocabulary';
import { fallbackLookupTermsForCard } from '../../src/reader/lookup/japanese-segments';
import { publicLookupFallbackCards } from '../../src/reader/lookup/public-fallback-cards';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';

vi.mock('../../src/academy/content/lesson-content-registry', () => ({
    ACADEMY_LESSON_CONTENT_REGISTRY: [],
    getAuthoredWeekRegistration: vi.fn(),
}));

const L1_L15_PREVIEW_ROWS = [
    '*review こうえん', '*review はな', 'き', 'ベンチ', 'ふんすい', 'ATM', 'コンビニ', 'ポスト', 'ビル',
    '*review うけつけ', '*review\nおてあらい／トイレ', 'ちゅうしゃじょう', 'きっさてん', 'ほんや',
    'さかなや', '〜や', 'おとこのこ', 'おんなのこ', 'おとこのひと', 'おんなのひと', 'ねこ', 'いぬ',
    'どうぶつえん', 'パンダ', 'ぞう', 'きりん', 'ライオン', '〜が', 'あります', 'います', '*review ここ',
    '*review そこ', '*review あそこ', '〜かい／〜がい', '〜に',
] as const;

const L1_L15_STUDY_ROWS = [
    ['公園', 'こうえん', 'park'], ['花', 'はな', 'flower'], ['木', 'き', 'tree'],
    ['ベンチ', 'ベンチ', 'bench'], ['噴水', 'ふんすい', 'fountain'], ['ATM', 'エーティーエム', 'ATM'],
    ['コンビニ', 'コンビニ', 'convenience store'], ['ポスト', 'ポスト', 'postbox'],
    ['ビル', 'ビル', 'building'], ['受付', 'うけつけ', 'reception desk'],
    ['お手洗い', 'おてあらい', 'restroom; toilet'], ['駐車場', 'ちゅうしゃじょう', 'car park'],
    ['喫茶店', 'きっさてん', 'coffee shop; Japanese-style cafe'], ['本屋', 'ほんや', 'bookshop'],
    ['魚屋', 'さかなや', 'fish shop'], ['屋', 'や', 'shop; store suffix'],
    ['男の子', 'おとこのこ', 'boy'], ['女の子', 'おんなのこ', 'girl'],
    ['男の人', 'おとこのひと', 'man'], ['女の人', 'おんなのひと', 'woman'],
    ['猫', 'ねこ', 'cat'], ['犬', 'いぬ', 'dog'], ['動物園', 'どうぶつえん', 'zoo'],
    ['パンダ', 'パンダ', 'panda'], ['象', 'ぞう', 'elephant'], ['キリン', 'キリン', 'giraffe'],
    ['ライオン', 'ライオン', 'lion'], ['が', 'が', 'subject marker'],
    ['ある', 'ある', 'to exist; to be (inanimate)'], ['いる', 'いる', 'to exist; to be (animate)'],
    ['ここ', 'ここ', 'here'], ['そこ', 'そこ', 'there (near the listener)'], ['あそこ', 'あそこ', 'over there'],
    ['階', 'かい', 'floor; storey'], ['に', 'に', 'in; at (place of existence)'],
] as const;

const L1_L16_PREVIEW_ROWS = [
    '(お)てら', 'Noun 1 と Noun 2', 'Noun 1 や Noun 2 (など)', 'スイッチ',
    '*review\nじどうはんばいき', 'いろいろな', 'もの', '*review へや', '*review にわ',
    '(どうも) すみません', 'コーナー', 'いちばん した',
] as const;

const L1_L16_STUDY_ROWS = [
    ['寺', 'てら', 'temple'], ['と', 'と', 'and (complete list)'],
    ['や', 'や', 'and; among other things'], ['スイッチ', 'スイッチ', 'switch'],
    ['自動販売機', 'じどうはんばいき', 'vending machine'], ['色々', 'いろいろ', 'various; all sorts'],
    ['物', 'もの', 'thing; object; material'], ['部屋', 'へや', 'room'], ['庭', 'にわ', 'garden'],
    ['すみません', 'すみません', 'excuse me; thank you'],
    ['コーナー', 'コーナー', 'corner; section'], ['一番下', 'いちばんした', 'the bottom'],
] as const;

const L1_L18_PREVIEW_ROWS = [
    '*review りんご', 'みかん', 'サンドイッチ', 'カレーライス', 'アイスクリーム', 'えだまめ',
    'なまビール', 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ',
    'ここのつ', 'とお', '〜こ', 'きって', 'はがき', 'ふうとう', '〜まい', '〜だい', 'ひとり', 'ふたり',
    '〜にん', '〜ほん／ぽん／ぼん', '〜ひき／ぴき／びき', 'いちご', 'メニュー', 'ていしょく',
    'ちゅうもん', 'ちゅうもんします', '*review\n〜を みせてください', '*review\n〜を ください',
    '〜を おねがいします', '*review\nいらっしゃいませ', 'かしこまりました',
    'しょうしょう\nおまちください',
] as const;

const L1_L19_PREVIEW_ROWS = [
    'がいこく', 'りゅうがくせい', 'ぜんぶで、〜', '〜だけ', 'みんな', 'おや', 'りょうしん', 'きょうだい',
    'います', '〜じかん', '〜ふん／ぷん', '〜にち', '〜しゅうかん', '〜かげつ', '〜ねん', '〜かい（〜回）',
    '〜ぐらい', 'どのくらい', 'かかります', 'いい (お)てんき ですね。', 'おでかけ ですか。',
    'ちょっと 〜まで。', 'いってらっしゃい。', 'いってきます。', 'ふなびん', 'こうくうびん',
    'エアメール', 'そくたつ', 'かきとめ',
] as const;

const CASES = [
    {
        packageId: 'l1-l08',
        filename: '009-l1-l08.json',
        studyExpressions: [
            '復習', '時', '分', '半', '今', 'どういたしまして', '朝', '昼', '夜', '午前', '午後', '仕事',
            'パーティ', '試験', '会議', '休み', '昼休み', 'から', 'まで', '郵便局', '図書館', '美術館',
            'レストラン', '映画',
        ],
    },
    {
        packageId: 'l1-l09',
        filename: '010-l1-l09.json',
        studyExpressions: [
            '復習', 'ご飯', '朝ご飯', '晩ご飯', '昼ご飯', 'カレンダー', '何曜日', 'と', '電話', '番号',
            '電話番号', '何番',
        ],
    },
    {
        packageId: 'l1-l10',
        filename: '011-l1-l10.json',
        studyExpressions: [
            '今朝', '今晩', '毎朝', '毎日', '毎晩', '起きる', '寝る', '働く', '休む', '勉強する', '終わる',
            'に', 'ます',
        ],
    },
    {
        packageId: 'l1-l15',
        filename: '016-l1-l15.json',
        studyExpressions: L1_L15_STUDY_ROWS.map(([expression]) => expression),
    },
    {
        packageId: 'l1-l16',
        filename: '017-l1-l16.json',
        studyExpressions: L1_L16_STUDY_ROWS.map(([expression]) => expression),
    },
] as const;

describe('Library SRS exact linkage for the delivered early source-sheet boundaries', () => {
    beforeEach(() => localStorage.clear());

    it('claims the l1-l19 owner without claiming no-sheet or carry-forward lessons', () => {
        expect(EARLY_LIBRARY_VOCABULARY_PACKAGE_IDS)
            .toEqual(['l1-l08', 'l1-l09', 'l1-l10', 'l1-l15', 'l1-l16', 'l1-l18', 'l1-l19']);
        expect(EARLY_LIBRARY_VOCABULARY_PACKAGE_IDS).not.toEqual(expect.arrayContaining([
            'l1-l11', 'l1-l12', 'l1-l13', 'l1-l14', 'l1-l17', 'l1-l20',
        ]));
    });

    it.each(CASES)('keeps $packageId preview rows verbatim while Study receives separate lemmas', testCase => {
        const input = lessonPackage(testCase.filename);
        const sheet = createLibraryVocabularySheetFromPackage(input, testCase.packageId);
        const sourceRows = vocabularyRows(input, sheet.sourceId);
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(sheet).toMatchObject({ lessonId: testCase.packageId, sourceStatus: 'exact-source' });
        expect(sheet.items.map(item => item.expression)).toEqual(sourceRows.map(row => sourceExact(row).words));
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual(
            sourceRows.map(row => {
                const locus = record(record(row.source).locus);
                return [locus.page, locus.row];
            }),
        );
        expect(sheet.items.map(item => item.source.id)).toEqual(sourceRows.map(row => record(row.source).itemId));
        expect(sheet.items.map(item => item.studyExpression)).toEqual(testCase.studyExpressions);
        expect(study.map(item => [item.expression, item.reading ?? item.expression, item.meaning])).toEqual(
            sheet.items.map(item => [item.studyExpression, item.reading, item.studyMeaning]),
        );

        expect(seeds).toHaveLength(sourceRows.length);
        expect(seeds.map(seed => seed.sourceQuestionId)).toEqual(sheet.items.map(item => item.source.id));
        expect(seeds.map(seed => seed.content)).toEqual(sheet.items.map(item => ({
            expression: item.studyExpression,
            ...(item.reading !== item.studyExpression ? { reading: item.reading } : {}),
            meanings: [item.studyMeaning],
        })));
        expect(seeds.every(seed => seed.reason === 'new-learning' && seed.content.sentence === undefined)).toBe(true);
    });

    it('pins every l1-l15 preview cell and its separate canonical Study triple', () => {
        const input = lessonPackage('016-l1-l15.json');
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l1-l15');
        const sourceRows = vocabularyRows(input, sheet.sourceId);

        expect(sheet.items.map(item => item.expression)).toEqual(L1_L15_PREVIEW_ROWS);
        expect(sheet.items.map(item => [item.expression, item.sourcePronunciation, item.sourceMeaning])).toEqual(
            sourceRows.map(row => {
                const exact = sourceExact(row);
                return [exact.words, exact.pronunciation, exact.meaning];
            }),
        );
        expect(sheet.items.map(item => [item.studyExpression, item.reading, item.studyMeaning]))
            .toEqual(L1_L15_STUDY_ROWS);
        expect(libraryStudyVocabulary(sheet).map(item => [
            item.expression,
            item.reading ?? item.expression,
            item.meaning,
        ])).toEqual(L1_L15_STUDY_ROWS);
    });

    it('pins l1-l16 to the owner sheet, preserves blank-row evidence, and seeds only populated rows', () => {
        const input = lessonPackage('017-l1-l16.json');
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l1-l16');
        const sourceRows = vocabularyRows(input, sheet.sourceId);
        const sourceComponent = vocabularyComponent(input, sheet.sourceId);

        expect(sheet).toMatchObject({
            lessonId: 'l1-l16',
            title: 'New Chapter 10-2 Vocabulary Sheet',
            sourceId: 'moodle-vocabulary:5881257:51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751',
            sourceStatus: 'exact-source',
        });
        expect(sheet.sourceId).not.toContain('63e1f0563379b1550fea069feffa761877b504e9af2eca22f2054d4cc7aa9495');
        expect(record(sourceComponent.provenance).sourceBlankRows).toEqual([13, 14, 15, 16]);
        expect(sheet.items.map(item => item.expression)).toEqual(L1_L16_PREVIEW_ROWS);
        expect(sheet.items.map(item => [item.expression, item.sourcePronunciation, item.sourceMeaning])).toEqual(
            sourceRows.map(row => {
                const exact = sourceExact(row);
                return [exact.words, exact.pronunciation, exact.meaning];
            }),
        );
        expect(sheet.items.map(item => [item.studyExpression, item.reading, item.studyMeaning]))
            .toEqual(L1_L16_STUDY_ROWS);
        expect(libraryVocabularyReviewSeeds(sheet)).toHaveLength(12);
        expect(libraryVocabularyReviewSeeds(sheet).map(seed => seed.sourceQuestionId))
            .toEqual(sourceRows.map(row => record(row.source).itemId));
    });

    it('pins all l1-l18 source rows while keeping blank cells and layout-only text out of canonical cards', () => {
        const input = lessonPackage('019-l1-l18.json');
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l1-l18');
        const sourceRows = vocabularyRows(input, sheet.sourceId);
        const component = vocabularyComponent(input, sheet.sourceId);
        const provenance = record(component.provenance);
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(sheet).toMatchObject({
            lessonId: 'l1-l18',
            title: 'New Chapter 11-1 Vocabulary Sheet',
            sourceId: 'moodle-vocabulary:6200250:446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6',
            sourceStatus: 'exact-source',
        });
        expect(provenance.orderedRows).toEqual([1, 39]);
        expect(provenance.sourceBlankRows).toBeUndefined();
        expect(sheet.items).toHaveLength(39);
        expect(sheet.items.map(item => item.expression)).toEqual(L1_L18_PREVIEW_ROWS);
        expect(sheet.items.map(item => item.expression)).toEqual(sourceRows.map(row => sourceExact(row).words));
        expect(sheet.items.filter(item => item.sourcePronunciation === null)).toHaveLength(33);
        expect(sheet.items.filter(item => item.sourceMeaning === null)).toHaveLength(31);

        expect(sheet.items[0]).toMatchObject({ expression: '*review りんご', studyExpression: 'りんご' });
        expect(sheet.items[33]).toMatchObject({
            expression: '*review\n〜を みせてください',
            studyExpression: '〜を みせてください',
        });
        expect(sheet.items[38]).toMatchObject({
            expression: 'しょうしょう\nおまちください',
            studyExpression: 'しょうしょう おまちください',
        });
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual([
            ...Array.from({ length: 20 }, (_, index) => [1, index + 1]),
            ...Array.from({ length: 19 }, (_, index) => [2, index + 21]),
        ]);

        expect(sheet.items[21]).toMatchObject({
            expression: '〜まい',
            studyExpression: '〜まい',
            sourceMeaning: 'a counter suffix for small things',
            studyMeaning: 'a counter suffix for small things',
            studyStatus: 'quarantined-source-ambiguity',
        });
        expect(study).toHaveLength(38);
        expect(seeds).toHaveLength(38);
        expect(study.map(item => item.source)).not.toContain(sheet.items[21]!.source.id);
        expect(seeds.map(seed => seed.sourceQuestionId)).not.toContain(sheet.items[21]!.source.id);
    });

    it('pins the l1-l19 owner rows, preserves blank row 30, and quarantines the ambiguous います gloss', () => {
        const input = lessonPackage('020-l1-l19.json');
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l1-l19');
        const sourceRows = vocabularyRows(input, sheet.sourceId);
        const provenance = record(vocabularyComponent(input, sheet.sourceId).provenance);
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(sheet).toMatchObject({
            lessonId: 'l1-l19',
            title: 'Chapter 11-2,3 Vocabulary Sheet',
            sourceId: 'moodle-vocabulary:6223185:9dff734cc9ce3542b9e8356f989eb38d59fa7ec4875630ad19b646f9e7474400',
            sourceStatus: 'exact-source',
        });
        expect(provenance.orderedRows).toEqual([1, 29]);
        expect(provenance.sourceBlankRows).toEqual([30]);
        expect(sheet.items).toHaveLength(29);
        expect(sheet.items.map(item => item.expression)).toEqual(L1_L19_PREVIEW_ROWS);
        expect(sheet.items.map(item => [item.expression, item.sourcePronunciation, item.sourceMeaning])).toEqual(
            sourceRows.map(row => {
                const exact = sourceExact(row);
                return [exact.words, exact.pronunciation, exact.meaning];
            }),
        );
        expect(sheet.items[8]).toMatchObject({
            expression: 'います',
            studyExpression: 'いる',
            sourceMeaning: 'I have',
            studyStatus: 'quarantined-source-ambiguity',
        });
        expect(study).toHaveLength(28);
        expect(seeds).toHaveLength(28);
        expect(study.map(item => item.source)).not.toContain(sheet.items[8]!.source.id);
        expect(seeds.map(seed => seed.sourceQuestionId)).not.toContain(sheet.items[8]!.source.id);
    });

    it('keeps a polite source row visible while Reader fallback targets its dictionary lemma', () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('011-l1-l10.json'), 'l1-l10');
        const word = sheet.items[5]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);

        expect(word).toMatchObject({
            expression: 'おきます',
            studyExpression: '起きる',
            reading: 'おきる',
            studyMeaning: 'get up / wake up',
        });
        expect(surface.getAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(JSON.stringify([{
            surface: 'おきます', lemma: '起きる', reading: 'おきる',
        }]));

        const [token] = applyAuthoredVocabularyOverrides({ text: 'おきます', parent: surface }, []);
        expect(token?.card).toMatchObject({
            spelling: 'おきます',
            reading: 'おきる',
            source: 'fallback',
            fallbackLookupTerms: ['起きる'],
            meanings: [],
            pitchAccent: [],
        });

        const session = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        });
        const steps = session.steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);
    });

    it('carries an l1-l15 review row through dictionary and Jiten fallback', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('016-l1-l15.json'), 'l1-l15');
        const word = sheet.items[0]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);
        const [token] = applyAuthoredVocabularyOverrides({ text: word.expression, parent: surface }, []);

        expect(word).toMatchObject({
            expression: '*review こうえん',
            studyExpression: '公園',
            reading: 'こうえん',
            studyMeaning: 'park',
        });
        expect(token?.card).toMatchObject({
            spelling: '*review こうえん',
            reading: 'こうえん',
            source: 'fallback',
            fallbackLookupTerms: ['公園'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('公園');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('公園');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);
    });

    it('carries an l1-l16 review row through dictionary, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('017-l1-l16.json'), 'l1-l16');
        const word = sheet.items[4]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);
        const [token] = applyAuthoredVocabularyOverrides({ text: word.expression, parent: surface }, []);

        expect(word).toMatchObject({
            expression: '*review\nじどうはんばいき',
            studyExpression: '自動販売機',
            reading: 'じどうはんばいき',
            studyMeaning: 'vending machine',
        });
        expect(token?.card).toMatchObject({
            spelling: '*review\nじどうはんばいき',
            reading: 'じどうはんばいき',
            source: 'fallback',
            fallbackLookupTerms: ['自動販売機'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('自動販売機');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('自動販売機');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);
    });

    it('carries an l1-l18 review row through Reader, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('019-l1-l18.json'), 'l1-l18');
        const word = sheet.items[0]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);
        const [token] = applyAuthoredVocabularyOverrides({ text: word.expression, parent: surface }, []);

        expect(word).toMatchObject({
            expression: '*review りんご',
            studyExpression: 'りんご',
            reading: 'りんご',
            studyMeaning: 'apple',
            studyStatus: 'canonical',
        });
        expect(token?.card).toMatchObject({
            spelling: '*review りんご',
            reading: 'りんご',
            source: 'fallback',
            fallbackLookupTerms: ['りんご'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('りんご');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('りんご');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);
    });

    it('carries an l1-l19 owner row through Reader, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('020-l1-l19.json'), 'l1-l19');
        const word = sheet.items[24]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);
        const [token] = applyAuthoredVocabularyOverrides({ text: word.expression, parent: surface }, []);

        expect(word).toMatchObject({
            expression: 'ふなびん',
            studyExpression: '船便',
            reading: 'ふなびん',
            studyMeaning: 'sea mail',
            studyStatus: 'canonical',
        });
        expect(token?.card).toMatchObject({
            spelling: 'ふなびん',
            reading: 'ふなびん',
            source: 'fallback',
            fallbackLookupTerms: ['船便'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('船便');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('船便');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);
    });

    it('does not author a Reader fallback for the quarantined l1-l18 source ambiguity', () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('019-l1-l18.json'), 'l1-l18');
        const word = sheet.items[21]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);

        expect(word.studyStatus).toBe('quarantined-source-ambiguity');
        expect(surface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
        expect(applyAuthoredVocabularyOverrides({ text: word.expression, parent: surface }, [])).toEqual([]);
    });

    it('does not author a Reader fallback for the quarantined l1-l19 source ambiguity', () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage('020-l1-l19.json'), 'l1-l19');
        const word = sheet.items[8]!;
        const surface = document.createElement('span');
        surface.textContent = word.expression;
        attachLibraryReaderVocabulary(surface, word);

        expect(word.studyStatus).toBe('quarantined-source-ambiguity');
        expect(surface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
        expect(applyAuthoredVocabularyOverrides({ text: word.expression, parent: surface }, [])).toEqual([]);
    });

    it.each(['l1-l15', 'l1-l16', 'l1-l18', 'l1-l19'] as const)(
        'returns from the selected %s Library route to the exact originating place', packageId => {
        const entered = transitionAcademyRoute({
            route: 'station' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: `authored-week:${packageId}` },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: `authored-week:${packageId}` });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'station',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l1-l18 without duplicating or resetting the scheduled canonical card', async () => {
        let now = Date.parse('2026-07-15T08:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage('019-l1-l18.json'), 'l1-l18'),
        )[0]!;
        const collect = () => repository.collectAcademyVocabulary({
            expression: word.expression,
            reading: word.reading,
            meanings: [word.meaning],
            provenance: {
                id: `academy:study-syllabus:${word.id}`,
                kind: 'study-encounter',
                sourceId: word.source,
            },
        });

        await collect();
        const first = (await repository.queue(1)).cards[0]!;
        await repository.review({ card: first, grade: 'good' });
        now += 1;
        await collect();

        expect((await repository.queue(1)).cards).toEqual([]);
        expect(Object.keys((first.raw as { academyProvenance?: object }).academyProvenance ?? {}))
            .toEqual([`academy:study-syllabus:${word.id}`]);
    });

    it('revisits l1-l19 without duplicating or resetting the scheduled canonical card', async () => {
        let now = Date.parse('2026-07-15T09:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage('020-l1-l19.json'), 'l1-l19'),
        )[0]!;
        const collect = () => repository.collectAcademyVocabulary({
            expression: word.expression,
            reading: word.reading,
            meanings: [word.meaning],
            provenance: {
                id: `academy:study-syllabus:${word.id}`,
                kind: 'study-encounter',
                sourceId: word.source,
            },
        });

        await collect();
        const first = (await repository.queue(1)).cards[0]!;
        await repository.review({ card: first, grade: 'good' });
        now += 1;
        await collect();

        expect((await repository.queue(1)).cards).toEqual([]);
        expect(Object.keys((first.raw as { academyProvenance?: object }).academyProvenance ?? {}))
            .toEqual([`academy:study-syllabus:${word.id}`]);
    });

    it.each([
        ['l1-l11', '012-l1-l11.json'],
        ['l1-l12', '013-l1-l12.json'],
        ['l1-l13', '014-l1-l13.json'],
        ['l1-l14', '015-l1-l14.json'],
    ] as const)('leaves no-sheet %s explicitly unclaimed and unseeded', (packageId, filename) => {
        const input = lessonPackage(filename);
        const sheet = createLibraryVocabularySheetFromPackage(input, packageId);

        expect(earlyLibraryVocabularyStudyDefinition(packageId, input)).toBeUndefined();
        expect(sheet).toMatchObject({ lessonId: packageId, sourceStatus: 'not-provided', items: [] });
        expect(libraryVocabularyReviewSeeds(sheet)).toEqual([]);
    });

    it('proves l1-l16 ownership from the pipeline and treats l1-l17 as carry-forward', () => {
        const ownerInput = lessonPackage('017-l1-l16.json');
        const consumerInput = lessonPackage('018-l1-l17.json');
        const ownership = record(JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/lesson-source-ownership.v1.json',
            'utf8',
        )) as unknown);
        const declaration = array(ownership.sharedPayloads).map(record).find(candidate =>
            candidate.payloadSha256 === '51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751');

        expect(declaration).toMatchObject({
            ownerPackageId: 'l1-l16',
            consumerPackageIds: ['l1-l17'],
        });
        expect(sourceTrace(ownerInput, String(declaration?.payloadSha256))).toMatchObject({
            moduleId: 5881257,
            member: 'Handouts/New Chapter 10-2 Vocabulary Sheet.pdf',
        });
        expect(sourceTrace(consumerInput, String(declaration?.payloadSha256))).toMatchObject({
            moduleId: 5489600,
            member: 'Handouts from last week/New Chapter 10-2 Vocabulary Sheet.pdf',
        });
    });

    it('rejects mutations to every load-bearing l1-l16 ownership fact', () => {
        const wrongMember = structuredClone(lessonPackage('017-l1-l16.json'));
        mutableRecord(sourceTrace(wrongMember,
            '51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751')).member
            = 'Handouts from last week/New Chapter 10-2 Vocabulary Sheet.pdf';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l16', wrongMember))
            .toThrow(/ownership trace changed/i);

        const wrongComponent = structuredClone(lessonPackage('017-l1-l16.json'));
        const component = mutableRecord(vocabularyComponent(wrongComponent,
            'moodle-vocabulary:5881257:51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751'));
        component.type = 'vocabulary';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l16', wrongComponent))
            .toThrow(/exactly one evidence-linked/i);

        const wrongBlankRows = structuredClone(lessonPackage('017-l1-l16.json'));
        const blankRowProvenance = mutableRecord(vocabularyComponent(wrongBlankRows,
            'moodle-vocabulary:5881257:51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751').provenance);
        blankRowProvenance.sourceBlankRows = [13, 14, 15];
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l16', wrongBlankRows))
            .toThrow(/blank-row evidence changed/i);
    });

    it('proves l1-l18 ownership from the pipeline and treats l1-l19 as carry-forward', () => {
        const ownerInput = lessonPackage('019-l1-l18.json');
        const consumerInput = lessonPackage('020-l1-l19.json');
        const ownership = record(JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/lesson-source-ownership.v1.json',
            'utf8',
        )) as unknown);
        const declaration = array(ownership.sharedPayloads).map(record).find(candidate =>
            candidate.payloadSha256 === '446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6');

        expect(declaration).toMatchObject({
            ownerPackageId: 'l1-l18',
            consumerPackageIds: ['l1-l19'],
        });
        expect(sourceTrace(ownerInput, String(declaration?.payloadSha256))).toMatchObject({
            moduleId: 6200250,
            member: 'Handouts/New_Chapter 11-1 Vocabulary Sheet.pdf',
        });
        expect(sourceTrace(consumerInput, String(declaration?.payloadSha256))).toMatchObject({
            moduleId: 6223185,
            member: 'Handouts from last week/New_Chapter 11-1 Vocabulary Sheet.pdf',
        });
    });

    it('rejects mutations to the l1-l18 owner identity, row surfaces, and zero-blank-row boundary', () => {
        const wrongMember = structuredClone(lessonPackage('019-l1-l18.json'));
        mutableRecord(sourceTrace(wrongMember,
            '446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6')).member
            = 'Handouts from last week/New_Chapter 11-1 Vocabulary Sheet.pdf';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l18', wrongMember))
            .toThrow(/ownership trace changed/i);

        const wrongSurface = structuredClone(lessonPackage('019-l1-l18.json'));
        const exact = mutableRecord(record(vocabularyRows(wrongSurface,
            'moodle-vocabulary:6200250:446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6')[0]!.source).exact);
        exact.words = 'りんご';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l18', wrongSurface))
            .toThrow(/exact source words changed at row 1/i);

        const silentlyCorrectedGloss = structuredClone(lessonPackage('019-l1-l18.json'));
        const ambiguousExact = mutableRecord(record(vocabularyRows(silentlyCorrectedGloss,
            'moodle-vocabulary:6200250:446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6')[21]!.source).exact);
        ambiguousExact.meaning = 'a counter suffix for flat things';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l18', silentlyCorrectedGloss))
            .toThrow(/quarantined source meaning changed at row 22/i);

        const inventedBlankRow = structuredClone(lessonPackage('019-l1-l18.json'));
        mutableRecord(vocabularyComponent(inventedBlankRow,
            'moodle-vocabulary:6200250:446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6').provenance)
            .sourceBlankRows = [40];
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l18', inventedBlankRow))
            .toThrow(/blank-row evidence changed/i);
    });

    it('proves l1-l19 ownership from the pipeline and treats l1-l20 as carry-forward', () => {
        const ownerInput = lessonPackage('020-l1-l19.json');
        const consumerInput = lessonPackage('021-l1-l20.json');
        const ownership = record(JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/lesson-source-ownership.v1.json',
            'utf8',
        )) as unknown);
        const declaration = array(ownership.sharedPayloads).map(record).find(candidate =>
            candidate.payloadSha256 === '9dff734cc9ce3542b9e8356f989eb38d59fa7ec4875630ad19b646f9e7474400');

        expect(declaration).toMatchObject({
            ownerPackageId: 'l1-l19',
            consumerPackageIds: ['l1-l20'],
        });
        expect(sourceTrace(ownerInput, String(declaration?.payloadSha256))).toMatchObject({
            moduleId: 6223185,
            member: 'Handouts/Chapter 11-2,3 Vocabulary Sheet.pdf',
        });
        expect(sourceTrace(consumerInput, String(declaration?.payloadSha256))).toMatchObject({
            moduleId: 6310077,
            member: 'Handouts from last week/Chapter 11-2,3 Vocabulary Sheet.pdf',
        });
    });

    it('rejects mutations to the l1-l19 owner identity, row surfaces, gloss quarantine, and blank-row boundary', () => {
        const sourceId = 'moodle-vocabulary:6223185:9dff734cc9ce3542b9e8356f989eb38d59fa7ec4875630ad19b646f9e7474400';
        const wrongMember = structuredClone(lessonPackage('020-l1-l19.json'));
        mutableRecord(sourceTrace(wrongMember,
            '9dff734cc9ce3542b9e8356f989eb38d59fa7ec4875630ad19b646f9e7474400')).member
            = 'Handouts from last week/Chapter 11-2,3 Vocabulary Sheet.pdf';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l19', wrongMember))
            .toThrow(/ownership trace changed/i);

        const wrongSurface = structuredClone(lessonPackage('020-l1-l19.json'));
        mutableRecord(record(vocabularyRows(wrongSurface, sourceId)[0]!.source).exact).words = '外国';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l19', wrongSurface))
            .toThrow(/exact source words changed at row 1/i);

        const silentlyReframedGloss = structuredClone(lessonPackage('020-l1-l19.json'));
        mutableRecord(record(vocabularyRows(silentlyReframedGloss, sourceId)[8]!.source).exact).meaning
            = 'to exist (animate)';
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l19', silentlyReframedGloss))
            .toThrow(/quarantined source meaning changed at row 9/i);

        const droppedBlankRow = structuredClone(lessonPackage('020-l1-l19.json'));
        mutableRecord(vocabularyComponent(droppedBlankRow, sourceId).provenance).sourceBlankRows = [];
        expect(() => earlyLibraryVocabularyStudyDefinition('l1-l19', droppedBlankRow))
            .toThrow(/blank-row evidence changed/i);
    });

    it('rejects any future omission inside the newly delivered early frontier', () => {
        expect(() => validateSenseiVocabularyLinkage('l1-l19', {
            id: 'l1-l19:no-exact-source-vocabulary',
            lessonId: 'l1-l19',
            title: 'Lesson 19 vocabulary',
            sourceId: 'academy:l1-l19:no-exact-source-vocabulary',
            sourceStatus: 'not-provided',
            items: [],
        }, [{
            sourceId: `moodle-vocabulary:6134871:${'a'.repeat(64)}`,
            payloadSha256: 'a'.repeat(64),
            extractionStatus: 'complete',
            rowCount: 1,
            completeRowCount: 1,
        }], [])).toThrow(/inside the delivered vocabulary frontier/i);
    });
});

function lessonPackage(filename: string): unknown {
    return JSON.parse(readFileSync(`public/academy/content/lessons/${filename}`, 'utf8')) as unknown;
}

function vocabularyRows(input: unknown, sourceId: string): readonly Readonly<Record<string, unknown>>[] {
    return array(vocabularyComponent(input, sourceId).items).map(record);
}

function vocabularyComponent(input: unknown, sourceId: string): Readonly<Record<string, unknown>> {
    const root = record(input);
    const component = array(root.components).map(record).find(candidate => {
        const type = candidate.type;
        return (type === 'vocabulary' || type === 'source-vocabulary-reference')
            && record(candidate.provenance).sourceId === sourceId;
    });
    return record(component);
}

function sourceTrace(input: unknown, payloadSha256: string): Readonly<Record<string, unknown>> {
    const coverage = record(record(input).sourceCoverage);
    const entry = array(coverage.coverageMap).map(record).find(candidate =>
        candidate.payloadSha256 === payloadSha256);
    return record(record(entry).sourceTrace);
}

function sourceExact(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return record(record(row.source).exact);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object.');
    return value as Readonly<Record<string, unknown>>;
}

function mutableRecord(value: unknown): Record<string, unknown> {
    return record(value) as Record<string, unknown>;
}

function array(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError('Expected an array.');
    return value;
}
