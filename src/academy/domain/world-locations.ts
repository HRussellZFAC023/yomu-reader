import { ACADEMY_ASSETS, type AcademyItemAsset, type AcademyItemAssetId, type AcademyPlateId } from '../assets';
import { getAcademyCastMember } from './cast-registry';

export type WorldPlaceId =
    | 'courtyard'
    | 'classroom'
    | 'library'
    | 'cafe'
    | 'lab'
    | 'street'
    | 'station'
    | 'konbini'
    | 'ramen'
    | 'japan-centre'
    | 'home'
    | 'cafeteria'
    | 'bookshop'
    | 'park'
    | 'station-platform'
    | 'train'
    | 'supermarket'
    | 'restaurant'
    | 'izakaya'
    | 'post-office'
    | 'clinic'
    | 'pharmacy'
    | 'office'
    | 'museum'
    | 'shrine'
    | 'temple'
    | 'hotel'
    | 'ryokan'
    | 'airport'
    | 'festival'
    | 'shotengai'
    | 'tokyo-station';

export type WorldRegionId = 'campus' | 'bloomsbury' | 'commute' | 'home' | 'japan';

export type WorldTimePhase = 'morning' | 'lunch' | 'after-class' | 'evening' | 'night';
export type WorldLanguage = 'en' | 'ja';

export interface WorldProgress {
    readonly completedScenes: readonly string[];
    readonly completedEncounterIds: readonly string[];
    /** Derived from the canonical encounter projection; never a parallel unlock list. */
    readonly metCharacterIds?: readonly string[];
    readonly worldVisits?: Readonly<Partial<Record<WorldPlaceId, number>>>;
    readonly seenIntroductions?: readonly string[];
}

export interface WorldPlaceProjection {
    readonly id: WorldPlaceId;
    readonly region: WorldRegionId;
    readonly label: LocalizedText;
    readonly scene: AcademyPlateId;
    readonly moment: LocalizedText;
    readonly people: readonly string[];
    readonly composition?: WorldSceneComposition;
    readonly arrivalDialogue?: WorldArrivalDialogue;
    readonly activity: WorldActivityProjection;
    readonly objects?: readonly WorldObject[];
    readonly practice?: WorldPractice;
    readonly exits: readonly WorldPlaceId[];
    readonly availability: WorldAvailability;
    readonly introduction: WorldIntroduction;
    readonly stamp: WorldStamp;
}

export type WorldSceneMotif =
    | 'courtyard'
    | 'classroom'
    | 'library'
    | 'cafe'
    | 'street'
    | 'station'
    | 'konbini'
    | 'ramen'
    | 'japan-centre'
    | 'home'
    | 'cafeteria'
    | 'lab'
    | 'bookshop'
    | 'park'
    | 'station-platform';

export type WorldPurposeSurface =
    | 'noticeboard'
    | 'blackboard'
    | 'reading-desk'
    | 'cafe-menu'
    | 'street-sign'
    | 'departure-board'
    | 'checkout-counter'
    | 'noren-menu'
    | 'gift-counter'
    | 'journal-desk'
    | 'meal-tray'
    | 'listening-console'
    | 'bookshop-shelf'
    | 'weather-sketchbook'
    | 'transfer-board';

export interface WorldSceneLandmark {
    readonly id: string;
    readonly depth: 'far' | 'middle' | 'near';
}

/** Authored spatial identity for a mature location scene. */
export interface WorldSceneComposition {
    readonly motif: WorldSceneMotif;
    readonly purposeSurface: WorldPurposeSurface;
    readonly landmarks: readonly WorldSceneLandmark[];
}

export interface WorldArrivalDialogue {
    readonly speakerId: string;
    readonly line: LocalizedText;
    readonly action: LocalizedText;
}

export interface LocalizedText {
    readonly en: string;
    readonly ja: string;
}

export interface WorldActivity {
    readonly label: LocalizedText;
    readonly detail: LocalizedText;
    readonly route?: WorldRoute;
    readonly unavailableReason?: LocalizedText;
    readonly curriculum?: WorldCurriculumHook;
}

export interface WorldCurriculumHook {
    readonly id: string;
    readonly surface: 'textbook' | 'moodle' | 'story';
    readonly state: 'grounded' | 'planned';
    readonly label: LocalizedText;
}

export interface WorldActivityProjection extends WorldActivity {
    readonly curriculum: WorldCurriculumHook;
}

/** A diegetic control available in the current place, not a global navigation shortcut. */
export interface WorldObject {
    readonly id: string;
    readonly kind: 'audio';
    readonly label: LocalizedText;
    readonly detail: LocalizedText;
}

export interface WorldPractice {
    readonly id: string;
    readonly kind: 'direction' | 'listening' | 'counter' | 'ordering' | 'shadowing' | 'availability' | 'meeting' | 'transfer';
    /** Optional place-owned label for a rotating diegetic task surface. */
    readonly sceneLabel?: LocalizedText;
    readonly prompt: LocalizedText;
    /** Spoken by the browser pronunciation service; revealed as a transcript after play. */
    readonly audioLine: string;
    readonly choices: readonly WorldPracticeChoice[];
    readonly correctChoiceId: string;
    /** An optional hands-on response surface; choices remain available for listen-and-choose rounds. */
    readonly manipulation?: WorldPracticeManipulation;
    /** Exact source ownership plus bounded sequence/recognition support for this replay. */
    readonly source?: WorldPracticeSourceGrounding;
    readonly success: LocalizedText;
    /** Optional SRS evidence earned only after the learner completes this practice. */
    readonly review?: WorldPracticeReview;
}

export interface WorldPracticeSourceGrounding {
    readonly primary: WorldPracticeSourceReference & {
        readonly relation: 'exact-task' | 'source-sequenced-adaptation';
    };
    readonly supports: readonly (WorldPracticeSourceReference & {
        readonly relation: 'sequence-only' | 'counter-recognition-only' | 'shopping-frame-only';
    })[];
}

export interface WorldPracticeSourceReference {
    readonly corpus: 'moodle' | 'minna' | 'genki';
    readonly sourceId: string;
    readonly label: LocalizedText;
}

export interface WorldPracticeChoice {
    readonly id: string;
    readonly label: LocalizedText;
}

/** A deliberately small local manipulation, using only word chunks already taught in the source material. */
export type WorldPracticeManipulation =
    | Readonly<{
        readonly kind: 'token-order';
        readonly tokens: readonly WorldPracticeChoice[];
        readonly correctTokenIds: readonly string[];
    }>
    | Readonly<{
        /** Two deliberate commitments make a time range, rather than a single answer guess. */
        readonly kind: 'time-range';
        readonly startChoices: readonly WorldPracticeChoice[];
        readonly correctStartId: string;
        readonly endChoices: readonly WorldPracticeChoice[];
        readonly correctEndId: string;
    }>
    | Readonly<{
        /** A listening-source order is recorded as quantities on a restaurant ticket. */
        readonly kind: 'order-grid';
        readonly rows: readonly Readonly<{
            readonly id: string;
            readonly item: LocalizedText;
            readonly quantityChoices: readonly WorldPracticeChoice[];
            readonly correctQuantityId: string;
        }>[];
    }>
    | Readonly<{
        /** A visible counter tag must be identified before its taught request or price is answered. */
        readonly kind: 'counter-tag';
        readonly tags: readonly WorldPracticeChoice[];
        readonly correctTagId: string;
    }>
    | Readonly<{
        /** A heard shop price is counted on the register in fixed-value notes. */
        readonly kind: 'cash-count';
        readonly item: LocalizedText;
        readonly denominationYen: 1000;
        readonly correctCount: number;
        readonly maxCount: number;
        readonly completionLine?: LocalizedText;
    }>;

/** A compact, place-owned review card for a completed replayable activity. */
export interface WorldPracticeReview {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence?: string;
    /** The exact taught prompt that authorizes this world replay evidence. */
    readonly sourceQuestionId?: string;
}

export interface WorldAvailability {
    readonly state: 'open' | 'locked';
    readonly reason?: LocalizedText;
}

export interface WorldIntroduction {
    readonly id: string;
    readonly isFirstVisit: boolean;
}

export interface WorldStamp {
    readonly id: string;
    readonly label: LocalizedText;
    readonly prop: 'notebook' | 'ticket' | 'receipt' | 'menu' | 'bookmark' | 'key';
    readonly art?: AcademyItemAsset;
    /** Registry id for an earned item presentation; it never authorizes a cast likeness. */
    readonly itemAssetId?: AcademyItemAssetId;
    readonly use: LocalizedText;
    readonly claimed: boolean;
}

export type WorldRoute = 'campus' | 'class' | 'review' | 'cafe' | 'journal' | 'aakash-meet'
    | 'classroom' | 'lab' | 'street' | 'station' | 'konbini' | 'ramen' | 'home' | 'world';

export interface WorldRegionProjection {
    readonly id: WorldRegionId;
    readonly label: LocalizedText;
    readonly places: readonly WorldPlaceId[];
}

interface WorldPlaceDefinition {
    readonly id: WorldPlaceId;
    readonly region: WorldRegionId;
    readonly label: LocalizedText;
    readonly scene: AcademyPlateId;
    readonly people: readonly string[];
    readonly composition?: WorldSceneComposition;
    readonly arrivalDialogue?: WorldArrivalDialogue;
    readonly exits: readonly WorldPlaceId[];
    readonly activity: WorldActivity;
    readonly objects?: readonly WorldObject[];
    readonly practices?: readonly WorldPractice[];
    readonly availability?: (progress: WorldProgress) => WorldAvailability;
}

const OPEN: WorldAvailability = { state: 'open' };

function locked(ja: string, en: string): (progress: WorldProgress) => WorldAvailability {
    return () => ({ state: 'locked', reason: { ja, en } });
}

function ramenOrderingSource(sourceQuestionId: string): WorldPracticeSourceGrounding {
    return Object.freeze({
        primary: Object.freeze({
            corpus: 'moodle' as const,
            sourceId: sourceQuestionId,
            relation: 'exact-task' as const,
            label: { ja: 'Moodle CD A-43・注文票', en: 'Moodle CD A-43 order grid' },
        }),
        supports: Object.freeze([
            Object.freeze({
                corpus: 'minna' as const,
                sourceId: 'japanese-minna:11-11',
                relation: 'sequence-only' as const,
                label: { ja: 'みんなの日本語 初級I・11課の順序', en: 'Minna no Nihongo I Lesson 11 sequence' },
            }),
            Object.freeze({
                corpus: 'genki' as const,
                sourceId: 'genki-2e:l1-l18:lesson-3-literacy-1',
                relation: 'counter-recognition-only' as const,
                label: { ja: 'Genki I・3課の「一つ・二つ」', en: 'Genki I Lesson 3 一つ/二つ recognition' },
            }),
        ]),
    });
}

function japanCentreShoppingSource(sourceQuestionId: string): WorldPracticeSourceGrounding {
    return Object.freeze({
        primary: Object.freeze({
            corpus: 'moodle' as const,
            sourceId: sourceQuestionId,
            relation: 'source-sequenced-adaptation' as const,
            label: { ja: 'Moodle レベル1・7課の買い物', en: 'Moodle Level 1 Lesson 7 shopping' },
        }),
        supports: Object.freeze([
            Object.freeze({
                corpus: 'minna' as const,
                sourceId: 'japanese-minna:3-3',
                relation: 'sequence-only' as const,
                label: { ja: 'みんなの日本語 初級I・3課の順序', en: 'Minna no Nihongo I Lesson 3 sequence' },
            }),
            Object.freeze({
                corpus: 'genki' as const,
                sourceId: 'genki-2e:l1-l07:lesson-2-workbook-3',
                relation: 'shopping-frame-only' as const,
                label: { ja: 'Genki I・2課の買い物会話', en: 'Genki I Lesson 2 shopping frame' },
            }),
        ]),
    });
}

function tubeCommuteSource(sourceQuestionId: string): WorldPracticeSourceGrounding {
    return Object.freeze({
        primary: Object.freeze({
            corpus: 'moodle' as const,
            sourceId: sourceQuestionId,
            relation: 'source-sequenced-adaptation' as const,
            label: { ja: 'Moodle A-46・地下鉄の通学時間', en: 'Moodle A-46 Tube commute timing' },
        }),
        supports: Object.freeze([
            Object.freeze({
                corpus: 'minna' as const,
                sourceId: 'japanese-minna:11-11',
                relation: 'sequence-only' as const,
                label: { ja: 'みんなの日本語 初級I・11課の順序', en: 'Minna no Nihongo I Lesson 11 sequence' },
            }),
            Object.freeze({
                corpus: 'genki' as const,
                sourceId: 'genki-2e:l1-l21:lesson-1-workbook-1',
                relation: 'sequence-only' as const,
                label: { ja: 'Genki I・1課の数と時間', en: 'Genki I Lesson 1 number and time reinforcement' },
            }),
        ]),
    });
}

const WORLD_PLACES: readonly WorldPlaceDefinition[] = [
    {
        id: 'courtyard',
        region: 'campus',
        label: { ja: '中庭', en: 'Courtyard' },
        scene: 'entrance',
        people: ['rie', 'aakash'],
        composition: {
            motif: 'courtyard',
            purposeSurface: 'noticeboard',
            landmarks: [
                { id: 'cherry-canopy', depth: 'far' },
                { id: 'garden-path', depth: 'middle' },
                { id: 'notice-post', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'rie',
            line: {
                ja: '「掲示を見たら、今日の用事を一つ選んでみましょう。」',
                en: '“Once you have read the notice, choose one thing to do today.”',
            },
            action: { ja: '掲示を見る', en: 'Read the notice' },
        },
        exits: ['classroom', 'library', 'cafe', 'cafeteria', 'street', 'lab'],
        activity: {
            label: { ja: 'クラス日誌を見る', en: 'Open the class journal' },
            detail: { ja: '今日会った人と、これまでの場面を振り返る。', en: 'Revisit the people and scenes from today.' },
            route: 'journal',
        },
        objects: [{
            id: 'courtyard-bell',
            kind: 'audio',
            label: { ja: '校舎の鐘', en: 'Campus bell' },
            detail: { ja: '中庭の風と遠い鐘を切り替える。', en: 'Toggle the courtyard breeze and distant bell.' },
        }],
        practices: [
            {
                id: 'courtyard-notice-look',
                kind: 'availability',
                prompt: { ja: '掲示の「見る」指示を順番に置く。', en: 'Put the noticeboard instruction to look in order.' },
                audioLine: 'みてください。',
                choices: [],
                correctChoiceId: 'source-order',
                manipulation: {
                    kind: 'token-order',
                    tokens: [
                        { id: 'look', label: { ja: 'みて', en: 'look' } },
                        { id: 'please', label: { ja: 'ください。', en: 'please' } },
                    ],
                    correctTokenIds: ['look', 'please'],
                },
                success: { ja: '掲示を見る指示を組み立てられた。', en: 'You assembled the instruction to look at the notice.' },
                review: {
                    id: 'review:world:courtyard:notice-look',
                    conceptId: 'concept:classroom-look-instruction',
                    expression: 'みてください。',
                    reading: 'みてください。',
                    meanings: ['Please look.'],
                    sourceQuestionId: 'source-question:classroom-phrase-04',
                },
            },
            {
                id: 'courtyard-notice-write',
                kind: 'availability',
                prompt: { ja: '掲示の「書く」指示を順番に置く。', en: 'Put the noticeboard instruction to write in order.' },
                audioLine: 'かいてください。',
                choices: [],
                correctChoiceId: 'source-order',
                manipulation: {
                    kind: 'token-order',
                    tokens: [
                        { id: 'write', label: { ja: 'かいて', en: 'write' } },
                        { id: 'please', label: { ja: 'ください。', en: 'please' } },
                    ],
                    correctTokenIds: ['write', 'please'],
                },
                success: { ja: '日誌に書く指示を組み立てられた。', en: 'You assembled the instruction to write it in the journal.' },
                review: {
                    id: 'review:world:courtyard:notice-write',
                    conceptId: 'concept:classroom-write-instruction',
                    expression: 'かいてください。',
                    reading: 'かいてください。',
                    meanings: ['Please write.'],
                    sourceQuestionId: 'source-question:classroom-phrase-07',
                },
            },
        ],
    },
    {
        id: 'classroom',
        region: 'campus',
        label: { ja: '教室', en: 'Classroom' },
        scene: 'classroom',
        people: ['rie', 'aakash', 'felix'],
        composition: {
            motif: 'classroom',
            purposeSurface: 'blackboard',
            landmarks: [
                { id: 'rain-window', depth: 'far' },
                { id: 'chalk-notes', depth: 'middle' },
                { id: 'front-desks', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'rie',
            line: {
                ja: '「黒板の予定を見てから、聞こえた表現を一つ確かめましょう。」',
                en: '“Read the board first, then check one expression you hear.”',
            },
            action: { ja: '黒板を見る', en: 'Read the board' },
        },
        exits: ['courtyard', 'library', 'cafeteria', 'cafe'],
        activity: {
            label: { ja: '黒板の授業予定を見る', en: 'Read the board and enter class' },
            detail: { ja: '今のレベルの授業予定、シラバス、練習に進む。', en: 'Open the current lesson plan, syllabus, and practice path.' },
            route: 'class',
        },
        objects: [{
            id: 'classroom-rain',
            kind: 'audio',
            label: { ja: '窓の雨', en: 'Window rain' },
            detail: { ja: '雨音と放課後の教室音を切り替える。', en: 'Toggle rain and after-class room tone.' },
        }],
        practices: [
            {
                id: 'classroom-board-understanding',
                kind: 'listening',
                prompt: { ja: '黒板の説明のあと、理解を確かめる言葉を選ぶ。', en: 'After the board explanation, choose the phrase that checks understanding.' },
                audioLine: 'わかりますか。',
                choices: [
                    { id: 'correct', label: { ja: 'わかりますか。', en: 'Do you understand?' } },
                    { id: 'repeat', label: { ja: 'もう一度お願いします。', en: 'One more time, please.' } },
                    { id: 'good', label: { ja: 'いいです。', en: 'Good.' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: '理解を確かめる言葉を聞き取れた。', en: 'You heard the phrase that checks understanding.' },
                review: {
                    id: 'review:world:classroom:board-understanding',
                    conceptId: 'concept:classroom-understanding-check',
                    expression: 'わかりますか。',
                    reading: 'わかりますか。',
                    meanings: ['Do you understand?'],
                    sourceQuestionId: 'source-question:classroom-phrase-08',
                },
            },
            {
                id: 'classroom-board-confirmation',
                kind: 'listening',
                prompt: { ja: '黒板の答えと合うときの短い返事を選ぶ。', en: 'Choose the short reply used when an answer matches the board.' },
                audioLine: 'あってます。',
                choices: [
                    { id: 'good', label: { ja: 'いいです。', en: 'Good.' } },
                    { id: 'correct', label: { ja: 'あってます。', en: 'That matches.' } },
                    { id: 'different', label: { ja: 'ちがいます。', en: 'That is different.' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: '答えが合うときの返事を聞き取れた。', en: 'You heard the reply that confirms a match.' },
                review: {
                    id: 'review:world:classroom:board-confirmation',
                    conceptId: 'concept:classroom-confirm-correct',
                    expression: 'あってます。',
                    reading: 'あってます。',
                    meanings: ['That matches.'],
                    sourceQuestionId: 'source-question:classroom-phrase-11',
                },
            },
        ],
    },
    {
        id: 'library',
        region: 'campus',
        label: { ja: '図書館', en: 'Library' },
        scene: 'library',
        people: ['rie', 'sophie'],
        composition: {
            motif: 'library',
            purposeSurface: 'reading-desk',
            landmarks: [
                { id: 'book-stacks', depth: 'far' },
                { id: 'green-lamps', depth: 'middle' },
                { id: 'open-book', depth: 'near' },
            ],
        },
        exits: ['courtyard', 'classroom', 'bookshop', 'lab'],
        activity: {
            label: { ja: '本の場所を確かめる', en: 'Find a book on the shelves' },
            detail: { ja: 'ありますの形で、辞書や本がどこにあるかを聞き取る。', en: 'Use the あります pattern to hear where a dictionary or book is.' },
            route: 'review',
        },
        practices: [
            {
                id: 'library-dictionary-location',
                kind: 'availability',
                prompt: { ja: '辞書がどこにあるかを選ぶ。', en: 'Choose where the dictionary is.' },
                audioLine: 'じしょは図書館にあります。',
                choices: [
                    { id: 'correct', label: { ja: '図書館', en: 'Library' } },
                    { id: 'bookshop', label: { ja: '書店', en: 'Bookshop' } },
                    { id: 'cafe', label: { ja: 'カフェ', en: 'Cafe' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: '辞書が図書館にあると聞き取れた。', en: 'You heard that the dictionary is in the library.' },
                review: {
                    id: 'review:world:library:dictionary-location',
                    conceptId: 'concept:world:library:dictionary-location',
                    expression: 'じしょは図書館にあります。',
                    reading: 'じしょはとしょかんにあります。',
                    meanings: ['The dictionary is in the library.'],
                },
            },
            {
                id: 'library-bookshop-location',
                kind: 'availability',
                prompt: { ja: '本がどこにあるかを選ぶ。', en: 'Choose where the book is.' },
                audioLine: 'ほんは書店にあります。',
                choices: [
                    { id: 'library', label: { ja: '図書館', en: 'Library' } },
                    { id: 'correct', label: { ja: '書店', en: 'Bookshop' } },
                    { id: 'cafe', label: { ja: 'カフェ', en: 'Cafe' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: '本が書店にあると聞き取れた。', en: 'You heard that the book is in the bookshop.' },
                review: {
                    id: 'review:world:library:bookshop-location',
                    conceptId: 'concept:world:library:bookshop-location',
                    expression: 'ほんは書店にあります。',
                    reading: 'ほんはしょてんにあります。',
                    meanings: ['The book is in the bookshop.'],
                },
            },
        ],
        objects: [{
            id: 'library-rain',
            kind: 'audio',
            label: { ja: '閲覧室の雨', en: 'Reading-room rain' },
            detail: { ja: '雨音とページをめくる音を切り替える。', en: 'Toggle rain and turning pages.' },
        }],
    },
    {
        id: 'cafe',
        region: 'campus',
        label: { ja: 'カフェ', en: 'Cafe' },
        scene: 'cafe',
        people: ['aakash', 'felix'],
        composition: {
            motif: 'cafe',
            purposeSurface: 'cafe-menu',
            landmarks: [
                { id: 'rain-glass', depth: 'far' },
                { id: 'counter-lamp', depth: 'middle' },
                { id: 'coffee-table', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'aakash',
            line: {
                ja: '「メニューを見ながら、値段と数を聞いてみよう。」',
                en: '“Let’s look at the menu and listen for the price and quantity.”',
            },
            action: { ja: 'メニューを見る', en: 'Look at the menu' },
        },
        exits: ['courtyard', 'classroom', 'cafeteria', 'street'],
        activity: {
            label: { ja: '飲み物を注文する', en: 'Order a drink' },
            detail: { ja: '値段と数を聞いて、カフェでの短い注文を確かめる。', en: 'Listen for a price and quantity in a short cafe order.' },
            route: 'aakash-meet',
        },
        practices: [
            {
                id: 'cafe-coffee-price',
                kind: 'counter',
                prompt: { ja: 'コーヒーの値段を選ぶ。', en: 'Choose the price of the coffee.' },
                audioLine: 'コーヒーは三百円です。',
                choices: [
                    { id: 'correct', label: { ja: '三百円', en: '300 yen' } },
                    { id: 'thousand', label: { ja: '千円', en: '1,000 yen' } },
                    { id: 'eight-thousand', label: { ja: '八千円', en: '8,000 yen' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: 'コーヒーが三百円だと聞き取れた。', en: 'You heard that the coffee costs 300 yen.' },
                review: {
                    id: 'review:world:cafe:coffee-price',
                    conceptId: 'concept:world:cafe:coffee-price',
                    expression: 'コーヒーは三百円です。',
                    reading: 'コーヒーはさんびゃくえんです。',
                    meanings: ['The coffee is 300 yen.'],
                },
            },
            {
                id: 'cafe-coffee-counter',
                kind: 'ordering',
                prompt: { ja: 'コーヒーを一つ頼む言い方を選ぶ。', en: 'Choose how to order one coffee.' },
                audioLine: 'コーヒーを一つ、お願いします。',
                choices: [
                    { id: 'correct', label: { ja: 'コーヒーを一つ、お願いします。', en: 'One coffee, please.' } },
                    { id: 'two', label: { ja: 'コーヒーを二つ、お願いします。', en: 'Two coffees, please.' } },
                    { id: 'water', label: { ja: 'お水を一つ、お願いします。', en: 'One water, please.' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: 'コーヒーを一つ注文できた。', en: 'You ordered one coffee.' },
                review: {
                    id: 'review:world:cafe:coffee-counter',
                    conceptId: 'concept:world:cafe:coffee-counter',
                    expression: 'コーヒーを一つ、お願いします。',
                    reading: 'コーヒーをひとつ、おねがいします。',
                    meanings: ['One coffee, please.'],
                },
            },
        ],
        objects: [{
            id: 'cafe-radio',
            kind: 'audio',
            label: { ja: '店内ラジオ', en: 'Cafe radio' },
            detail: { ja: '店内の音と音楽を切り替える。', en: 'Toggle the room sound and music.' },
        }],
    },
    {
        id: 'lab',
        region: 'campus',
        label: { ja: '語学ラボ', en: 'Language lab' },
        scene: 'languageLab',
        people: ['xingyu', 'mika'],
        composition: {
            motif: 'lab',
            purposeSurface: 'listening-console',
            landmarks: [
                { id: 'headphone-booths', depth: 'far' },
                { id: 'waveform-console', depth: 'middle' },
                { id: 'shadowing-card', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'xingyu',
            line: {
                ja: '「聞こえた言葉を、そのまま繰り返してみましょう。」',
                en: '“Try repeating the words exactly as you hear them.”',
            },
            action: { ja: 'ヘッドホンをつける', en: 'Use the headphones' },
        },
        exits: ['courtyard', 'library'],
        activity: {
            label: { ja: '教室の表現をシャドーイングする', en: 'Shadow the classroom repair line' },
            detail: { ja: 'レッスン0の「もう一度お願いします」を聞いて、最後の語を確かめる。', en: 'Use Lesson 0’s “one more time, please” line to hear and repeat the final word.' },
        },
        practices: [
            {
                id: 'lab-classroom-repair',
                kind: 'shadowing',
                prompt: { ja: 'レッスン0の表現を聞いて、最後の語を選ぶ。', en: 'Listen to the Lesson 0 line and choose its final word.' },
                audioLine: 'もう一度お願いします。',
                choices: [
                    { id: 'correct', label: { ja: 'お願いします', en: 'please' } },
                    { id: 'again', label: { ja: 'もう一度', en: 'one more time' } },
                    { id: 'thanks', label: { ja: 'ありがとう', en: 'thank you' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: 'お願いの表現を最後まで聞き取れた。', en: 'You caught the repair line to the end.' },
                review: {
                    id: 'review:world:lab:classroom-repair',
                    conceptId: 'concept:classroom-repair-repeat',
                    expression: 'もう一度お願いします。',
                    reading: 'もういちどおねがいします。',
                    meanings: ['One more time, please.'],
                    sourceQuestionId: 'source-question:classroom-phrase-09',
                },
            },
            {
                id: 'lab-classroom-repeat',
                kind: 'shadowing',
                prompt: { ja: '同じ表現を聞いて、最初のまとまりを選ぶ。', en: 'Listen again and choose the opening phrase.' },
                audioLine: 'もう一度お願いします。',
                choices: [
                    { id: 'correct', label: { ja: 'もう一度', en: 'one more time' } },
                    { id: 'please', label: { ja: 'お願いします', en: 'please' } },
                    { id: 'class', label: { ja: 'クラス', en: 'class' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: '繰り返しの合図を聞き取れた。', en: 'You caught the cue to repeat.' },
                review: {
                    id: 'review:world:lab:classroom-repeat',
                    conceptId: 'concept:classroom-repair-repeat',
                    expression: 'もう一度お願いします。',
                    reading: 'もういちどおねがいします。',
                    meanings: ['One more time, please.'],
                    sourceQuestionId: 'source-question:classroom-phrase-09',
                },
            },
        ],
        objects: [{
            id: 'lab-console',
            kind: 'audio',
            label: { ja: '再生コンソール', en: 'Playback console' },
            detail: { ja: 'ヘッドホンの選択音を切り替える。', en: 'Toggle the headphone selection tone.' },
        }],
    },
    {
        id: 'street',
        region: 'bloomsbury',
        label: { ja: '通り', en: 'Street' },
        scene: 'street',
        people: ['aakash', 'peter'],
        composition: {
            motif: 'street',
            purposeSurface: 'street-sign',
            landmarks: [
                { id: 'rainy-blocks', depth: 'far' },
                { id: 'crossing-sign', depth: 'middle' },
                { id: 'wet-pavement', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'aakash',
            line: {
                ja: '「標識を見ながら、まっすぐと右を聞き取ってみよう。」',
                en: '“Watch the signs and listen for straight ahead and right.”',
            },
            action: { ja: '標識を見る', en: 'Read the signs' },
        },
        exits: ['courtyard', 'station', 'konbini', 'ramen', 'supermarket', 'park', 'post-office', 'home', 'cafe'],
        activity: {
            label: { ja: '道案内を練習する', en: 'Practise giving directions' },
            detail: { ja: 'まっすぐ・右を使って、雨の中の道案内をする。', en: 'Use まっすぐ and 右 in the rainy directions scene.' },
        },
        practices: [
            {
                id: 'street-cafe-direction',
                kind: 'direction',
                prompt: { ja: 'Aakash-san: 「カフェはどこですか。」', en: 'Aakash-san asks where the cafe is.' },
                audioLine: 'まっすぐ行って、右です。',
                choices: [
                    { id: 'correct', label: { ja: 'まっすぐ行って、右です。', en: 'Go straight, then right.' } },
                    { id: 'left', label: { ja: 'まっすぐ行って、左です。', en: 'Go straight, then left.' } },
                    { id: 'closed', label: { ja: '今日は休みです。', en: 'It is closed today.' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: 'Aakash-sanに道を伝えられた。', en: 'You gave Aakash-san the route.' },
                review: {
                    id: 'review:world:street:cafe-direction',
                    conceptId: 'concept:directions-straight-right',
                    expression: 'まっすぐ行って、右です。',
                    reading: 'まっすぐいって、みぎです。',
                    meanings: ['Go straight, then it is on the right.'],
                    sourceQuestionId: 'activity:aakash-rainy-directions',
                },
            },
            {
                id: 'street-station-direction',
                kind: 'direction',
                prompt: { ja: 'Peter-san: 「駅はどこですか。」', en: 'Peter-san asks where the station is.' },
                audioLine: 'まっすぐ行って、左です。',
                choices: [
                    { id: 'correct', label: { ja: 'まっすぐ行って、左です。', en: 'Go straight, then left.' } },
                    { id: 'right', label: { ja: 'まっすぐ行って、右です。', en: 'Go straight, then right.' } },
                    { id: 'home', label: { ja: '家に帰ります。', en: 'I am going home.' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: 'Peter-sanに駅への道を伝えられた。', en: 'You gave Peter-san directions to the station.' },
                review: {
                    id: 'review:world:street:station-direction',
                    conceptId: 'concept:directions-straight-right',
                    expression: 'まっすぐ行って、左です。',
                    reading: 'まっすぐいって、ひだりです。',
                    meanings: ['Go straight, then it is on the left.'],
                    sourceQuestionId: 'aakash-directions:guided-frame',
                },
            },
        ],
        objects: [{
            id: 'street-rain',
            kind: 'audio',
            label: { ja: '雨の通学路', en: 'Rainy street' },
            detail: { ja: '雨、足音、遠い車の音を切り替える。', en: 'Toggle rain, footsteps, and distant traffic.' },
        }],
    },
    {
        id: 'station',
        region: 'commute',
        label: { ja: '駅', en: 'Station' },
        scene: 'station',
        people: ['aakash'],
        composition: {
            motif: 'station',
            purposeSurface: 'departure-board',
            landmarks: [
                { id: 'glass-canopy', depth: 'far' },
                { id: 'platform-clock', depth: 'middle' },
                { id: 'ticket-gates', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'aakash',
            line: {
                ja: '「出発案内を聞いて、場所と行き先を確かめよう。」',
                en: '“Listen to the departure board and check the place and destination.”',
            },
            action: { ja: '案内を聞く', en: 'Hear the announcement' },
        },
        exits: ['street', 'konbini', 'station-platform', 'airport'],
        activity: {
            label: { ja: '駅の案内を聞く', en: 'Listen to station notices' },
            detail: { ja: '駅の前・中・駅から遠い場所を聞き取る。', en: 'Listen for what is in front of, inside, or far from the station.' },
        },
        practices: [
            {
                id: 'station-bookshop-location',
                kind: 'listening',
                sceneLabel: { ja: '駅前　案内', en: 'Station-front notice' },
                prompt: { ja: '駅の近くにある場所を選ぶ。', en: 'Choose the place near the station.' },
                audioLine: '駅の前に本屋があります。',
                choices: [
                    { id: 'bookshop', label: { ja: '本屋', en: 'Bookshop' } },
                    { id: 'restaurant', label: { ja: 'レストラン', en: 'Restaurant' } },
                    { id: 'toilet', label: { ja: 'トイレ', en: 'Toilet' } },
                ],
                correctChoiceId: 'bookshop',
                success: { ja: '駅の前の本屋と聞き取れた。', en: 'You heard that the bookshop is in front of the station.' },
                review: {
                    id: 'review:world:station:bookshop-location',
                    conceptId: 'concept:world:station:bookshop-location',
                    expression: '駅の前に本屋があります。',
                    reading: 'えきのまえにほんやがあります。',
                    meanings: ['There is a bookshop in front of the station.'],
                },
            },
            {
                id: 'station-counter-location',
                kind: 'listening',
                sceneLabel: { ja: '駅なか　案内', en: 'Inside-station notice' },
                prompt: { ja: '駅の中にあるものを選ぶ。', en: 'Choose what is inside the station.' },
                audioLine: '駅の中にコンビニがあります。',
                choices: [
                    { id: 'konbini', label: { ja: 'コンビニ', en: 'Convenience store' } },
                    { id: 'bookshop', label: { ja: '本屋', en: 'Bookshop' } },
                    { id: 'restaurant', label: { ja: 'レストラン', en: 'Restaurant' } },
                ],
                correctChoiceId: 'konbini',
                success: { ja: '駅の中のコンビニと聞き取れた。', en: 'You heard that the convenience store is inside the station.' },
                review: {
                    id: 'review:world:station:counter-location',
                    conceptId: 'concept:world:station:counter-location',
                    expression: '駅の中にコンビニがあります。',
                    reading: 'えきのなかにこんびにがあります。',
                    meanings: ['There is a convenience store inside the station.'],
                },
            },
            {
                id: 'station-far-location',
                kind: 'listening',
                sceneLabel: { ja: '駅から　案内', en: 'Station-distance notice' },
                prompt: { ja: '駅から遠い場所を選ぶ。', en: 'Choose the place far from the station.' },
                audioLine: 'レストランは駅から遠いです。',
                choices: [
                    { id: 'restaurant', label: { ja: 'レストラン', en: 'Restaurant' } },
                    { id: 'konbini', label: { ja: 'コンビニ', en: 'Convenience store' } },
                    { id: 'bookshop', label: { ja: '本屋', en: 'Bookshop' } },
                ],
                correctChoiceId: 'restaurant',
                success: { ja: 'レストランが駅から遠いと聞き取れた。', en: 'You heard that the restaurant is far from the station.' },
                review: {
                    id: 'review:world:station:far-location',
                    conceptId: 'concept:world:station:far-location',
                    expression: 'レストランは駅から遠いです。',
                    reading: 'れすとらんはえきからとおいです。',
                    meanings: ['The restaurant is far from the station.'],
                },
            },
        ],
        objects: [{
            id: 'station-platform-sound',
            kind: 'audio',
            label: { ja: '駅の環境音', en: 'Platform ambience' },
            detail: { ja: '列車、雨、ホームの音を切り替える。', en: 'Toggle trains, rain, and platform ambience.' },
        }],
    },
    {
        id: 'konbini',
        region: 'bloomsbury',
        label: { ja: 'コンビニ', en: 'Convenience store' },
        scene: 'konbini',
        people: ['nanako'],
        composition: {
            motif: 'konbini',
            purposeSurface: 'checkout-counter',
            landmarks: [
                { id: 'store-stripes', depth: 'far' },
                { id: 'warm-shelves', depth: 'middle' },
                { id: 'checkout-basket', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'nanako',
            line: {
                ja: '「いらっしゃいませ。値段を聞いて、千円札を数えてください。」',
                en: '“Welcome. Listen for the price, then count the ¥1,000 notes.”',
            },
            action: { ja: 'レジへ', en: 'Go to the counter' },
        },
        exits: ['street', 'station', 'ramen', 'japan-centre'],
        activity: {
            label: { ja: 'レジで買い物をする', en: 'Shop at the counter' },
            detail: { ja: '値段を聞く・買いたい物を言う。', en: 'Ask a price and say what you want to buy.' },
        },
        practices: [
            {
                id: 'konbini-shirt-price',
                kind: 'counter',
                sceneLabel: { ja: 'レジ 01・シャツ', en: 'Register 01 · Shirt' },
                prompt: { ja: '値段を聞いて、千円札の数をレジに入れる。', en: 'Listen for the price, then count the ¥1,000 notes into the register.' },
                audioLine: 'シャツは ３，０００えん',
                choices: [],
                correctChoiceId: 'cash-count',
                manipulation: {
                    kind: 'cash-count',
                    item: { ja: 'シャツ', en: 'Shirt' },
                    denominationYen: 1000,
                    correctCount: 3,
                    maxCount: 8,
                },
                success: { ja: '三枚で、３，０００円。レジの金額が合った。', en: 'Three notes make ¥3,000. The register total matches.' },
                review: {
                    id: 'review:world:konbini:shirt-price',
                    conceptId: 'concept:l1-l07:shirt-price',
                    expression: 'シャツは ３，０００えん',
                    reading: 'シャツは さんぜんえん',
                    meanings: ['The shirt is 3,000 yen.'],
                    sourceQuestionId: 'l1-l07/ex-listen-detail',
                },
            },
            {
                id: 'konbini-cd-price',
                kind: 'counter',
                sceneLabel: { ja: 'レジ 02・CD', en: 'Register 02 · CD' },
                prompt: { ja: '値段を聞いて、千円札の数をレジに入れる。', en: 'Listen for the price, then count the ¥1,000 notes into the register.' },
                audioLine: 'どれも １，０００えん',
                choices: [],
                correctChoiceId: 'cash-count',
                manipulation: {
                    kind: 'cash-count',
                    item: { ja: 'CD', en: 'CD' },
                    denominationYen: 1000,
                    correctCount: 1,
                    maxCount: 8,
                },
                success: { ja: '一枚で、１，０００円。どのCDも同じ値段だ。', en: 'One note makes ¥1,000. Every CD has the same price.' },
                review: {
                    id: 'review:world:konbini:cd-price',
                    conceptId: 'concept:l1-l07:cd-price',
                    expression: 'どれも １，０００えん',
                    reading: 'どれも せんえん',
                    meanings: ['Each one is 1,000 yen.'],
                    sourceQuestionId: 'l1-l07/ex-read-price',
                },
            },
            {
                id: 'konbini-bag-checkout',
                kind: 'counter',
                sceneLabel: { ja: 'レジ 03・かばん', en: 'Register 03 · Bag' },
                prompt: { ja: '値段を聞いて、千円札の数をレジに入れる。', en: 'Listen for the price, then count the ¥1,000 notes into the register.' },
                audioLine: 'この かばんは いくらですか。８，０００えんです。',
                choices: [],
                correctChoiceId: 'cash-count',
                manipulation: {
                    kind: 'cash-count',
                    item: { ja: 'かばん', en: 'Bag' },
                    denominationYen: 1000,
                    correctCount: 8,
                    maxCount: 8,
                    completionLine: { ja: 'この かばんを ください', en: 'This bag, please.' },
                },
                success: { ja: '八枚で、８，０００円。「この かばんを ください」で会計できた。', en: 'Eight notes make ¥8,000. You can check out with “この かばんを ください”.' },
                review: {
                    id: 'review:world:konbini:bag-price',
                    conceptId: 'concept:l1-l07:bag-price',
                    expression: 'この かばんは いくらですか。８，０００えんです。',
                    reading: 'この かばんは いくらですか。はっせんえんです。',
                    meanings: ['How much is this bag? It is 8,000 yen.'],
                    sentence: 'この かばんを ください',
                    sourceQuestionId: 'l1-l07/ex-ikura-cloze',
                },
            },
        ],
        objects: [{
            id: 'konbini-register-sound',
            kind: 'audio',
            label: { ja: 'レジの音', en: 'Register sound' },
            detail: { ja: '店内音楽とレジの数える音を切り替える。', en: 'Toggle the store music and register count.' },
        }],
    },
    {
        id: 'ramen',
        region: 'bloomsbury',
        label: { ja: 'ラーメン屋', en: 'Ramen shop' },
        scene: 'ramen',
        // Rie is always available. Shin joins only after the canonical encounter
        // projection has introduced him; his blocked likeness remains a silhouette.
        people: ['rie', 'shin'],
        composition: {
            motif: 'ramen',
            purposeSurface: 'noren-menu',
            landmarks: [
                { id: 'paper-lanterns', depth: 'far' },
                { id: 'red-noren', depth: 'middle' },
                { id: 'ramen-counter', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'rie',
            line: {
                ja: '「注文票があります。まず聞いて、品物と数をそろえましょう。」',
                en: '“Here is the order ticket. Listen first, then match each item and quantity.”',
            },
            action: { ja: '注文する', en: 'Order at the counter' },
        },
        exits: ['street', 'konbini', 'restaurant', 'izakaya'],
        activity: {
            label: { ja: '注文票をそろえる', en: 'Complete the order ticket' },
            detail: { ja: '元の聞き取りの品物と数を、注文票にそろえる。', en: 'Tally the items and quantities from the source listening order.' },
        },
        practices: [
            {
                id: 'ramen-a43-order-one',
                kind: 'ordering',
                sceneLabel: { ja: 'CD A-43・注文 1', en: 'CD A-43 · Order 1' },
                prompt: { ja: '聞き取りの一番の注文票に、品物と数をそろえる。', en: 'Tally the items and quantities for the first listening order.' },
                audioLine: '紅茶一つ、ビール一つ、サンドイッチ二つですね。',
                source: ramenOrderingSource('l1-l19/ex-l19-a43-order-1'),
                choices: [],
                correctChoiceId: 'source-grid',
                manipulation: {
                    kind: 'order-grid',
                    rows: [
                        {
                            id: 'tea', item: { ja: '紅茶', en: 'Tea' }, correctQuantityId: 'one',
                            quantityChoices: [
                                { id: 'one', label: { ja: '一つ', en: 'One' } },
                                { id: 'two', label: { ja: '二つ', en: 'Two' } },
                                { id: 'three', label: { ja: '三つ', en: 'Three' } },
                            ],
                        },
                        {
                            id: 'beer', item: { ja: 'ビール', en: 'Beer' }, correctQuantityId: 'one',
                            quantityChoices: [
                                { id: 'one', label: { ja: '一つ', en: 'One' } },
                                { id: 'two', label: { ja: '二つ', en: 'Two' } },
                                { id: 'three', label: { ja: '三つ', en: 'Three' } },
                            ],
                        },
                        {
                            id: 'sandwich', item: { ja: 'サンドイッチ', en: 'Sandwich' }, correctQuantityId: 'two',
                            quantityChoices: [
                                { id: 'one', label: { ja: '一つ', en: 'One' } },
                                { id: 'two', label: { ja: '二つ', en: 'Two' } },
                                { id: 'three', label: { ja: '三つ', en: 'Three' } },
                            ],
                        },
                    ],
                },
                success: { ja: '紅茶、ビール、サンドイッチの数を注文票にそろえた。', en: 'You matched the tea, beer, and sandwich quantities on the order ticket.' },
                review: {
                    id: 'review:world:ramen:a43-order-one',
                    conceptId: 'concept:l1-l19:listening-order-1',
                    expression: '紅茶一つ、ビール一つ、サンドイッチ二つ',
                    meanings: ['One tea, one beer, and two sandwiches.'],
                    sourceQuestionId: 'l1-l19/ex-l19-a43-order-1',
                },
            },
            {
                id: 'ramen-a43-order-two',
                kind: 'ordering',
                sceneLabel: { ja: 'CD A-43・注文 2', en: 'CD A-43 · Order 2' },
                prompt: { ja: '聞き取りの二番の注文票に、品物と数をそろえる。', en: 'Tally the items and quantities for the second listening order.' },
                audioLine: 'カレーライス二つ、サンドイッチ一つ、ジュース二つですね。',
                source: ramenOrderingSource('l1-l19/ex-l19-a43-order-2'),
                choices: [],
                correctChoiceId: 'source-grid',
                manipulation: {
                    kind: 'order-grid',
                    rows: [
                        {
                            id: 'curry-rice', item: { ja: 'カレーライス', en: 'Curry rice' }, correctQuantityId: 'two',
                            quantityChoices: [
                                { id: 'one', label: { ja: '一つ', en: 'One' } },
                                { id: 'two', label: { ja: '二つ', en: 'Two' } },
                                { id: 'three', label: { ja: '三つ', en: 'Three' } },
                            ],
                        },
                        {
                            id: 'sandwich', item: { ja: 'サンドイッチ', en: 'Sandwich' }, correctQuantityId: 'one',
                            quantityChoices: [
                                { id: 'one', label: { ja: '一つ', en: 'One' } },
                                { id: 'two', label: { ja: '二つ', en: 'Two' } },
                                { id: 'three', label: { ja: '三つ', en: 'Three' } },
                            ],
                        },
                        {
                            id: 'juice', item: { ja: 'ジュース', en: 'Juice' }, correctQuantityId: 'two',
                            quantityChoices: [
                                { id: 'one', label: { ja: '一つ', en: 'One' } },
                                { id: 'two', label: { ja: '二つ', en: 'Two' } },
                                { id: 'three', label: { ja: '三つ', en: 'Three' } },
                            ],
                        },
                    ],
                },
                success: { ja: 'カレー、サンドイッチ、ジュースの数を注文票にそろえた。', en: 'You matched the curry rice, sandwich, and juice quantities on the order ticket.' },
                review: {
                    id: 'review:world:ramen:a43-order-two',
                    conceptId: 'concept:l1-l19:listening-order-2',
                    expression: 'カレーライス二つ、サンドイッチ一つ、ジュース二つ',
                    meanings: ['Two curry rices, one sandwich, and two juices.'],
                    sourceQuestionId: 'l1-l19/ex-l19-a43-order-2',
                },
            },
        ],
        objects: [{
            id: 'ramen-kitchen',
            kind: 'audio',
            label: { ja: '厨房の音', en: 'Kitchen sounds' },
            detail: { ja: '湯気、器、厨房の音を切り替える。', en: 'Toggle steam, bowls, and kitchen ambience.' },
        }],
    },
    {
        id: 'japan-centre',
        region: 'bloomsbury',
        label: { ja: 'ジャパンセンター', en: 'Japan Centre' },
        scene: 'japanCentre',
        people: ['sophie', 'aakash', 'felix'],
        composition: {
            motif: 'japan-centre',
            purposeSurface: 'gift-counter',
            landmarks: [
                { id: 'storefront-lantern', depth: 'far' },
                { id: 'gift-shelves', depth: 'middle' },
                { id: 'omiyage-tag', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'sophie',
            line: {
                ja: '「お土産を探していますか。札を一緒に読んでみましょう。」',
                en: '“Are you looking for a gift? Let us read the tag together.”',
            },
            action: { ja: '札を見る', en: 'Read the tag' },
        },
        exits: ['konbini', 'bookshop', 'ramen'],
        activity: {
            label: { ja: '札を読んでレジで伝える', en: 'Read a tag, then respond at the counter' },
            detail: { ja: '元の買い物のことばで、札の品物とレジの返事をそろえる。', en: 'Use the source shopping language to connect a tagged item and counter reply.' },
        },
        practices: [
            {
                id: 'japan-centre-bag-request',
                kind: 'counter',
                sceneLabel: { ja: 'お土産の札・お願い', en: 'Gift tag · Request' },
                prompt: { ja: '札のかばんを見つけて、レジで言うことばを選ぶ。', en: 'Find the bag tag, then choose what to say at the counter.' },
                audioLine: 'このかばんをください。',
                choices: [
                    { id: 'correct', label: { ja: 'このかばんをください。', en: 'This bag, please.' } },
                    { id: 'price', label: { ja: 'このかばんはいくらですか。', en: 'How much is this bag?' } },
                    { id: 'where', label: { ja: 'このかばんはどこですか。', en: 'Where is this bag?' } },
                ],
                correctChoiceId: 'correct',
                manipulation: {
                    kind: 'counter-tag',
                    tags: [
                        { id: 'shirt', label: { ja: 'シャツ', en: 'Shirt' } },
                        { id: 'cd', label: { ja: 'CD', en: 'CD' } },
                        { id: 'bag', label: { ja: 'かばん', en: 'Bag' } },
                    ],
                    correctTagId: 'bag',
                },
                source: japanCentreShoppingSource('l1-l07/ex-kudasai'),
                success: { ja: 'かばんの札を見て、レジで頼めた。', en: 'You read the bag tag and made the counter request.' },
                review: {
                    id: 'review:world:japan-centre:bag-request',
                    conceptId: 'concept:l1-l07:kudasai',
                    expression: 'このかばんをください。',
                    meanings: ['This bag, please.'],
                    sourceQuestionId: 'l1-l07/ex-kudasai',
                },
            },
            {
                id: 'japan-centre-bag-price',
                kind: 'counter',
                sceneLabel: { ja: 'お土産の札・値段', en: 'Gift tag · Price' },
                prompt: { ja: '札のかばんを見つけて、店員の値段の返事を選ぶ。', en: 'Find the bag tag, then choose the clerk’s price reply.' },
                audioLine: 'このかばんはいくらですか。８，０００えんです。',
                choices: [
                    { id: 'correct', label: { ja: '８，０００えんです。', en: 'It is 8,000 yen.' } },
                    { id: 'one-thousand', label: { ja: '１，０００えんです。', en: 'It is 1,000 yen.' } },
                    { id: 'three-thousand', label: { ja: '３，０００えんです。', en: 'It is 3,000 yen.' } },
                ],
                correctChoiceId: 'correct',
                manipulation: {
                    kind: 'counter-tag',
                    tags: [
                        { id: 'shirt', label: { ja: 'シャツ', en: 'Shirt' } },
                        { id: 'cd', label: { ja: 'CD', en: 'CD' } },
                        { id: 'bag', label: { ja: 'かばん', en: 'Bag' } },
                    ],
                    correctTagId: 'bag',
                },
                source: japanCentreShoppingSource('l1-l07/ex-ikura-cloze'),
                success: { ja: 'かばんの札と８，０００えんの返事をそろえた。', en: 'You matched the bag tag with the 8,000-yen reply.' },
                review: {
                    id: 'review:world:japan-centre:bag-price',
                    conceptId: 'concept:l1-l07:bag-price',
                    expression: 'このかばんはいくらですか。８，０００えんです。',
                    meanings: ['How much is this bag? It is 8,000 yen.'],
                    sourceQuestionId: 'l1-l07/ex-ikura-cloze',
                },
            },
        ],
        objects: [{
            id: 'japan-centre-shop-bell',
            kind: 'audio',
            label: { ja: '店のベル', en: 'Shop bell' },
            detail: { ja: '棚のざわめきとレジのベルを切り替える。', en: 'Toggle shelf chatter and the counter bell.' },
        }],
    },
    {
        id: 'home',
        region: 'home',
        label: { ja: '家', en: 'Home' },
        scene: 'home',
        people: ['aakash'],
        composition: {
            motif: 'home',
            purposeSurface: 'journal-desk',
            landmarks: [
                { id: 'rainy-rooftops', depth: 'far' },
                { id: 'desk-lamp', depth: 'middle' },
                { id: 'tied-journal', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'aakash',
            line: {
                ja: '「おかえりなさい。今日は、帰ってきてからどんな時間でしたか？」',
                en: '“Welcome home. What kind of time have you had since you came back today?”',
            },
            action: { ja: '今夜のページを開く', en: 'Open tonight’s page' },
        },
        exits: ['street', 'courtyard'],
        activity: {
            label: { ja: 'Aakash-sanと通話で今日の記録を読む', en: 'Read today’s journal with Aakash on a call' },
            detail: { ja: 'Aakash-sanは自分の机から通話で参加する。今日の場面と出会った人を振り返る。', en: 'Aakash joins from his own desk on a call; revisit today’s scenes and people.' },
            route: 'journal',
        },
        practices: [
            {
                id: 'home-usually-return',
                kind: 'availability',
                sceneLabel: { ja: '帰る時間', en: 'The time we return' },
                prompt: { ja: '日誌に「家に帰る」習慣を順番に書く。', en: 'Put the home-return routine in journal order.' },
                audioLine: 'メアリーさんはたいてい六時ごろ家に帰ります。',
                choices: [],
                correctChoiceId: 'source-order',
                manipulation: {
                    kind: 'token-order',
                    tokens: [
                        { id: 'mary', label: { ja: 'メアリーさんは', en: 'Mary' } },
                        { id: 'usually', label: { ja: 'たいてい', en: 'usually' } },
                        { id: 'six', label: { ja: '六時ごろ', en: 'at about six' } },
                        { id: 'home', label: { ja: '家に', en: 'home' } },
                        { id: 'return', label: { ja: '帰ります。', en: 'returns' } },
                    ],
                    correctTokenIds: ['mary', 'usually', 'six', 'home', 'return'],
                },
                source: {
                    primary: {
                        corpus: 'genki',
                        sourceId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
                        label: { ja: 'Genki I・3課・Workbook 5・4', en: 'Genki I · Lesson 3 · Workbook 5 · item 4' },
                        relation: 'exact-task',
                    },
                    supports: [],
                },
                success: { ja: '帰宅する習慣を日誌に書けた。', en: 'You wrote the return-home routine in the journal.' },
                review: {
                    id: 'review:world:home:usually-return',
                    conceptId: 'concept:l1-l10:daily-routine:genki-usually-return',
                    expression: 'メアリーさんはたいてい六時ごろ家に帰ります。',
                    reading: 'めありーさんはたいていろくじごろいえにかえります。',
                    meanings: ['Mary usually returns home at about six.'],
                    sourceQuestionId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
                },
            },
            {
                id: 'home-usually-sleep',
                kind: 'availability',
                sceneLabel: { ja: '眠る時間', en: 'The time we sleep' },
                prompt: { ja: '日誌に「寝る」習慣を順番に書く。', en: 'Put the sleep routine in journal order.' },
                audioLine: 'メアリーさんはたいてい十一時ごろ寝ます。',
                choices: [],
                correctChoiceId: 'source-order',
                manipulation: {
                    kind: 'token-order',
                    tokens: [
                        { id: 'mary', label: { ja: 'メアリーさんは', en: 'Mary' } },
                        { id: 'usually', label: { ja: 'たいてい', en: 'usually' } },
                        { id: 'eleven', label: { ja: '十一時ごろ', en: 'at about eleven' } },
                        { id: 'sleep', label: { ja: '寝ます。', en: 'sleeps' } },
                    ],
                    correctTokenIds: ['mary', 'usually', 'eleven', 'sleep'],
                },
                source: {
                    primary: {
                        corpus: 'genki',
                        sourceId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-5',
                        label: { ja: 'Genki I・3課・Workbook 5・5', en: 'Genki I · Lesson 3 · Workbook 5 · item 5' },
                        relation: 'exact-task',
                    },
                    supports: [],
                },
                success: { ja: '寝る習慣を日誌に書けた。', en: 'You wrote the sleep routine in the journal.' },
                review: {
                    id: 'review:world:home:usually-sleep',
                    conceptId: 'concept:l1-l10:daily-routine:genki-usually-sleep',
                    expression: 'メアリーさんはたいてい十一時ごろ寝ます。',
                    reading: 'めありーさんはたいていじゅういちじごろねます。',
                    meanings: ['Mary usually goes to bed at about eleven.'],
                    sourceQuestionId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-5',
                },
            },
        ],
        objects: [{
            id: 'home-radio',
            kind: 'audio',
            label: { ja: 'ラジオ', en: 'Radio' },
            detail: { ja: '帰宅後の音と音楽を切り替える。', en: 'Toggle the at-home sound and music.' },
        }],
    },
    {
        id: 'cafeteria',
        region: 'campus',
        label: { ja: '学生食堂', en: 'Student dining' },
        scene: 'cafe',
        people: ['aakash', 'felix'],
        composition: {
            motif: 'cafeteria',
            purposeSurface: 'meal-tray',
            landmarks: [
                { id: 'menu-window', depth: 'far' },
                { id: 'tray-rail', depth: 'middle' },
                { id: 'order-slip', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'felix',
            line: {
                ja: '「注文はそれぞれです。自分のトレーを先にそろえましょう。」',
                en: '“Everyone orders separately. Let us build your own tray first.”',
            },
            action: { ja: 'トレーを取る', en: 'Take a tray' },
        },
        exits: ['courtyard', 'classroom', 'cafe'],
        activity: {
            label: { ja: 'トレーに注文をそろえる', en: 'Build the order on a tray' },
            detail: { ja: '元の注文会話の品物・を・数・くださいを、トレーに順番に置く。', en: 'Arrange the source item, を, quantity, and ください on your tray.' },
        },
        practices: [
            {
                id: 'cafeteria-draft-beer-order',
                kind: 'ordering',
                prompt: { ja: '元の会話の飲み物の注文を、トレーに順番に置く。', en: 'Place the source drink order on the tray in its original order.' },
                audioLine: 'なまビールをふたつください。',
                choices: [
                    { id: 'drink', label: { ja: 'なまビール', en: 'draft beer' } },
                    { id: 'object', label: { ja: 'を', en: 'object marker' } },
                    { id: 'quantity', label: { ja: 'ふたつ', en: 'two' } },
                    { id: 'request', label: { ja: 'ください。', en: 'please' } },
                ],
                correctChoiceId: 'request',
                manipulation: {
                    kind: 'token-order',
                    tokens: [
                        { id: 'drink', label: { ja: 'なまビール', en: 'draft beer' } },
                        { id: 'object', label: { ja: 'を', en: 'object marker' } },
                        { id: 'quantity', label: { ja: 'ふたつ', en: 'two' } },
                        { id: 'request', label: { ja: 'ください。', en: 'please' } },
                    ],
                    correctTokenIds: ['drink', 'object', 'quantity', 'request'],
                },
                success: { ja: '自分のトレーに、元の飲み物の注文をそろえられた。', en: 'You assembled the source drink order on your own tray.' },
                review: {
                    id: 'review:world:cafeteria:draft-beer-order',
                    conceptId: 'concept:l1-l19:food-order:drink-request',
                    expression: 'なまビールをふたつください。',
                    meanings: ['Two draft beers, please.'],
                    sentence: 'なまビールをふたつください。',
                    sourceQuestionId: 'moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order',
                },
            },
            {
                id: 'cafeteria-draft-beer-request',
                kind: 'ordering',
                prompt: { ja: '同じ注文から、ていねいな終わり方をトレーに置く。', en: 'Use the same source order and place its polite ending on the tray.' },
                audioLine: 'なまビールをふたつください。',
                choices: [
                    { id: 'drink', label: { ja: 'なまビール', en: 'draft beer' } },
                    { id: 'object', label: { ja: 'を', en: 'object marker' } },
                    { id: 'quantity', label: { ja: 'ふたつ', en: 'two' } },
                    { id: 'request', label: { ja: 'ください。', en: 'please' } },
                ],
                correctChoiceId: 'request',
                manipulation: {
                    kind: 'token-order',
                    tokens: [
                        { id: 'quantity', label: { ja: 'ふたつ', en: 'two' } },
                        { id: 'request', label: { ja: 'ください。', en: 'please' } },
                    ],
                    correctTokenIds: ['quantity', 'request'],
                },
                success: { ja: '数のあとに、ていねいな注文の終わり方を置けた。', en: 'You placed the polite request ending after the quantity.' },
                review: {
                    id: 'review:world:cafeteria:draft-beer-request',
                    conceptId: 'concept:l1-l19:food-order:drink-request',
                    expression: 'なまビールをふたつください。',
                    meanings: ['Two draft beers, please.'],
                    sentence: 'なまビールをふたつください。',
                    sourceQuestionId: 'moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order',
                },
            },
        ],
        objects: [{
            id: 'cafeteria-tray-rattle',
            kind: 'audio',
            label: { ja: 'トレーの音', en: 'Tray sounds' },
            detail: { ja: '食堂のトレーと食器の音を切り替える。', en: 'Toggle the cafeteria tray and tableware ambience.' },
        }],
    },
    {
        id: 'bookshop',
        region: 'campus',
        label: { ja: '書店', en: 'Bookshop' },
        scene: 'bookshop',
        people: ['sophie'],
        composition: {
            motif: 'bookshop',
            purposeSurface: 'bookshop-shelf',
            landmarks: [
                { id: 'towering-shelves', depth: 'far' },
                { id: 'genre-endcap', depth: 'middle' },
                { id: 'order-slip', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'sophie',
            line: {
                ja: '「辞書をお探しですか。棚を一緒に見ましょう。」',
                en: '“Are you looking for a dictionary? Let us check the shelves together.”',
            },
            action: { ja: '棚を見る', en: 'Browse the shelves' },
        },
        exits: ['library', 'street'],
        activity: {
            label: { ja: '辞書があるかたずねる', en: 'Ask whether a dictionary is available' },
            detail: { ja: 'レベル1の「じしょがありますか」の形で、棚にある物をたずねる。', en: 'Use Level 1’s じしょがありますか pattern to ask what the shelf has.' },
        },
        practices: [
            {
                id: 'bookshop-dictionary-available',
                kind: 'availability',
                prompt: { ja: '店員に「じしょがありますか」とたずねる。返事を選ぶ。', en: 'Ask “Is there a dictionary?” and choose the reply.' },
                audioLine: 'じしょが ありますか。',
                choices: [
                    { id: 'correct', label: { ja: 'はい、あります。', en: 'Yes, there is.' } },
                    { id: 'no', label: { ja: 'いいえ、ありません。', en: 'No, there is not.' } },
                    { id: 'price', label: { ja: 'いくらですか。', en: 'How much is it?' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: '辞書があるか確認できた。', en: 'You confirmed that the dictionary is available.' },
                review: {
                    id: 'review:world:bookshop:dictionary-available',
                    conceptId: 'concept:l1-l14:reason:6',
                    expression: 'じしょが ありますか。',
                    meanings: ['Is there a dictionary?'],
                    sourceQuestionId: 'moodle:6097314:f7854a77:p2:q2:1',
                },
            },
            {
                id: 'bookshop-small-change-available',
                kind: 'availability',
                prompt: { ja: 'レジで「こまかい おかね」があるかたずねる。返事を選ぶ。', en: 'At the till, ask whether there is small change and choose the reply.' },
                audioLine: 'こまかい おかねが ありますか。',
                choices: [
                    { id: 'correct', label: { ja: 'はい、たくさん あります。', en: 'Yes, there is plenty.' } },
                    { id: 'no', label: { ja: 'いいえ、たくさん ありません。', en: 'No, there is not much.' } },
                    { id: 'not-at-all', label: { ja: 'はい、ぜんぜん あります。', en: 'Yes, not at all there is.' } },
                ],
                correctChoiceId: 'correct',
                success: { ja: 'こまかいお金がたくさんあると確認できた。', en: 'You confirmed that there is plenty of small change.' },
                review: {
                    id: 'review:world:bookshop:small-change-available',
                    conceptId: 'concept:l1-l14:reason:7',
                    expression: 'はい、たくさん あります。',
                    meanings: ['Yes, there is plenty.'],
                    sourceQuestionId: 'moodle:6097314:f7854a77:p2:q2:4',
                },
            },
        ],
        objects: [{
            id: 'bookshop-catalogue',
            kind: 'audio',
            label: { ja: '目録カード', en: 'Catalogue card' },
            detail: { ja: 'カードをめくる音を切り替える。', en: 'Toggle the catalogue-card turn.' },
        }],
    },
    {
        id: 'park',
        region: 'bloomsbury',
        label: { ja: '公園', en: 'Park' },
        scene: 'park',
        people: ['felix', 'peter'],
        composition: {
            motif: 'park',
            purposeSurface: 'weather-sketchbook',
            landmarks: [
                { id: 'plane-trees', depth: 'far' },
                { id: 'weather-ribbon', depth: 'middle' },
                { id: 'park-bench', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'felix',
            line: {
                ja: '「今日は天気がよくないですね。でも、公園はきれいです。空の色を一つ、紙に残しませんか。」',
                en: '“The weather is not good today, but the park is beautiful. Shall we leave one colour from the sky on paper?”',
            },
            action: { ja: '空を見る', en: 'Look at the sky' },
        },
        exits: ['street', 'cafe', 'home'],
        activity: {
            label: { ja: '空模様を写す', en: 'Catch the weather' },
            detail: { ja: '天気と公園の様子を、出典のことばで紙に残す。', en: 'Press a sourced weather or park description into the sketchbook.' },
            curriculum: {
                id: 'source:l1-l11:park-weather-description',
                surface: 'textbook',
                state: 'grounded',
                label: { ja: '天気と描写の出典', en: 'Weather and description sources' },
            },
        },
        practices: [
            {
                id: 'park-overcast-weather',
                kind: 'listening',
                sceneLabel: { ja: '雨上がり・曇り空', en: 'After rain · overcast sky' },
                prompt: { ja: '天気はよくないです。', en: 'The weather is not good.' },
                audioLine: '天気はよくないです。',
                choices: [{ id: 'cloud-silver', label: { ja: '雲の銀色', en: 'Cloud silver' } }],
                correctChoiceId: 'cloud-silver',
                source: {
                    primary: {
                        corpus: 'genki',
                        sourceId: 'genki-2e:l1-l11:lesson-5-workbook-2:slot-9',
                        label: { ja: 'Genki I・Lesson 5・Workbook 2・9', en: 'Genki I · Lesson 5 · Workbook 2 · item 9' },
                        relation: 'exact-task',
                    },
                    supports: [{
                        corpus: 'moodle',
                        sourceId: 'moodle:6053028:dfec00d8:p1:q1:2',
                        label: { ja: 'Moodle・ハイドパークの描写', en: 'Moodle · Hyde Park description' },
                        relation: 'sequence-only',
                    }],
                },
                success: { ja: '曇り空の色を紙に残しました。', en: 'You pressed the overcast sky into the page.' },
                review: {
                    id: 'review:world:park:overcast-weather',
                    conceptId: 'concept:l1-l11:genki-weather-negative',
                    expression: '天気はよくないです。',
                    meanings: ['The weather is not good.'],
                    sourceQuestionId: 'genki-2e:l1-l11:lesson-5-workbook-2:slot-9',
                },
            },
            {
                id: 'park-hyde-description',
                kind: 'listening',
                sceneLabel: { ja: '秋・木々の道', en: 'Autumn · tree-lined path' },
                prompt: { ja: 'ハイドパークはきれいな公園です。', en: 'Hyde Park is a beautiful park.' },
                audioLine: 'ハイドパークは きれいな こうえんです。',
                choices: [{ id: 'leaf-green', label: { ja: '葉の緑', en: 'Leaf green' } }],
                correctChoiceId: 'leaf-green',
                source: {
                    primary: {
                        corpus: 'moodle',
                        sourceId: 'moodle:6053028:dfec00d8:p1:q1:2',
                        label: { ja: 'Moodle・ハイドパークの描写', en: 'Moodle · Hyde Park description' },
                        relation: 'exact-task',
                    },
                    supports: [{
                        corpus: 'genki',
                        sourceId: 'genki-2e:l1-l11:lesson-5-workbook-2:slot-9',
                        label: { ja: 'Genki I・天気の問題', en: 'Genki I · weather item' },
                        relation: 'sequence-only',
                    }],
                },
                success: { ja: '木々の色を紙に残しました。', en: 'You pressed the tree-lined path into the page.' },
                review: {
                    id: 'review:world:park:hyde-description',
                    conceptId: 'concept:l1-l11:moodle-na-adjective-park',
                    expression: 'ハイドパークは きれいな こうえんです。',
                    meanings: ['Hyde Park is a beautiful park.'],
                    sourceQuestionId: 'moodle:6053028:dfec00d8:p1:q1:2',
                },
            },
            {
                id: 'park-blossom-description',
                kind: 'listening',
                sceneLabel: { ja: '春・花の小道', en: 'Spring · blossom path' },
                prompt: { ja: 'さくらはきれいな花です。', en: 'Cherry blossom is a beautiful flower.' },
                audioLine: 'さくらは きれいな はなです。',
                choices: [{ id: 'blossom-pink', label: { ja: '花の桃色', en: 'Blossom pink' } }],
                correctChoiceId: 'blossom-pink',
                source: {
                    primary: {
                        corpus: 'moodle',
                        sourceId: 'moodle:6053028:dfec00d8:p2:q2:5',
                        label: { ja: 'Moodle・さくらの描写', en: 'Moodle · cherry blossom description' },
                        relation: 'exact-task',
                    },
                    supports: [{
                        corpus: 'genki',
                        sourceId: 'genki-2e:l1-l11:lesson-5-workbook-2:slot-9',
                        label: { ja: 'Genki I・天気の問題', en: 'Genki I · weather item' },
                        relation: 'sequence-only',
                    }],
                },
                success: { ja: '花の色を紙に残しました。', en: 'You pressed the blossom colour into the page.' },
                review: {
                    id: 'review:world:park:blossom-description',
                    conceptId: 'concept:l1-l11:moodle-na-adjective-flower',
                    expression: 'さくらは きれいな はなです。',
                    meanings: ['Cherry blossom is a beautiful flower.'],
                    sourceQuestionId: 'moodle:6053028:dfec00d8:p2:q2:5',
                },
            },
        ],
        objects: [{
            id: 'park-sketchbook',
            kind: 'audio',
            label: { ja: '空のスケッチ帳', en: 'Sky sketchbook' },
            detail: { ja: '紙の音を切り替える。', en: 'Toggle the paper sound.' },
        }],
    },
    {
        id: 'station-platform',
        region: 'commute',
        label: { ja: '地下鉄ホーム', en: 'Tube platform' },
        scene: 'stationPlatform',
        people: ['aakash'],
        composition: {
            motif: 'station-platform',
            purposeSurface: 'transfer-board',
            landmarks: [
                { id: 'overhead-lines', depth: 'far' },
                { id: 'carriage-door', depth: 'middle' },
                { id: 'transfer-map', depth: 'near' },
            ],
        },
        arrivalDialogue: {
            speakerId: 'aakash',
            line: {
                ja: '「雨ですね。いつもの地下鉄が何分か、アナウンスを一緒に聞きましょう。」',
                en: '“Rain again. Let’s listen for how long the usual Tube journey takes.”',
            },
            action: { ja: 'ホームで聞く', en: 'Listen on the platform' },
        },
        exits: ['station', 'train'],
        activity: {
            label: { ja: 'いつものルートを聞く', en: 'Catch the usual route' },
            detail: { ja: 'ストの日と、いつもの地下鉄の時間を聞き分ける。', en: 'Separate the strike-day journey from the usual Tube time.' },
        },
        practices: [
            {
                id: 'tube-platform-usual-thirty',
                kind: 'transfer',
                sceneLabel: { ja: 'A-46　いつもの通学', en: 'A-46 · Usual commute' },
                prompt: { ja: 'いつもの交通手段と時間を選ぶ。', en: 'Choose the usual transport and journey time.' },
                audioLine: 'いつも ちかてつで ３０ぷん だけ です。',
                choices: [
                    { id: 'tube-30', label: { ja: '地下鉄　３０分', en: 'Tube · 30 minutes' } },
                    { id: 'bus-2h', label: { ja: 'バス　２時間', en: 'Bus · 2 hours' } },
                    { id: 'walk-15', label: { ja: '歩いて　１５分', en: 'On foot · 15 minutes' } },
                ],
                correctChoiceId: 'tube-30',
                source: tubeCommuteSource('moodle:6375062:49468890a807f485a2c86cf2c05f6c3e11b6e2bf0cbd2ca50da662de8b91e5f5:pdf-p3:short-dialogues-2:item-1'),
                success: { ja: 'いつもの地下鉄は３０分だと聞き取れた。', en: 'You caught the usual 30-minute Tube journey.' },
                review: {
                    id: 'review:world:tube-platform:usual-thirty',
                    conceptId: 'concept:l1-l21:commute-comparison:1',
                    expression: 'いつも ちかてつで ３０ぷん だけ です。',
                    meanings: ['Usually it is only thirty minutes by Tube.'],
                    sourceQuestionId: 'l1-l21/ex-l21-a46-strike-example',
                },
            },
            {
                id: 'tube-platform-usual-fifteen',
                kind: 'transfer',
                sceneLabel: { ja: 'A-46　帰りの再放送', en: 'A-46 · Return replay' },
                prompt: { ja: '再放送から、いつものルートを選ぶ。', en: 'Choose the usual route in the replay.' },
                audioLine: 'いつも ちかてつで １５ぷん だけ です。',
                choices: [
                    { id: 'walk-90', label: { ja: '歩いて　１時間半', en: 'On foot · 90 minutes' } },
                    { id: 'tube-15', label: { ja: '地下鉄　１５分', en: 'Tube · 15 minutes' } },
                    { id: 'bus-45', label: { ja: 'バス　４５分', en: 'Bus · 45 minutes' } },
                ],
                correctChoiceId: 'tube-15',
                source: tubeCommuteSource('moodle:6375062:49468890a807f485a2c86cf2c05f6c3e11b6e2bf0cbd2ca50da662de8b91e5f5:pdf-p3:short-dialogues-2:item-2'),
                success: { ja: 'いつもの地下鉄は１５分だと聞き取れた。', en: 'You caught the usual 15-minute Tube journey.' },
                review: {
                    id: 'review:world:tube-platform:usual-fifteen',
                    conceptId: 'concept:l1-l21:commute-comparison:2',
                    expression: 'いつも ちかてつで １５ぷん だけ です。',
                    meanings: ['Usually it is only fifteen minutes by Tube.'],
                    sourceQuestionId: 'l1-l21/ex-l21-a46-strike-walk-tube',
                },
            },
        ],
        objects: [{
            id: 'tube-platform-signal',
            kind: 'audio',
            label: { ja: 'ホームの信号音', en: 'Platform signal' },
            detail: { ja: '許可済みの信号音と音楽を切り替える。', en: 'Toggle the authorized signal cue and music.' },
        }],
    },
    {
        id: 'train',
        region: 'commute',
        label: { ja: '電車', en: 'Train' },
        scene: 'entrance',
        people: ['peter'],
        exits: ['station-platform', 'tokyo-station'],
        activity: {
            label: { ja: '車内アナウンスを聞く', en: 'Listen on the train' },
            detail: { ja: '次の駅・優先席・遅延を聞き取る。', en: 'Listen for the next stop, priority seats, and delays.' },
        },
        availability: locked('車内アナウンスの音声を準備中。', 'Opens with verified train-announcement audio.'),
    },
    {
        id: 'supermarket',
        region: 'bloomsbury',
        label: { ja: 'スーパー', en: 'Supermarket' },
        scene: 'writingStudio',
        people: ['nanako'],
        exits: ['street', 'konbini', 'restaurant'],
        activity: {
            label: { ja: '量り売りで買う', en: 'Shop by quantity' },
            detail: { ja: '値段・重さ・特売をたずねる。', en: 'Ask about prices, weight, and specials.' },
        },
        availability: locked('スーパーでの買い物レッスンを準備中。', 'Opens with the grounded supermarket-shopping lesson.'),
    },
    {
        id: 'restaurant',
        region: 'bloomsbury',
        label: { ja: '定食屋', en: 'Set-meal restaurant' },
        scene: 'cafe',
        people: ['felix'],
        exits: ['ramen', 'supermarket', 'street'],
        activity: {
            label: { ja: '定食を注文する', en: 'Order a set meal' },
            detail: { ja: 'おすすめ・苦手な食べ物・会計を使う。', en: 'Use recommendations, dietary preferences, and payment language.' },
        },
        availability: locked('定食屋での会話レッスンを準備中。', 'Opens with the grounded set-meal conversation.'),
    },
    {
        id: 'izakaya',
        region: 'bloomsbury',
        label: { ja: '居酒屋', en: 'Izakaya' },
        scene: 'cafe',
        people: ['aakash', 'felix'],
        exits: ['ramen', 'street'],
        activity: {
            label: { ja: '大人の食事会に参加する', en: 'Join an adult dinner' },
            detail: { ja: '乾杯・取り分け・丁寧な断り方を使う。', en: 'Use toasts, sharing food, and polite refusals.' },
        },
        availability: locked('成人向けの食事会レッスンを準備中。', 'Opens with the grounded adult dinner conversation.'),
    },
    {
        id: 'post-office',
        region: 'bloomsbury',
        label: { ja: '郵便局', en: 'Post office' },
        scene: 'writingStudio',
        people: ['rie'],
        exits: ['street', 'clinic'],
        activity: {
            label: { ja: '荷物を送る', en: 'Send a parcel' },
            detail: { ja: '宛先・重さ・速達を伝える。', en: 'Give an address, weight, and delivery speed.' },
        },
        availability: locked('郵便局で荷物を送る場面を準備中。', 'Opens with the grounded parcel-posting scene.'),
    },
    {
        id: 'clinic',
        region: 'bloomsbury',
        label: { ja: 'クリニック', en: 'Clinic' },
        scene: 'home',
        people: ['rie'],
        exits: ['post-office', 'pharmacy'],
        activity: {
            label: { ja: '症状を伝える', en: 'Describe symptoms' },
            detail: { ja: '痛み・いつから・薬のアレルギーを伝える。', en: 'Describe pain, duration, and medicine allergies.' },
        },
        availability: locked('医療コミュニケーションの安全確認中。', 'Opens after the medical-communication lesson is safety-reviewed.'),
    },
    {
        id: 'pharmacy',
        region: 'bloomsbury',
        label: { ja: '薬局', en: 'Pharmacy' },
        scene: 'writingStudio',
        people: ['nanako'],
        exits: ['clinic', 'street'],
        activity: {
            label: { ja: '薬の説明を聞く', en: 'Hear medicine instructions' },
            detail: { ja: '用法・回数・注意を確認する。', en: 'Confirm dosage, frequency, and precautions.' },
        },
        availability: locked('薬局での安全確認済み会話を準備中。', 'Opens with the safety-reviewed pharmacy dialogue.'),
    },
    {
        id: 'office',
        region: 'bloomsbury',
        label: { ja: 'オフィス', en: 'Office' },
        scene: 'classroom',
        people: ['peter'],
        exits: ['street', 'station'],
        activity: {
            label: { ja: '予定を調整する', en: 'Schedule a meeting' },
            detail: { ja: '日時・会議室・丁寧な依頼を使う。', en: 'Use dates, meeting rooms, and polite requests.' },
        },
        availability: locked('仕事の予定調整レッスンを準備中。', 'Opens with the grounded workplace scheduling lesson.'),
    },
    {
        id: 'museum',
        region: 'bloomsbury',
        label: { ja: '美術館', en: 'Museum' },
        scene: 'library',
        people: ['sophie'],
        exits: ['park', 'street'],
        activity: {
            label: { ja: '展示を見る', en: 'Visit an exhibition' },
            detail: { ja: '感想・案内・写真のルールを使う。', en: 'Use opinions, directions, and photo rules.' },
        },
        availability: locked('美術館の案内場面を準備中。', 'Opens with the grounded museum-guide scene.'),
    },
    {
        id: 'shrine',
        region: 'japan',
        label: { ja: '神社', en: 'Shrine' },
        scene: 'entrance',
        people: ['rie'],
        exits: ['park', 'temple', 'festival'],
        activity: {
            label: { ja: '参拝の案内を聞く', en: 'Hear visiting guidance' },
            detail: { ja: '作法・季節行事・お願いごとを読む。', en: 'Read etiquette, seasonal events, and wishes.' },
        },
        availability: locked('文化的な案内と監修済みの場面を準備中。', 'Opens with the culturally reviewed shrine visit.'),
    },
    {
        id: 'temple',
        region: 'japan',
        label: { ja: 'お寺', en: 'Temple' },
        scene: 'entrance',
        people: ['rie'],
        exits: ['shrine', 'park'],
        activity: {
            label: { ja: '静かな案内を読む', en: 'Read a quiet guide' },
            detail: { ja: '拝観・御朱印・静かにする表現を使う。', en: 'Use admission, stamp-book, and quiet-space language.' },
        },
        availability: locked('お寺の案内場面を準備中。', 'Opens with the grounded temple-guide scene.'),
    },
    {
        id: 'hotel',
        region: 'commute',
        label: { ja: 'ホテル', en: 'Hotel' },
        scene: 'home',
        people: ['peter'],
        exits: ['station', 'airport', 'ryokan'],
        activity: {
            label: { ja: 'チェックインする', en: 'Check in' },
            detail: { ja: '予約・名前・朝食の希望を伝える。', en: 'Give a reservation, name, and breakfast preference.' },
        },
        availability: locked('ホテルのチェックイン場面を準備中。', 'Opens with the grounded hotel check-in scene.'),
    },
    {
        id: 'ryokan',
        region: 'japan',
        label: { ja: '旅館', en: 'Ryokan' },
        scene: 'home',
        people: ['rie'],
        exits: ['hotel', 'airport'],
        activity: {
            label: { ja: '宿の案内を聞く', en: 'Hear lodging guidance' },
            detail: { ja: '部屋・温泉・食事の時間を確認する。', en: 'Confirm rooms, baths, and meal times.' },
        },
        availability: locked('旅館の案内場面を準備中。', 'Opens with the grounded ryokan guidance scene.'),
    },
    {
        id: 'airport',
        region: 'commute',
        label: { ja: '空港', en: 'Airport' },
        scene: 'entrance',
        people: ['peter'],
        exits: ['station', 'hotel', 'tokyo-station'],
        activity: {
            label: { ja: '出発を確認する', en: 'Confirm departure' },
            detail: { ja: '搭乗口・荷物・遅延を確認する。', en: 'Confirm gates, baggage, and delays.' },
        },
        availability: locked('空港での出発案内を準備中。', 'Opens with verified airport-departure audio.'),
    },
    {
        id: 'festival',
        region: 'japan',
        label: { ja: '祭り会場', en: 'Festival grounds' },
        scene: 'entrance',
        people: ['aakash', 'felix'],
        exits: ['shrine', 'shotengai'],
        activity: {
            label: { ja: '屋台で買う', en: 'Buy from a stall' },
            detail: { ja: '注文・お釣り・待ち合わせを使う。', en: 'Use ordering, change, and meet-up language.' },
        },
        availability: locked('季節の祭り場面を準備中。', 'Opens with the grounded seasonal festival scene.'),
    },
    {
        id: 'shotengai',
        region: 'japan',
        label: { ja: '商店街', en: 'Shopping street' },
        scene: 'writingStudio',
        people: ['nanako', 'felix'],
        exits: ['festival', 'tokyo-station', 'hotel'],
        activity: {
            label: { ja: '店をたずねる', en: 'Ask about a shop' },
            detail: { ja: '営業時間・おすすめ・道順をたずねる。', en: 'Ask about opening hours, recommendations, and directions.' },
        },
        availability: locked('商店街を歩く場面を準備中。', 'Opens with the grounded shopping-street scene.'),
    },
    {
        id: 'tokyo-station',
        region: 'japan',
        label: { ja: '東京駅', en: 'Tokyo Station' },
        scene: 'entrance',
        people: ['aakash', 'peter'],
        exits: ['train', 'airport', 'shotengai'],
        activity: {
            label: { ja: '乗り換えをたずねる', en: 'Ask for a transfer' },
            detail: { ja: '路線・出口・新幹線の乗り換えを使う。', en: 'Use lines, exits, and shinkansen transfers.' },
        },
        availability: locked('東京駅での乗り換え場面を準備中。', 'Opens with the grounded Tokyo Station transfer scene.'),
    },
];

const PLACE_BY_ID = new Map(WORLD_PLACES.map(place => [place.id, place]));

const WORLD_REGION_LABELS: Readonly<Record<WorldRegionId, LocalizedText>> = {
    campus: { ja: 'キャンパス', en: 'Campus' },
    bloomsbury: { ja: 'ブルームズベリー（ロンドン）', en: 'Bloomsbury, London' },
    commute: { ja: '通学・移動', en: 'Commute' },
    home: { ja: '家', en: 'Home' },
    japan: { ja: '日本', en: 'Japan' },
};

export const WORLD_PLACE_IDS: readonly WorldPlaceId[] = Object.freeze(WORLD_PLACES.map(place => place.id));

/** Registry-backed region list for the world map. Adding a place never requires a map UI edit. */
export function worldRegions(): readonly WorldRegionProjection[] {
    return (Object.keys(WORLD_REGION_LABELS) as WorldRegionId[]).map(id => ({
        id,
        label: WORLD_REGION_LABELS[id],
        places: WORLD_PLACES.filter(place => place.region === id).map(place => place.id),
    }));
}

export function isWorldPlaceId(value: unknown): value is WorldPlaceId {
    return typeof value === 'string' && (WORLD_PLACE_IDS as readonly string[]).includes(value);
}

export function worldPlace(id: WorldPlaceId): WorldPlaceDefinition {
    const place = PLACE_BY_ID.get(id);
    if (!place) throw new TypeError(`Unknown world place: ${id}`);
    return place;
}

export function projectWorldPlace(id: WorldPlaceId, progress: WorldProgress): WorldPlaceProjection {
    const place = worldPlace(id);
    const availability = place.availability?.(progress) ?? OPEN;
    const phase = worldTimePhase(progress, id);
    return {
        ...place,
        activity: { ...place.activity, curriculum: curriculumHook(place) },
        people: rotatingPeople(place.people, progress, id),
        ...(place.practices ? { practice: place.practices[visitCount(progress, id) % place.practices.length]! } : {}),
        availability,
        moment: worldMoment(progress, phase),
        introduction: worldLocationIntroduction(id, progress.seenIntroductions),
        stamp: worldStamp(id, progress.seenIntroductions),
    };
}

function curriculumHook(place: WorldPlaceDefinition): WorldCurriculumHook {
    if (place.activity.curriculum) return place.activity.curriculum;
    const grounded = GROUNDED_CURRICULUM[place.id];
    if (grounded) return grounded;
    return {
        id: `moodle:planned:${place.id}`,
        surface: 'moodle',
        state: 'planned',
        label: { ja: 'Moodle活動（準備中）', en: 'Moodle activity (planned)' },
    };
}

const GROUNDED_CURRICULUM: Readonly<Partial<Record<WorldPlaceId, WorldCurriculumHook>>> = {
    courtyard: { id: 'moodle:class-journal', surface: 'moodle', state: 'grounded', label: { ja: 'クラス日誌', en: 'Class journal' } },
    classroom: { id: 'moodle:class-path', surface: 'moodle', state: 'grounded', label: { ja: '授業予定とシラバス', en: 'Class plan and syllabus' } },
    library: { id: 'moodle:spaced-review', surface: 'moodle', state: 'grounded', label: { ja: '間隔反復の復習', en: 'Spaced review' } },
    cafe: { id: 'story:aakash-meet', surface: 'story', state: 'grounded', label: { ja: '放課後の会話', en: 'After-class conversation' } },
    lab: { id: 'lesson-zero:classroom-repair', surface: 'textbook', state: 'grounded', label: { ja: 'レッスン0・もう一度お願いします', en: 'Lesson 0: one more time, please' } },
    cafeteria: { id: 'l1-l19:ordering-food', surface: 'moodle', state: 'grounded', label: { ja: 'レベル1・飲み物の注文', en: 'Level 1: drink ordering' } },
    street: { id: 'textbook:rainy-directions', surface: 'textbook', state: 'grounded', label: { ja: '雨の日の道案内', en: 'Rainy-day directions' } },
    station: { id: 'textbook:station-announcements', surface: 'textbook', state: 'grounded', label: { ja: '駅のアナウンス', en: 'Station announcements' } },
    konbini: { id: 'textbook:counter-shopping', surface: 'textbook', state: 'grounded', label: { ja: 'レジでの買い物', en: 'Counter shopping' } },
    ramen: { id: 'moodle:l1-l19:a43-order-grid', surface: 'moodle', state: 'grounded', label: { ja: 'Chapter 11・注文と助数詞', en: 'Chapter 11: ordering and counters' } },
    'japan-centre': { id: 'textbook:counter-shopping', surface: 'textbook', state: 'grounded', label: { ja: 'お土産を一つ選ぶ', en: 'Choose one gift' } },
    home: { id: 'moodle:journal-replay', surface: 'moodle', state: 'grounded', label: { ja: '日誌と場面の再生', en: 'Journal and scene replay' } },
    bookshop: { id: 'l1-l14:things-available', surface: 'textbook', state: 'grounded', label: { ja: 'レベル1・じしょがありますか', en: 'Level 1: is there a dictionary?' } },
    park: { id: 'source:l1-l11:park-weather-description', surface: 'textbook', state: 'grounded', label: { ja: '天気と描写の出典', en: 'Weather and description sources' } },
    'station-platform': { id: 'textbook:station-announcements', surface: 'textbook', state: 'grounded', label: { ja: '駅のアナウンス・乗り換え', en: 'Station announcements: transfers' } },
};

export function worldTimePhase(progress: WorldProgress, place: WorldPlaceId): WorldTimePhase {
    if (place === 'konbini') return 'evening';
    const phase: readonly WorldTimePhase[] = ['morning', 'lunch', 'after-class', 'evening', 'night'];
    return phase[(storyDay(progress) + visitCount(progress, place) - 1) % phase.length]!;
}

/** Natural, Japanese-first time tags for the current-place header. */
export const WORLD_TIME_PHASE_LABELS: Readonly<Record<WorldTimePhase, LocalizedText>> = {
    morning: { ja: '朝', en: 'Morning' },
    lunch: { ja: '昼休み', en: 'Lunch break' },
    'after-class': { ja: '放課後', en: 'After class' },
    evening: { ja: '夕方', en: 'Early evening' },
    night: { ja: '夜', en: 'Night' },
};

export function worldTimePhaseLabel(phase: WorldTimePhase): LocalizedText {
    return WORLD_TIME_PHASE_LABELS[phase];
}

export function worldLocationIntroduction(place: WorldPlaceId, seen: readonly string[] | undefined): WorldIntroduction {
    const id = `place:${place}`;
    return { id, isFirstVisit: !seen?.includes(id) };
}

export function worldStamp(place: WorldPlaceId, seen: readonly string[] | undefined): WorldStamp {
    const id = `action:world-stamp:${place}`;
    const reward = WORLD_REWARDS[place] ?? {
        prop: 'notebook' as const,
        label: { ja: `${worldPlace(place).label.ja}のメモ`, en: `${worldPlace(place).label.en} note` },
        use: { ja: '次の場面で、覚えた表現を見返す。', en: 'Review the expression at the next scene.' },
    };
    return {
        id,
        ...reward,
        claimed: seen?.includes(id) ?? false,
    };
}

const WORLD_REWARDS: Readonly<Partial<Record<WorldPlaceId, Pick<WorldStamp, 'prop' | 'art' | 'itemAssetId' | 'label' | 'use'>>>> = {
    courtyard: { prop: 'notebook', label: { ja: 'クラス日誌', en: 'Class journal note' }, use: { ja: '家の机で今日の場面を見返す。', en: 'Review today’s scenes at the desk at home.' } },
    classroom: { prop: 'notebook', art: ACADEMY_ASSETS.items.classroomBelongings, itemAssetId: 'item.classroom-belongings', label: { ja: '黒板メモ', en: 'Board note' }, use: { ja: '次の授業で予定と表現を確かめる。', en: 'Use it to check the next lesson plan and expressions.' } },
    library: { prop: 'bookmark', art: ACADEMY_ASSETS.items.libraryPhotoAlbum, itemAssetId: 'item.library-photo-album', label: { ja: '復習しおり', en: 'Review bookmark' }, use: { ja: '図書館で保存した語を復習する。', en: 'Use it to return to saved-word review in the library.' } },
    cafe: { prop: 'receipt', art: ACADEMY_ASSETS.items.cafeOrderScene, itemAssetId: 'item.cafe-order-scene', label: { ja: 'カフェの注文風景', en: 'Cafe order scene' }, use: { ja: '注文の品物と会話の流れを見返す。', en: 'Inspect the order and revisit the conversation flow.' } },
    street: { prop: 'notebook', art: ACADEMY_ASSETS.items.streetDirectionMap, itemAssetId: 'item.street-direction-map', label: { ja: '道案内マップ', en: 'Directions map' }, use: { ja: '通りで右・左の表現を地図で確かめる。', en: 'Use the map to practise right and left on the street.' } },
    station: { prop: 'ticket', art: ACADEMY_ASSETS.items.stationTicket, itemAssetId: 'item.station-ticket', label: { ja: '乗車券', en: 'Platform ticket' }, use: { ja: 'ホームで行き先と番線を確かめる。', en: 'Use it to check destination and platform at the station.' } },
    park: { prop: 'notebook', label: { ja: '空色の一枚', en: 'Sky impression' }, use: { ja: '公園で見つけた天気と描写のことばを見返す。', en: 'Revisit the weather and description found in the Park.' } },
    konbini: { prop: 'receipt', art: ACADEMY_ASSETS.items.konbiniShoppingList, itemAssetId: 'item.konbini-shopping-list', label: { ja: '買い物レシート', en: 'Shopping receipt' }, use: { ja: '次のレジで数と袋の表現を使う。', en: 'Use it for quantities and bag requests at the next counter.' } },
    ramen: { prop: 'menu', art: ACADEMY_ASSETS.items.ramenQuantityBoard, itemAssetId: 'item.ramen-quantity-board', label: { ja: '注文札', en: 'Order ticket' }, use: { ja: '次の食事で注文の表現を使う。', en: 'Use it to order at the next meal.' } },
    'japan-centre': { prop: 'bookmark', art: ACADEMY_ASSETS.items.japanCentreOmiyageTag, itemAssetId: 'item.japan-centre-omiyage-tag', label: { ja: 'お土産の札', en: 'Gift tag' }, use: { ja: '次の買い物で、品物と数を確かめる。', en: 'Use it to check the item and quantity at the next counter.' } },
    home: { prop: 'key', label: { ja: '机の鍵', en: 'Desk key' }, use: { ja: '机で日誌、再生、プロフィールを開く。', en: 'Use it at the desk for journal, replay, and profile.' } },
    cafeteria: { prop: 'receipt', label: { ja: '食堂の注文票', en: 'Dining order slip' }, use: { ja: '次の食事で、品物・数・くださいを順番に確かめる。', en: 'Use it to check item, quantity, and ください in order at the next meal.' } },
};

export function markWorldVisit(
    visits: WorldProgress['worldVisits'],
    place: WorldPlaceId,
): Readonly<Partial<Record<WorldPlaceId, number>>> {
    return { ...visits, [place]: visitCount({ completedScenes: [], completedEncounterIds: [], worldVisits: visits }, place) + 1 };
}

export function displayWorldPersonName(characterId: string, language: WorldLanguage): string {
    const member = getAcademyCastMember(characterId);
    if (member.category === 'teacher') return member.teacherSalutation?.[language] ?? member.firstName;
    return `${member.firstName}-san`;
}

export function worldRouteForPlace(place: WorldPlaceId): WorldRoute {
    if (place === 'courtyard') return 'campus';
    if (place === 'classroom') return 'classroom';
    if (place === 'library') return 'review';
    if (place === 'cafe' || place === 'lab' || place === 'street' || place === 'station'
        || place === 'konbini' || place === 'ramen' || place === 'home') return place;
    return 'world';
}

function worldMoment(progress: WorldProgress, phase: WorldTimePhase): LocalizedText {
    const day = storyDay(progress);
    const phaseText = worldTimePhaseLabel(phase);
    const season = day >= 6 ? { ja: '初夏', en: 'Early summer' } : { ja: '春', en: 'Spring' };
    return { ja: `${season.ja}・${day}日目・${phaseText.ja}`, en: `${season.en} · Day ${day} · ${phaseText.en}` };
}

function storyDay(progress: WorldProgress): number {
    return Math.max(1, Math.floor(progress.completedScenes.length / 2) + 1);
}

function visitCount(progress: WorldProgress, place: WorldPlaceId): number {
    return progress.worldVisits?.[place] ?? 0;
}

function rotatingPeople(people: readonly string[], progress: WorldProgress, place: WorldPlaceId): readonly string[] {
    const visible = people.filter(id => id === 'rie' || progress.metCharacterIds?.includes(id));
    if (!visible.length) return people.slice(0, 1);
    if (visible.length < 2) return visible;
    const offset = (storyDay(progress) + visitCount(progress, place)) % visible.length;
    return [...visible.slice(offset), ...visible.slice(0, offset)];
}

export function worldSceneSources(scene: AcademyPlateId): Readonly<{ wide: string; mobile: string }> {
    return ACADEMY_ASSETS.locations[scene];
}
