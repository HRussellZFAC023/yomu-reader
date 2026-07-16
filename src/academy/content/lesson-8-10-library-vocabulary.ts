export interface EarlyLibraryVocabularyStudyRow {
    readonly expression: string;
    readonly reading: string;
    readonly meaning: string;
    readonly studyStatus: 'canonical' | 'quarantined-source-ambiguity';
}

export interface EarlyLibraryVocabularyStudyDefinition {
    readonly packageId: string;
    readonly sourceId: string;
    readonly componentType: 'vocabulary' | 'source-vocabulary-reference';
    readonly rows: readonly EarlyLibraryVocabularyStudyRow[];
}

type StudyRowInput = readonly [expression: string, reading: string, meaning?: string];

interface QuarantinedSourceRow {
    readonly sourceRow: number;
    readonly sourceMeaning: string;
}

interface Definition {
    readonly packageId: string;
    readonly packageOrder: number;
    readonly moduleId: number;
    readonly payloadSha256: string;
    readonly title: string;
    readonly componentType: 'vocabulary' | 'source-vocabulary-reference';
    readonly archiveMember?: string;
    readonly sourceBlankRows?: readonly number[];
    readonly sourceWords?: readonly string[];
    readonly quarantinedRows?: readonly QuarantinedSourceRow[];
    readonly rows: readonly StudyRowInput[];
}

interface DefinitionOptions {
    readonly componentType?: Definition['componentType'];
    readonly archiveMember?: string;
    readonly sourceBlankRows?: readonly number[];
    readonly sourceWords?: readonly string[];
    readonly quarantinedRows?: readonly QuarantinedSourceRow[];
}

const DEFINITIONS = Object.freeze({
    'l1-l08': definition('l1-l08', 9, 5866381,
        '036a057edcccc409c987027b0a4d3fef00dc8134fd0e4bb0bc5341c2cdc2dadd',
        'New Chapter 4-1 Vocabulary Sheet', [
            ['復習', 'ふくしゅう'], ['時', 'じ'], ['分', 'ふん'], ['半', 'はん'], ['今', 'いま'],
            ['どういたしまして', 'どういたしまして'], ['朝', 'あさ'], ['昼', 'ひる'], ['夜', 'よる'],
            ['午前', 'ごぜん'], ['午後', 'ごご'], ['仕事', 'しごと'], ['パーティ', 'パーティ'],
            ['試験', 'しけん'], ['会議', 'かいぎ'], ['休み', 'やすみ'], ['昼休み', 'ひるやすみ'],
            ['から', 'から'], ['まで', 'まで'], ['郵便局', 'ゆうびんきょく'], ['図書館', 'としょかん'],
            ['美術館', 'びじゅつかん'], ['レストラン', 'レストラン'], ['映画', 'えいが'],
        ]),
    'l1-l09': definition('l1-l09', 10, 5889535,
        '0a7df2fcfcf8641cc41723757a06711f165155470d5513a4a758a37f08519675',
        'New Chapter 4-2 Vocabulary Sheet', [
            ['復習', 'ふくしゅう'], ['ご飯', 'ごはん'], ['朝ご飯', 'あさごはん'], ['晩ご飯', 'ばんごはん'],
            ['昼ご飯', 'ひるごはん'], ['カレンダー', 'カレンダー'], ['何曜日', 'なんようび'], ['と', 'と'],
            ['電話', 'でんわ'], ['番号', 'ばんごう'], ['電話番号', 'でんわばんごう'], ['何番', 'なんばん'],
        ]),
    'l1-l10': definition('l1-l10', 11, 5907552,
        '440338339cd23627dc7a3509dd60d4e44f97dd22f90e538485a88a3398cbe897',
        'New Chapter 4-3 Vocabulary Sheet', [
            ['今朝', 'けさ'], ['今晩', 'こんばん'], ['毎朝', 'まいあさ'], ['毎日', 'まいにち'],
            ['毎晩', 'まいばん'], ['起きる', 'おきる'], ['寝る', 'ねる'], ['働く', 'はたらく'],
            ['休む', 'やすむ'], ['勉強する', 'べんきょうする'], ['終わる', 'おわる'], ['に', 'に'], ['ます', 'ます'],
        ]),
    'l1-l15': definition('l1-l15', 16, 6134871,
        'e9e38790a7391ec46e11b24c50e2aff47a09ee9427fec7e3dd3be50c438aa542',
        'New Chapter 10-1 Vocabulary Sheet', [
            ['公園', 'こうえん', 'park'], ['花', 'はな', 'flower'], ['木', 'き', 'tree'],
            ['ベンチ', 'ベンチ', 'bench'], ['噴水', 'ふんすい', 'fountain'],
            ['ATM', 'エーティーエム', 'ATM'], ['コンビニ', 'コンビニ', 'convenience store'],
            ['ポスト', 'ポスト', 'postbox'], ['ビル', 'ビル', 'building'],
            ['受付', 'うけつけ', 'reception desk'], ['お手洗い', 'おてあらい', 'restroom; toilet'],
            ['駐車場', 'ちゅうしゃじょう', 'car park'],
            ['喫茶店', 'きっさてん', 'coffee shop; Japanese-style cafe'], ['本屋', 'ほんや', 'bookshop'],
            ['魚屋', 'さかなや', 'fish shop'], ['屋', 'や', 'shop; store suffix'],
            ['男の子', 'おとこのこ', 'boy'], ['女の子', 'おんなのこ', 'girl'],
            ['男の人', 'おとこのひと', 'man'], ['女の人', 'おんなのひと', 'woman'],
            ['猫', 'ねこ', 'cat'], ['犬', 'いぬ', 'dog'], ['動物園', 'どうぶつえん', 'zoo'],
            ['パンダ', 'パンダ', 'panda'], ['象', 'ぞう', 'elephant'], ['キリン', 'キリン', 'giraffe'],
            ['ライオン', 'ライオン', 'lion'], ['が', 'が', 'subject marker'],
            ['ある', 'ある', 'to exist; to be (inanimate)'], ['いる', 'いる', 'to exist; to be (animate)'],
            ['ここ', 'ここ', 'here'], ['そこ', 'そこ', 'there (near the listener)'],
            ['あそこ', 'あそこ', 'over there'], ['階', 'かい', 'floor; storey'],
            ['に', 'に', 'in; at (place of existence)'],
        ]),
    'l1-l16': definition('l1-l16', 17, 5881257,
        '51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751',
        'New Chapter 10-2 Vocabulary Sheet', [
            ['寺', 'てら', 'temple'], ['と', 'と', 'and (complete list)'],
            ['や', 'や', 'and; among other things'], ['スイッチ', 'スイッチ', 'switch'],
            ['自動販売機', 'じどうはんばいき', 'vending machine'],
            ['色々', 'いろいろ', 'various; all sorts'], ['物', 'もの', 'thing; object; material'],
            ['部屋', 'へや', 'room'], ['庭', 'にわ', 'garden'],
            ['すみません', 'すみません', 'excuse me; thank you'],
            ['コーナー', 'コーナー', 'corner; section'], ['一番下', 'いちばんした', 'the bottom'],
        ], {
            componentType: 'source-vocabulary-reference',
            archiveMember: 'Handouts/New Chapter 10-2 Vocabulary Sheet.pdf',
            sourceBlankRows: [13, 14, 15, 16],
        }),
    'l1-l18': definition('l1-l18', 19, 6200250,
        '446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6',
        'New Chapter 11-1 Vocabulary Sheet', [
            ['りんご', 'りんご', 'apple'], ['みかん', 'みかん', 'mandarin orange'],
            ['サンドイッチ', 'サンドイッチ', 'sandwich'], ['カレーライス', 'カレーライス', 'curry rice'],
            ['アイスクリーム', 'アイスクリーム', 'ice cream'], ['えだまめ', 'えだまめ', 'edamame'],
            ['なまビール', 'なまビール', 'draft beer'], ['ひとつ', 'ひとつ', 'one (general counter)'],
            ['ふたつ', 'ふたつ', 'two (general counter)'], ['みっつ', 'みっつ', 'three (general counter)'],
            ['よっつ', 'よっつ', 'four (general counter)'], ['いつつ', 'いつつ', 'five (general counter)'],
            ['むっつ', 'むっつ', 'six (general counter)'], ['ななつ', 'ななつ', 'seven (general counter)'],
            ['やっつ', 'やっつ', 'eight (general counter)'], ['ここのつ', 'ここのつ', 'nine (general counter)'],
            ['とお', 'とお', 'ten (general counter)'], ['〜こ', '〜こ', 'counter suffix for small things'],
            ['きって', 'きって', 'postage stamp'], ['はがき', 'はがき', 'postcard'],
            ['ふうとう', 'ふうとう', 'envelope'],
            // The source repeats the 〜こ gloss here. Keep it verbatim and out of Study until independently resolved.
            ['〜まい', '〜まい', 'a counter suffix for small things'],
            ['〜だい', '〜だい', 'counter for machines and vehicles'], ['ひとり', 'ひとり', 'one person'],
            ['ふたり', 'ふたり', 'two people'], ['〜にん', '〜にん', 'counter for people'],
            ['〜ほん／ぽん／ぼん', '〜ほん／ぽん／ぼん', 'counter for long cylindrical things'],
            ['〜ひき／ぴき／びき', '〜ひき／ぴき／びき', 'counter for small animals'],
            ['いちご', 'いちご', 'strawberry'], ['メニュー', 'メニュー', 'menu'],
            ['ていしょく', 'ていしょく', 'set meal'], ['ちゅうもん', 'ちゅうもん', 'order'],
            ['ちゅうもんします', 'ちゅうもんします', 'order (verb)'],
            ['〜を みせてください', '〜を みせてください', 'please show me 〜'],
            ['〜を ください', '〜を ください', 'please give me 〜 / I will take 〜'],
            ['〜を おねがいします', '〜を おねがいします', 'ask / request / may I have 〜'],
            ['いらっしゃいませ', 'いらっしゃいませ', 'Welcome (to the shop)'],
            ['かしこまりました', 'かしこまりました', 'Certainly / understood (honorific)'],
            ['しょうしょう おまちください', 'しょうしょう おまちください', 'Please wait a moment.'],
        ], {
            archiveMember: 'Handouts/New_Chapter 11-1 Vocabulary Sheet.pdf',
            sourceBlankRows: [],
            quarantinedRows: [{
                sourceRow: 22,
                sourceMeaning: 'a counter suffix for small things',
            }],
            sourceWords: [
                '*review りんご', 'みかん', 'サンドイッチ', 'カレーライス', 'アイスクリーム', 'えだまめ',
                'なまビール', 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ',
                'やっつ', 'ここのつ', 'とお', '〜こ', 'きって', 'はがき', 'ふうとう', '〜まい', '〜だい',
                'ひとり', 'ふたり', '〜にん', '〜ほん／ぽん／ぼん', '〜ひき／ぴき／びき', 'いちご', 'メニュー',
                'ていしょく', 'ちゅうもん', 'ちゅうもんします', '*review\n〜を みせてください',
                '*review\n〜を ください', '〜を おねがいします', '*review\nいらっしゃいませ', 'かしこまりました',
                'しょうしょう\nおまちください',
            ],
        }),
    'l1-l19': definition('l1-l19', 20, 6223185,
        '9dff734cc9ce3542b9e8356f989eb38d59fa7ec4875630ad19b646f9e7474400',
        'Chapter 11-2,3 Vocabulary Sheet', [
            ['外国', 'がいこく', 'foreign country'], ['留学生', 'りゅうがくせい', 'international student'],
            ['全部で', 'ぜんぶで', 'in total, 〜'], ['だけ', 'だけ', 'only 〜'],
            ['みんな', 'みんな', 'all, everything, everyone'], ['親', 'おや', 'parent / parents'],
            ['両親', 'りょうしん', 'parents'], ['兄弟', 'きょうだい', 'siblings'],
            // The source gloss describes one sentence frame, not the lexical meaning of います.
            ['いる', 'いる', 'I have'], ['時間', 'じかん', '〜 hours'], ['分', 'ふん', '〜 minutes'],
            ['日', 'にち', '〜 days'], ['週間', 'しゅうかん', '〜 weeks'], ['か月', 'かげつ', '〜 months'],
            ['年', 'ねん', '〜 years'], ['回', 'かい', '〜 times'], ['ぐらい', 'ぐらい', 'about 〜'],
            ['どのくらい', 'どのくらい', 'how / how long / to what extent'],
            ['かかる', 'かかる', 'take (time) / cost (money)'],
            ['いい天気ですね', 'いいてんきですね', 'Nice weather, isn’t it?'],
            ['お出かけですか', 'おでかけですか', 'Are you going out?'],
            ['ちょっと〜まで', 'ちょっとまで', 'I am just going to 〜.'],
            ['行ってらっしゃい', 'いってらっしゃい', 'See you later / So long.'],
            ['行ってきます', 'いってきます', "See you later / I'm going and coming back."],
            ['船便', 'ふなびん', 'sea mail'], ['航空便', 'こうくうびん', 'air mail'],
            ['エアメール', 'エアメール', 'air mail'], ['速達', 'そくたつ', 'special delivery'],
            ['書留', 'かきとめ', 'registered delivery'],
        ], {
            archiveMember: 'Handouts/Chapter 11-2,3 Vocabulary Sheet.pdf',
            sourceBlankRows: [30],
            quarantinedRows: [{ sourceRow: 9, sourceMeaning: 'I have' }],
            sourceWords: [
                'がいこく', 'りゅうがくせい', 'ぜんぶで、〜', '〜だけ', 'みんな', 'おや', 'りょうしん',
                'きょうだい', 'います', '〜じかん', '〜ふん／ぷん', '〜にち', '〜しゅうかん', '〜かげつ',
                '〜ねん', '〜かい（〜回）', '〜ぐらい', 'どのくらい', 'かかります', 'いい (お)てんき ですね。',
                'おでかけ ですか。', 'ちょっと 〜まで。', 'いってらっしゃい。', 'いってきます。', 'ふなびん',
                'こうくうびん', 'エアメール', 'そくたつ', 'かきとめ',
            ],
        }),
} satisfies Readonly<Record<string, Definition>>);

export const EARLY_LIBRARY_VOCABULARY_PACKAGE_IDS = Object.freeze(
    Object.keys(DEFINITIONS) as (keyof typeof DEFINITIONS)[],
);

export function requiresEarlyLibraryVocabulary(packageId: string): boolean {
    return (EARLY_LIBRARY_VOCABULARY_PACKAGE_IDS as readonly string[]).includes(packageId);
}

/**
 * Adds dictionary-facing study support only after the exact Moodle component
 * and every source-row identity have been verified. Exact preview cells remain
 * owned by the package and are projected by library-vocabulary-sheet.
 */
export function earlyLibraryVocabularyStudyDefinition(
    packageId: string,
    input: unknown,
): EarlyLibraryVocabularyStudyDefinition | undefined {
    const expected = DEFINITIONS[packageId as keyof typeof DEFINITIONS];
    if (!expected) return undefined;

    const root = record(input, `${packageId} package`);
    const identity = record(root.identity, `${packageId} identity`);
    const coverage = record(root.sourceCoverage, `${packageId} source coverage`);
    if (root.id !== expected.packageId
        || root.order !== expected.packageOrder
        || identity.moduleId !== expected.moduleId
        || coverage.archiveModuleId !== expected.moduleId) {
        throw new TypeError(`Unexpected ${packageId} source package identity.`);
    }

    const source = array(coverage.members, `${packageId} source members`)
        .map((value, index) => record(value, `${packageId} source member ${index + 1}`))
        .find(member => member.payloadSha256 === expected.payloadSha256);
    if (!source || source.title !== expected.title || source.role !== 'vocabulary') {
        throw new TypeError(`${packageId} is missing its exact Library vocabulary source.`);
    }

    if (expected.archiveMember) {
        const coverageEntry = array(coverage.coverageMap, `${packageId} source coverage map`)
            .map((value, index) => record(value, `${packageId} source coverage ${index + 1}`))
            .find(entry => entry.payloadSha256 === expected.payloadSha256);
        const sourceTrace = coverageEntry
            ? record(coverageEntry.sourceTrace, `${packageId} source trace`)
            : undefined;
        if (!coverageEntry
            || coverageEntry.worksheetTitle !== expected.title
            || coverageEntry.status !== 'exact-source-vocabulary-preserved'
            || sourceTrace?.moduleId !== expected.moduleId
            || sourceTrace.member !== expected.archiveMember
            || sourceTrace.payloadSha256 !== expected.payloadSha256
            || sourceTrace.answerVisibility !== 'after-attempt') {
            throw new TypeError(`${packageId} Library vocabulary ownership trace changed.`);
        }
    }

    const sourceId = `moodle-vocabulary:${expected.moduleId}:${expected.payloadSha256}`;
    const components = array(root.components, `${packageId} components`)
        .map((value, index) => record(value, `${packageId} component ${index + 1}`))
        .filter(component => component.type === expected.componentType
            && record(component.provenance, `${packageId} vocabulary provenance`).sourceId === sourceId);
    if (components.length !== 1) {
        throw new TypeError(`${packageId} must expose exactly one evidence-linked Library vocabulary component.`);
    }
    const component = components[0]!;
    const provenance = record(component.provenance, `${packageId} vocabulary provenance`);
    if (provenance.payloadSha256 !== expected.payloadSha256
        || provenance.title !== expected.title
        || provenance.answerVisibility !== 'after-attempt') {
        throw new TypeError(`${packageId} Library vocabulary provenance changed.`);
    }
    if (expected.sourceBlankRows) {
        const actualBlankRows = provenance.sourceBlankRows === undefined
            ? []
            : array(provenance.sourceBlankRows, `${packageId} source blank rows`);
        if (actualBlankRows.join(',') !== expected.sourceBlankRows.join(',')) {
            throw new TypeError(`${packageId} Library source blank-row evidence changed.`);
        }
    }

    const rows = array(component.items, `${packageId} vocabulary rows`);
    if (rows.length !== expected.rows.length) {
        throw new TypeError(`${packageId} Library study support no longer matches its exact source rows.`);
    }
    let previousPage = 0;
    let previousRow = 0;
    const studyRows = rows.map((value, index): EarlyLibraryVocabularyStudyRow => {
        const row = record(value, `${packageId} vocabulary row ${index + 1}`);
        const rowSource = record(row.source, `${packageId} vocabulary row ${index + 1} source`);
        const locus = record(rowSource.locus, `${packageId} vocabulary row ${index + 1} locus`);
        const page = positiveInteger(locus.page, `${packageId} vocabulary row ${index + 1} page`);
        const sourceRow = positiveInteger(locus.row, `${packageId} vocabulary row ${index + 1} row`);
        const itemId = `${sourceId}:p${page}:row-${sourceRow}`;
        if (page < previousPage || (page === previousPage && sourceRow <= previousRow)
            || rowSource.itemId !== itemId
            || rowSource.payloadSha256 !== expected.payloadSha256
            || rowSource.title !== expected.title
            || rowSource.answerVisibility !== 'after-attempt') {
            throw new TypeError(`${packageId} Library source-row identity changed at row ${index + 1}.`);
        }
        const exact = record(rowSource.exact, `${itemId} exact fields`);
        const exactWords = text(exact.words, `${itemId} exact words`);
        if (expected.sourceWords && exactWords !== expected.sourceWords[index]) {
            throw new TypeError(`${packageId} Library exact source words changed at row ${sourceRow}.`);
        }
        const quarantine = expected.quarantinedRows?.find(candidate => candidate.sourceRow === sourceRow);
        if (quarantine && exact.meaning !== quarantine.sourceMeaning) {
            throw new TypeError(`${packageId} quarantined source meaning changed at row ${sourceRow}.`);
        }
        previousPage = page;
        previousRow = sourceRow;
        const [expression, reading, meaning] = expected.rows[index]!;
        return Object.freeze({
            expression,
            reading,
            meaning: text(meaning ?? row.en, `${itemId} Yomu definition`),
            studyStatus: quarantine
                ? 'quarantined-source-ambiguity'
                : 'canonical',
        });
    });

    return Object.freeze({
        packageId,
        sourceId,
        componentType: expected.componentType,
        rows: Object.freeze(studyRows),
    });
}

function definition(
    packageId: string,
    packageOrder: number,
    moduleId: number,
    payloadSha256: string,
    title: string,
    rows: readonly StudyRowInput[],
    options: DefinitionOptions = {},
): Definition {
    if (options.sourceWords && options.sourceWords.length !== rows.length) {
        throw new TypeError(`${packageId} source-word pins must match its study rows.`);
    }
    return Object.freeze({
        packageId,
        packageOrder,
        moduleId,
        payloadSha256,
        title,
        componentType: options.componentType ?? 'vocabulary',
        ...(options.archiveMember ? { archiveMember: options.archiveMember } : {}),
        ...(options.sourceBlankRows ? { sourceBlankRows: Object.freeze(options.sourceBlankRows) } : {}),
        ...(options.sourceWords ? { sourceWords: Object.freeze(options.sourceWords) } : {}),
        ...(options.quarantinedRows ? { quarantinedRows: Object.freeze(options.quarantinedRows) } : {}),
        rows: Object.freeze(rows),
    });
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function positiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer.`);
    }
    return value;
}
