import { DOCS_BASE_URL } from '../app/constants';
import { escapeHtml } from '../dom';
import { grammarRuleText, resolveUiLanguage, uiText, type UiCopyKey } from '../app/i18n';
import { activeLearningTarget } from '../languages/target-runtime';
import { requestJson as requestReaderJson } from '../network/http';
import {
    renderStudyEmpty,
    renderStudyList,
    renderStudySentenceAudioButton,
    renderStudySentenceBlock,
} from './section-render';
import type { InterfaceLanguage } from '../app/types';
import {
    readTargetGrammarPreferences,
    setTargetGrammarRuleKnown as persistGrammarRuleKnown,
    setTargetKnownGrammarVisible as persistKnownGrammarVisible,
} from './grammar-knowledge';
import { currentGrammarAvailability, renderGrammarAvailability } from './grammar-availability';
import { translateText } from '../translation/google';
import type { GrammarPreferences } from './grammar-knowledge';
import type {
    GrammarExample,
    GrammarHint,
    GrammarLevel,
    LocalGrammarRuleExample,
    LocalGrammarRuleSummary,
    SentenceTranslationResult,
} from './tools-contract';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

export type { GrammarPreferences } from './grammar-knowledge';
export type {
    GrammarHint,
    LocalGrammarRuleExample,
    LocalGrammarRuleSummary,
    SentenceTranslationResult,
} from './tools-contract';

interface GrammarRuleData {
    kind: string;
    short: string;
    detail: string;
    url?: string;
    examples: GrammarExample[];
}

interface GroupedGrammarHint {
    hint: GrammarHint;
    count: number;
}

const TRANSLATION_TIMEOUT_MS = 5000;
const GRAMMAR_RULE_DATA_TIMEOUT_MS = 15000;
const EN_GRAMMAR_RULE_DATA_URL = `${DOCS_BASE_URL}data/en-grammar-rule-copy.json`;
const ENGLISH_TEXT_RE = /[A-Za-z]{3,}/u;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

let grammarRuleDataPromise: Promise<Record<string, GrammarRuleData>> | undefined;

export function resetGrammarRuleDataCacheForTests(): void {
    grammarRuleDataPromise = undefined;
}

export function listLocalGrammarRuleExamples(): LocalGrammarRuleExample[] {
    // Runtime target inventories deliberately carry no bulky example corpus.
    return [];
}

export function listLocalGrammarRules(): LocalGrammarRuleSummary[] {
    return activeLearningTarget().grammar.rules.map(rule => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        exampleCount: 0,
    }));
}

export function detectGrammarHints(sentence: string): GrammarHint[] {
    return activeLearningTarget().grammar.detect(sentence).map(match => ({
        ...match,
        kind: 'Grammar',
        short: match.name,
        detail: match.name,
        examples: [],
    }));
}

export function preloadGrammarResources(sentence: string, language: InterfaceLanguage = 'en'): GrammarHint[] {
    const hints = detectGrammarHints(sentence);
    const grammar = activeLearningTarget().grammar;
    const copyId = hints.length ? grammar.ruleCopyId(hints[0].ruleId) : null;
    if (copyId) void loadGrammarRuleData().catch(() => undefined);
    if (resolveUiLanguage(language) === 'ja' && copyId) {
        void grammarRuleText(language, copyId).catch(() => undefined);
    }
    return hints;
}

export function preloadTargetSentenceTranslation(sentence: string, outputLanguage = 'en'): void {
    void translateTargetSentence(sentence, outputLanguage).catch(() => undefined);
}

export function setGrammarRuleKnown(ruleId: string, known: boolean): GrammarPreferences {
    return persistGrammarRuleKnown(activeLearningTarget(), ruleId, known);
}

export function setKnownGrammarVisible(showKnown: boolean): GrammarPreferences {
    return persistKnownGrammarVisible(activeLearningTarget(), showKnown);
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

const TRANSLATABLE_CONTENT_CHAR = /[\p{L}\p{N}]/u;

/**
 * Reject empty/punctuation-only page chrome through the target Module instead
 * of guessing a language from a shared script. Latin text cannot be proven
 * Spanish rather than English from glyphs alone; the active target remains the
 * explicit source identity, while this gate only establishes that there is a
 * meaningful amount of target-script text to send.
 */
export function isTranslatableTargetSentence(sentence: string): boolean {
    const target = activeLearningTarget();
    if (target.language === 'ja') return isTranslatableJapaneseSentence(sentence);
    const evidence = targetSentenceEvidence(sentence, target.isLookupableText);
    return evidence.target >= 2 && evidence.content > 0 && evidence.target / evidence.content >= 0.15;
}

function targetSentenceEvidence(
    sentence: string,
    isTargetText: (character: string) => boolean,
): { content: number; target: number } {
    const evidence = { content: 0, target: 0 };
    for (const character of sentence.trim()) {
        if (TRANSLATABLE_CONTENT_CHAR.test(character)) evidence.content += 1;
        if (isTargetText(character)) evidence.target += 1;
    }
    return evidence;
}

/**
 * `outputLanguage` is the OUTPUT axis — where the sentence lands — never the
 * interface locale. Callers resolve it with `outputLanguageOf(settings)`.
 */
export async function translateTargetSentence(
    sentence: string,
    requestedOutputLanguage = 'en',
): Promise<SentenceTranslationResult | null> {
    const trimmed = sentence.trim();
    if (!trimmed || !isTranslatableTargetSentence(trimmed)) return null;
    const sourceLanguage = activeLearningTarget().language;
    const outputLanguage = sentenceOutputLanguage(requestedOutputLanguage, sourceLanguage);
    if (!outputLanguage) return null;
    const requestSentence = normalizeSentenceForTranslationRequest(trimmed);
    const text = await translateText(requestSentence, {
        sourceLanguage,
        outputLanguage,
        timeoutMs: TRANSLATION_TIMEOUT_MS,
        includeDictionaryData: true,
    });
    return { text, outputLanguage };
}

function sentenceOutputLanguage(outputLanguage: string, sourceLanguage: string): string | null {
    // `auto` is an interface-locale value that never meant an output language.
    // Preserve Japanese's established English fallback. For every other target,
    // an explicit same-language output is not a translation and must not echo
    // the source as if work had happened.
    if (outputLanguage === 'auto') return defaultSentenceOutputLanguage(sourceLanguage);
    if (outputLanguage.toLowerCase() !== sourceLanguage.toLowerCase()) return outputLanguage;
    return sameSourceSentenceOutputLanguage(sourceLanguage);
}

function defaultSentenceOutputLanguage(sourceLanguage: string): string | null {
    return sourceLanguage === 'en' ? null : 'en';
}

function sameSourceSentenceOutputLanguage(sourceLanguage: string): string | null {
    return sourceLanguage === 'ja' ? 'en' : null;
}

function normalizeSentenceForTranslationRequest(sentence: string): string {
    return sentence
        .replace(/[「『]/g, '"')
        .replace(/[」』]/g, '"');
}

export async function renderGrammarHints(hints: GrammarHint[], sentence: string, preferences = readTargetGrammarPreferences(activeLearningTarget()), language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean } = {}): Promise<string> {
    if (!hints.length) return renderGrammarAvailability(currentGrammarAvailability(language), language);
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

function grammarSummary(visibleCount: number, hiddenKnownCount: number, language: InterfaceLanguage): string {
    const shown = `${visibleCount} ${uiText(language, 'grammarShown')}`;
    if (hiddenKnownCount) return `${shown} · ${hiddenKnownCount} ${uiText(language, 'grammarKnownHidden')}`;
    return shown;
}

function renderGrammarSentence(sentence: string, language: InterfaceLanguage, audioEnabled: boolean): string {
    return renderStudySentenceBlock(sentence, language, {
        audioEnabled,
        attrs: 'data-grammar-sentence',
    });
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
    return `<button class="jpdb-reader-grammar-toggle" type="button" data-action="study-grammar-toggle-known-visibility"${privateCommandAttributes({ kind: 'card-action', action: 'study-grammar-toggle-known-visibility' })} aria-pressed="${showKnown ? 'true' : 'false'}">${label}</button>`;
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
    const knownState = grammarKnownState(known, language);
    return `
            <li class="jpdb-reader-study-item${knownState.className}" data-grammar-rule-id="${escapeHtml(hint.ruleId)}">
                <div class="jpdb-reader-study-name">
                    <span>${escapeHtml(displayName)}</span>
                    <span class="jpdb-reader-grammar-level">${escapeHtml(grammarLevelText(hint.level, language))}</span>
                </div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(details.kind)}</div>
                        <div class="jpdb-reader-grammar-actions">
                            ${renderGrammarRepeatCount(count)}
                            <button class="jpdb-reader-grammar-known" type="button" data-action="study-grammar-toggle-known" data-grammar-rule-id="${escapeHtml(hint.ruleId)}" data-grammar-known="${knownState.pressed}"${privateCommandAttributes({ kind: 'card-action', action: 'study-grammar-toggle-known', grammarRuleId: hint.ruleId, grammarKnown: known })} aria-pressed="${knownState.pressed}">${knownState.label}</button>
                        </div>
                    </div>
                    <div class="jpdb-reader-study-short jpdb-reader-parseable">${escapeHtml(details.short)}</div>
                    ${renderGrammarHintDisclosure(hint, details, displayName, language, audioEnabled)}
                </div>
            </li>`;
}

function grammarKnownState(known: boolean, language: InterfaceLanguage): { className: string; pressed: string; label: string } {
    return known
        ? { className: ' known', pressed: 'true', label: uiText(language, 'grammarReview') }
        : { className: '', pressed: 'false', label: uiText(language, 'grammarKnown') };
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
    const copyId = activeLearningTarget().grammar.ruleCopyId(hint.ruleId);
    const englishData = copyId
        ? await loadGrammarRuleData().then(data => data[copyId]).catch(() => undefined)
        : undefined;
    const base = englishData ? { ...fallback, ...englishData } : fallback;
    if (resolveUiLanguage(language) !== 'ja') return base;
    const ruleCopy = copyId ? await grammarRuleText(language, copyId) : undefined;
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
    return resolveUiLanguage(language) === 'ja' && level === 'Core'
        ? uiText(language, 'grammarLevelCore')
        : level;
}

function grammarDisplayName(hint: GrammarHint, language: InterfaceLanguage): string {
    const uiLanguage = resolveUiLanguage(language);
    const localized = hint.displayNames?.[uiLanguage];
    if (localized) return localized;
    if (uiLanguage !== 'ja' || !ENGLISH_TEXT_RE.test(hint.name)) return hint.name;
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
    const japaneseUi = resolveUiLanguage(language) === 'ja';
    const english = japaneseUi || !example.english ? '' : `<div>${escapeHtml(example.english)}</div>`;
    const note = japaneseUi || !example.note || ENGLISH_TEXT_RE.test(example.note) ? '' : `<div>${escapeHtml(example.note)}</div>`;
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
