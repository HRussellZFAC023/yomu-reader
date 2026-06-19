import { escapeHtml } from '../dom';
import { uiText } from '../app/i18n';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from '../lookup/pos';
import { formatMetaFrequency, groupTermEntriesByDictionary } from '../dictionaries/groups';
import {
    glossaryToHtml,
    glossaryToText,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from '../dictionaries/yomitan';
import type { DictionaryPreference, JPDBCard, ReaderSettings } from '../app/types';
import {
    ANKI_FIELD_ROLES,
    type AnkiCardContext,
    type AnkiFieldContext,
} from './types';
import { ankiFieldMappingForModel, yomuFieldForRole } from './field-mapping';
import { retargetYomuFieldsToExistingModel } from './field-retarget';

export function buildYomuAnkiFields(card: JPDBCard, sentence = '', context: AnkiCardContext = {}): Record<string, string> {
    const fieldContext = ankiFieldContext(context);
    const jpdbUrl = jpdbVocabularyUrl(card);
    return {
        Expression: escapeHtml(card.spelling),
        Reading: renderCardReading(card),
        Meaning: renderJpdbMeanings(card),
        Sentence: renderSentence(sentence, sentenceHighlightTargets(card, fieldContext)),
        Url: escapeHtml(fieldContext.sourceUrl),
        Frequency: renderFrequency(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        PartOfSpeech: renderPartOfSpeech(card.partOfSpeech),
        Image: '',
        Audio: '',
        JPDB: renderJpdbLink(jpdbUrl, fieldContext.interfaceLanguage),
        Status: renderCardStatus(card, fieldContext.interfaceLanguage),
        Pitch: renderPitchField(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        DictionaryDefinitions: renderDictionaryDefinitions(fieldContext.localEntries, fieldContext.dictionaryPreferences),
        Kanji: renderKanjiDefinitions(fieldContext.kanjiEntries, fieldContext.dictionaryPreferences, fieldContext.interfaceLanguage),
        Source: renderSource(fieldContext.sourceUrl, fieldContext.sourceTitle),
    };
}

export interface AnkiNoteFieldTargetPlan {
    modelName: string;
    yomuManaged: boolean;
    fieldNames: string[];
}

export function buildYomuAnkiPreviewFields(card: JPDBCard, sentence: string, settings: ReaderSettings, context: AnkiCardContext = {}, fieldTargetPlan?: AnkiNoteFieldTargetPlan | null): Record<string, string> {
    const yomuFields = buildYomuAnkiFields(card, sentence, {
        ...context,
        interfaceLanguage: settings.interfaceLanguage,
    });
    // When the configured model is an existing non-Yomu model, the write path
    // retargets fields into that model; preview the retargeted fields so the
    // user sees exactly what will be written.
    if (fieldTargetPlan && !fieldTargetPlan.yomuManaged && fieldTargetPlan.fieldNames.length) {
        const mapping = ankiFieldMappingForModel(settings, fieldTargetPlan.modelName, fieldTargetPlan.fieldNames);
        const retargeted = retargetYomuFieldsToExistingModel(yomuFields, fieldTargetPlan.fieldNames, mapping);
        const written = Object.fromEntries(Object.entries(retargeted).filter(([, value]) => value.trim()));
        if (Object.keys(written).length) return written;
    }
    const mapping = settings.ankiFieldMappings?.[settings.ankiModel.trim() || 'よむ Japanese'];
    if (!mapping || !Object.values(mapping).some(value => value?.trim())) return yomuFields;

    const fields: Record<string, string> = {};
    for (const role of ANKI_FIELD_ROLES) {
        const fieldName = mapping[role]?.trim();
        const value = yomuFields[yomuFieldForRole(role)];
        if (fieldName && value) fields[fieldName] = value;
    }
    return Object.keys(fields).length ? fields : yomuFields;
}

function renderCardReading(card: JPDBCard): string {
    return card.reading && card.reading !== card.spelling ? escapeHtml(card.reading) : '';
}

function renderPartOfSpeech(partOfSpeech: string[]): string {
    return escapeHtml(formatPartOfSpeech(partOfSpeech) || formatPartOfSpeechDetails(partOfSpeech));
}

function renderJpdbLink(jpdbUrl: string, language: ReaderSettings['interfaceLanguage']): string {
    return jpdbUrl ? `<a href="${jpdbUrl}">${escapeHtml(uiText(language, 'openOnJpdb'))}</a>` : '';
}

function ankiFieldContext(context: AnkiCardContext): AnkiFieldContext {
    return {
        localEntries: fallbackArray(context.localEntries),
        kanjiEntries: fallbackArray(context.kanjiEntries),
        metaEntries: fallbackArray(context.metaEntries),
        dictionaryPreferences: fallbackArray(context.dictionaryPreferences),
        sentenceTarget: fallbackString(context.sentenceTarget),
        sourceUrl: fallbackString(context.sourceUrl),
        sourceTitle: fallbackString(context.sourceTitle),
        interfaceLanguage: context.interfaceLanguage ?? 'en',
    };
}

function fallbackArray<T>(value: T[] | undefined): T[] {
    return value ?? [];
}

function fallbackString(value: string | undefined): string {
    return value ?? '';
}

function jpdbVocabularyUrl(card: JPDBCard): string {
    return card.source === 'local' || card.source === 'anki'
        ? ''
        : `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
}

function renderCardStatus(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.source === 'local') return `<span class="yomu-chip">${escapeHtml(uiText(language, 'ankiLocalDictionaryStatus'))}</span>`;
    if (card.source === 'anki') return '<span class="yomu-chip">Anki</span>';
    return card.cardState.map(state => `<span class="yomu-chip">${escapeHtml(state)}</span>`).join(' ');
}

function renderJpdbMeanings(card: JPDBCard): string {
    return card.meanings.slice(0, 8).map(meaning => {
        const pos = formatPartOfSpeech(meaning.partOfSpeech);
        return `<div class="yomu-definition">
            ${pos ? `<span class="yomu-pos">${escapeHtml(pos)}</span>` : ''}
            <div>${escapeHtml(meaning.glosses.join('; '))}</div>
        </div>`;
    }).join('');
}

function sentenceHighlightTargets(card: JPDBCard, context: AnkiFieldContext): string[] {
    return [context.sentenceTarget, card.spelling, card.reading];
}

function renderSentence(sentence: string, targets: string[]): string {
    if (!sentence) return '';
    const target = firstSentenceHighlightTarget(sentence, targets);
    if (!target) return escapeHtml(sentence);
    return sentence.split(target)
        .map(part => escapeHtml(part))
        .join(`<span class="yomu-highlight">${escapeHtml(target)}</span>`);
}

function firstSentenceHighlightTarget(sentence: string, targets: string[]): string {
    const seen = new Set<string>();
    for (const target of targets) {
        const normalized = target.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        if (sentence.includes(normalized)) return normalized;
    }
    return '';
}

function renderDictionaryDefinitions(entries: YomitanTermEntry[], preferences: DictionaryPreference[]): string {
    const groups = Array.from(groupTermEntriesByDictionary(entries).entries()).slice(0, 6);
    return groups.map(([dictionary, items]) => `
        <div class="yomu-dict-group">
            <h3 class="yomu-dict-label">${escapeHtml(dictionaryLabel(dictionary, preferences))}</h3>
            ${items.slice(0, 6).map(entry => `
                <div class="yomu-dict-entry">
                    <div class="yomu-dict-head">
                        <span class="yomu-dict-expression">${escapeHtml(entry.expression)}</span>
                        ${entry.reading && entry.reading !== entry.expression ? `<span class="yomu-dict-reading">${escapeHtml(entry.reading)}</span>` : ''}
                        ${entry.definitionTags || entry.rules || entry.termTags ? `<span class="yomu-tags">${escapeHtml([entry.definitionTags, entry.rules, entry.termTags].filter(Boolean).join(' · '))}</span>` : ''}
                    </div>
                    <div class="yomu-glossary" data-dictionary="${escapeHtml(entry.dictionary)}">${entry.glossary.slice(0, 5).map(item => `<div>${safeGlossaryHtml(item, entry.dictionary)}</div>`).join('')}</div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderKanjiDefinitions(entries: YomitanKanjiEntry[], preferences: DictionaryPreference[], language: ReaderSettings['interfaceLanguage']): string {
    const byCharacter = new Map<string, YomitanKanjiEntry[]>();
    for (const entry of entries) {
        const group = byCharacter.get(entry.character) ?? [];
        group.push(entry);
        byCharacter.set(entry.character, group);
    }
    return Array.from(byCharacter.entries()).slice(0, 8).map(([character, items]) => `
        <div class="yomu-kanji-entry">
            <div class="yomu-dict-head">
                <span class="yomu-kanji-char">${escapeHtml(character)}</span>
                <span class="yomu-dict-label">${escapeHtml(items.map(item => dictionaryLabel(item.dictionary, preferences)).filter(uniqueValue).slice(0, 3).join(' · '))}</span>
            </div>
            ${items.slice(0, 3).map(item => `
                <div>
                    ${item.onyomi.length ? `<span class="yomu-kanji-reading">${escapeHtml(uiText(language, 'onReading'))} ${escapeHtml(item.onyomi.join('、'))}</span>` : ''}
                    ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> ${escapeHtml(uiText(language, 'kunReading'))} ${escapeHtml(item.kunyomi.join('、'))}</span>` : ''}
                    <div>${item.meanings.slice(0, 8).map(meaning => escapeHtml(meaning)).join('; ')}</div>
                    ${item.tags.length ? `<span class="yomu-tags">${escapeHtml(item.tags.join(' · '))}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderFrequency(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips: string[] = [];
    if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
    for (const entry of entries) {
        appendFrequencyChip(chips, entry, preferences);
        if (chips.length >= 8) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function appendFrequencyChip(chips: string[], entry: YomitanMetaEntry, preferences: DictionaryPreference[]): void {
    if (entry.mode !== 'freq') return;
    const value = formatMetaFrequency(entry.data);
    if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
}

function renderPitchField(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips = firstJpdbPitchChip(card);
    for (const entry of entries) {
        appendPitchChip(chips, entry, preferences);
        if (chips.length >= 4) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function firstJpdbPitchChip(card: JPDBCard): string[] {
    const pitch = card.pitchAccent.find(Boolean);
    if (!pitch) return [];
    const reading = card.reading && card.reading !== card.spelling ? `${card.reading} ` : '';
    return [`<span class="yomu-chip">JPDB ${escapeHtml(reading)}${escapeHtml(pitch)}</span>`];
}

function appendPitchChip(chips: string[], entry: YomitanMetaEntry, preferences: DictionaryPreference[]): void {
    if (entry.mode !== 'pitch') return;
    const value = formatMetaPitch(entry.data);
    if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
}

function renderSource(sourceUrl: string, sourceTitle: string): string {
    const source = ankiSourceLink(sourceUrl, sourceTitle);
    if (!source.label) return '';
    return source.href ? `<a href="${escapeHtml(source.href)}">${escapeHtml(source.label)}</a>` : escapeHtml(source.label);
}

function ankiSourceLink(sourceUrl: string, sourceTitle: string): { href: string; label: string } {
    return { href: sourceUrl, label: sourceTitle || sourceUrl };
}

function dictionaryLabel(name: string, preferences: DictionaryPreference[]): string {
    return preferences.find(item => item.name === name)?.alias || name;
}

function uniqueValue<T>(value: T, index: number, array: T[]): boolean {
    return array.indexOf(value) === index;
}

function safeGlossaryHtml(value: unknown, dictionary: string): string {
    const html = glossaryToHtml(value, dictionary);
    return html || escapeHtml(glossaryToText(value));
}

function formatMetaPitch(value: unknown): string {
    const record = metaRecord(value);
    if (!record) return '';
    const positions = metaPitchPositions(record);
    return positions.length ? formatPitchPositions(positions) : formatPitchPosition(record.position);
}

function metaRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function metaPitchPositions(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function formatPitchPositions(positions: unknown[]): string {
    return positions.slice(0, 4).map(String).join(', ');
}

function formatPitchPosition(position: unknown): string {
    return typeof position === 'number' ? String(position) : '';
}
