import { primaryCardState } from './card-state';
import { effectiveFuriganaMode } from './settings';
import type { JPDBToken, ReaderSettings } from './types';

const KANJI_RE = /[\u3400-\u9fff]/u;
const KANA_CHAR_RE = /[\u3040-\u30ffー・]/u;
const KANA_RE = /^[\u3040-\u30ffー・]+$/u;
const EASY_FURIGANA_KANJI = new Set(
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        .split(''),
);
const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku']);
const PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;

type TrustedTypesFactory = {
    createPolicy?: (name: string, options: { createHTML: (value: string) => string }) => { createHTML: (value: string) => unknown };
    getPolicy?: (name: string) => { createHTML: (value: string) => unknown } | null;
};
type TrustedTypesGlobal = typeof globalThis & {
    trustedTypes?: TrustedTypesFactory;
    unsafeWindow?: { trustedTypes?: TrustedTypesFactory };
};

export interface KanjiNavigationRenderOptions {
    enabled: boolean;
    label: string;
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

export interface TokenRenderOptions {
    allowRuby?: boolean;
    kanjiNavigation?: KanjiNavigationRenderOptions;
    scanWord?: boolean;
    passiveInteraction?: boolean;
    // Scan-word renders keep the JPDB-provided ruby spans intact (e.g. 読む -> よむ) instead of
    // re-centering furigana onto bare kanji, which is reserved for the popup token renderers.
    preserveTokenRubies?: boolean;
}

let trustedHtmlPolicy: { createHTML: (value: string) => unknown } | null | undefined;

/*
 * Central HTML sink for Yomu-owned render templates.
 *
 * Callers pass markup assembled by the reader's render functions; dynamic text,
 * attributes, and URLs must be escaped before they reach this helper. Keeping
 * the assignment centralized makes AMO/CWS review notes and Trusted Types
 * behavior auditable instead of scattering raw HTML sinks through feature code.
 */
export function setInnerHtml(element: Element, html: string): void {
    if (!assignInnerHtml(element, html)) element.textContent = html;
}

export function parseHtmlDocument(html: string): Document {
    const parsed = parseHtmlWithDomParser(html);
    if (parsed) return parsed;

    const fallback = document.implementation.createHTMLDocument('');
    if (assignInnerHtml(fallback.documentElement, html)) return fallback;
    if (assignInnerHtml(fallback.body, html)) return fallback;
    fallback.body.textContent = html;
    return fallback;
}

function assignInnerHtml(element: Element, html: string): boolean {
    try {
        element.innerHTML = trustedHtml(html) as string;
        return true;
    } catch {
        return false;
    }
}

export function parseXmlDocument(source: string, mimeType: DOMParserSupportedType = 'text/xml'): Document {
    try {
        return new DOMParser().parseFromString(trustedHtml(source) as string, mimeType);
    } catch {
        return document.implementation.createDocument(null, '');
    }
}

function parseHtmlWithDomParser(html: string): Document | null {
    try {
        return new DOMParser().parseFromString(trustedHtml(html) as string, 'text/html');
    } catch {
        return null;
    }
}

export function appendTrustedHtml(element: Element, html: string): void {
    const template = document.createElement('template');
    setInnerHtml(template, html);
    element.append(template.content);
}

export function htmlToFirstElement(html: string): HTMLElement | null {
    const trimmed = html.trim();
    if (!trimmed) return null;
    const template = document.createElement('template');
    setInnerHtml(template, trimmed);
    const first = template.content.firstElementChild;
    return first instanceof HTMLElement ? document.importNode(first, true) as HTMLElement : null;
}

export function appendToDocumentHead(element: Node): void {
    const target = document.head || document.documentElement || document.body;
    target.appendChild(element);
}

export function renderTokensToHtml(text: string, tokens: JPDBToken[], settings: ReaderSettings): string {
    let html = '';
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    for (const token of safeTokens) {
        if (token.start > offset) html += escapeHtml(text.slice(offset, token.start));
        html += renderTokenHtml(text.slice(token.start, token.end), token, settings);
        offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
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

export function nonOverlappingTokens(tokens: JPDBToken[], textLength: number): JPDBToken[] {
    const safe: JPDBToken[] = [];
    let offset = 0;
    for (const token of tokens) {
        if (!isSafeTokenSpan(token, offset, textLength)) continue;
        safe.push(token);
        offset = token.end;
    }
    return safe;
}

function isSafeTokenSpan(token: JPDBToken, offset: number, textLength: number): boolean {
    return token.start >= offset
        && token.start >= 0
        && token.end > token.start
        && token.end <= textLength;
}

export function renderToken(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    options: TokenRenderOptions = {},
): HTMLElement {
    const span = createReaderWordSpan(token, options);
    if (!options.kanjiNavigation?.enabled && options.passiveInteraction !== true) span.tabIndex = -1;

    const hasRuby = shouldRenderRuby(surface, token, settings, options.allowRuby, options.preserveTokenRubies);
    if (hasRuby) {
        span.classList.add('jpdb-reader-has-furi');
        setInnerHtml(span, renderRuby(surface, token, options.kanjiNavigation, options.preserveTokenRubies));
    } else if (options.kanjiNavigation?.enabled) {
        setInnerHtml(span, renderKanjiNavigationText(surface, options.kanjiNavigation));
    } else {
        span.textContent = surface;
    }
    return span;
}

export function renderTokenShell(token: JPDBToken, options: TokenRenderOptions = {}): HTMLElement {
    const span = createReaderWordSpan(token, options);
    if (options.passiveInteraction !== true) span.tabIndex = -1;
    return span;
}

// Builds the bare reader-word <span> (class + identity/pitch/sentence dataset) shared by every token renderer.
// Callers add the tabindex and content afterward, since those vary by render mode.
function createReaderWordSpan(token: JPDBToken, options: TokenRenderOptions): HTMLElement {
    const span = document.createElement('span');
    const state = primaryCardState(token.card.cardState);
    span.className = readerWordClassName(state, token);
    applyTokenRenderOptions(span, options);
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.pitchClass = safePitchClass(token.pitchClass);
    span.dataset.sentence = token.sentence ?? '';
    if (token.card.spelling) span.dataset.expression = token.card.spelling;
    if (token.card.reading) span.dataset.reading = token.card.reading;
    return span;
}

function applyTokenRenderOptions(span: HTMLElement, options: TokenRenderOptions): void {
    if (options.scanWord) span.classList.add('jpdb-reader-scan-word');
    if (options.passiveInteraction) {
        span.classList.add('jpdb-reader-passive-word');
        span.dataset.jpdbReaderPassive = 'true';
    }
}

function renderTokenHtml(surface: string, token: JPDBToken, settings: ReaderSettings): string {
    const state = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const classes = [readerWordClassName(state, token), hasRuby ? 'jpdb-reader-has-furi' : ''].filter(Boolean).join(' ');
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : '';
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : '';
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}" data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? '')}"${expression}${reading} tabindex="-1">${content}</span>`;
}

export function shouldRenderRuby(surface: string, token: JPDBToken, settings: ReaderSettings, allowRuby = true, preserveTokenRubies = false): boolean {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface);
}

function furiganaModeAllowsRuby(mode: string, surface: string): boolean {
    if (mode === 'off') return false;
    return mode !== 'difficult-kanji' || hasDifficultKanji(surface);
}

function hasDifficultKanji(surface: string): boolean {
    for (const char of surface) {
        if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
}

function readerWordClassName(state: string, token: JPDBToken): string {
    const classes = ['jpdb-reader-word'];
    if (token.card.partOfSpeech.includes('prt') || PARTICLE_SURFACE_RE.test(token.card.spelling.trim())) {
        classes.push('jpdb-reader-particle');
        return classes.join(' ');
    }
    if (hasKnownCardState(token.card)) classes.push(`jpdb-${state}`);
    classes.push(`jpdb-pitch-${safePitchClass(token.pitchClass)}`);
    return classes.join(' ');
}

function hasKnownCardState(card: JPDBToken['card']): boolean {
    return Array.isArray(card.cardState) && card.cardState.length > 0;
}

function safePitchClass(value: string): string {
    return PITCH_CLASSES.has(value) ? value : 'unknown';
}

export function renderRuby(surface: string, token: JPDBToken, kanjiNavigation?: KanjiNavigationRenderOptions, preserveTokenRubies = false): string {
    let html = '';
    let localOffset = 0;
    for (const ruby of effectiveTokenRubies(surface, token, preserveTokenRubies)) {
        const start = ruby.start - token.start;
        const end = ruby.end - token.start;
        html += renderKanjiNavigationText(surface.slice(localOffset, start), kanjiNavigation);
        html += `<ruby><span class="jpdb-reader-ruby-base">${renderKanjiNavigationText(surface.slice(start, end), kanjiNavigation)}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
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
        if (!surfaceSuffix || !KANA_RE.test(surfaceSuffix)) continue;
        const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
        if (rubies.length) return rubies;
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

function effectiveTokenRubies(surface: string, token: JPDBToken, preserveTokenRubies = false): JPDBToken['rubies'] {
    const sources = sourceTokenRubies(surface, token);
    if (preserveTokenRubies) {
        // Preserve explicit rubies verbatim over kanji-containing bases; a
        // kana-only base never needs furigana (the ruby would just repeat
        // the visible word).
        return sources.filter(ruby => {
            const range = localRubyRange(surface, token, ruby);
            return range !== null && KANJI_RE.test(surface.slice(range.start, range.end));
        });
    }
    return sources.flatMap(ruby => kanjiOnlyRubySegments(surface, token, ruby));
}

function sourceTokenRubies(surface: string, token: JPDBToken): JPDBToken['rubies'] {
    if (token.rubies.length) return token.rubies;

    const reading = token.card.reading.trim();
    if (!surface || !KANJI_RE.test(surface) || !reading || reading === surface || !KANA_RE.test(reading)) return [];
    return [{ text: reading, start: token.start, end: token.end, length: token.length }];
}

function kanjiOnlyRubySegments(surface: string, token: JPDBToken, ruby: JPDBToken['rubies'][number]): JPDBToken['rubies'] {
    const range = localRubyRange(surface, token, ruby);
    if (!range) return [];

    return kanjiRubyParts(surface.slice(range.start, range.end), ruby.text.trim()).map(part => ({
        text: part.text,
        start: token.start + range.start + part.start,
        end: token.start + range.start + part.end,
        length: part.end - part.start,
    }));
}

function localRubyRange(surface: string, token: JPDBToken, ruby: JPDBToken['rubies'][number]): { start: number; end: number } | null {
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

function appendRubyGap(parts: Array<{ text: string; start: number; end: number }>, base: string, start: number, end: number, reading: string): void {
    const part = trimRubyPartToKanji(base.slice(start, end), reading)[0];
    if (part) parts.push({ text: part.text, start: start + part.start, end: start + part.end });
}

function trimRubyPartToKanji(base: string, reading: string): Array<{ text: string; start: number; end: number }> {
    const trimmed = trimSharedKanaAffixes(base, reading);
    if (!trimmed.surface || !trimmed.reading || !KANJI_RE.test(trimmed.surface)) return [];
    return [{
        text: trimmed.reading,
        start: trimmed.offset,
        end: trimmed.offset + trimmed.surface.length,
    }];
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
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function trustedHtml(value: string): string | unknown {
    try {
        const factory = trustedTypesFactory();
        if (!factory) return value;
        if (trustedHtmlPolicy === undefined) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
        return trustedHtmlPolicy && typeof trustedHtmlPolicy.createHTML === 'function' ? trustedHtmlPolicy.createHTML(value) : value;
    } catch {
        trustedHtmlPolicy = null;
        return value;
    }
}

function trustedTypesFactory(): TrustedTypesFactory | undefined {
    const root = globalThis as TrustedTypesGlobal;
    return [
        root.trustedTypes,
        typeof window === 'undefined' ? undefined : (window as unknown as TrustedTypesGlobal).trustedTypes,
        root.unsafeWindow?.trustedTypes,
    ].find((factory): factory is TrustedTypesFactory => Boolean(factory));
}

function createTrustedHtmlPolicy(factory: TrustedTypesFactory): { createHTML: (value: string) => unknown } | null {
    try {
        const existing = factory.getPolicy?.('yomu-reader');
        if (existing && typeof existing.createHTML === 'function') return existing;
        return factory.createPolicy?.('yomu-reader', { createHTML: html => html }) ?? null;
    } catch {
        return null;
    }
}
