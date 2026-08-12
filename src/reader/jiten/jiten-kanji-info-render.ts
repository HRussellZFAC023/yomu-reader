import { escapeHtml } from '../dom';
import { privateCommandAttributes } from '../dom/private-command-capabilities';
import { cardStateLabel, uiText } from '../app/i18n';
import { renderKanjiKeywordChips } from '../popup/kanji-keyword-line';
import { kanjiSourceStateKey } from '../sources/definition-render';
import { KANJI_JPDB_SOURCE_ID } from '../sources/sections';
import type { CardState, InterfaceLanguage } from '../app/types';
import type { JitenKanjiInfo, JitenKanjiWordsPage, JitenVocabularyWordSummary } from '../dictionaries/jiten';
import type { RtkInfo } from '../kanji/rtk';
import type { YomitanKanjiEntry } from '../dictionaries/yomitan';
import type { JpdbKanjiVocabulary } from '../jpdb/jpdb-kanji';
import type { KanjiSourceInfo } from '../kanji/origin';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
const JITEN_KANJI_WORD_PAGE_SIZE = 9;
const CARD_STATES = new Set<CardState>([
    'not-in-deck',
    'new',
    'learning',
    'young',
    'known',
    'mature',
    'due',
    'failed',
    'blacklisted',
    'never-forget',
    'redundant',
    'suspended',
    'locked',
    'frequent',
    'mastered',
    'in-deck',
    'unparsed',
]);
const JITEN_KNOWN_STATE_MAP = new Map<number, CardState>([
    [0, 'new'],
    [1, 'young'],
    [2, 'mature'],
    [3, 'blacklisted'],
    [4, 'due'],
    [5, 'mastered'],
    [6, 'redundant'],
]);

interface JitenKanjiVocabularyWord extends JpdbKanjiVocabulary {
    termHtml: string;
    frequencyRank: number | null;
    wordId: number;
    readingIndex: number;
    kanjiReading: string;
    states: CardState[];
    pitchAccents: number[];
}

interface JitenKanjiWordSource {
    word: JitenVocabularyWordSummary;
    kanjiReading: string;
}

export function renderJitenKanjiInfo(
    info: JitenKanjiInfo | null,
    language: InterfaceLanguage,
    initiallyExpanded = true,
    sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID),
    title = 'Jiten kanji facts',
): string {
    if (!info) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji jpdb-reader-jiten-kanji" data-source="jiten-kanji" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-local-entry">
                ${renderJitenKanjiFacts(info, language)}
                ${renderJitenKanjiReadings(info, language)}
                ${renderJitenKanjiVocabulary(info, language)}
            </div>
        </details>
    `;
}

export function renderJitenKanjiInfoWithAttributes(
    info: JitenKanjiInfo | null,
    language: InterfaceLanguage,
    sourceAttributes: SourceAttributes,
    title = 'Jiten kanji facts',
): string {
    if (!info) return '';
    const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji jpdb-reader-jiten-kanji" data-source="jiten-kanji" ${sourceAttributes(sourceStateKey)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-local-entry">
                ${renderJitenKanjiFacts(info, language)}
                ${renderJitenKanjiReadings(info, language)}
                ${renderJitenKanjiVocabulary(info, language)}
            </div>
        </details>
    `;
}

export function jitenKanjiVocabulary(_info: JitenKanjiInfo | null): JpdbKanjiVocabulary[] {
    return [];
}

export function renderJitenKanjiWordsPage(page: JitenKanjiWordsPage | null, reading = '', language: InterfaceLanguage = 'en'): string {
    return page
        ? renderJitenKanjiVocabularyWords(
            jitenVocabularyFromWordSummaries((page.items ?? []).map(word => ({ word, kanjiReading: reading }))),
            language,
        )
        : '';
}

export function renderJitenKanjiWordsMoreButton(
    character: string,
    reading: string,
    renderedCount: number,
    total: number,
    nextPage: number,
    language: InterfaceLanguage,
): string {
    if (total <= renderedCount) return '';
    return renderJitenKanjiMoreButtonAttributes(character, reading, nextPage, JITEN_KANJI_WORD_PAGE_SIZE, total, total - renderedCount, language);
}

export function jitenKanjiWordsPageSize(): number {
    return JITEN_KANJI_WORD_PAGE_SIZE;
}

function jitenKanjiWordSummaries(info: JitenKanjiInfo): JitenKanjiWordSource[] {
    return [
        ...(info.topWords ?? []).map(word => ({ word, kanjiReading: '' })),
        ...(info.wordsByReading ?? []).flatMap(group => (group.words ?? []).map(word => ({ word, kanjiReading: group.reading }))),
    ];
}

function jitenVocabularyFromWordSummaries(sources: JitenKanjiWordSource[]): JitenKanjiVocabularyWord[] {
    const seen = new Set<string>();
    return sources
        .filter(source => {
            const key = `${source.word.wordId}:${source.word.readingIndex}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map(({ word, kanjiReading }) => ({
            expression: cleanJitenWordSurface(word),
            reading: jitenAnnotatedKana(word.readingFurigana) || cleanJitenAnnotatedText(word.reading),
            meaning: word.mainDefinition,
            url: `https://jiten.moe/vocabulary/${encodeURIComponent(String(word.wordId))}/${encodeURIComponent(String(word.readingIndex))}`,
            termHtml: renderJitenAnnotatedReading(word.readingFurigana || word.reading),
            frequencyRank: word.frequencyRank,
            wordId: word.wordId,
            readingIndex: word.readingIndex,
            kanjiReading,
            states: jitenWordStates(word),
            pitchAccents: jitenWordPitchAccents(word),
        }));
}

function jitenKanjiKeyword(info: JitenKanjiInfo | null): string {
    return info?.meanings?.[0] ?? '';
}

export function renderJitenKanjiKeywordLine(
    info: JitenKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
    language: InterfaceLanguage = 'en',
    sourceInfo: KanjiSourceInfo | null = null,
): string {
    return renderKanjiKeywordChips([
        { text: jitenKanjiKeyword(info), label: 'Jiten', canonical: true },
        { text: rtkInfo?.keyword, label: 'RTK' },
        { text: sourceInfo?.kanjiAliveKeyword, label: 'Kanji Alive' },
        ...entries.flatMap(entry => entry.meanings).filter(Boolean).slice(0, 3).map(meaning => ({ text: meaning, label: uiText(language, 'dict') })),
    ], language);
}

export function jitenKanjiFactRows(info: JitenKanjiInfo | null, language: InterfaceLanguage): [string, string][] {
    if (!info) return [];
    return [
        fact(uiText(language, 'factMeaning'), (info.meanings ?? []).join(', ')),
        fact(uiText(language, 'factFrequency'), info.frequencyRank ? `Jiten #${info.frequencyRank}` : ''),
        fact('JLPT', info.jlptLevel ? `Jiten N${info.jlptLevel}` : ''),
        fact(uiText(language, 'factGrade'), info.grade ? `Jiten ${gradeLabel(info.grade, language)}` : ''),
        fact(uiText(language, 'strokes'), info.strokeCount ? `Jiten ${info.strokeCount}` : ''),
        ...jitenKanjiGroupingFactRows(info),
    ].filter((item): item is [string, string] => Boolean(item));
}

export function jitenKanjiOriginFactLabels(info: JitenKanjiInfo | null, language: InterfaceLanguage): string[] {
    if (!info) return [];
    const labels = new Set<string>();
    const add = (...values: string[]) => values.filter(Boolean).forEach(value => labels.add(value));
    if (info.meanings?.length) add('Meaning', uiText(language, 'factMeaning'));
    if (info.frequencyRank) add('Frequency', uiText(language, 'factFrequency'));
    if (info.jlptLevel) add('JLPT');
    if (info.grade) add('Grade', uiText(language, 'factGrade'));
    if (info.strokeCount) add('Strokes', uiText(language, 'strokes'));
    if (info.groupingTags?.kanken) add('Kanken');
    return Array.from(labels);
}

function jitenKanjiGroupingFactRows(info: JitenKanjiInfo): Array<[string, string] | null> {
    const tags = info.groupingTags;
    if (!tags) return [];
    return [
        fact('Kanken', tags.kanken ?? ''),
        fact('WK', tags.wanikani ?? ''),
        fact('RTK', tags.rtk ?? ''),
        fact('KLC', tags.klc ?? ''),
        fact('TMW', tags.tmw ?? ''),
    ];
}

function gradeLabel(grade: number, language: InterfaceLanguage): string {
    return language === 'ja' ? `${grade}年` : `Grade ${grade}`;
}

export function jitenKanjiReadingRows(info: JitenKanjiInfo | null): string[] {
    if (!info) return [];
    const wordsByReading = info.wordsByReading ?? [];
    const groupedTotal = wordsByReading.reduce((sum, group) => sum + Math.max(0, group.totalWords), 0);
    const groupedReadings = wordsByReading
        .slice()
        .sort((a, b) => b.totalWords - a.totalWords)
        .map(group => {
            const percent = groupedTotal ? ` ${Math.round((group.totalWords / groupedTotal) * 100)}%` : '';
            return `${group.reading}${percent}`;
        });
    return groupedReadings.length
        ? groupedReadings.slice(0, 10)
        : [
            ...(info.kunReadings ?? []).map(reading => `${reading} kun`),
            ...(info.onReadings ?? []).map(reading => `${reading} on`),
        ].slice(0, 10);
}

function renderJitenKanjiFacts(info: JitenKanjiInfo, language: InterfaceLanguage): string {
    const facts = jitenKanjiFactRows(info, language);
    return facts.length ? `<div class="jpdb-reader-kanji-facts">
        ${facts.map(([label, value]) => `<span title="${escapeHtml(`Jiten · ${label}: ${value}`)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(value)}</span></span>`).join('')}
    </div>` : '';
}

function renderJitenKanjiReadings(info: JitenKanjiInfo, language: InterfaceLanguage): string {
    const groupedReadings = jitenKanjiGroupedReadingRows(info);
    if (groupedReadings.length) {
        return `<div class="jpdb-reader-kanji-readings jpdb-reader-jiten-kanji-reading-filter" role="list" aria-label="${escapeHtml(uiText(language, 'reading'))}">
            ${groupedReadings.map(reading => `<button type="button" data-action="jiten-kanji-reading" data-jiten-kanji-character="${escapeHtml(info.character)}" data-jiten-kanji-reading="${escapeHtml(reading.reading)}"${privateCommandAttributes({ kind: 'jiten-kanji-words', action: 'filter', character: info.character, reading: reading.reading })} role="listitem" aria-pressed="false"><span>${escapeHtml(reading.reading)}</span><small>${escapeHtml(reading.share)}</small></button>`).join('')}
        </div>`;
    }
    const readings = jitenKanjiReadingRows(info).filter(Boolean);
    return readings.length ? `<div class="jpdb-reader-kanji-readings">
        ${readings.slice(0, 12).map(reading => `<span>${escapeHtml(reading)}</span>`).join('')}
    </div>` : '';
}

function jitenKanjiGroupedReadingRows(info: JitenKanjiInfo): Array<{ reading: string; share: string }> {
    const wordsByReading = info.wordsByReading ?? [];
    const groupedTotal = wordsByReading.reduce((sum, group) => sum + Math.max(0, group.totalWords), 0);
    if (!groupedTotal) return [];
    return wordsByReading
        .slice()
        .sort((a, b) => b.totalWords - a.totalWords)
        .slice(0, 10)
        .map(group => ({ reading: group.reading, share: `${Math.round((group.totalWords / groupedTotal) * 100)}%` }));
}

function renderJitenKanjiVocabulary(info: JitenKanjiInfo, language: InterfaceLanguage): string {
    const words = jitenVocabularyFromWordSummaries(jitenKanjiWordSummaries(info));
    if (!words.length) return '';
    const firstWords = words.slice(0, JITEN_KANJI_WORD_PAGE_SIZE);
    return `<div class="jpdb-reader-similar-grid jpdb-reader-jiten-kanji-vocabulary" role="list">
        ${renderJitenKanjiVocabularyWords(firstWords, language)}
        ${renderJitenKanjiMoreButton(info, firstWords.length, language)}
    </div>`;
}

function renderJitenKanjiVocabularyWords(words: JitenKanjiVocabularyWord[], language: InterfaceLanguage): string {
    return words.map(word => renderJitenKanjiVocabularyWord(word, language)).join('');
}

function renderJitenKanjiVocabularyWord(word: JitenKanjiVocabularyWord, language: InterfaceLanguage): string {
    const key = `${word.expression}:${word.reading}`;
    const meta = renderJitenKanjiWordMeta(word, language);
    return `<button class="jpdb-reader-similar-word jpdb-reader-jiten-kanji-word" type="button" data-action="similar-word" data-expression="${escapeHtml(word.expression)}" data-reading="${escapeHtml(word.reading)}"${privateCommandAttributes({ kind: 'kanji-word', expression: word.expression, reading: word.reading })} data-jiten-kanji-word-key="${escapeHtml(key)}" data-jiten-kanji-reading="${escapeHtml(word.kanjiReading)}" title="${escapeHtml(jitenKanjiWordTitle(word))}" aria-label="${escapeHtml(jitenKanjiWordAriaLabel(word))}" role="listitem">
        <span class="jpdb-reader-similar-word-head jpdb-reader-jiten-kanji-word-main">
            <span class="jpdb-reader-jiten-kanji-word-term">${word.termHtml || escapeHtml(word.expression)}</span>
            ${meta}
        </span>
        ${word.meaning ? `<small class="jpdb-reader-similar-meaning">${escapeHtml(word.meaning)}</small>` : ''}
    </button>`;
}

function renderJitenKanjiWordMeta(word: JitenKanjiVocabularyWord, language: InterfaceLanguage): string {
    const state = primaryJitenWordState(word.states);
    const items = [
        state
            ? `<span class="jpdb-reader-jiten-kanji-word-status" title="${escapeHtml(`Jiten · ${cardStateLabel(state, language)}`)}"><span class="jpdb-reader-state-dot jiten-${escapeHtml(state)}"></span>${escapeHtml(cardStateLabel(state, language))}</span>`
            : '',
        word.pitchAccents.length
            ? `<span class="jpdb-reader-jiten-kanji-word-pitch" title="${escapeHtml(`Pitch accent: ${word.pitchAccents.join(', ')}`)}">P${escapeHtml(word.pitchAccents.join('/'))}</span>`
            : '',
        word.frequencyRank ? `<em>#${escapeHtml(String(word.frequencyRank))}</em>` : '',
    ].filter(Boolean).join('');
    return items ? `<span class="jpdb-reader-jiten-kanji-word-meta">${items}</span>` : '';
}

function primaryJitenWordState(states: CardState[]): CardState | null {
    return states.find(state => state !== 'not-in-deck' && state !== 'in-deck') ?? states[0] ?? null;
}

function jitenKanjiWordTitle(word: JitenKanjiVocabularyWord): string {
    return [word.expression, word.reading && word.reading !== word.expression ? word.reading : '', word.meaning].filter(Boolean).join(' · ');
}

function jitenKanjiWordAriaLabel(word: JitenKanjiVocabularyWord): string {
    return [word.expression, word.reading && word.reading !== word.expression ? word.reading : '', word.meaning, word.frequencyRank ? `frequency ${word.frequencyRank}` : ''].filter(Boolean).join(', ');
}

function renderJitenKanjiMoreButton(info: JitenKanjiInfo, renderedCount: number, language: InterfaceLanguage): string {
    const total = jitenKanjiWordsTotal(info);
    if (total <= renderedCount) return '';
    const remaining = total - renderedCount;
    const reading = jitenKanjiMoreReading(info);
    return renderJitenKanjiMoreButtonAttributes(info.character, reading, 2, JITEN_KANJI_WORD_PAGE_SIZE, total, remaining, language);
}

function renderJitenKanjiMoreButtonAttributes(character: string, reading: string, page: number, pageSize: number, total: number, remaining: number, language: InterfaceLanguage): string {
    return `<button class="jpdb-reader-btn jpdb-reader-jiten-kanji-more" type="button" data-action="jiten-kanji-more" data-jiten-kanji-character="${escapeHtml(character)}" data-jiten-kanji-reading="${escapeHtml(reading)}" data-jiten-kanji-page="${page}" data-jiten-kanji-page-size="${pageSize}" data-jiten-kanji-total="${total}"${privateCommandAttributes({ kind: 'jiten-kanji-words', action: 'more', character, reading, page, pageSize, total })}>
        ${escapeHtml(uiText(language, 'more'))} <span class="jpdb-reader-source-status">${remaining}</span>
    </button>`;
}

function jitenKanjiWordsTotal(info: JitenKanjiInfo): number {
    const groupedTotal = (info.wordsByReading ?? []).reduce((sum, group) => sum + Math.max(0, group.totalWords), 0);
    return Math.max(jitenVocabularyFromWordSummaries(jitenKanjiWordSummaries(info)).length, groupedTotal);
}

function jitenKanjiMoreReading(info: JitenKanjiInfo): string {
    const groups = (info.wordsByReading ?? []).filter(group => group.reading && group.totalWords > (group.words ?? []).length);
    return groups.length === 1 ? groups[0]?.reading ?? '' : '';
}

function sourceStateAttribute(sourceStateKey: string, initiallyExpanded: boolean): string {
    return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}" ${initiallyExpanded ? 'open' : ''}`;
}

function cleanJitenWordSurface(word: JitenVocabularyWordSummary): string {
    return cleanJitenAnnotatedText(word.matchSurface || word.readingFurigana || word.reading);
}

function cleanJitenAnnotatedText(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$1').trim();
}

function jitenAnnotatedKana(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$2').trim();
}

function renderJitenAnnotatedReading(value: string): string {
    const source = value.trim();
    if (!source) return '';
    let html = '';
    let offset = 0;
    const regex = /([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
        html += escapeHtml(source.slice(offset, match.index));
        html += `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(match[1] ?? '')}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(match[2] ?? '')}</rt><rp>)</rp></ruby>`;
        offset = match.index + match[0].length;
    }
    html += escapeHtml(source.slice(offset));
    return html;
}

function fact(label: string, value: string): [string, string] | null {
    return value.trim() ? [label, value.trim()] : null;
}

function jitenWordStates(word: JitenVocabularyWordSummary): CardState[] {
    const source = word as JitenVocabularyWordSummary & { knownStates?: unknown; knownState?: unknown; cardState?: unknown };
    const rawStates = Array.isArray(source.knownStates)
        ? source.knownStates
        : Array.isArray(source.knownState)
            ? source.knownState
            : Array.isArray(source.cardState)
                ? source.cardState
                : [];
    return rawStates
        .map(state => typeof state === 'number' ? JITEN_KNOWN_STATE_MAP.get(state) : state)
        .filter((state): state is CardState => typeof state === 'string' && CARD_STATES.has(state as CardState));
}

function jitenWordPitchAccents(word: JitenVocabularyWordSummary): number[] {
    const source = word as JitenVocabularyWordSummary & { pitchAccents?: unknown; pitchAccent?: unknown };
    const rawPitch = Array.isArray(source.pitchAccents)
        ? source.pitchAccents
        : Array.isArray(source.pitchAccent)
            ? source.pitchAccent
            : [];
    return rawPitch.filter((pitch): pitch is number => Number.isInteger(pitch) && pitch >= 0).slice(0, 3);
}
