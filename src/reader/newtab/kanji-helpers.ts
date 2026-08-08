import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import type { DoodleStroke } from '../kanji/doodle';
import type { JpdbKanjiInfo, JpdbKanjiVocabulary } from '../jpdb/jpdb-kanji';
import { kanjiCharacters } from './index';
import { DEFAULT_OVERLAY_BACKGROUND_COLOR } from '../settings/index';
import { KANJI_DICTIONARIES_SOURCE_ID, KANJI_JPDB_SOURCE_ID, KANJI_ORIGINS_SOURCE_ID, KANJI_SIMILAR_WORDS_SOURCE_ID, KANJI_STROKE_SOURCE_ID, kanjiSourceLabel } from '../sources/sections';
import { stablePositiveHashId } from '../core/stable-hash';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import { jpdbVocabularyIdentityFromUrl } from '../jpdb/jpdb-vocabulary-url';
import type { RtkInfo } from '../kanji/rtk';
import type { JPDBCard, ReaderSettings } from '../app/types';
import { activeLearningTarget } from '../languages/target-runtime';
import type { LearningTargetModule } from '../languages/types';

const NEW_TAB_PUBLIC_JPDB_KANJI_SEED_LIMIT = 8;
const NEW_TAB_PUBLIC_JPDB_WORD_SEED_LIMIT = 12;
const NEW_TAB_HANDWRITING_GOOGLE_URL = 'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

export const NEW_TAB_HANDWRITING_COMMON_KANJI =
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄光入全公六共内円写冬出分切前力加動北十千午半南原反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        + '以衣医右雨運英映泳園遠王央横屋温化荷界開階寒感漢館岸起期客急級宮球究去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始姉指歯詩次事持式実写者主守酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対代第題炭短談着注柱丁帳調追定庭笛鉄転都度登島湯等豆動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和';

const NEW_TAB_PUBLIC_JPDB_COMMON_WORDS = [
    '時間', '世界', '日本語', '今日', '明日', '言葉', '友達', '家族', '勉強', '学校', '先生', '学生', '会社', '仕事', '電車', '料理',
    '食事', '音楽', '映画', '天気', '元気', '簡単', '大丈夫', '一緒', '大切', '自分', '問題', '生活', '場所', '理由', '練習', '説明',
    '質問', '意味', '経験', '準備', '約束', '連絡', '部屋', '旅行', '写真', '名前', '電話', '病院', '買い物', '食べ物', '飲み物',
];

export const newTabKanjiKeyword = (card: JPDBCard, fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null, localMeanings: string[]): string =>
    fullInfo?.keyword || rtk?.keyword || card.kanjiKeyword || localMeanings[0] || '';

export const fallbackSearchKanjiCard = (kanji: string): JPDBCard =>
    kanjiPlaceholderCard(kanji, stableNegativeNewTabId(`kanji:${kanji}`), 'fallback');

function kanjiPlaceholderCard(kanji: string, vid: number, source: JPDBCard['source']): JPDBCard {
    return {
        vid,
        sid: 0,
        rid: 0,
        spelling: kanji,
        reading: kanji,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source,
        sentence: kanji,
    };
}

export const oldFormsFact = (fullInfo: JpdbKanjiInfo | null): string => fullInfo?.oldForms.length ? fullInfo.oldForms.join(', ') : '';

export const isStandaloneKanjiCard = (card: JPDBCard, kanji: string): boolean =>
    card.spelling === kanji && kanjiCharacters(card.spelling).length === 1 && Array.from(card.spelling).length === 1;

// Synthetic kanji cards injected into the Word-tab queue by the kanji-unlock
// flow (jpdb parity): negative vid from stableNegativeNewTabId plus a
// single-kanji spelling identifies them so they render and grade as kanji
// even outside the Kanji tab.
export const isKanjiUnlockStudyCard = (card: JPDBCard): boolean =>
    card.vid < 0 && isStandaloneKanjiCard(card, card.spelling);

export const randomPublicJpdbSeedKanji = (limit = NEW_TAB_PUBLIC_JPDB_KANJI_SEED_LIMIT): string[] =>
    shuffleStrings(uniqueStrings(Array.from(NEW_TAB_HANDWRITING_COMMON_KANJI))).slice(0, Math.max(0, limit));

export const randomPublicJpdbSeedWords = (limit = NEW_TAB_PUBLIC_JPDB_WORD_SEED_LIMIT): string[] =>
    shuffleStrings(uniqueStrings([...NEW_TAB_PUBLIC_JPDB_COMMON_WORDS])).slice(0, Math.max(0, limit));

function shuffleStrings(values: string[]): string[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

export function jpdbKanjiVocabularyToNewTabCard(entry: JpdbKanjiVocabulary): JPDBCard {
    const identity = jpdbVocabularyIdentityFromUrl(entry.url);
    const spelling = cleanNewTabTextValue(identity?.spelling) || cleanNewTabTextValue(entry.expression);
    const reading = cleanNewTabTextValue(identity?.reading) || cleanNewTabTextValue(entry.reading) || spelling;
    const meaning = cleanNewTabTextValue(entry.meaning);
    return {
        vid: identity?.vid || stableNegativeNewTabId(`${spelling}\n${reading}\n${entry.url}`),
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: meaning ? [{ glosses: [meaning], partOfSpeech: [] }] : [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: spelling,
    };
}

const cleanNewTabTextValue = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

export const stableNegativeNewTabId = (value: string): number => -stablePositiveHashId(value);

export const fact = (label: string, value: string | undefined): [string, string] | null => value ? [label, value] : null;

export const compactFacts = (facts: Array<[string, string] | null>): [string, string][] =>
    facts.filter((item): item is [string, string] => Boolean(item));

export function heisigFact(fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null): string {
    const jpdbFrame = heisigFrameValue(fullInfo?.heisig);
    const rtkFrames = rtkFrameEntries(rtk?.frameNumber).filter(frame => frame.value !== jpdbFrame);
    return [
        jpdbFrame ? `JPDB #${jpdbFrame}` : '',
        ...rtkFrames.map(frame => `${frame.label} #${frame.value}`),
    ].filter(Boolean).join(' · ');
}

function heisigFrameValue(value: string | undefined): string {
    const frames = rtkFrameValues(value);
    return frames[frames.length - 1] ?? '';
}

const rtkFrameValues = (value: string | undefined): string[] => rtkFrameEntries(value).map(frame => frame.value);

function rtkFrameEntries(value: string | undefined): Array<{ label: string; value: string }> {
    if (!value) return [];
    const versioned = [...value.matchAll(/(V\d+)\s*:\s*#?(\d+)/giu)]
        .map(match => ({ label: match[1]?.toUpperCase() ?? '', value: match[2] ?? '' }))
        .filter(frame => frame.label && frame.value);
    return versioned.length
        ? versioned
        : [...value.matchAll(/#?(\d+)/gu)].map(match => ({ label: 'RTK', value: match[1] ?? '' })).filter(frame => frame.value);
}

export const newTabKanjiReadings = (fullInfo: JpdbKanjiInfo | null, localReadings: string[]): string[] =>
    fullInfo?.readings.length
        ? fullInfo.readings.slice(0, 8).map(reading => `${reading.reading}${reading.share ? ` ${reading.share}` : ''}`)
        : localReadings;

export const newTabKanjiSourceAttrs = (sourceStateKey: string, initiallyExpanded = true): string =>
    `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}" ${initiallyExpanded ? 'open' : ''}`;

export function newTabKanjiSourceTitle(settings: ReaderSettings, sourceId: string): string {
    return kanjiSourceLabel(settings, sourceId, defaultNewTabKanjiSourceTitle(settings, sourceId));
}

function defaultNewTabKanjiSourceTitle(settings: ReaderSettings, sourceId: string): string {
    const language = settings.interfaceLanguage;
    if (sourceId === KANJI_STROKE_SOURCE_ID) return uiText(language, 'strokePractice');
    if (sourceId === KANJI_JPDB_SOURCE_ID) return uiText(language, 'readingsComponents');
    if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return uiText(language, 'kanjiDictionaries');
    if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) return uiText(language, 'sourceNameWordsUsingKanji');
    if (sourceId === KANJI_ORIGINS_SOURCE_ID) return uiText(language, 'originStructure');
    return '';
}

export function normalizeJpdbKanjiInfo(info: JpdbKanjiInfo): JpdbKanjiInfo {
    return {
        kanji: textOrEmpty(info.kanji),
        keyword: textOrEmpty(info.keyword),
        frequency: textOrEmpty(info.frequency),
        type: textOrEmpty(info.type),
        kanken: textOrEmpty(info.kanken),
        heisig: textOrEmpty(info.heisig),
        oldForms: arrayOrEmpty(info.oldForms),
        readings: arrayOrEmpty(info.readings),
        components: arrayOrEmpty(info.components),
        usedInKanji: arrayOrEmpty(info.usedInKanji),
        mnemonic: textOrEmpty(info.mnemonic),
        vocabulary: arrayOrEmpty(info.vocabulary),
        actions: arrayOrEmpty(info.actions),
        loggedIn: Boolean(info.loggedIn),
        kanjiReviewsEnabled: Boolean(info.kanjiReviewsEnabled),
    };
}

const textOrEmpty = (value: unknown): string => typeof value === 'string' ? value : '';

const arrayOrEmpty = <T>(value: T[] | undefined): T[] => Array.isArray(value) ? value : [];

export function keywordCandidates(
    card: JPDBCard,
    jpdb: JpdbKanjiInfo | null,
    rtk: RtkInfo | null,
    source: ReaderSettings['newTabKanjiKeywordSource'],
): Array<string | undefined> {
    return keywordCandidateOrder(source).map(candidate => keywordCandidateValue(candidate, card, jpdb, rtk));
}

type KanjiKeywordCandidateSource = 'rtk' | 'jpdb' | 'local';
const KANJI_KEYWORD_CANDIDATE_ORDER: Record<string, KanjiKeywordCandidateSource[]> = {
    auto: ['rtk', 'jpdb', 'local'],
    rtk: ['rtk', 'local'],
    jpdb: ['jpdb', 'local'],
    local: ['local', 'jpdb', 'rtk'],
};

function keywordCandidateOrder(source: ReaderSettings['newTabKanjiKeywordSource']): KanjiKeywordCandidateSource[] {
    return KANJI_KEYWORD_CANDIDATE_ORDER[source] ?? KANJI_KEYWORD_CANDIDATE_ORDER.auto;
}

function keywordCandidateValue(
    source: KanjiKeywordCandidateSource,
    card: JPDBCard,
    jpdb: JpdbKanjiInfo | null,
    rtk: RtkInfo | null,
): string | undefined {
    if (source === 'rtk') return rtk?.keyword;
    if (source === 'jpdb') return jpdb?.keyword;
    return card.kanjiKeyword;
}

export const firstTruthy = (values: Array<string | undefined>): string => values.find(Boolean) ?? '';

export async function recognizeGoogleHandwriting(
    strokes: DoodleStroke[],
    target: LearningTargetModule = activeLearningTarget(),
): Promise<string[]> {
    if (typeof fetch !== 'function' || !strokes.length) return [];
    const response = await fetch(NEW_TAB_HANDWRITING_GOOGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            options: 'enable_pre_space',
            requests: [{
                writing_guide: {
                    writing_area_width: 240,
                    writing_area_height: 240,
                },
                ink: googleHandwritingInk(strokes),
                language: target.language,
            }],
        }),
    });
    if (!response.ok) return [];
    return googleHandwritingPredictionQueries(await response.json().catch(() => null));
}

const googleHandwritingInk = (strokes: DoodleStroke[]): number[][][] => strokes
    .map(stroke => [stroke.map(point => Math.round(point.x * 240)), stroke.map(point => Math.round(point.y * 240)), []])
    .filter(stroke => stroke[0].length > 1 && stroke[1].length > 1);

function googleHandwritingPredictionQueries(response: unknown): string[] {
    const results = nestedArrayAtPath(response, [1, 0, 1]);
    return uniqueStrings(results.flatMap(result => {
        const text = typeof result === 'string' ? result.trim() : '';
        return text ? [text] : [];
    })).slice(0, 8);
}

function nestedArrayAtPath(value: unknown, path: readonly number[]): unknown[] {
    let current = value;
    for (const index of path) {
        if (!Array.isArray(current)) return [];
        current = current[index];
    }
    return Array.isArray(current) ? current : [];
}

export const shouldWaitForMoreDoodleStrokes = (strokes: DoodleStroke[], expectedStrokes: number): boolean =>
    expectedStrokes > 0 && strokes.length < expectedStrokes;

export const visibleCardKanji = (card: JPDBCard | undefined): string =>
    card ? kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '' : '';

export function doodlePreviewDataUrl(canvas: HTMLCanvasElement): string {
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const context = snapshot.getContext('2d');
    if (!canPaintDoodlePreview(context)) return canvas.toDataURL('image/png');
    paintDoodlePreview(context, snapshot, canvas);
    return snapshot.toDataURL('image/png');
}

const canPaintDoodlePreview = (context: CanvasRenderingContext2D | null): context is CanvasRenderingContext2D =>
    Boolean(context && typeof context.fillRect === 'function' && typeof context.drawImage === 'function');

function paintDoodlePreview(context: CanvasRenderingContext2D, snapshot: HTMLCanvasElement, canvas: HTMLCanvasElement): void {
    context.fillStyle = doodlePreviewBackground(canvas);
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(canvas, 0, 0);
}

function doodlePreviewBackground(canvas: HTMLCanvasElement): string {
    const stage = canvas.closest<HTMLElement>('.jpdb-reader-doodle-stage');
    return getComputedStyle(stage ?? canvas).backgroundColor || DEFAULT_OVERLAY_BACKGROUND_COLOR;
}
