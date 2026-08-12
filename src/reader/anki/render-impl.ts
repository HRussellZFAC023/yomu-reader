import { ankiMediaFilenameFromCardUrl, buildYomuAnkiPreviewFields, canUseMobileAnkiHandoff, mobileAnkiHandoffAppName, type AnkiCardContext, type AnkiExistingNote, type AnkiLookupResult, type AnkiNoteFieldTargetPlan, type AnkiRenderedCard } from './index';
import { ANKI_SOURCE_ID } from '../app/constants';
import { escapeHtml, parseHtmlDocument, setInnerHtml } from '../dom';
import { definitionSourceLabel } from '../sources/sections';
import { speakerIcon } from '../ui/icons';
import type { StoredMiningContext } from '../study/mining-context';
import type { CardState, InterfaceLanguage, JPDBCard, JPDBGrade, ReaderSettings, ReviewGradeIntervals } from '../app/types';
import { cardStateLabel, formatUiText, uiText, type UiCopyKey } from '../app/i18n';
import {
    currentAccountDataSurfaceIsTrusted,
    installOwnedStudyLauncher,
} from '../app/account-data-surface';
import { preparePrivateCommandSerialization, privateCommandAttributes } from '../dom/private-command-capabilities';

interface AnkiCardSanitizeOptions {
    maxFontPx: number;
    maxFontPt: number;
    maxFontRelative: number;
}

interface RenderAnkiExistingSectionOptions {
    suppressReviewButtons?: boolean;
    sourceAttributes?: (key: string, initiallyExpanded?: boolean) => string;
    trustedAccountDataSurface?: boolean;
}

function ankiDetailsStateAttributes(options: RenderAnkiExistingSectionOptions, key: string, initiallyOpen: boolean): string {
    return options.sourceAttributes ? options.sourceAttributes(key, initiallyOpen) : initiallyOpen ? 'open' : '';
}

function ankiDeckSourceStateKey(note: AnkiExistingNote): string {
    return `${ANKI_SOURCE_ID}:deck:${note.deckNames.join('/') || note.modelName}`;
}

const POPOVER_ANKI_SANITIZE: AnkiCardSanitizeOptions = {
    maxFontPx: 30,
    maxFontPt: 22,
    maxFontRelative: 1.8,
};
const STUDY_ANKI_SANITIZE: AnkiCardSanitizeOptions = {
    maxFontPx: 52,
    maxFontPt: 39,
    maxFontRelative: 3.1,
};
const CONTEXT_SOURCE_LABEL_KEYS: Partial<Record<StoredMiningContext['sourceKind'], UiCopyKey>> = {
    video: 'contextVideo',
    image: 'contextImage',
};

export function renderAnkiActionRow(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!ankiActionRowCanAdd(ankiLookup, settings)) return '';
    const mobileHandoff = shouldRenderMobileAnkiHandoffAction(ankiLookup, settings);
    if (!ankiActionRowIsTrusted(ankiLookup, mobileHandoff)) return '';
    const label = ankiActionRowLabel(settings.interfaceLanguage, mobileHandoff);
    return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki"${privateCommandAttributes({ kind: 'card-action', action: 'anki' })}>${escapeHtml(label)}</button></div>`;
}

function ankiActionRowCanAdd(ankiLookup: AnkiLookupResult, settings: ReaderSettings): boolean {
    if (!settings.ankiEnabled) return false;
    return !ankiLookup.primary && ankiLookup.state === 'not-in-deck';
}

function ankiActionRowIsTrusted(ankiLookup: AnkiLookupResult, mobileHandoff: boolean): boolean {
    return mobileHandoff || ankiLookup.trusted !== false;
}

function ankiActionRowLabel(language: InterfaceLanguage, mobileHandoff: boolean): string {
    return mobileHandoff ? mobileAnkiHandoffButtonLabel(language) : uiText(language, 'addToAnki');
}

function mobileAnkiHandoffButtonLabel(language: InterfaceLanguage): string {
    const app = mobileAnkiHandoffAppName();
    return language === 'ja' ? formatUiText(language, 'sendToMobileAnki', { app }) : ['Send', 'to', app].join(' ');
}

function shouldRenderMobileAnkiHandoffAction(ankiLookup: AnkiLookupResult, settings: ReaderSettings): boolean {
    return canUseMobileAnkiHandoff(settings) && !ankiLookup.primary;
}

export function renderAnkiExistingSection(
    ankiLookup: AnkiLookupResult,
    storedContext: StoredMiningContext | null,
    settings: ReaderSettings,
    options: RenderAnkiExistingSectionOptions = {},
): string {
    if (!ankiSectionIsEnabled(settings)) return '';
    const notes = orderedExistingAnkiNotes(ankiLookup);
    const primary = notes[0];
    if (!primary) return '';
    if (!accountDataSurfaceIsTrusted(options.trustedAccountDataSurface)) {
        return renderPrivateAccountDataLauncher(settings.interfaceLanguage);
    }
    return renderTrustedAnkiExistingSection(ankiLookup, primary, notes, storedContext, settings, options);
}

function renderTrustedAnkiExistingSection(
    ankiLookup: AnkiLookupResult,
    primary: AnkiExistingNote,
    notes: AnkiExistingNote[],
    storedContext: StoredMiningContext | null,
    settings: ReaderSettings,
    options: RenderAnkiExistingSectionOptions,
): string {
    const language = settings.interfaceLanguage;
    const aggregateState = ankiLookup.state;
    const summary = ankiExistingSectionSummary(primary, notes.length, language, aggregateState);
    const title = definitionSourceLabel(settings, ANKI_SOURCE_ID, 'Anki');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing" ${ankiDetailsStateAttributes(options, ANKI_SOURCE_ID, true)}>
            <summary class="jpdb-reader-local-title">
                <span><span class="jpdb-reader-state-dot anki-${aggregateState}"></span>${escapeHtml(title)}${ankiNoteCountSuffix(notes)}</span>
                <small class="jpdb-reader-source-status">${escapeHtml(summary)}</small>
            </summary>
            ${renderExistingAnkiCollisionSummary(notes, language)}
            ${renderExistingAnkiNotes(notes, primary, storedContext, settings, options)}
        </details>
    `;
}

function ankiSectionIsEnabled(settings: ReaderSettings): boolean {
    return settings.ankiEnabled && settings.ankiSectionEnabled;
}

function ankiNoteCountSuffix(notes: AnkiExistingNote[]): string {
    return notes.length > 1 ? ` (${notes.length})` : '';
}

function renderExistingAnkiCollisionSummary(notes: AnkiExistingNote[], language: InterfaceLanguage): string {
    return notes.length > 1 ? renderAnkiCollisionSummary(notes, language) : '';
}

function renderExistingAnkiNotes(notes: AnkiExistingNote[], primary: AnkiExistingNote, storedContext: StoredMiningContext | null, settings: ReaderSettings, options: RenderAnkiExistingSectionOptions): string {
    if (notes.length === 1) return renderAnkiExistingNote(primary, storedContext, settings, false, true, options);
    return notes.map((note, index) => renderAnkiExistingNote(note, ankiContextForNote(index, storedContext), settings, true, index === 0, options)).join('');
}

function ankiContextForNote(index: number, storedContext: StoredMiningContext | null): StoredMiningContext | null {
    return index === 0 ? storedContext : null;
}

export function renderAnkiNewCardPreview(
    card: JPDBCard,
    sentence: string | undefined,
    settings: ReaderSettings,
    context: AnkiCardContext = {},
    fieldTargetPlan?: AnkiNoteFieldTargetPlan | null,
    options: { trustedAccountDataSurface?: boolean } = {},
): string {
    if (!ankiSectionIsEnabled(settings)) return '';
    if (!accountDataSurfaceIsTrusted(options.trustedAccountDataSurface)) {
        return renderPrivateAccountDataLauncher(settings.interfaceLanguage);
    }
    const fields = buildYomuAnkiPreviewFields(card, ankiPreviewSentence(sentence, card), settings, context, fieldTargetPlan);
    const fieldPreview = renderAnkiPreviewFields(fields, settings.interfaceLanguage, { renderHtml: true });
    if (!fieldPreview) return '';
    const title = definitionSourceLabel(settings, ANKI_SOURCE_ID, 'Anki');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing jpdb-reader-anki-new">
            <summary class="jpdb-reader-local-title">
                <span><span class="jpdb-reader-state-dot anki-not-in-deck"></span>${escapeHtml(title)}</span>
                <small class="jpdb-reader-source-status">${escapeHtml(ankiNewCardSummary(settings))}</small>
            </summary>
            <div class="jpdb-reader-local-entry jpdb-reader-anki-card-preview">
                ${fieldPreview}
            </div>
        </details>
    `;
}

function ankiPreviewSentence(sentence: string | undefined, card: JPDBCard): string {
    return sentence ?? card.sentence ?? '';
}

function accountDataSurfaceIsTrusted(explicit: boolean | undefined): boolean {
    return explicit ?? currentAccountDataSurfaceIsTrusted();
}

function renderPrivateAccountDataLauncher(language: InterfaceLanguage): string {
    if (typeof document !== 'undefined') installOwnedStudyLauncher(document);
    return `<section class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-account-private-launcher" data-account-private-launcher>
        <div class="jpdb-reader-local-title"><strong>${escapeHtml(uiText(language, 'accountSettingsTrustedSurfaceTitle'))}</strong></div>
        <p class="jpdb-reader-help">${escapeHtml(uiText(language, 'accountSettingsTrustedSurfaceHelp'))}</p>
        <button class="jpdb-reader-btn" type="button" data-yomu-owned-study-launcher>${escapeHtml(uiText(language, 'openAccountSettingsTrustedSurface'))}</button>
    </section>`;
}

function orderedExistingAnkiNotes(ankiLookup: AnkiLookupResult): AnkiExistingNote[] {
    const notes: AnkiExistingNote[] = [];
    const seen = new Set<string>();
    appendUniqueAnkiNote(notes, seen, ankiLookup.primary);
    (ankiLookup.notes ?? []).forEach(note => appendUniqueAnkiNote(notes, seen, note));
    return notes;
}

function appendUniqueAnkiNote(notes: AnkiExistingNote[], seen: Set<string>, note: AnkiExistingNote | null | undefined): void {
    if (!note) return;
    const key = ankiNoteKey(note);
    if (seen.has(key)) return;
    seen.add(key);
    notes.push(note);
}

function ankiNoteKey(note: AnkiExistingNote): string {
    if (Number.isFinite(note.noteId) && note.noteId > 0) return `note:${note.noteId}`;
    return `${note.modelName}:${note.primaryCardId || note.cardIds.join(',')}:${note.deckNames.join(',')}`;
}

function ankiExistingSectionSummary(primary: AnkiExistingNote, count: number, language: InterfaceLanguage, aggregateState: CardState): string {
    const summary = ankiExistingAggregateSummary(primary, aggregateState, language);
    return count > 1 ? `${summary} · ${count} matches` : summary;
}

function renderAnkiCollisionSummary(notes: AnkiExistingNote[], language: InterfaceLanguage): string {
    return `<div class="jpdb-reader-anki-match-summary" aria-label="${escapeHtml(uiText(language, 'ankiMatches'))}">
        ${notes.map(note => `<div class="jpdb-reader-anki-match-summary-row">
            <span><span class="jpdb-reader-state-dot anki-${note.state}"></span>${escapeHtml(ankiNoteIdentityLabel(note, language))}</span>
            <small>${escapeHtml(ankiExistingSummary(note, language))}</small>
        </div>`).join('')}
    </div>`;
}

function renderAnkiExistingNote(
    note: AnkiExistingNote,
    storedContext: StoredMiningContext | null,
    settings: ReaderSettings,
    collapsible: boolean,
    open: boolean,
    options: RenderAnkiExistingSectionOptions,
): string {
    const language = settings.interfaceLanguage;
    const preview = ankiExistingPreview(note, storedContext, language);
    const content = `<div class="jpdb-reader-anki-existing-note-body">
        ${preview.renderedCard}
        ${preview.fields}
        ${preview.pending}
        ${preview.context}
        ${renderAnkiNoteActions(note, language)}
        ${!options.suppressReviewButtons && settings.enableReviews && note.primaryCardId ? renderReviewButtons(settings, note, { targetLabel: ankiCardReviewTargetLabel(note, language) }) : ''}
    </div>`;
    if (!collapsible) {
        return `<div class="jpdb-reader-local-entry jpdb-reader-anki-card-preview" data-anki-note-id="${note.noteId}">
        ${content}
    </div>`;
    }
    return `<details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note" data-anki-note-id="${note.noteId}" ${ankiDetailsStateAttributes(options, ankiDeckSourceStateKey(note), open)}>
        <summary class="jpdb-reader-anki-existing-note-title">
            <span><span class="jpdb-reader-state-dot anki-${note.state}"></span><strong>${escapeHtml(ankiNoteIdentityLabel(note, language))}</strong></span>
            <small>${escapeHtml(preview.summary)}</small>
        </summary>
        ${content}
    </details>`;
}

function ankiNewCardSummary(settings: ReaderSettings): string {
    return [
        uiText(settings.interfaceLanguage, 'ankiNewCard'),
        settings.ankiDeck.trim() || 'よむ',
        settings.ankiModel.trim() || 'よむ Japanese',
    ].filter(Boolean).join(' · ');
}

function ankiExistingPreview(note: AnkiExistingNote, storedContext: StoredMiningContext | null, language: InterfaceLanguage): { summary: string; renderedCard: string; fields: string; pending: string; context: string } {
    const renderedCard = renderAnkiRenderedCard(note, language);
    const fields = renderedCard ? '' : renderAnkiStoredFieldsFallback(note, language);
    return {
        summary: ankiExistingSummary(note, language),
        renderedCard,
        fields,
        pending: renderedCard || fields ? '' : renderAnkiDetailsStatus(note, language),
        context: storedContext ? renderLastMiningContext(storedContext, language) : '',
    };
}

function renderAnkiDetailsStatus(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const key = note.detailsUnavailable ? 'ankiCardDetailsUnavailable' : 'ankiCardDetailsPending';
    return `<div class="jpdb-reader-help jpdb-reader-anki-details-pending" role="status">${escapeHtml(uiText(language, key))}</div>`;
}

function renderAnkiStoredFieldsFallback(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const fields = renderAnkiFields(note, language);
    if (!fields) return '';
    return `<details class="jpdb-reader-anki-stored-fields" open>
        <summary>${escapeHtml(uiText(language, 'ankiStoredFields'))}</summary>
        ${fields}
    </details>`;
}

function ankiExistingSummary(note: AnkiExistingNote, language: InterfaceLanguage): string {
    return [
        ankiStateLabel(note.state, language),
        note.deckNames.length ? note.deckNames.join(', ') : '',
        ankiReviewMetricsLabel(note, language),
    ].filter(Boolean).join(' · ') || 'Anki';
}

function ankiExistingAggregateSummary(primary: AnkiExistingNote, aggregateState: CardState, language: InterfaceLanguage): string {
    return [
        ankiStateLabel(aggregateState, language),
        primary.deckNames.length ? primary.deckNames.join(', ') : '',
        ankiReviewMetricsLabel(primary, language),
    ].filter(Boolean).join(' · ') || 'Anki';
}

function ankiNoteIdentityLabel(note: AnkiExistingNote, language: InterfaceLanguage): string {
    return [
        note.deckNames.length ? note.deckNames.join(', ') : '',
        note.modelName,
        ankiNoteKindLabel(note, language),
    ].filter(Boolean).join(' · ') || 'Anki';
}

function ankiNoteKindLabel(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const fields = Object.keys(note.fields).map(name => name.replace(/[_\s-]+/g, '').toLowerCase());
    const model = note.modelName.replace(/[_\s-]+/g, '').toLowerCase();
    if (fields.some(name => /^(?:kanji|keyword|onyomi|kunyomi|on|kun|heisig|frame(?:no|number)?|stroke(?:order|diagram|count)?)$/.test(name)) || /(?:rtk|heisig|kanji)/.test(model)) {
        return uiText(language, 'kanji');
    }
    if (fields.some(name => /^(?:katakana|hiragana|kana|mnemonic)$/.test(name))) return language === 'ja' ? 'かな' : 'Kana';
    if (fields.some(name => /sentence|selectiontext|contextsentence/.test(name))) return language === 'ja' ? '文' : 'Sentence';
    return uiText(language, 'word');
}

function ankiReviewMetricsLabel(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const parts = [
        note.reps ? `${note.reps} ${uiText(language, note.reps === 1 ? 'ankiReviewSingular' : 'ankiReviewPlural')}` : '',
        note.lapses ? `${note.lapses} ${uiText(language, note.lapses === 1 ? 'ankiLapseSingular' : 'ankiLapsePlural')}` : '',
    ].filter(Boolean);
    return parts.join(', ');
}

function ankiStateLabel(state: string, language: InterfaceLanguage): string {
    return cardStateLabel(state, language);
}

function renderAnkiRenderedCard(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const cards = orderedRenderedCards(note);
    if (!cards.length) return '';
    return cards.map((card, index) => renderAnkiRenderedCardPreview(note, card, language, cards.length > 1, index)).join('');
}

function renderAnkiRenderedCardPreview(note: AnkiExistingNote, card: AnkiRenderedCard, language: InterfaceLanguage, showHeading: boolean, index: number): string {
    const soundFilenames = ankiSoundFilenames(note);
    const sides = renderAnkiRenderedSides(card, soundFilenames, language);
    if (!sides.length) return '';
    const content = sides.join('');
    if (!showHeading) {
        return `<div class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="${card.cardId}">${content}</div>`;
    }
    const title = renderedCardTitle(card, index);
    return `<details class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="${card.cardId}"${index === 0 ? ' open' : ''}>
        <summary class="jpdb-reader-anki-rendered-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</summary>
        ${content}
    </details>`;
}

function orderedRenderedCards(note: AnkiExistingNote): AnkiRenderedCard[] {
    const cards = note.renderedCards ?? [];
    const primary = cards.find(card => card.cardId === note.primaryCardId);
    return primary ? [primary, ...cards.filter(card => card.cardId !== primary.cardId)] : cards;
}

// UT-49: raw card ids (#1764...) are database noise to users — the deck
// plus the template name (or an ordinal) identifies the card fully.
function renderedCardTitle(card: AnkiRenderedCard, index: number): string {
    if (card.cardName) return [card.deckName, card.cardName].filter(Boolean).join(' · ');
    return [card.deckName, `Card ${index + 1}`].filter(Boolean).join(' · ');
}

function renderAnkiRenderedSides(card: AnkiRenderedCard, soundFilenames: string[], language: InterfaceLanguage, options = POPOVER_ANKI_SANITIZE): string[] {
    const questionHtml = sanitizeAnkiCardHtml(card.question, soundFilenames, language, card.mediaDataUrls, options);
    const answerHtml = sanitizeAnkiCardHtml(card.answer, soundFilenames, language, card.mediaDataUrls, options);
    const question = renderAnkiRenderedSideBody(questionHtml);
    const answer = renderAnkiRenderedSideBody(answerHtml);
    if (!question) return answer ? [answer] : [];
    if (!answer) return [question];
    if (renderedAnkiAnswerIncludesQuestion(questionHtml, answerHtml)) return [answer];
    return [question, answer];
}

function renderAnkiRenderedSideBody(html: string): string {
    if (!html || !hasRenderableAnkiCardContent(html)) return '';
    return `<section class="jpdb-reader-anki-rendered-side">
        <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">${pruneRedundantAnkiGlyphRepeats(html)}</div>
    </section>`;
}

// UT-49: kanji templates often repeat the same glyph in several decorative
// fonts (YUMIN/HGRKK/KanjiStrokeOrders @font-face from Anki media). Those
// fonts cannot load here, so the repeats collapse into one identical glyph
// shown N times. Keep the first occurrence of each standalone short
// Japanese run and drop the exact duplicates (plus dead tts elements).
export function pruneRedundantAnkiGlyphRepeats(html: string): string {
    if (typeof document === 'undefined') return html;
    // This is a detached transform, not the live sink. Keep one-shot private
    // capability tokens serialized until the caller's final setInnerHtml.
    const root = parseHtmlDocument(html).body;
    root.querySelectorAll('tts').forEach(element => element.remove());
    duplicateAnkiGlyphElements(root).forEach(removeAnkiGlyphElement);
    root.querySelectorAll('br + br').forEach(element => element.remove());
    trimTrailingAnkiSpacing(root);
    return root.innerHTML;
}

function duplicateAnkiGlyphElements(root: ParentNode): Element[] {
    const seen = new Set<string>();
    return Array.from(root.querySelectorAll('span, font, b, strong, div')).filter(element => {
        const text = standaloneAnkiGlyphText(element);
        if (!text) return false;
        if (seen.has(text)) return true;
        seen.add(text);
        return false;
    });
}

function standaloneAnkiGlyphText(element: Element): string | null {
    if (element.children.length > 0) return null;
    const text = compactAnkiElementText(element);
    return isShortJapaneseGlyph(text) ? text : null;
}

function compactAnkiElementText(element: Element): string {
    return element.textContent ? element.textContent.replace(/\s+/g, '') : '';
}

function isShortJapaneseGlyph(text: string): boolean {
    if (!text) return false;
    if (text.length > 4) return false;
    return JAPANESE_GLYPH_RUN_RE.test(text);
}

function removeAnkiGlyphElement(element: Element): void {
    const before = element.previousSibling;
    if (isBlankAnkiTextNode(before)) before.remove();
    element.remove();
}

function trimTrailingAnkiSpacing(root: ParentNode): void {
    let last = root.lastChild;
    while (last && isTrailingAnkiSpacing(last)) {
        const previous = last.previousSibling;
        last.remove();
        last = previous;
    }
}

function isTrailingAnkiSpacing(node: Node): boolean {
    if (isBlankAnkiTextNode(node)) return true;
    return node instanceof Element && node.tagName === 'BR';
}

function isBlankAnkiTextNode(node: Node | null): node is Text {
    if (!(node instanceof Text)) return false;
    return node.textContent.trim() === '';
}

const JAPANESE_GLYPH_RUN_RE = /^[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\u3005\u3006\u30f6]+$/;

export function renderAnkiRenderedCardStudyBody(card: AnkiRenderedCard, revealed: boolean, language: InterfaceLanguage, soundFilenames: string[] = []): string {
    const questionHtml = sanitizeAnkiCardHtml(card.question, soundFilenames, language, card.mediaDataUrls, STUDY_ANKI_SANITIZE);
    const question = renderAnkiRenderedSideBody(questionHtml);
    const sides = revealed ? renderAnkiRenderedSides(card, soundFilenames, language, STUDY_ANKI_SANITIZE) : [question].filter(Boolean);
    if (!sides.length) return '';
    return `<div class="jpdb-reader-anki-rendered-card jpdb-reader-anki-study-card" data-anki-rendered-card-id="${card.cardId}">${sides.join('')}</div>`;
}

function renderedAnkiAnswerIncludesQuestion(questionHtml: string, answerHtml: string): boolean {
    const question = normalizedAnkiRenderedText(questionHtml);
    const answer = normalizedAnkiRenderedText(answerHtml);
    if (!question || !answer) return false;
    if (answer === question) return true;
    if (!answer.startsWith(question)) return false;
    const remainder = answer.slice(question.length).trim();
    return Boolean(remainder);
}

function normalizedAnkiRenderedText(html: string): string {
    if (typeof document === 'undefined') return html.replace(/\s+/g, ' ').trim();
    return parseHtmlDocument(html).body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function hasRenderableAnkiCardContent(html: string): boolean {
    if (typeof document === 'undefined') return Boolean(html.trim());
    const body = parseHtmlDocument(html).body;
    const text = body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (text) return true;
    return Boolean(body.querySelector([
        'img[src]',
        'audio[src]',
        'audio source[src]',
        'video[src]',
        'video source[src]',
        'svg',
        'canvas',
        '[data-anki-media-name]',
        '.jpdb-reader-anki-sound',
    ].join(',')));
}

function renderAnkiFields(note: AnkiExistingNote, language: InterfaceLanguage): string {
    return renderAnkiPreviewFields(note.fields, language);
}

function renderAnkiPreviewFields(fieldsByName: Record<string, string>, language: InterfaceLanguage, options: { renderHtml?: boolean } = {}): string {
    const fields = Object.entries(fieldsByName)
        .map(([name, value]) => ({ name, value: value.trim() }))
        .filter(field => field.value)
        .slice(0, 14);
    if (!fields.length) return '';
    return `<div class="jpdb-reader-anki-fields">
        ${fields.map(field => previewField(field.name, field.value, language, options)).join('')}
    </div>`;
}

function previewField(label: string, value: string, language: InterfaceLanguage, options: { renderHtml?: boolean } = {}): string {
    return `<div class="jpdb-reader-anki-field"><strong title="${escapeHtml(label)}">${escapeHtml(displayAnkiFieldLabel(label))}</strong><span>${renderFieldText(value, language, options)}</span></div>`;
}

function renderFieldText(value: string, language: InterfaceLanguage, options: { renderHtml?: boolean } = {}): string {
    const html = options.renderHtml
        ? sanitizeAnkiCardHtml(value, [], language)
        : escapeHtml(value);
    return html.replace(/\[sound:([^\]]+)]/gi, (_, filename: string) =>
        renderAnkiSoundChip(filename, language),
    );
}

function renderAnkiSoundChip(filename: string, language: InterfaceLanguage): string {
    const title = ankiAudioLabel(filename, language);
    return `<button class="jpdb-reader-icon-mini jpdb-reader-anki-sound jpdb-reader-audio-control" type="button" data-action="anki-media-audio" data-anki-media-name="${escapeHtml(filename)}"${privateCommandAttributes({ kind: 'card-action', action: 'anki-media-audio', mediaFilename: filename })} title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${speakerIcon()}</button>`;
}

function renderAnkiNoteActions(note: AnkiExistingNote, language: InterfaceLanguage): string {
    if (!Number.isFinite(note.noteId) || note.noteId <= 0) return '';
    return `<div class="jpdb-reader-anki-note-actions">
        ${renderAnkiAudioMergeSelect(note, language)}
        <div class="jpdb-reader-anki-note-action-row">
            <button class="jpdb-reader-btn anki compact" data-action="anki-merge" data-note-id="${note.noteId}"${privateCommandAttributes({ kind: 'card-action', action: 'anki-merge', noteId: note.noteId })} title="${escapeHtml(uiText(language, 'mergeYomuTitle'))}">${escapeHtml(uiText(language, 'mergeYomu'))}</button>
            <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${note.noteId}"${privateCommandAttributes({ kind: 'card-action', action: 'anki-edit', noteId: note.noteId })}>${escapeHtml(uiText(language, 'editInAnki'))}</button>
        </div>
    </div>`;
}

function renderAnkiAudioMergeSelect(note: AnkiExistingNote, language: InterfaceLanguage): string {
    if (!noteHasAudio(note)) return '';
    return `<label class="jpdb-reader-anki-audio-merge">
        <span>${escapeHtml(uiText(language, 'audio'))}</span>
        <select data-anki-audio-merge>
            <option value="both"${privateCommandAttributes({ kind: 'anki-audio-merge', mode: 'both' })}>${escapeHtml(uiText(language, 'keepBothAudio'))}</option>
            <option value="theirs"${privateCommandAttributes({ kind: 'anki-audio-merge', mode: 'theirs' })}>${escapeHtml(uiText(language, 'keepAnkiAudio'))}</option>
            <option value="ours"${privateCommandAttributes({ kind: 'anki-audio-merge', mode: 'ours' })}>${escapeHtml(uiText(language, 'useYomuAudio'))}</option>
        </select>
    </label>`;
}

function noteHasAudio(note: AnkiExistingNote): boolean {
    return Object.entries(note.fields).some(([name, value]) =>
        /audio|sound|voice|pronunciation/i.test(name) || /\[sound:[^\]]+]/i.test(value),
    );
}

function sanitizeAnkiCardHtml(
    value: string,
    soundFilenames: string[],
    language: InterfaceLanguage,
    mediaDataUrls: Record<string, string> = {},
    options = POPOVER_ANKI_SANITIZE,
): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (typeof document === 'undefined') return escapeHtml(trimmed);
    const template = ankiCardTemplate(trimmed);
    sanitizeAnkiCardFragment(template.content, mediaDataUrls, options);
    installAnkiMediaFallbackButtons(template.content, language, ankiPlaybackMarkerFilenames(template.content, soundFilenames));
    replaceAnkiSoundMarkers(template.content, language);
    replaceAnkiPlaybackMarkers(template.content, soundFilenames, language);
    return template.innerHTML.trim();
}

function sanitizeAnkiCardFragment(fragment: DocumentFragment, mediaDataUrls: Record<string, string>, options: AnkiCardSanitizeOptions): void {
    fragment.querySelectorAll('script, style, link, iframe, object, embed, base, meta').forEach(node => node.remove());
    unwrapAnkiCardRuby(fragment);
    fragment.querySelectorAll('*').forEach(node => sanitizeAnkiCardElement(node, mediaDataUrls, options));
}

// Drop baked-in furigana so the card body parses as plain base text and the
// reader re-applies ruby in the same style as everywhere else (this also stops
// the text collector from reading "base+reading" and rendering it duplicated).
function unwrapAnkiCardRuby(fragment: DocumentFragment): void {
    fragment.querySelectorAll('ruby').forEach(ruby => {
        ruby.querySelectorAll('rt, rp').forEach(node => node.remove());
        ruby.replaceWith(...Array.from(ruby.childNodes));
    });
    stripAnkiBracketFurigana(fragment);
}

// Anki's bracket furigana (`日本語[にほんご]`, with an optional separating
// space before the base) would otherwise show its raw brackets in the
// preview. Reduce it to base text like <ruby> above.
const ANKI_BRACKET_FURIGANA_RE = / ?([㐀-鿿々-〇]+)\[([぀-ヿー・]+)\]/gu;

function stripAnkiBracketFurigana(fragment: DocumentFragment): void {
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue ?? '';
        if (!text.includes('[')) continue;
        const replaced = text.replace(ANKI_BRACKET_FURIGANA_RE, '$1');
        if (replaced !== text) node.nodeValue = replaced;
    }
}

function sanitizeAnkiCardElement(element: Element, mediaDataUrls: Record<string, string>, options: AnkiCardSanitizeOptions): void {
    for (const attr of Array.from(element.attributes)) {
        if (shouldRemoveAnkiCardAttribute(attr.name, attr.value)) {
            element.removeAttribute(attr.name);
            continue;
        }
        rewriteAnkiCardMediaAttribute(element, attr.name, attr.value, mediaDataUrls);
    }
    sanitizeAnkiCardInlineStyle(element, options);
}

function rewriteAnkiCardMediaAttribute(element: Element, name: string, value: string, mediaDataUrls: Record<string, string>): void {
    if (!['src', 'poster', 'xlink:href'].includes(name.toLowerCase())) return;
    const filename = ankiMediaFilenameFromCardUrl(value);
    if (!filename) return;
    const dataUrl = mediaDataUrls[filename] ?? mediaDataUrls[value.trim()];
    element.setAttribute('data-anki-media-name', filename);
    if (dataUrl) element.setAttribute(name, dataUrl);
}

function sanitizeAnkiCardInlineStyle(element: Element, options: AnkiCardSanitizeOptions): void {
    if (!(element instanceof HTMLElement)) return;
    const originalStyle = element.getAttribute('style');
    if (!originalStyle) return;
    if (/(?:^|;)\s*font\s*:/i.test(originalStyle)) {
        element.setAttribute('style', capFontShorthandDeclarations(originalStyle, options));
    }
    if (/(?:^|;)\s*font-size\s*:/i.test(element.getAttribute('style') ?? '')) {
        element.setAttribute('style', capFontSizeDeclarations(element.getAttribute('style') ?? '', options));
    }
    removeNestedScrollInlineStyle(element);
    if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
}

function removeNestedScrollInlineStyle(element: HTMLElement): void {
    ['max-height', 'overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y']
        .forEach(property => element.style.removeProperty(property));
}

function capFontShorthandDeclarations(style: string, options: AnkiCardSanitizeOptions): string {
    return style.replace(/(^|;)(\s*font\s*:\s*)([^;]+)/gi, (_, separator: string, prefix: string, value: string) => {
        return `${separator}${prefix}${capFontShorthandValue(value, options)}`;
    });
}

function capFontShorthandValue(value: string, options: AnkiCardSanitizeOptions): string {
    return capFontLengthTokens(value, options);
}

function capFontSizeDeclarations(style: string, options: AnkiCardSanitizeOptions): string {
    return style.replace(/(^|;)(\s*font-size\s*:\s*)([^;]+)/gi, (_, separator: string, prefix: string, value: string) => {
        return `${separator}${prefix}${cappedFontSizeValue(value, options)}`;
    });
}

function cappedFontSizeValue(rawValue: string, options: AnkiCardSanitizeOptions): string {
    const value = rawValue.trim();
    const match = /^([\d.]+)\s*(px|pt|em|rem)$/i.exec(value);
    if (!match) return value;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount)) return value;
    if (unit === 'px') return `${Math.min(amount, options.maxFontPx)}px`;
    if (unit === 'pt') return `${Math.min(amount, options.maxFontPt)}pt`;
    if (unit === 'em' || unit === 'rem') return `${Math.min(amount, options.maxFontRelative)}${unit}`;
    return value;
}

function capFontLengthTokens(value: string, options: AnkiCardSanitizeOptions): string {
    const capped = value.replace(/(\d+(?:\.\d+)?)(\s*)(px|pt|em|rem)\b/gi, (
        match: string,
        amount: string,
        _space: string,
        unit: string,
    ) => {
        const cappedValue = cappedFontSizeValue(`${amount}${unit}`, options);
        return cappedValue || match;
    });
    return shouldWrapViewportFontSize(capped)
        ? `min(${capped}, ${options.maxFontPx}px)`
        : capped;
}

function shouldWrapViewportFontSize(value: string): boolean {
    const trimmed = value.trim();
    if (/^(?:clamp|min)\(/i.test(trimmed)) return false;
    return /\b\d+(?:\.\d+)?\s*(?:vw|vh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i.test(trimmed)
        || /^calc\(/i.test(trimmed)
        || /^max\(/i.test(trimmed);
}

function installAnkiMediaFallbackButtons(root: ParentNode, language: InterfaceLanguage, playbackMarkerFilenames: Set<string> = new Set()): void {
    root.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => {
        const filename = ankiMediaFilenameFromElement(media);
        if (!filename) return;
        media.setAttribute('controls', '');
        if (media.tagName === 'AUDIO' && playbackMarkerFilenames.has(filename)) return;
        const template = ankiCardTemplate(renderAnkiSoundChip(filename, language));
        media.before(template.content);
    });
}

function ankiMediaFilenameFromElement(media: HTMLMediaElement): string {
    const own = media.getAttribute('data-anki-media-name') || ankiMediaFilenameFromCardUrl(media.getAttribute('src') ?? '');
    if (own) return own;
    return Array.from(media.querySelectorAll('source'))
        .map(source => source.getAttribute('data-anki-media-name') || ankiMediaFilenameFromCardUrl(source.getAttribute('src') ?? ''))
        .find(Boolean) ?? '';
}

function replaceAnkiSoundMarkers(root: ParentNode, language: InterfaceLanguage): void {
    replaceAnkiTextMarkers(root, /\[sound:[^\]]+]/gi, (marker: string) => {
        const match = /^\[sound:([^\]]+)]$/i.exec(marker);
        return match ? ankiSoundMarkerNode(match[1], language) : null;
    });
}

function replaceAnkiPlaybackMarkers(root: ParentNode, soundFilenames: string[], language: InterfaceLanguage): void {
    replaceAnkiTextMarkers(root, /\[anki:play:[^\]]+]/gi, marker => ankiPlaybackMarkerNode(marker, soundFilenames, language));
}

function ankiPlaybackMarkerFilenames(root: ParentNode, soundFilenames: string[]): Set<string> {
    const filenames = new Set<string>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? '';
        for (const match of text.matchAll(/\[anki:play:[^\]]+]/gi)) {
            const filename = ankiPlaybackMarkerFilename(match[0], soundFilenames);
            if (filename) filenames.add(filename);
        }
    }
    return filenames;
}

function replaceAnkiTextMarkers(root: ParentNode, pattern: RegExp, markerNode: (marker: string) => HTMLElement | null): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    textNodes.forEach(node => replaceAnkiTextMarkerNode(node, pattern, markerNode));
}

function replaceAnkiTextMarkerNode(node: Text, pattern: RegExp, markerNode: (marker: string) => HTMLElement | null): void {
    const parts = node.textContent?.split(new RegExp(`(${pattern.source})`, pattern.flags)) ?? [];
    if (parts.length < 2) return;
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
        if (!part) continue;
        fragment.append(markerNode(part) ?? document.createTextNode(part));
    }
    node.replaceWith(fragment);
}

function ankiSoundMarkerNode(value: string, language: InterfaceLanguage): HTMLElement | null {
    const filename = value.trim();
    if (!filename) return null;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'jpdb-reader-icon-mini jpdb-reader-anki-sound jpdb-reader-audio-control';
    chip.dataset.action = 'anki-media-audio';
    chip.dataset.ankiMediaName = filename;
    preparePrivateCommandSerialization(chip, { kind: 'card-action', action: 'anki-media-audio', mediaFilename: filename });
    chip.title = ankiAudioLabel(filename, language);
    chip.setAttribute('aria-label', chip.title);
    setInnerHtml(chip, speakerIcon());
    return chip;
}

function ankiPlaybackMarkerNode(value: string, soundFilenames: string[], language: InterfaceLanguage): HTMLElement | null {
    const audioIndex = ankiPlaybackMarkerIndex(value);
    if (audioIndex === null) return null;
    const filename = ankiPlaybackMarkerFilenameAtIndex(soundFilenames, audioIndex);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'jpdb-reader-icon-mini jpdb-reader-anki-sound jpdb-reader-anki-playback-marker jpdb-reader-audio-control';
    chip.dataset.action = 'anki-media-audio';
    configureAnkiPlaybackMarker(chip, filename, language);
    chip.setAttribute('aria-label', chip.title);
    setInnerHtml(chip, speakerIcon());
    return chip;
}

function configureAnkiPlaybackMarker(chip: HTMLButtonElement, filename: string, language: InterfaceLanguage): void {
    if (!filename) {
        chip.title = uiText(language, 'ankiAudioUnavailablePreview');
        chip.disabled = true;
        return;
    }
    chip.dataset.ankiMediaName = filename;
    preparePrivateCommandSerialization(chip, { kind: 'card-action', action: 'anki-media-audio', mediaFilename: filename });
    chip.title = ankiAudioLabel(filename, language);
}

function ankiPlaybackMarkerFilename(value: string, soundFilenames: string[]): string {
    const audioIndex = ankiPlaybackMarkerIndex(value);
    return audioIndex === null ? '' : ankiPlaybackMarkerFilenameAtIndex(soundFilenames, audioIndex);
}

function ankiCardTemplate(html: string): HTMLTemplateElement {
    const template = document.createElement('template');
    const body = parseHtmlDocument(html).body;
    for (const node of Array.from(body.childNodes)) {
        template.content.append(document.importNode(node, true));
    }
    return template;
}

function ankiPlaybackMarkerIndex(value: string): number | null {
    const match = /^\[anki:play:[^:\]]+:(\d+)]$/i.exec(value);
    return match ? Number(match[1]) : null;
}

function ankiPlaybackMarkerFilenameAtIndex(soundFilenames: string[], index: number): string {
    return soundFilenames[index] ?? soundFilenames[0] ?? '';
}

function ankiSoundFilenames(note: AnkiExistingNote): string[] {
    const filenames = Object.values(note.fields)
        .flatMap(value => Array.from(value.matchAll(/\[sound:([^\]]+)]/gi), match => match[1]?.trim() ?? ''))
        .filter(Boolean);
    return [...new Set(filenames)];
}

function shouldRemoveAnkiCardAttribute(name: string, value: string): boolean {
    const lowerName = name.toLowerCase();
    if (lowerName.startsWith('on') || lowerName === 'srcdoc') return true;
    if (!['href', 'src', 'poster', 'xlink:href'].includes(lowerName)) return false;
    return isUnsafeAnkiCardUrl(value);
}

function isUnsafeAnkiCardUrl(value: string): boolean {
    const trimmed = value.trim();
    return /^(javascript|vbscript):/i.test(trimmed) || /^data:text\/html/i.test(trimmed);
}

function renderLastMiningContext(context: StoredMiningContext, language: InterfaceLanguage): string {
    return `<div class="jpdb-reader-anki-context"><strong>${escapeHtml(uiText(language, 'lastSeen'))}</strong><span>${escapeHtml(localizedContextLabel(context, language))}</span><small>${escapeHtml(context.sentence)}</small></div>`;
}

function localizedContextLabel(context: StoredMiningContext, language: InterfaceLanguage): string {
    const immersionLabel = localizedImmersionContextLabel(context);
    if (immersionLabel) return immersionLabel;
    const sourceLabel = localizedContextSourceLabel(context, language);
    if (sourceLabel) return `${sourceLabel}: ${context.sourceTitle}`;
    return context.sourceTitle || context.sourceUrl || uiText(language, 'contextCurrentPage');
}

function localizedImmersionContextLabel(context: StoredMiningContext): string {
    return context.sourceKind === 'immersion-kit' && context.immersionIndex !== undefined && context.immersionTotal
        ? `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}`
        : '';
}

function localizedContextSourceLabel(context: StoredMiningContext, language: InterfaceLanguage): string {
    if (!context.sourceTitle) return '';
    if (context.sourceKind === 'jpdb') return 'JPDB';
    const labelKey = CONTEXT_SOURCE_LABEL_KEYS[context.sourceKind];
    return labelKey ? uiText(language, labelKey) : '';
}

export function renderReviewButtons(
    settings: ReaderSettings,
    ankiNote: AnkiExistingNote | null = null,
    options: { disabled?: boolean; title?: string; targetLabel?: string; intervals?: ReviewGradeIntervals } = {},
): string {
    const ankiCardId = ankiReviewCardId(ankiNote);
    const grades = reviewButtonGrades(settings);
    // Jiten/Anki parity: due-in previews on the popover grade row, same data
    // the study page's grade bar shows.
    const intervals = ankiReviewIntervals(options.intervals, ankiNote);
    return `
        ${renderAnkiReviewTarget(options.targetLabel)}
        <div class="jpdb-reader-row${ankiReviewGradesClass(grades)}" style="--cols: ${grades.length}">
            ${grades.map(([grade, label]) => renderAnkiReviewButton(grade, label, ankiCardId, intervals, options, settings.interfaceLanguage)).join('')}
        </div>
    `;
}

function ankiReviewCardId(note: AnkiExistingNote | null): number | undefined {
    return note?.primaryCardId ?? undefined;
}

function ankiReviewIntervals(intervals: ReviewGradeIntervals | undefined, note: AnkiExistingNote | null): ReviewGradeIntervals | undefined {
    return intervals ?? note?.reviewGradeIntervals;
}

function renderAnkiReviewTarget(targetLabel: string | undefined): string {
    return targetLabel ? `<div class="jpdb-reader-review-target">${escapeHtml(targetLabel)}</div>` : '';
}

function ankiReviewGradesClass(grades: Array<[string, string]>): string {
    return grades.length === 5 ? ' jpdb-reader-grades' : '';
}

function renderAnkiReviewButton(
    grade: string,
    label: string,
    ankiCardId: number | undefined,
    intervals: ReviewGradeIntervals | undefined,
    options: { disabled?: boolean; title?: string; targetLabel?: string },
    language: InterfaceLanguage,
): string {
    const ankiAttrs = ankiReviewCardAttributes(ankiCardId);
    const command = privateCommandAttributes({
        kind: 'card-action',
        action: 'grade',
        grade: grade as JPDBGrade,
        reviewTarget: ankiReviewTarget(ankiCardId),
        ankiCardId,
    });
    return `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${command}${reviewButtonAttrs(options, label, language)}>${label}${ankiReviewIntervalSpan(intervals, grade)}</button>`;
}

function ankiReviewCardAttributes(ankiCardId: number | undefined): string {
    return ankiCardId ? ` data-anki-card-id="${ankiCardId}"` : '';
}

function ankiReviewTarget(ankiCardId: number | undefined): 'anki' | undefined {
    return ankiCardId ? 'anki' : undefined;
}

function ankiReviewIntervalSpan(intervals: ReviewGradeIntervals | undefined, grade: string): string {
    if (!intervals) return '';
    const interval = intervals[grade as keyof ReviewGradeIntervals];
    if (!interval) return '';
    const label = ankiReviewIntervalLabel(interval);
    return label ? `<span class="jpdb-reader-grade-interval">${escapeHtml(label)}</span>` : '';
}

function ankiReviewIntervalLabel(interval: NonNullable<ReviewGradeIntervals[keyof ReviewGradeIntervals]>): string {
    return interval.buttonLabel || interval.intervalLabel || '';
}

function reviewButtonAttrs(options: { disabled?: boolean; title?: string; targetLabel?: string }, buttonLabel: string, language: InterfaceLanguage): string {
    const title = options.title || options.targetLabel || '';
    const disabled = options.disabled ? ` disabled` : '';
    const titleAttr = options.disabled || title
        ? ` title="${escapeHtml(options.disabled ? title || uiText(language, 'unavailable') : title)}"`
        : '';
    const aria = title
        ? ` aria-label="${escapeHtml(`${buttonLabel}: ${title}`)}"`
        : '';
    return `${disabled}${titleAttr}${aria}`;
}

export function reviewButtonGrades(settings: ReaderSettings): Array<[string, string]> {
    const language = settings.interfaceLanguage;
    return settings.twoButtonReviews
        ? [['fail', uiText(language, 'gradeFailLabel')], ['pass', uiText(language, 'gradePassLabel')]]
        : [['nothing', uiText(language, 'gradeNothingLabel')], ['something', uiText(language, 'gradeSomethingLabel')], ['hard', uiText(language, 'gradeHardLabel')], ['okay', uiText(language, 'gradeOkayLabel')], ['easy', uiText(language, 'gradeEasyLabel')]];
}

function ankiAudioLabel(filename: string, language: InterfaceLanguage): string {
    return filename ? formatUiText(language, 'ankiAudioFilenameLabel', { filename }) : uiText(language, 'audio');
}

function ankiCardReviewTargetLabel(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const target = ankiCardReviewTargetName(note);
    return formatUiText(language, 'gradeAnkiCardTarget', { target });
}

function ankiCardReviewTargetName(note: AnkiExistingNote): string {
    const primaryCard = primaryRenderedAnkiCard(note);
    const deck = ankiReviewTargetDeck(note, primaryCard);
    const cardLabel = ankiReviewTargetCardLabel(note, primaryCard);
    return cardLabel.includes('#') || primaryCard?.cardName
        ? [deck, cardLabel].filter(Boolean).join(primaryCard?.cardName ? ' · ' : ' ')
        : deck;
}

function primaryRenderedAnkiCard(note: AnkiExistingNote): AnkiRenderedCard | null {
    if (!note.primaryCardId) return null;
    return note.renderedCards?.find(card => card.cardId === note.primaryCardId) ?? null;
}

function ankiReviewTargetDeck(note: AnkiExistingNote, primaryCard: AnkiRenderedCard | null): string {
    return primaryCard?.deckName || note.deckNames.join(', ') || note.modelName || 'Anki';
}

function ankiReviewTargetCardLabel(note: AnkiExistingNote, primaryCard: AnkiRenderedCard | null): string {
    const cardId = note.primaryCardId ? `#${note.primaryCardId}` : '';
    return primaryCard?.cardName ? `${primaryCard.cardName} ${cardId}`.trim() : cardId;
}

function displayAnkiFieldLabel(label: string): string {
    const cleaned = label.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return label;
    if (!/^[A-Z0-9\s]+$/.test(cleaned) || !/[A-Z]/.test(cleaned)) return cleaned;
    return cleaned.toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
}
