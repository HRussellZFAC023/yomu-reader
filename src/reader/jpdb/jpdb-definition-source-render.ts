import { cardHighlightScopeAttributes, renderCardHighlightedTextHtml, type CardHighlightTarget } from '../card-highlight';
import { JPDB_DEFINITION_SOURCE_ID } from '../constants';
import { escapeHtml } from '../dom';
import { speakerIcon } from '../icons';
import { uiText } from '../i18n';
import type { InterfaceLanguage, JPDBCard } from '../types';
import type { JpdbVocabularyInfo } from './jpdb-vocabulary';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;

export function renderJpdbDefinitionSource(card: JPDBCard, sourceAttributes: SourceAttributes, info: JpdbVocabularyInfo | null = null, language: InterfaceLanguage = 'en'): string {
    const meanings = jpdbDefinitionMeanings(card, info)
        .map(meaning => `<div class="jpdb-reader-meaning">${escapeHtml(meaning)}</div>`)
        .join('');
    const extras = renderJpdbVocabularyExtras(info, sourceAttributes, language, card);
    if (!meanings && !extras) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card" data-source="jpdb" ${cardHighlightScopeAttributes(card)} ${sourceAttributes(definitionSourceStateKey(JPDB_DEFINITION_SOURCE_ID), true)}>
            <summary class="jpdb-reader-local-title">JPDB</summary>
            ${meanings ? `<div class="jpdb-reader-meanings">${meanings}</div>` : ''}
            ${extras}
        </details>
    `;
}

function jpdbDefinitionMeanings(card: JPDBCard, info: JpdbVocabularyInfo | null): string[] {
    if (shouldPreferCardMeanings(card)) return cardDefinitionMeanings(card, info);
    return (info?.meanings ?? []).slice(0, 6);
}

function shouldPreferCardMeanings(card: JPDBCard): boolean {
    return card.source !== 'local' && card.source !== 'anki' && card.source !== 'fallback';
}

function cardDefinitionMeanings(card: JPDBCard, info: JpdbVocabularyInfo | null): string[] {
    const cardMeanings = card.meanings.slice(0, 6)
        .map(meaning => meaning.glosses.join('; ').trim())
        .filter(Boolean);
    return cardMeanings.length ? cardMeanings : (info?.meanings ?? []).slice(0, 6);
}

function renderJpdbVocabularyExtras(info: JpdbVocabularyInfo | null, sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget): string {
    if (!hasJpdbVocabularyExtras(info)) return '';
    return `<div class="jpdb-reader-jpdb-extras">${renderJpdbCompounds(info, language)}${renderJpdbUsedInVocabulary(info, sourceAttributes, language)}${renderJpdbExamples(info, sourceAttributes, language, card)}</div>`;
}

function hasJpdbVocabularyExtras(info: JpdbVocabularyInfo | null): info is JpdbVocabularyInfo {
    return Boolean(info && (info.compounds.length || (info.usedInVocabulary?.length ?? 0) || info.examples.length));
}

function renderJpdbCompounds(info: JpdbVocabularyInfo, language: InterfaceLanguage): string {
    return info.compounds.length ? `
        <section class="jpdb-reader-jpdb-extra">
            <ul class="jpdb-reader-jpdb-compounds">
                ${info.compounds.map(compound => `
                    <li class="jpdb-reader-jpdb-compound-row${compound.audioIds?.length ? ' has-audio' : ''}">
                        ${renderJpdbExampleAudioButton(compound.audioIds, compound.term, language)}
                        <span class="jpdb-reader-jpdb-compound-main">
                            <a
                                class="gloss-link jpdb-reader-jpdb-compound"
                                href="#jpdb-reader-dictionary-lookup"
                                data-dictionary-lookup="${escapeHtml(compound.term)}"
                                data-dictionary-reading="${escapeHtml(compound.reading)}"
                                data-dictionary="JPDB"
                                data-external="false"
                            >
                                <span class="jpdb-reader-jpdb-compound-head">
                                    ${renderJpdbRelatedTerm(compound.term, compound.reading, 'jpdb-reader-jpdb-compound-term', '', true, compound.termHtml)}
                                </span>
                            </a>
                            ${compound.meaning ? `<small>${escapeHtml(compound.meaning)}</small>` : ''}
                        </span>
                    </li>
                `).join('')}
            </ul>
        </section>
    ` : '';
}

function renderJpdbUsedInVocabulary(info: JpdbVocabularyInfo, sourceAttributes: SourceAttributes, language: InterfaceLanguage): string {
    const entries = info.usedInVocabulary ?? [];
    return entries.length ? `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group" ${sourceAttributes(definitionSourceStateKey(`${JPDB_DEFINITION_SOURCE_ID}:used-in-vocabulary`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'usedInVocabulary'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${entries.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in">
                ${entries.map(entry => `
                    <li class="jpdb-reader-jpdb-used-in-row${entry.audioIds?.length ? ' has-audio' : ''}">
                        ${renderJpdbExampleAudioButton(entry.audioIds, entry.term, language)}
                        <span class="jpdb-reader-jpdb-used-in-main">
                            <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.term)}" data-dictionary-reading="${escapeHtml(entry.reading)}" data-dictionary="JPDB" data-external="false"><span class="jpdb-reader-jpdb-compound-head">${renderJpdbUsedInTerm(entry.term, entry.reading, entry.url, entry.termHtml)}</span></a>
                            ${entry.meaning ? `<small>${escapeHtml(entry.meaning)}</small>` : ''}
                        </span>
                    </li>
                `).join('')}
                </ul>
            </div>
        </details>
    ` : '';
}

function renderJpdbExamples(info: JpdbVocabularyInfo, sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget): string {
    return info.examples.length ? `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group" ${sourceAttributes(definitionSourceStateKey(`${JPDB_DEFINITION_SOURCE_ID}:examples`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'exampleSentences'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${info.examples.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-examples">
                ${info.examples.map(example => `
                    <li class="jpdb-reader-jpdb-example">
                        <div class="jpdb-reader-jpdb-example-row${example.audioIds?.length ? ' has-audio' : ''}">
                            ${renderJpdbExampleAudioButton(example.audioIds, example.sentence, language)}
                            <div class="jpdb-reader-jpdb-example-text">
                                <div class="jpdb-reader-example-sentence jpdb-reader-parseable">${renderJpdbExampleSentence(example, card)}</div>
                                ${example.translation ? `<div class="jpdb-reader-example-translation">${escapeHtml(example.translation)}</div>` : ''}
                            </div>
                        </div>
                    </li>
                `).join('')}
                </ul>
            </div>
        </details>
    ` : '';
}

function renderJpdbExampleAudioButton(audioIds: string[] | undefined, sentence: string, language: InterfaceLanguage): string {
    const audio = audioIds?.join(',') ?? '';
    const label = uiText(language, 'playJpdbExampleAudio');
    return audio ? `<button class="jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio" type="button" data-action="jpdb-example-audio" data-jpdb-audio="${escapeHtml(audio)}" data-jpdb-example-sentence="${escapeHtml(sentence)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${speakerIcon()}</button>` : '';
}

function renderJpdbExampleSentence(example: JpdbVocabularyInfo['examples'][number], card: CardHighlightTarget): string {
    return example.sentenceHtml || renderCardHighlightedTextHtml(example.sentence, card);
}

function renderJpdbRelatedTerm(term: string, reading: string, className: string, extraAttributes = '', showReading = true, termHtml = ''): string {
    const readingText = visibleJpdbRelatedReading(term, reading);
    const base = `<span class="${escapeHtml(`${className} jpdb-reader-parseable`)}" data-dictionary="JPDB"${extraAttributes}>${termHtml || escapeHtml(term)}</span>`;
    if (termHtml || !showReading || !readingText) return base;
    return `<span class="jpdb-reader-jpdb-term-with-reading"><span class="jpdb-reader-furi jpdb-reader-jpdb-term-furi" data-jpdb-reader-surface-ignore="true" aria-hidden="true">${escapeHtml(readingText)}</span>${base}</span>`;
}

function renderJpdbUsedInTerm(term: string, reading: string, url: string, termHtml = ''): string {
    return `<span class="jpdb-reader-jpdb-compound-term jpdb-reader-jpdb-used-in-term" data-dictionary="JPDB">${renderPassiveJpdbRelatedWord(term, reading, url, { termHtml })}</span>`;
}

function renderPassiveJpdbRelatedWord(term: string, reading: string, url: string, options: { showReading?: boolean; termHtml?: string } = {}): string {
    const vid = jpdbVocabularyVidFromUrl(url);
    const identityAttributes = vid === null ? '' : ` data-vid="${vid}" data-sid="0"`;
    const readingAttribute = reading ? ` data-reading="${escapeHtml(reading)}"` : '';
    const { classes, content } = passiveJpdbRelatedWordContent(term, reading, options);
    return `<span class="${classes}" data-jpdb-reader-passive="true"${identityAttributes} data-pitch-class="" data-sentence="${escapeHtml(term)}" data-expression="${escapeHtml(term)}"${readingAttribute} tabindex="-1">${content}</span>`;
}

function passiveJpdbRelatedWordContent(term: string, reading: string, options: { showReading?: boolean; termHtml?: string }): { classes: string; content: string } {
    const termHtml = options.termHtml?.trim() ?? '';
    const visibleReading = passiveJpdbRelatedReading(term, reading, options, termHtml);
    return {
        classes: passiveJpdbRelatedClasses(Boolean(visibleReading || /<rt\b/i.test(termHtml))),
        content: termHtml || passiveJpdbRelatedPlainContent(term, visibleReading),
    };
}

function passiveJpdbRelatedReading(term: string, reading: string, options: { showReading?: boolean }, termHtml: string): string {
    return termHtml || options.showReading === false ? '' : visibleJpdbRelatedReading(term, reading);
}

function passiveJpdbRelatedClasses(hasFuri: boolean): string {
    return `jpdb-reader-word jpdb-reader-passive-word${hasFuri ? ' jpdb-reader-has-furi' : ''}`;
}

function passiveJpdbRelatedPlainContent(term: string, visibleReading: string): string {
    return visibleReading
        ? `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(term)}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(visibleReading)}</rt><rp>)</rp></ruby>`
        : escapeHtml(term);
}

function jpdbVocabularyVidFromUrl(value: string): number | null {
    try {
        const parts = new URL(value, 'https://jpdb.io').pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        const vid = Number.parseInt(parts[1] ?? '', 10);
        return Number.isFinite(vid) && vid > 0 ? vid : null;
    } catch {
        return null;
    }
}

function visibleJpdbRelatedReading(term: string, reading: string): string {
    const normalizedTerm = term.trim();
    const normalizedReading = reading.trim();
    return normalizedReading && normalizedReading !== normalizedTerm ? normalizedReading : '';
}

function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}
