import { primaryCardState } from '../cards/state';
import { cardDeckMembershipClassNames } from '../cards/deck-membership';
import { escapeHtml } from './html';
import {
    KANJI_RE,
    READING_KANA_CHAR_RE as KANA_CHAR_RE,
    READING_KANA_ONLY_RE as KANA_RE,
} from '../lookup/japanese-script';
import { effectiveFuriganaMode } from '../settings/index';
import { isUnifiedIdeograph } from '../languages/han';
import { activeLearningTarget, learningTargetModuleFor } from '../languages/target-runtime';
import type { LearningTargetModule } from '../languages/types';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import {
    type KanjiNavigationRenderOptions,
} from './token-kanji-navigation';

export { kanjiNavigationForElement } from './token-kanji-navigation';
export type { KanjiNavigationRenderOptions } from './token-kanji-navigation';

const EASY_FURIGANA_KANJI = new Set(
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        .split(''),
);
export const PITCH_CLASSES = new Set('heiban,atamadaka,nakadaka,odaka'.split(','));
const PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
const MINING_INSIGHT_UNKNOWN_STATES = new Set<CardState>(['new', 'not-in-deck', 'in-deck']);
const MINING_INSIGHT_MIN_CARD_COUNT = 3;
const FURIGANA_GROUP_STATES: Record<ReaderSettings['furiganaHiddenStateGroups'][number], readonly CardState[]> = {
    new: ['new', 'not-in-deck', 'in-deck'],
    learning: ['learning', 'young'],
    known: ['known', 'mature', 'mastered', 'never-forget', 'redundant'],
    due: ['due'],
    failed: ['failed'],
};

export interface TokenRenderOptions {
    allowRuby?: boolean;
    detachedReadings?: boolean;
    kanjiNavigation?: KanjiNavigationRenderOptions;
    scanWord?: boolean;
    proseWrap?: boolean;
    passiveInteraction?: boolean;
    preserveTokenRubies?: boolean;
    miningInsightKeys?: ReadonlySet<string>;
    showPitchAccent?: boolean;
}

interface RubyKanaAnchor {
    text: string;
    baseStart: number;
    baseEnd: number;
    readingStart: number;
    readingEnd: number;
}

interface RubyBaseKanaRun {
    text: string;
    baseStart: number;
    baseEnd: number;
}

function furiganaHiddenStates(settings: ReaderSettings): Set<CardState> {
    const states = new Set<CardState>();
    for (const group of settings.furiganaHiddenStateGroups) {
        for (const state of FURIGANA_GROUP_STATES[group] ?? []) states.add(state);
    }
    return states;
}

export function shouldHideFuriganaForCardState(settings: ReaderSettings, state: CardState): boolean {
    const mode = effectiveFuriganaMode(settings);
    if (mode === 'off') return true;
    return mode === 'known-status' && furiganaHiddenStates(settings).has(state);
}

export function renderHighlightedTextHtml(text: string, targets: string[], className: string): string {
    const needles = uniqueNonEmptyStrings(targets).sort((a, b) => b.length - a.length);
    if (!text || !needles.length) return escapeHtml(text);
    return renderHighlightChunks(text, needles, className);
}

function renderHighlightChunks(text: string, needles: string[], className: string): string {
    let html = '';
    let offset = 0;
    while (offset < text.length) {
        const match = nextHighlightMatch(text, needles, offset);
        if (!match) break;
        html += renderHighlightChunk(text, className, offset, match);
        offset = match.index + match.needle.length;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
}

function renderHighlightChunk(text: string, className: string, offset: number, match: { index: number; needle: string }): string {
    const prefix = match.index > offset ? escapeHtml(text.slice(offset, match.index)) : '';
    const marked = text.slice(match.index, match.index + match.needle.length);
    return `${prefix}<mark class="${escapeHtml(className)}">${escapeHtml(marked)}</mark>`;
}

function nextHighlightMatch(text: string, needles: string[], offset: number): { index: number; needle: string } | null {
    let best: { index: number; needle: string } | null = null;
    for (const needle of needles) {
        best = betterHighlightMatch(best, highlightMatchForNeedle(text, needle, offset));
    }
    return best;
}

function highlightMatchForNeedle(text: string, needle: string, offset: number): { index: number; needle: string } | null {
    const index = text.indexOf(needle, offset);
    return index < 0 ? null : { index, needle };
}

function betterHighlightMatch(
    current: { index: number; needle: string } | null,
    candidate: { index: number; needle: string } | null,
): { index: number; needle: string } | null {
    if (!candidate) return current;
    if (!current) return candidate;
    return isBetterHighlightMatch(candidate, current) ? candidate : current;
}

function isBetterHighlightMatch(candidate: { index: number; needle: string }, current: { index: number; needle: string }): boolean {
    return candidate.index < current.index
        || (candidate.index === current.index && candidate.needle.length > current.needle.length);
}

function uniqueNonEmptyStrings(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function nonOverlappingTokens(tokens: JPDBToken[], text: string): JPDBToken[] {
    const safe: JPDBToken[] = [];
    let offset = 0;
    for (const token of tokens) {
        if (!isSafeTokenSpan(token, offset, text)) continue;
        safe.push(token);
        offset = token.end;
    }
    return safe;
}

function isSafeTokenSpan(token: JPDBToken, offset: number, text: string): boolean {
    if (!Number.isInteger(token.start)
        || !Number.isInteger(token.end)
        || token.start < offset
        || token.start < 0
        || token.end <= token.start
        || token.end > text.length) return false;
    return learningTargetForToken(token).isLookupableText(text.slice(token.start, token.end));
}

export function miningInsightTokenKeys(tokens: JPDBToken[]): ReadonlySet<string> {
    const sentences = new Map<string, Map<string, { unknown: boolean }>>();
    for (const token of tokens) {
        const sentence = miningInsightSentenceKey(token);
        if (!sentence || isParticleCard(token.card)) continue;
        const cardKey = readerCardKey(token.card);
        const sentenceCards = sentences.get(sentence) ?? new Map<string, { unknown: boolean }>();
        if (!sentences.has(sentence)) sentences.set(sentence, sentenceCards);
        if (!sentenceCards.has(cardKey)) {
            sentenceCards.set(cardKey, { unknown: isMiningUnknownCard(token.card) });
        }
    }

    const keys = new Set<string>();
    sentences.forEach((cards, sentence) => {
        if (cards.size < MINING_INSIGHT_MIN_CARD_COUNT) return;
        const unknownCards = [...cards.entries()].filter(([, card]) => card.unknown);
        if (unknownCards.length !== 1) return;
        keys.add(miningInsightKey(sentence, unknownCards[0][0]));
    });
    return keys;
}

function isMiningUnknownCard(card: JPDBCard): boolean {
    return MINING_INSIGHT_UNKNOWN_STATES.has(primaryCardState(card.cardState));
}

export function miningInsightTokenKey(token: JPDBToken): string {
    return miningInsightKey(miningInsightSentenceKey(token), readerCardKey(token.card));
}

function miningInsightKey(sentence: string, cardKey: string): string {
    return `${sentence}\u0000${cardKey}`;
}

function miningInsightSentenceKey(token: JPDBToken): string {
    return (token.sentence ?? '').replace(/\s+/g, ' ').trim();
}

function readerCardKey(card: JPDBCard): string {
    return `${readerCardSource(card)}:${readerCardId(card)}/${readerReadingIndex(card)}`;
}

export function readerCardSource(card: JPDBCard): string {
    return card.source ?? (card.reviewSource === 'jiten-api' ? 'jiten' : 'jpdb');
}

export function readerCardId(card: JPDBCard): number {
    return readerCardSource(card) === 'jiten' ? card.jitenWordId ?? card.vid : card.vid;
}

export function readerReadingIndex(card: JPDBCard): number {
    return readerCardSource(card) === 'jiten' ? card.jitenReadingIndex ?? card.sid : card.sid;
}

export function shouldRenderRuby(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    allowRuby = true,
    preserveTokenRubies = false,
): boolean {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface, token, settings);
}

function furiganaModeAllowsRuby(mode: string, surface: string, token: JPDBToken, settings: ReaderSettings): boolean {
    if (mode === 'off') return false;
    if (mode === 'hover') return true;
    if (mode === 'known-status') return !shouldHideFuriganaForCardState(settings, primaryCardState(token.card.cardState));
    if (mode !== 'difficult-kanji') return true;
    // The curated difficulty list is a Japanese learning aid, not a universal
    // script heuristic. Targets without the Japanese input Adapter keep their
    // dictionary readings visible instead of silently losing all annotations.
    return learningTargetForToken(token).typing.answerNormalizer !== 'japanese-kana'
        || hasDifficultKanji(surface);
}

function hasDifficultKanji(surface: string): boolean {
    for (const char of surface) {
        if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
}

export function readerWordClassName(
    state: string,
    token: JPDBToken,
    settings: Pick<ReaderSettings, 'showPitchAccent'>,
): string {
    const classes = ['jpdb-reader-word'];
    if (isParticleCard(token.card)) {
        classes.push('jpdb-reader-particle');
    }
    if (hasKnownCardState(token.card)) {
        classes.push(`jpdb-${state}`);
        const source = readerCardSource(token.card);
        if (source !== 'jpdb') classes.push(`${source}-${state}`);
    }
    classes.push(...cardDeckMembershipClassNames(token.card));
    if (settings.showPitchAccent) classes.push(`jpdb-pitch-${tokenPitchClass(token)}`);
    return classes.join(' ');
}

function hasKnownCardState(card: JPDBToken['card']): boolean {
    return Array.isArray(card.cardState) && card.cardState.length > 0;
}

export function isParticleCard(card: JPDBCard): boolean {
    return card.partOfSpeech.includes('prt') || PARTICLE_SURFACE_RE.test(card.spelling.trim());
}

function safePitchClass(value: string): string {
    return PITCH_CLASSES.has(value) ? value : 'unknown';
}

export function tokenPitchClass(token: JPDBToken): string {
    return isParticleCard(token.card) ? 'particle' : safePitchClass(token.pitchClass);
}

export function renderRuby(
    surface: string,
    token: JPDBToken,
    kanjiNavigation?: KanjiNavigationRenderOptions,
    preserveTokenRubies = false,
): string {
    return renderTokenReadings(surface, token, kanjiNavigation, preserveTokenRubies, 'inline');
}

export function renderDetachedReadings(
    surface: string,
    token: JPDBToken,
    kanjiNavigation?: KanjiNavigationRenderOptions,
    preserveTokenRubies = false,
): string {
    return renderTokenReadings(surface, token, kanjiNavigation, preserveTokenRubies, 'detached');
}

export function renderTokenReadings(
    surface: string,
    token: JPDBToken,
    kanjiNavigation: KanjiNavigationRenderOptions | undefined,
    preserveTokenRubies: boolean,
    layout: 'inline' | 'detached',
): string {
    let html = '';
    let localOffset = 0;
    for (const ruby of effectiveTokenRubies(surface, token, preserveTokenRubies)) {
        const start = ruby.start - token.start;
        const end = ruby.end - token.start;
        html += renderKanjiNavigationText(surface.slice(localOffset, start), kanjiNavigation);
        const base = renderKanjiNavigationText(surface.slice(start, end), kanjiNavigation);
        html += layout === 'detached'
            ? `<span class="jpdb-reader-detached-ruby" data-yomu-source-start="${ruby.start}" data-yomu-source-end="${ruby.end}"><span class="jpdb-reader-ruby-base">${base}</span><span class="jpdb-reader-furi jpdb-reader-detached-furi" aria-hidden="true">${escapeHtml(ruby.text)}</span></span>`
            : `<ruby><span class="jpdb-reader-ruby-base">${base}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
        localOffset = end;
    }
    html += renderKanjiNavigationText(surface.slice(localOffset), kanjiNavigation);
    return html;
}

export function inferredInflectedSurfaceRubies(surface: string, spelling: string, reading: string): JPDBToken['rubies'] {
    const visibleSurface = surface.trim();
    const baseSpelling = spelling.trim();
    const baseReading = reading.trim();
    if (!visibleSurface || !baseSpelling || visibleSurface === baseSpelling) return [];
    if (!KANJI_RE.test(visibleSurface) || !KANA_RE.test(baseReading) || baseReading === baseSpelling) return [];

    for (const spellingSuffix of trailingKanaSuffixes(baseSpelling)) {
        if (!baseReading.endsWith(spellingSuffix)) continue;
        const spellingStem = baseSpelling.slice(0, -spellingSuffix.length);
        if (!spellingStem || !visibleSurface.startsWith(spellingStem)) continue;
        const surfaceSuffix = visibleSurface.slice(spellingStem.length);
        if (surfaceSuffix && !KANA_RE.test(surfaceSuffix)) continue;
        const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
        if (rubies.length) return rubies;
    }

    if (visibleSurface.startsWith(baseSpelling) && !KANA_CHAR_RE.test(baseSpelling)) {
        const surfaceSuffix = visibleSurface.slice(baseSpelling.length);
        if (!surfaceSuffix || KANA_RE.test(surfaceSuffix)) {
            return [{
                text: baseReading,
                start: 0,
                end: baseSpelling.length,
                length: baseSpelling.length,
            }];
        }
    }
    return [];
}

function trailingKanaSuffixes(value: string): string[] {
    const suffixes: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const suffix = value.slice(index);
        if (suffix && KANA_RE.test(suffix)) suffixes.push(suffix);
    }
    return suffixes.sort((first, second) => second.length - first.length);
}

function stemRubiesForInflectedSurface(surfaceStem: string, readingStem: string): JPDBToken['rubies'] {
    const trimmed = trimSharedKanaAffixes(surfaceStem, readingStem);
    if (!trimmed.surface || !trimmed.reading) return [];
    if (!KANJI_RE.test(trimmed.surface) || !KANA_RE.test(trimmed.reading)) return [];
    return [{
        text: trimmed.reading,
        start: trimmed.offset,
        end: trimmed.offset + trimmed.surface.length,
        length: trimmed.surface.length,
    }];
}

function trimSharedKanaAffixes(surface: string, reading: string): { surface: string; reading: string; offset: number } {
    let trimmedSurface = surface;
    let trimmedReading = reading;
    let offset = 0;
    while (trimmedSurface && trimmedReading && sameKanaCharacter(trimmedSurface[0], trimmedReading[0])) {
        trimmedSurface = trimmedSurface.slice(1);
        trimmedReading = trimmedReading.slice(1);
        offset += 1;
    }
    while (trimmedSurface && trimmedReading && sameKanaCharacter(
        trimmedSurface[trimmedSurface.length - 1],
        trimmedReading[trimmedReading.length - 1],
    )) {
        trimmedSurface = trimmedSurface.slice(0, -1);
        trimmedReading = trimmedReading.slice(0, -1);
    }
    return { surface: trimmedSurface, reading: trimmedReading, offset };
}

function sameKanaCharacter(first: string | undefined, second: string | undefined): boolean {
    return Boolean(first && second && first === second && KANA_RE.test(first));
}

export function effectiveTokenRubies(
    surface: string,
    token: JPDBToken,
    preserveTokenRubies = false,
): JPDBToken['rubies'] {
    const target = learningTargetForToken(token);
    if (target.typography.readingAnnotationMode === 'none') return [];
    const sources = sourceTokenRubies(surface, token);
    if (target.experiences.characterLookup === 'term-dictionary') {
        return sources.filter(ruby => localRubyRange(surface, token, ruby));
    }
    if (preserveTokenRubies) {
        return sources.flatMap(ruby => {
            const range = localRubyRange(surface, token, ruby);
            if (!range) return [];
            const base = surface.slice(range.start, range.end);
            if (!KANJI_RE.test(base)) return [];
            if (!KANA_CHAR_RE.test(base)) return [ruby];
            const parts = kanjiOnlyRubySegments(surface, token, ruby);
            return parts.length ? parts : [ruby];
        });
    }
    return sources.flatMap(ruby => kanjiOnlyRubySegments(surface, token, ruby));
}

function sourceTokenRubies(surface: string, token: JPDBToken): JPDBToken['rubies'] {
    if (token.rubies.length) return token.rubies;

    const reading = token.card.reading.trim();
    if (!surface || !reading || reading === surface) return [];
    if (surface.trim() === token.card.spelling.trim()) {
        return [{ text: reading, start: token.start, end: token.end, length: token.length }];
    }
    // Inflected-surface inference is a Japanese Adapter. Other targets render
    // exact dictionary-owned spans and never guess how a reading maps across a
    // changed surface.
    if (learningTargetForToken(token).typing.answerNormalizer !== 'japanese-kana'
        || !KANJI_RE.test(surface)
        || !KANA_RE.test(reading)) return [];
    const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
    if (inferred.length) {
        return inferred.map(ruby => ({
            ...ruby,
            start: token.start + ruby.start,
            end: token.start + ruby.end,
        }));
    }
    return [];
}

function learningTargetForToken(token: JPDBToken): LearningTargetModule {
    return learningTargetModuleFor(token.card.language) ?? activeLearningTarget();
}

function kanjiOnlyRubySegments(
    surface: string,
    token: JPDBToken,
    ruby: JPDBToken['rubies'][number],
): JPDBToken['rubies'] {
    const range = localRubyRange(surface, token, ruby);
    if (!range) return [];

    return kanjiRubyParts(surface.slice(range.start, range.end), ruby.text.trim()).map(part => ({
        text: part.text,
        start: token.start + range.start + part.start,
        end: token.start + range.start + part.end,
        length: part.end - part.start,
    }));
}

export function localRubyRange(
    surface: string,
    token: JPDBToken,
    ruby: JPDBToken['rubies'][number],
): { start: number; end: number } | null {
    const start = ruby.start - token.start;
    const end = ruby.end - token.start;
    if (start < 0 || end > surface.length || end <= start) return null;
    return { start, end };
}

function kanjiRubyParts(base: string, reading: string): Array<{ text: string; start: number; end: number }> {
    if (!base || !reading || !KANJI_RE.test(base)) return [];
    if (!KANA_RE.test(reading)) return [{ text: reading, start: 0, end: base.length }];

    const anchors = alignRubyKanaAnchors(base, reading);
    if (!anchors) return trimRubyPartToKanji(base, reading);

    const parts: Array<{ text: string; start: number; end: number }> = [];
    let baseOffset = 0;
    let readingOffset = 0;
    for (const anchor of anchors) {
        appendRubyGap(parts, base, baseOffset, anchor.baseStart, reading.slice(readingOffset, anchor.readingStart));
        baseOffset = anchor.baseEnd;
        readingOffset = anchor.readingEnd;
    }
    appendRubyGap(parts, base, baseOffset, base.length, reading.slice(readingOffset));
    return parts.length ? parts : trimRubyPartToKanji(base, reading);
}

function appendRubyGap(
    parts: Array<{ text: string; start: number; end: number }>,
    base: string,
    start: number,
    end: number,
    reading: string,
): void {
    const part = trimRubyPartToKanji(base.slice(start, end), reading)[0];
    if (part) parts.push({ text: part.text, start: start + part.start, end: start + part.end });
}

function trimRubyPartToKanji(base: string, reading: string): Array<{ text: string; start: number; end: number }> {
    const trimmed = trimSharedKanaAffixes(base, reading);
    if (!trimmed.surface || !trimmed.reading || !KANJI_RE.test(trimmed.surface)) return [];
    const kanjiOnly = kanaTrimmedKanjiRange(trimmed.surface, trimmed.reading);
    if (kanjiOnly) {
        return [{
            text: trimmed.reading,
            start: trimmed.offset + kanjiOnly.start,
            end: trimmed.offset + kanjiOnly.end,
        }];
    }
    return [{
        text: trimmed.reading,
        start: trimmed.offset,
        end: trimmed.offset + trimmed.surface.length,
    }];
}

function kanaTrimmedKanjiRange(base: string, reading: string): { start: number; end: number } | null {
    if (!KANA_RE.test(reading) || !KANA_CHAR_RE.test(base)) return null;
    const chars = Array.from(base);
    const first = chars.findIndex(char => KANJI_RE.test(char));
    if (first < 0) return null;
    let last = -1;
    for (let index = chars.length - 1; index >= first; index -= 1) {
        if (KANJI_RE.test(chars[index])) {
            last = index;
            break;
        }
    }
    if (last < first || (first === 0 && last === chars.length - 1)) return null;
    return { start: first, end: last + 1 };
}

function alignRubyKanaAnchors(base: string, reading: string): RubyKanaAnchor[] | null {
    const runs = rubyBaseKanaRuns(base);
    if (!runs.length) return [];
    return findRubyKanaAnchorPlan(base, reading, runs, 0, 0, []);
}

function findRubyKanaAnchorPlan(
    base: string,
    reading: string,
    runs: RubyBaseKanaRun[],
    index: number,
    readingOffset: number,
    anchors: RubyKanaAnchor[],
): RubyKanaAnchor[] | null {
    if (index >= runs.length) return rubyKanaAnchorPlanIsValid(base, reading, anchors) ? anchors : null;

    const run = runs[index];
    for (const readingStart of readingRunOccurrences(reading, run.text, readingOffset)) {
        const nextAnchors = anchors.concat({
            ...run,
            readingStart,
            readingEnd: readingStart + run.text.length,
        });
        const plan = findRubyKanaAnchorPlan(base, reading, runs, index + 1, readingStart + run.text.length, nextAnchors);
        if (plan) return plan;
    }
    return null;
}

function readingRunOccurrences(reading: string, text: string, offset: number): number[] {
    const occurrences: number[] = [];
    let index = reading.indexOf(text, offset);
    while (index >= 0) {
        occurrences.push(index);
        index = reading.indexOf(text, index + 1);
    }
    return occurrences;
}

function rubyKanaAnchorPlanIsValid(base: string, reading: string, anchors: RubyKanaAnchor[]): boolean {
    let baseOffset = 0;
    let readingOffset = 0;
    for (const anchor of anchors) {
        if (!rubyGapCanOwnReading(base.slice(baseOffset, anchor.baseStart), reading.slice(readingOffset, anchor.readingStart))) return false;
        baseOffset = anchor.baseEnd;
        readingOffset = anchor.readingEnd;
    }
    return rubyGapCanOwnReading(base.slice(baseOffset), reading.slice(readingOffset));
}

function rubyGapCanOwnReading(base: string, reading: string): boolean {
    return KANJI_RE.test(base) ? reading.length > 0 : reading.length === 0;
}

function rubyBaseKanaRuns(base: string): RubyBaseKanaRun[] {
    const runs: RubyBaseKanaRun[] = [];
    let start = -1;
    for (let index = 0; index <= base.length; index += 1) {
        const isKana = index < base.length && KANA_CHAR_RE.test(base[index]);
        if (isKana && start < 0) start = index;
        if ((!isKana || index === base.length) && start >= 0) {
            runs.push({ text: base.slice(start, index), baseStart: start, baseEnd: index });
            start = -1;
        }
    }
    return runs;
}

export function renderKanjiNavigationText(value: string, options?: KanjiNavigationRenderOptions): string {
    if (!options?.enabled) return escapeHtml(value);
    return Array.from(value).map(character => isKanjiForInlineNavigation(character)
        ? renderKanjiNavigationCharacter(character, options.label)
        : escapeHtml(character),
    ).join('');
}

function renderKanjiNavigationCharacter(character: string, label: string): string {
    const safeCharacter = escapeHtml(character);
    return `<button class="jpdb-reader-kanji-inline" type="button" data-action="kanji" data-kanji="${safeCharacter}" title="${escapeHtml(`${label}: ${character}`)}">${safeCharacter}</button>`;
}

function isKanjiForInlineNavigation(value: string): boolean {
    return isUnifiedIdeograph(value);
}
