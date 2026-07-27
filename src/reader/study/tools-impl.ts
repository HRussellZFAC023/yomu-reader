import { DOCS_BASE_URL } from '../app/constants';
import { escapeHtml } from '../dom';
import { grammarRuleText, uiText, type UiCopyKey } from '../app/i18n';
import { requestJson as requestReaderJson } from '../network/http';
import {
    renderStudyEmpty,
    renderStudyList,
    renderStudySentenceAudioButton,
    renderStudySentenceBlock,
} from './section-render';
import type { InterfaceLanguage } from '../app/types';
import {
    readGrammarPreferences,
    setGrammarRuleKnown as persistGrammarRuleKnown,
    setKnownGrammarVisible as persistKnownGrammarVisible,
} from './grammar-knowledge';
import { YOMU_GRAMMAR_REGISTRY } from './grammar-registry';
import { translateText } from '../translation/google';

export interface GrammarHint {
    ruleId: string;
    name: string;
    level: GrammarLevel;
    kind: string;
    short: string;
    detail: string;
    url: string;
    match: string;
    confidence: 'high' | 'medium';
    index: number;
    examples?: GrammarExample[];
}

export interface GrammarExample {
    japanese: string;
    english: string;
    note?: string;
}

export type GrammarLevel = 'Core' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

interface GrammarPattern {
    ruleId: string;
    level: GrammarLevel;
    pattern: RegExp;
    name: string;
    url: string;
    confidence: GrammarHint['confidence'];
    priority: number;
}

interface GrammarRuleData {
    kind: string;
    short: string;
    detail: string;
    url?: string;
    examples: GrammarExample[];
}

type RankedGrammarHint = GrammarHint & { priority: number };

interface GroupedGrammarHint {
    hint: GrammarHint;
    count: number;
}

export interface GrammarPreferences {
    knownRuleIds: string[];
    showKnown: boolean;
}

export interface LocalGrammarRuleExample {
    ruleId: string;
    name: string;
    level: GrammarLevel;
    example: GrammarExample;
}

export interface LocalGrammarRuleSummary {
    ruleId: string;
    name: string;
    level: GrammarLevel;
    exampleCount: number;
}

const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやのて、。！？!?\s]{1,24}`;
const FORM_CHUNK = String.raw`[^はがをにへとでもやのてで、。！？!?\s]{0,24}`;
const MAX_LOCAL_GRAMMAR_HINTS = 12;
const GRAMMAR_HINT_CACHE_LIMIT = 240;
const TRANSLATION_TIMEOUT_MS = 5000;
const GRAMMAR_RULE_DATA_TIMEOUT_MS = 15000;
const EN_GRAMMAR_RULE_DATA_URL = `${DOCS_BASE_URL}data/en-grammar-rule-copy.json`;
const ENGLISH_TEXT_RE = /[A-Za-z]{3,}/u;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

function gp(
    ruleId: string,
    level: GrammarLevel,
    name: string,
    source: string,
    url = '',
    confidence: GrammarHint['confidence'] = 'medium',
    priority = 30,
): GrammarPattern {
    return { ruleId, level, pattern: new RegExp(source, 'gu'), name, url, confidence, priority };
}

function grammarPatternFromRule(rule: (typeof YOMU_GRAMMAR_REGISTRY)[number]): GrammarPattern {
    return gp(
        rule.ruleId,
        rule.level,
        rule.name,
        rule.patternSource.replaceAll('{F}', FORM_CHUNK).replaceAll('{P}', PARTICLE_CHUNK),
        rule.url,
        rule.confidence,
        rule.priority,
    );
}

const GRAMMAR_PATTERNS: GrammarPattern[] = YOMU_GRAMMAR_REGISTRY.map(grammarPatternFromRule);

const grammarHintCache = new Map<string, GrammarHint[]>();
let grammarRuleDataPromise: Promise<Record<string, GrammarRuleData>> | undefined;

export function resetGrammarRuleDataCacheForTests(): void {
    grammarRuleDataPromise = undefined;
}

export function listLocalGrammarRuleExamples(): LocalGrammarRuleExample[] {
    return YOMU_GRAMMAR_REGISTRY.flatMap(rule => rule.examples.map(example => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        example,
    })));
}

export function listLocalGrammarRules(): LocalGrammarRuleSummary[] {
    return YOMU_GRAMMAR_REGISTRY.map(rule => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        exampleCount: rule.examples.length,
    }));
}

export function detectGrammarHints(sentence: string): GrammarHint[] {
    const normalized = sentence.normalize('NFKC').replace(/\s+/g, '');
    const cached = grammarHintCache.get(normalized);
    if (cached) return cached;

    const seenMatches = new Set<string>();
    const seenNames = new Map<string, number>();
    const selected: RankedGrammarHint[] = [];
    const ranked = GRAMMAR_PATTERNS
        .flatMap(item => grammarMatches(item, normalized))
        .sort(compareRankedGrammarHints);
    for (const item of ranked) {
        const key = `${item.ruleId}:${item.match}:${item.index}`;
        if (seenMatches.has(key)) continue;
        const count = seenNames.get(item.ruleId) ?? 0;
        if (count >= 2) continue;
        if (selected.some(existing => shouldSuppressOverlappingGrammarHint(existing, item))) continue;
        seenMatches.add(key);
        seenNames.set(item.ruleId, count + 1);
        selected.push(item);
        if (selected.length >= MAX_LOCAL_GRAMMAR_HINTS) break;
    }
    const hints = selected
        .sort(compareGrammarHints)
        .map(({ priority: _priority, ...hint }) => hint);
    cacheGrammarHints(normalized, hints);
    return hints;
}

export function preloadGrammarResources(sentence: string, language: InterfaceLanguage = 'en'): GrammarHint[] {
    const hints = detectGrammarHints(sentence);
    if (hints.length) void loadGrammarRuleData().catch(() => undefined);
    if (language === 'ja' && hints.length) {
        void grammarRuleText(language, hints[0].ruleId).catch(() => undefined);
    }
    return hints;
}

export function preloadJapaneseSentenceTranslation(sentence: string, language = 'en'): void {
    void translateJapaneseSentence(sentence, language).catch(() => undefined);
}

function cacheGrammarHints(key: string, hints: GrammarHint[]): void {
    if (!key) return;
    grammarHintCache.set(key, hints);
    if (grammarHintCache.size <= GRAMMAR_HINT_CACHE_LIMIT) return;
    const oldest = grammarHintCache.keys().next().value;
    if (typeof oldest === 'string') grammarHintCache.delete(oldest);
}

function compareRankedGrammarHints(a: RankedGrammarHint, b: RankedGrammarHint): number {
    return a.priority - b.priority
        || a.index - b.index
        || b.match.length - a.match.length
        || a.name.localeCompare(b.name);
}

function compareGrammarHints(a: GrammarHint, b: GrammarHint): number {
    return a.index - b.index || a.name.localeCompare(b.name);
}

function shouldSuppressOverlappingGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    if (!grammarHintRangesOverlap(existing, next)) return false;
    if (sameGrammarHintLocation(existing, next)) return true;
    if (shouldKeepOverlappingGrammarHint(existing, next)) return false;
    return shouldSuppressLooseGrammarHint(existing, next)
        || shouldSuppressContainedGrammarHint(existing, next);
}

function sameGrammarHintLocation(existing: GrammarHint, next: GrammarHint): boolean {
    return existing.match === next.match && existing.index === next.index;
}

function grammarHintRangesOverlap(a: GrammarHint, b: GrammarHint): boolean {
    const aEnd = a.index + a.match.length;
    const bEnd = b.index + b.match.length;
    return a.index < bEnd && b.index < aEnd;
}

function shouldKeepOverlappingGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return isCopulaPriorityException(existing, next) || areBothHighConfidenceGrammarHints(existing, next);
}

function isCopulaPriorityException(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return existing.ruleId === 'copula-desu-da' && next.priority < 50;
}

function areBothHighConfidenceGrammarHints(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return existing.priority < 40 && next.priority < 40;
}

function shouldSuppressLooseGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return next.priority >= 40 && existing.priority < next.priority;
}

function shouldSuppressContainedGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return grammarHintContains(existing, next)
        && existing.priority <= next.priority
        && existing.match.length > next.match.length;
}

function grammarHintContains(outer: GrammarHint, inner: GrammarHint): boolean {
    return inner.index >= outer.index && grammarHintEnd(inner) <= grammarHintEnd(outer);
}

function grammarHintEnd(hint: GrammarHint): number {
    return hint.index + hint.match.length;
}

export function setGrammarRuleKnown(ruleId: string, known: boolean): GrammarPreferences {
    return persistGrammarRuleKnown(ruleId, known);
}

export function setKnownGrammarVisible(showKnown: boolean): GrammarPreferences {
    return persistKnownGrammarVisible(showKnown);
}

// A "sentence" reaching translation can be OCR or page noise (code
// screenshots, UI chrome) that merely contains a stray CJK character; Google
// passes the ASCII through and the popover ends up presenting garbage as a
// translation. Require the text to be meaningfully Japanese before asking.
const JAPANESE_CHAR = /[぀-ヿ㐀-鿿]/g;

export function isTranslatableJapaneseSentence(sentence: string): boolean {
    const trimmed = sentence.trim();
    if (!trimmed) return false;
    const japanese = trimmed.match(JAPANESE_CHAR)?.length ?? 0;
    if (japanese < 2) return false;
    const dense = trimmed.replace(/\s+/g, '').length;
    return japanese / dense >= 0.15;
}

export async function translateJapaneseSentence(sentence: string, language = 'en'): Promise<string> {
    const trimmed = sentence.trim();
    if (!trimmed || !isTranslatableJapaneseSentence(trimmed)) return '';
    const requestSentence = normalizeSentenceForTranslationRequest(trimmed);
    const targetLanguage = translationTargetLanguage(language);
    return translateText(requestSentence, {
        sourceLanguage: 'ja',
        targetLanguage,
        timeoutMs: TRANSLATION_TIMEOUT_MS,
        includeDictionaryData: true,
    });
}

function translationTargetLanguage(language: InterfaceLanguage | string): string {
    // The source is Japanese; Japanese UI is immersion chrome, not a translation target.
    return language === 'auto' || language === 'ja' ? 'en' : language;
}

function normalizeSentenceForTranslationRequest(sentence: string): string {
    return sentence
        .replace(/[「『]/g, '"')
        .replace(/[」』]/g, '"');
}

export async function renderGrammarHints(hints: GrammarHint[], sentence: string, preferences = readGrammarPreferences(), language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean } = {}): Promise<string> {
    if (!hints.length) return '';
    const knownRuleIds = new Set(preferences.knownRuleIds);
    const visibleHints = visibleGrammarHints(hints, knownRuleIds, preferences.showKnown);
    const visibleGroups = groupGrammarHintsByRule(visibleHints);
    const knownCount = countKnownGrammarHints(hints, knownRuleIds);
    const audioEnabled = options.audioEnabled ?? true;
    return `
        ${renderGrammarSentence(sentence, language, audioEnabled)}
        ${renderGrammarToolbar(visibleGroups.length, knownCount, preferences.showKnown, language)}
        ${await renderGrammarHintList(visibleGroups, knownRuleIds, language, audioEnabled)}`;
}

function visibleGrammarHints(hints: GrammarHint[], knownRuleIds: Set<string>, showKnown: boolean): GrammarHint[] {
    return showKnown ? hints : hints.filter(hint => !knownRuleIds.has(hint.ruleId));
}

function countKnownGrammarHints(hints: GrammarHint[], knownRuleIds: Set<string>): number {
    return new Set(hints.filter(hint => knownRuleIds.has(hint.ruleId)).map(hint => hint.ruleId)).size;
}

function groupGrammarHintsByRule(hints: GrammarHint[]): GroupedGrammarHint[] {
    const groups = new Map<string, GroupedGrammarHint>();
    for (const hint of hints) {
        const existing = groups.get(hint.ruleId);
        if (existing) {
            existing.count += 1;
            continue;
        }
        groups.set(hint.ruleId, { hint, count: 1 });
    }
    return Array.from(groups.values());
}

function renderGrammarSentence(sentence: string, language: InterfaceLanguage, audioEnabled: boolean): string {
    return renderStudySentenceBlock(sentence, language, { audioEnabled }, 'data-grammar-sentence');
}

function renderGrammarToolbar(visibleCount: number, knownCount: number, showKnown: boolean, language: InterfaceLanguage): string {
    const hiddenKnownCount = showKnown ? 0 : knownCount;
    return `
        <div class="jpdb-reader-grammar-toolbar" data-grammar-toolbar>
            <div class="jpdb-reader-grammar-summary">${escapeHtml(grammarSummary(visibleCount, hiddenKnownCount, language))}</div>
            ${renderGrammarKnownVisibilityButton(knownCount, showKnown, language)}
        </div>`;
}

function renderGrammarKnownVisibilityButton(knownCount: number, showKnown: boolean, language: InterfaceLanguage): string {
    if (!knownCount) return '';
    const label = showKnown ? uiText(language, 'grammarHideKnown') : uiText(language, 'grammarShowKnown');
    return `<button class="jpdb-reader-grammar-toggle" type="button" data-action="study-grammar-toggle-known-visibility" aria-pressed="${showKnown ? 'true' : 'false'}">${label}</button>`;
}

async function renderGrammarHintList(visibleGroups: GroupedGrammarHint[], knownRuleIds: Set<string>, language: InterfaceLanguage, audioEnabled: boolean): Promise<string> {
    if (!visibleGroups.length) return renderStudyEmpty(uiText(language, 'allDetectedGrammarKnown'));
    const items = await Promise.all(visibleGroups.map(group => renderGrammarHintItem(group, knownRuleIds.has(group.hint.ruleId), language, audioEnabled)));
    return renderStudyList(items, 'data-grammar-list');
}

async function renderGrammarHintItem(group: GroupedGrammarHint, known: boolean, language: InterfaceLanguage, audioEnabled: boolean): Promise<string> {
    const { hint, count } = group;
    const details = await grammarHintDetails(hint, language);
    const displayName = grammarDisplayName(hint, language);
    return `
            <li class="jpdb-reader-study-item${known ? ' known' : ''}" data-grammar-rule-id="${escapeHtml(hint.ruleId)}">
                <div class="jpdb-reader-study-name">
                    <span>${escapeHtml(displayName)}</span>
                    <span class="jpdb-reader-grammar-level">${escapeHtml(grammarLevelText(hint.level, language))}</span>
                </div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(details.kind)}</div>
                        <div class="jpdb-reader-grammar-actions">
                            ${renderGrammarRepeatCount(count)}
                            <button class="jpdb-reader-grammar-known" type="button" data-action="study-grammar-toggle-known" data-grammar-rule-id="${escapeHtml(hint.ruleId)}" data-grammar-known="${known ? 'true' : 'false'}" aria-pressed="${known ? 'true' : 'false'}">${known ? uiText(language, 'grammarReview') : uiText(language, 'grammarKnown')}</button>
                        </div>
                    </div>
                    <div class="jpdb-reader-study-short jpdb-reader-parseable">${escapeHtml(details.short)}</div>
                    ${renderGrammarHintDisclosure(hint, details, displayName, language, audioEnabled)}
                </div>
            </li>`;
}

// Reported from an owner screenshot as "the Details button does nothing".
//
// The control was never dead: <details>/<summary> toggles correctly, and it is
// measurably reachable — it is not a nested-parse root, so no annotated word
// ever sits inside it to steal the click the way the document click path steals
// clicks on annotated chrome. What it lacked was anything of its own to show.
//
// The bundled grammar registry (grammar-registry.ts) ships NO prose: a rule
// carries only id/level/name/pattern/url and an empty example list. Every word
// of explanation lives in the remote en-grammar-rule-copy.json. When that
// request does not land, `grammarHintFallbackData` fills `short` AND `detail`
// with the same rule name — so the row read `と`, and opening Details revealed
// `と` again, one line below the `と` already on screen. From the outside that
// is indistinguishable from a broken button.
//
// So the disclosure is now earned rather than assumed: it is rendered only when
// there is an explanation or an example behind it. With nothing to reveal, the
// match line and the guide link render inline instead, which also promotes the
// guide from "hidden behind a toggle that opens onto a single link" into a
// control the user can see and click directly.
function renderGrammarHintDisclosure(
    hint: GrammarHint,
    details: GrammarRuleData,
    displayName: string,
    language: InterfaceLanguage,
    audioEnabled: boolean,
): string {
    const detail = renderGrammarHintDetail(details, displayName);
    const examples = renderGrammarHintExamples(details.examples, language, audioEnabled);
    const match = renderGrammarHintMatch(hint, language);
    const guide = renderGrammarHintGuide(details.url ?? '', language);
    if (!detail && !examples) return `${match}${guide}`;
    return `<details class="jpdb-reader-grammar-more">
                        <summary>${escapeHtml(uiText(language, 'grammarDetails'))}</summary>
                        ${detail}${match}${examples}${guide}
                    </details>`;
}

// A repeat is not a detail. Both fallbacks collapse onto the rule name, and the
// short line carrying that same name is already rendered directly above, so
// compare against both rather than only against `short`.
function renderGrammarHintDetail(details: GrammarRuleData, displayName: string): string {
    const detail = details.detail.trim();
    if (!detail || detail === details.short.trim() || detail === displayName.trim()) return '';
    return `<div class="jpdb-reader-study-detail jpdb-reader-parseable">${escapeHtml(detail)}</div>`;
}

function renderGrammarHintMatch(hint: GrammarHint, language: InterfaceLanguage): string {
    return `<div class="jpdb-reader-study-match"><span>${escapeHtml(uiText(language, 'grammarFoundIn'))}</span><span class="jpdb-reader-study-match-text jpdb-reader-parseable">${escapeHtml(hint.match)}</span></div>`;
}

function renderGrammarRepeatCount(count: number): string {
    return count > 1 ? `<span class="jpdb-reader-grammar-repeat">x${count}</span>` : '';
}

async function grammarHintDetails(hint: GrammarHint, language: InterfaceLanguage): Promise<GrammarRuleData> {
    const fallback = grammarHintFallbackData(hint, language);
    const englishData = await loadGrammarRuleData()
        .then(data => data[hint.ruleId])
        .catch(() => undefined);
    const base = englishData ? { ...fallback, ...englishData } : fallback;
    if (language !== 'ja') return base;
    const ruleCopy = await grammarRuleText(language, hint.ruleId);
    if (ruleCopy) return { ...base, ...ruleCopy };
    const name = grammarDisplayName(hint, language);
    return {
        ...base,
        kind: uiText(language, 'grammar'),
        short: interpolateUiText(language, 'grammarGenericShort', { name, match: hint.match }),
        detail: interpolateUiText(language, 'grammarGenericDetail', { name, match: hint.match }),
    };
}

function grammarHintFallbackData(hint: GrammarHint, language: InterfaceLanguage): GrammarRuleData {
    return {
        kind: hint.kind || uiText(language, 'grammar'),
        short: hint.short || grammarDisplayName(hint, language),
        detail: hint.detail || grammarDisplayName(hint, language),
        url: hint.url || undefined,
        examples: hint.examples ?? [],
    };
}

function grammarLevelText(level: GrammarLevel, language: InterfaceLanguage): string {
    return language === 'ja' && level === 'Core' ? uiText(language, 'grammarLevelCore') : level;
}

function grammarDisplayName(hint: GrammarHint, language: InterfaceLanguage): string {
    if (language !== 'ja' || !ENGLISH_TEXT_RE.test(hint.name)) return hint.name;
    if (JAPANESE_TEXT_RE.test(hint.match)) return hint.match;
    return japaneseGrammarText(hint.name) || hint.name;
}

function japaneseGrammarText(value: string): string {
    return (value.match(/[ぁ-んァ-ヶ一-龯々〆ヵヶー〜]+/gu) ?? []).join(' / ');
}

function interpolateUiText(language: InterfaceLanguage, key: UiCopyKey, values: Record<string, string>): string {
    return uiText(language, key).replace(/\{(\w+)}/g, (_, name: string) => values[name] ?? '');
}

function renderGrammarHintExamples(examples: GrammarExample[], language: InterfaceLanguage, audioEnabled: boolean): string {
    const visibleExamples = examples.slice(0, 2);
    if (!visibleExamples.length) return '';
    return `<div class="jpdb-reader-grammar-examples"><span>${escapeHtml(uiText(language, 'grammarExample'))}</span>${visibleExamples.map(example => renderGrammarExample(example, language, audioEnabled)).join('')}</div>`;
}

function renderGrammarExample(example: GrammarExample, language: InterfaceLanguage, audioEnabled: boolean): string {
    const english = language === 'ja' || !example.english ? '' : `<div>${escapeHtml(example.english)}</div>`;
    const note = language === 'ja' || !example.note || ENGLISH_TEXT_RE.test(example.note) ? '' : `<div>${escapeHtml(example.note)}</div>`;
    return `<div class="jpdb-reader-grammar-example jpdb-reader-parseable">
        <div class="jpdb-reader-grammar-example-japanese">
            <span class="jpdb-reader-parseable">${escapeHtml(example.japanese)}</span>
            ${renderStudySentenceAudioButton(language, { audioEnabled, sentence: example.japanese })}
        </div>
        ${english}${note}
    </div>`;
}

function renderGrammarHintGuide(url: string, language: InterfaceLanguage): string {
    return url ? `<a class="jpdb-reader-study-guide" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(uiText(language, 'grammarGuide'))}</a>` : '';
}

const BARE_MITAI_DESIRE_FALSE_POSITIVE_RE = /(?:読み|飲み|住み|休み|頼み|望み|悩み|包み|噛み|組み|編み|摘み|進み|歩み|楽しみ|悲しみ|苦しみ|試み)たい$/u;
const LEXICAL_DESIRE_TAI_RE = /^(?:いたい|痛い|冷たい|重たい|やたい)(?:です)?$/u;
const LEXICAL_NEGATIVE_NAI_RE = /(?:少ない|危ない|まかない|何気ない|さりげない|なにげない)$/u;
const LEXICAL_METHOD_KATA_RE = /(?:夕方|地方|親方|行方|方法|の方)$/u;
const LEXICAL_SUFFIX_GE_RE = /(?:からあげ|おかげ|さりげ|なにげ)$/u;
const LEXICAL_SUFFIX_MEKU_RE = /(?:きめき|きらめく|ひらめき|うごめく)$/u;
const LEXICAL_POSSIBILITY_ERU_RE = /^(?:得る|得ます|得た|得ました|得ない|得ません|得なかった|得ませんでした)$/u;
const PRONOUN_POSSESSIVE_NOMINALIZER_RE = /(?:私|僕|俺|彼|彼女|誰|何)の$/u;

interface GrammarMatchContext {
    rawMatch: string;
    before: string;
    following: string;
}

type GrammarMatchSkipPredicate = (context: GrammarMatchContext) => boolean;

const GRAMMAR_MATCH_SKIP_PREDICATES: Readonly<Record<string, GrammarMatchSkipPredicate>> = {
    'appearance-sou': ({ rawMatch }) => rawMatch === 'そう' || /(?:かわいそう|ごちそう)$/u.test(rawMatch),
    'hearsay-sou-da': ({ rawMatch }) => /(?:かわいそう|ごちそう)/u.test(rawMatch),
    'volitional-you': ({ rawMatch }) => rawMatch === 'よう' || rawMatch === 'さよう',
    'similarity-you-da': ({ rawMatch }) => rawMatch.startsWith('さよう'),
    'conditional-nara': ({ rawMatch }) => rawMatch.endsWith('さようなら'),
    'desire-tai': ({ rawMatch }) => LEXICAL_DESIRE_TAI_RE.test(rawMatch),
    'without-naide': ({ rawMatch, following }) => rawMatch.endsWith('ないで') && following.startsWith('す'),
    'negative-nai': ({ rawMatch }) => LEXICAL_NEGATIVE_NAI_RE.test(rawMatch),
    'method-kata': shouldSkipMethodKataMatch,
    'suffix-ge': ({ rawMatch }) => LEXICAL_SUFFIX_GE_RE.test(rawMatch),
    'state-mama': ({ rawMatch, before }) => rawMatch.includes('わがまま') || (rawMatch === 'まま' && before.endsWith('わが')),
    'difficulty-gatai': ({ rawMatch }) => rawMatch.endsWith('ありがたい'),
    'substitution-kawari-ni': ({ rawMatch }) => rawMatch.endsWith('おかわりに'),
    'suffix-meku': ({ rawMatch }) => LEXICAL_SUFFIX_MEKU_RE.test(rawMatch),
    'possibility-eru-enai': ({ rawMatch }) => LEXICAL_POSSIBILITY_ERU_RE.test(rawMatch) || rawMatch.startsWith('心得'),
    'suffix-gimi': ({ rawMatch }) => rawMatch.endsWith('不気味'),
    'fresh-tate': ({ rawMatch }) => rawMatch === 'たて',
    'elapsed-buri-ni': ({ rawMatch }) => rawMatch.endsWith('すぶりに'),
    'ease-yasui-nikui': ({ rawMatch }) => rawMatch === 'やすい',
    'examples-toka': ({ following }) => following.startsWith('言') || following.startsWith('聞') || following.startsWith('思'),
    'explanation-no-da': ({ rawMatch }) => /(?:私|僕|俺|彼|彼女|誰|何)の(?:だ|だった|じゃない|ではない)$/u.test(rawMatch),
    'skill-no-ga-suki': shouldSkipPronounPossessiveNominalizerMatch,
    'nominalizer-no': shouldSkipPronounPossessiveNominalizerMatch,
    'sensation-ga-suru': ({ rawMatch }) => /(?:彼|彼女|私|僕|俺|君|あなた|先生|友だち|子ども)がす/u.test(rawMatch),
    'standard-ni-shite-wa': ({ following }) => /^(?:いけ|なら|だめ)/u.test(following),
    'emphasis-sae': ({ rawMatch }) => rawMatch.endsWith('ささえ'),
    'emphasis-koso': ({ rawMatch }) => rawMatch.endsWith('ようこそ'),
    'evidence-rashii-mitai': ({ rawMatch }) => BARE_MITAI_DESIRE_FALSE_POSITIVE_RE.test(rawMatch),
};

function shouldSkipGrammarMatch(item: GrammarPattern, sentence: string, match: RegExpMatchArray): boolean {
    const predicate = GRAMMAR_MATCH_SKIP_PREDICATES[item.ruleId];
    if (!predicate) return false;
    return predicate(grammarMatchContext(sentence, match));
}

function grammarMatchContext(sentence: string, match: RegExpMatchArray): GrammarMatchContext {
    const rawMatch = match[0];
    const start = match.index ?? 0;
    const end = start + rawMatch.length;
    return {
        rawMatch,
        before: sentence.slice(Math.max(0, start - 4), start),
        following: sentence.slice(end, end + 6),
    };
}

function shouldSkipMethodKataMatch({ rawMatch, before, following }: GrammarMatchContext): boolean {
    return LEXICAL_METHOD_KATA_RE.test(rawMatch)
        || (rawMatch === '方' && (following.startsWith('法') || before.endsWith('の') || /[夕地親行]/u.test(before.slice(-1))));
}

function shouldSkipPronounPossessiveNominalizerMatch({ rawMatch }: GrammarMatchContext): boolean {
    return PRONOUN_POSSESSIVE_NOMINALIZER_RE.test(rawMatch);
}

function grammarMatches(item: GrammarPattern, sentence: string): RankedGrammarHint[] {
    return Array.from(sentence.matchAll(item.pattern))
        .filter(match => !shouldSkipGrammarMatch(item, sentence, match))
        .map(match => {
            const rawMatch = match[0];
            const learnerFacingMatch = learnerMatch(item.name, rawMatch);
            const learnerOffset = rawMatch.lastIndexOf(learnerFacingMatch);
            const indexOffset = learnerOffset > 0 ? learnerOffset : 0;
            return {
                ruleId: item.ruleId,
                name: item.name,
                level: item.level,
                kind: 'Grammar',
                short: item.name,
                detail: item.name,
                url: item.url,
                match: learnerFacingMatch,
                confidence: item.confidence,
                index: (match.index ?? 0) + indexOffset,
                priority: item.priority,
                examples: [],
            };
        })
        .filter(hint => hint.match.length > 0);
}

function grammarSummary(visibleCount: number, hiddenKnownCount: number, language: InterfaceLanguage): string {
    const shown = `${visibleCount} ${uiText(language, 'grammarShown')}`;
    if (hiddenKnownCount) return `${shown} · ${hiddenKnownCount} ${uiText(language, 'grammarKnownHidden')}`;
    return shown;
}

const LEARNER_MATCH_ENDING_NAMES = new Set([
    'たい', 'ない', 'ました', 'ます', 'た', 'よう', 'そう', '方', 'やすい / にくい', 'すぎる',
    'れる / られる', 'させる', 'させられる', 'がち', '気味', 'げ', 'っぽい', 'めく',
]);

const LEARNER_MATCH_HELPER_NAMES = new Set([
    'てください', 'ていただけませんか', 'ないでください', 'させてください', 'てほしい', 'てくれる / てもらう',
    'てしまう', 'てみる', 'ておく', 'ている', 'てある', 'てくる', 'ていく', 'てから',
]);

function learnerMatch(name: string, rawMatch: string): string {
    let match = rawMatch.replace(/^(?:そして|それで|でも|また|しかし|それに|つまり|ただし|だから)/u, '');
    if (LEARNER_MATCH_HELPER_NAMES.has(name)) {
        const afterClauseBoundary = match.replace(/^.*(?:[、。！？!?]|たら|なら|ので|から)/u, '');
        if (afterClauseBoundary) match = afterClauseBoundary;
    }
    if (!LEARNER_MATCH_ENDING_NAMES.has(name)) return match;
    const afterLastParticle = match.replace(/^.*[はがをにへともやの]/u, '');
    return afterLastParticle || match;
}

async function loadGrammarRuleData(): Promise<Record<string, GrammarRuleData>> {
    grammarRuleDataPromise ??= requestJson<Record<string, GrammarRuleData>>(EN_GRAMMAR_RULE_DATA_URL, {
        timeoutMs: GRAMMAR_RULE_DATA_TIMEOUT_MS,
        failureLabel: 'English grammar rule data request',
        timeoutLabel: 'Grammar rule data timed out.',
    })
        .then(normalizeGrammarRuleData)
        .catch(() => {
            grammarRuleDataPromise = undefined;
            return {};
        });
    return grammarRuleDataPromise;
}

function normalizeGrammarRuleData(value: unknown): Record<string, GrammarRuleData> {
    if (!isObjectRecord(value)) return {};
    const data: Record<string, GrammarRuleData> = {};
    for (const [ruleId, item] of Object.entries(value)) {
        const normalized = normalizeGrammarRuleDataItem(item);
        if (normalized) data[ruleId] = normalized;
    }
    return data;
}

function normalizeGrammarRuleDataItem(item: unknown): GrammarRuleData | undefined {
    if (!isObjectRecord(item)) return undefined;
    const candidate = item as Partial<Record<keyof GrammarRuleData, unknown>>;
    if (!hasRequiredGrammarRuleData(candidate)) return undefined;
    return {
        kind: candidate.kind,
        short: candidate.short,
        detail: candidate.detail,
        url: grammarRuleDataUrl(candidate.url),
        examples: normalizeGrammarExamples(candidate.examples),
    };
}

function hasRequiredGrammarRuleData(
    candidate: Partial<Record<keyof GrammarRuleData, unknown>>,
): candidate is Partial<Record<keyof GrammarRuleData, unknown>> & Pick<GrammarRuleData, 'kind' | 'short' | 'detail'> {
    return typeof candidate.kind === 'string'
        && typeof candidate.short === 'string'
        && typeof candidate.detail === 'string';
}

function grammarRuleDataUrl(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function normalizeGrammarExamples(value: unknown): GrammarExample[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const candidate = item as Partial<Record<keyof GrammarExample, unknown>>;
        if (typeof candidate.japanese !== 'string' || typeof candidate.english !== 'string') return [];
        return [{
            japanese: candidate.japanese,
            english: candidate.english,
            ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
        }];
    });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

interface StudyJsonRequestOptions {
    timeoutMs?: number;
    failureLabel?: string;
    timeoutLabel?: string;
}

function requestJson<T>(url: string, options: StudyJsonRequestOptions = {}): Promise<T> {
    return requestReaderJson(url, {
        timeoutMs: options.timeoutMs ?? TRANSLATION_TIMEOUT_MS,
        allowDirectCrossOrigin: true,
        allowConfiguredProxy: false,
        allowPublicProxies: false,
        preferFetch: true,
        failureLabel: options.failureLabel ?? 'Translation request',
        timeoutLabel: options.timeoutLabel ?? 'Translation timed out.',
    }) as Promise<T>;
}
