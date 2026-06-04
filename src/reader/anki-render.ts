import { ankiMediaFilenameFromCardUrl, buildYomuAnkiPreviewFields, canUseMobileAnkiHandoff, mobileAnkiHandoffAppName, type AnkiCardContext, type AnkiExistingNote, type AnkiLookupResult, type AnkiRenderedCard } from './anki';
import { escapeHtml } from './dom';
import type { StoredMiningContext } from './mining-context';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from './types';
import { formatUiText, uiText, type UiCopyKey } from './i18n';

export function renderAnkiActionRow(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (ankiLookup.primary) return '';
    if (ankiLookup.state !== 'not-in-deck') return '';
    const mobileHandoff = shouldRenderMobileAnkiHandoffAction(ankiLookup, settings);
    if (!mobileHandoff && ankiLookup.trusted === false) return '';
    const label = mobileHandoff
        ? formatUiText(settings.interfaceLanguage, 'sendToMobileAnki', { app: mobileAnkiHandoffAppName() })
        : uiText(settings.interfaceLanguage, 'addToAnki');
    return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${escapeHtml(label)}</button></div>`;
}

function shouldRenderMobileAnkiHandoffAction(ankiLookup: AnkiLookupResult, settings: ReaderSettings): boolean {
    return canUseMobileAnkiHandoff(settings) && !ankiLookup.primary;
}

export function renderAnkiExistingSection(ankiLookup: AnkiLookupResult, storedContext: StoredMiningContext | null, settings: ReaderSettings): string {
    if (!settings.ankiSectionEnabled) return '';
    const notes = orderedExistingAnkiNotes(ankiLookup);
    const primary = notes[0];
    if (!primary) return '';
    const language = settings.interfaceLanguage;
    const summary = ankiExistingSectionSummary(primary, notes.length, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing" open>
            <summary class="jpdb-reader-local-title">
                <span><span class="jpdb-reader-state-dot anki-${primary.state}"></span>Anki${notes.length > 1 ? ` (${notes.length})` : ''}</span>
                <small class="jpdb-reader-source-status">${escapeHtml(summary)}</small>
            </summary>
            ${notes.length > 1 ? renderAnkiCollisionSummary(notes, language) : ''}
            ${notes.length === 1
                ? renderAnkiExistingNote(primary, storedContext, settings, false, true)
                : notes.map((note, index) => renderAnkiExistingNote(note, index === 0 ? storedContext : null, settings, true, index === 0)).join('')}
        </details>
    `;
}

export function renderAnkiNewCardPreview(card: JPDBCard, sentence: string | undefined, settings: ReaderSettings, context: AnkiCardContext = {}): string {
    if (!settings.ankiEnabled || !settings.ankiSectionEnabled) return '';
    const fields = buildYomuAnkiPreviewFields(card, sentence ?? card.sentence ?? '', settings, context);
    const fieldPreview = renderAnkiPreviewFields(fields, settings.interfaceLanguage, { renderHtml: true });
    if (!fieldPreview) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing jpdb-reader-anki-new">
            <summary class="jpdb-reader-local-title">
                <span><span class="jpdb-reader-state-dot anki-not-in-deck"></span>Anki</span>
                <small class="jpdb-reader-source-status">${escapeHtml(ankiNewCardSummary(settings))}</small>
            </summary>
            <div class="jpdb-reader-local-entry jpdb-reader-anki-card-preview">
                ${fieldPreview}
            </div>
        </details>
    `;
}

function orderedExistingAnkiNotes(ankiLookup: AnkiLookupResult): AnkiExistingNote[] {
    const notes: AnkiExistingNote[] = [];
    appendUniqueAnkiNote(notes, ankiLookup.primary);
    (ankiLookup.notes ?? []).forEach(note => appendUniqueAnkiNote(notes, note));
    return notes;
}

function appendUniqueAnkiNote(notes: AnkiExistingNote[], note: AnkiExistingNote | null | undefined): void {
    if (!note) return;
    const key = ankiNoteKey(note);
    if (notes.some(existing => ankiNoteKey(existing) === key)) return;
    notes.push(note);
}

function ankiNoteKey(note: AnkiExistingNote): string {
    if (Number.isFinite(note.noteId) && note.noteId > 0) return `note:${note.noteId}`;
    return `${note.modelName}:${note.primaryCardId || note.cardIds.join(',')}:${note.deckNames.join(',')}`;
}

function ankiExistingSectionSummary(primary: AnkiExistingNote, count: number, language: InterfaceLanguage): string {
    const summary = ankiExistingSummary(primary, language);
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

function renderAnkiExistingNote(note: AnkiExistingNote, storedContext: StoredMiningContext | null, settings: ReaderSettings, collapsible: boolean, open: boolean): string {
    const language = settings.interfaceLanguage;
    const preview = ankiExistingPreview(note, storedContext, language);
    const content = `<div class="jpdb-reader-anki-existing-note-body">
        ${preview.renderedCard}
        ${preview.fields}
        ${preview.pending}
        ${preview.context}
        ${renderAnkiNoteActions(note, language)}
        ${settings.enableReviews && note.primaryCardId ? renderReviewButtons(settings, note, { targetLabel: ankiCardReviewTargetLabel(note, language) }) : ''}
    </div>`;
    if (!collapsible) {
        return `<div class="jpdb-reader-local-entry jpdb-reader-anki-card-preview" data-anki-note-id="${note.noteId}">
        ${content}
    </div>`;
    }
    return `<details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note" data-anki-note-id="${note.noteId}"${open ? ' open' : ''}>
        <summary class="jpdb-reader-anki-existing-note-title">
            <span><span class="jpdb-reader-state-dot anki-${note.state}"></span><strong>${escapeHtml(ankiNoteIdentityLabel(note, language))}</strong></span>
            <small>${escapeHtml(preview.summary)}</small>
        </summary>
        ${content}
    </details>`;
}

export function ankiNewCardSummary(settings: ReaderSettings): string {
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
    const key = ANKI_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : state;
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
    return `<details class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="${card.cardId}"${index === 0 ? ' open' : ''}>
        <summary class="jpdb-reader-anki-rendered-card-title">${escapeHtml(renderedCardTitle(card, index))}</summary>
        ${content}
    </details>`;
}

function orderedRenderedCards(note: AnkiExistingNote): AnkiRenderedCard[] {
    const cards = note.renderedCards ?? [];
    const primary = cards.find(card => card.cardId === note.primaryCardId);
    return primary ? [primary, ...cards.filter(card => card.cardId !== primary.cardId)] : cards;
}

function renderedCardTitle(card: AnkiRenderedCard, index: number): string {
    return [card.deckName, `#${card.cardId || index + 1}`].filter(Boolean).join(' ');
}

function renderAnkiRenderedSides(card: AnkiRenderedCard, soundFilenames: string[], language: InterfaceLanguage): string[] {
    const questionHtml = sanitizeAnkiCardHtml(card.question, soundFilenames, language, card.mediaDataUrls);
    const answerHtml = sanitizeAnkiCardHtml(card.answer, soundFilenames, language, card.mediaDataUrls);
    const question = hasRenderableAnkiCardContent(questionHtml) ? renderAnkiRenderedSideBody(questionHtml) : '';
    const answer = hasRenderableAnkiCardContent(answerHtml) ? renderAnkiRenderedSideBody(answerHtml) : '';
    if (!question) return answer ? [answer] : [];
    if (!answer) return [question];
    if (renderedAnkiAnswerIncludesQuestion(questionHtml, answerHtml)) return [answer];
    return [question, answer];
}

function renderAnkiRenderedSideBody(html: string): string {
    if (!html || !hasRenderableAnkiCardContent(html)) return '';
    return `<section class="jpdb-reader-anki-rendered-side">
        <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">${html}</div>
    </section>`;
}

export function renderAnkiRenderedCardStudyBody(card: AnkiRenderedCard, revealed: boolean, language: InterfaceLanguage, soundFilenames: string[] = []): string {
    const questionHtml = sanitizeAnkiCardHtml(card.question, soundFilenames, language, card.mediaDataUrls);
    const question = hasRenderableAnkiCardContent(questionHtml) ? renderAnkiRenderedSideBody(questionHtml) : '';
    const sides = revealed ? renderAnkiRenderedSides(card, soundFilenames, language) : [question].filter(Boolean);
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
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function hasRenderableAnkiCardContent(html: string): boolean {
    if (typeof document === 'undefined') return Boolean(html.trim());
    const template = document.createElement('template');
    template.innerHTML = html;
    const text = template.content.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (text) return true;
    return Boolean(template.content.querySelector([
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
    const label = uiText(language, 'ankiCardAudio');
    const title = ankiAudioLabel(filename, language);
    return `<button class="jpdb-reader-anki-sound" type="button" data-action="anki-media-audio" data-anki-media-name="${escapeHtml(filename)}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

function renderAnkiNoteActions(note: AnkiExistingNote, language: InterfaceLanguage): string {
    if (!Number.isFinite(note.noteId) || note.noteId <= 0) return '';
    return `<div class="jpdb-reader-anki-note-actions">
        ${renderAnkiAudioMergeSelect(note, language)}
        <div class="jpdb-reader-anki-note-action-row">
            <button class="jpdb-reader-btn anki compact" data-action="anki-merge" data-note-id="${note.noteId}" title="${escapeHtml(uiText(language, 'mergeYomuTitle'))}">${escapeHtml(uiText(language, 'mergeYomu'))}</button>
            <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${note.noteId}">${escapeHtml(uiText(language, 'editInAnki'))}</button>
        </div>
    </div>`;
}

function renderAnkiAudioMergeSelect(note: AnkiExistingNote, language: InterfaceLanguage): string {
    if (!noteHasAudio(note)) return '';
    return `<label class="jpdb-reader-anki-audio-merge">
        <span>${escapeHtml(uiText(language, 'audio'))}</span>
        <select data-anki-audio-merge>
            <option value="both">${escapeHtml(uiText(language, 'keepBothAudio'))}</option>
            <option value="theirs">${escapeHtml(uiText(language, 'keepAnkiAudio'))}</option>
            <option value="ours">${escapeHtml(uiText(language, 'useYomuAudio'))}</option>
        </select>
    </label>`;
}

function noteHasAudio(note: AnkiExistingNote): boolean {
    return Object.entries(note.fields).some(([name, value]) =>
        /audio|sound|voice|pronunciation/i.test(name) || /\[sound:[^\]]+]/i.test(value),
    );
}

function sanitizeAnkiCardHtml(value: string, soundFilenames: string[], language: InterfaceLanguage, mediaDataUrls: Record<string, string> = {}): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (typeof document === 'undefined') return escapeHtml(trimmed);
    const template = document.createElement('template');
    template.innerHTML = trimmed;
    sanitizeAnkiCardFragment(template.content, mediaDataUrls);
    installAnkiMediaFallbackButtons(template.content, language);
    replaceAnkiSoundMarkers(template.content, language);
    replaceAnkiPlaybackMarkers(template.content, soundFilenames, language);
    return template.innerHTML.trim();
}

function sanitizeAnkiCardFragment(fragment: DocumentFragment, mediaDataUrls: Record<string, string>): void {
    fragment.querySelectorAll('script, style, link, iframe, object, embed, base, meta').forEach(node => node.remove());
    fragment.querySelectorAll('*').forEach(node => sanitizeAnkiCardElement(node, mediaDataUrls));
}

function sanitizeAnkiCardElement(element: Element, mediaDataUrls: Record<string, string>): void {
    for (const attr of Array.from(element.attributes)) {
        if (shouldRemoveAnkiCardAttribute(attr.name, attr.value)) {
            element.removeAttribute(attr.name);
            continue;
        }
        rewriteAnkiCardMediaAttribute(element, attr.name, attr.value, mediaDataUrls);
    }
    sanitizeAnkiCardInlineStyle(element);
}

function rewriteAnkiCardMediaAttribute(element: Element, name: string, value: string, mediaDataUrls: Record<string, string>): void {
    if (!['src', 'poster', 'xlink:href'].includes(name.toLowerCase())) return;
    const filename = ankiMediaFilenameFromCardUrl(value);
    if (!filename) return;
    const dataUrl = mediaDataUrls[filename] ?? mediaDataUrls[value.trim()];
    element.setAttribute('data-anki-media-name', filename);
    if (dataUrl) element.setAttribute(name, dataUrl);
}

function sanitizeAnkiCardInlineStyle(element: Element): void {
    if (!(element instanceof HTMLElement)) return;
    const originalStyle = element.getAttribute('style');
    if (!originalStyle) return;
    if (/(?:^|;)\s*font(?:-size)?\s*:/i.test(originalStyle)) {
        const capped = cappedFontSizeValue(element.style.fontSize);
        if (capped) element.style.fontSize = capped;
    }
    removeNestedScrollInlineStyle(element);
    const updatedStyle = element.getAttribute('style');
    if (updatedStyle && /(?:^|;)\s*font\s*:/i.test(updatedStyle)) {
        element.setAttribute('style', updatedStyle.replace(/(^|;)\s*font\s*:[^;]+;?/gi, '$1').trim());
    }
    if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
}

function removeNestedScrollInlineStyle(element: HTMLElement): void {
    ['max-height', 'overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y']
        .forEach(property => element.style.removeProperty(property));
}

function cappedFontSizeValue(rawValue: string): string {
    const value = rawValue.trim();
    const match = /^([\d.]+)\s*(px|pt|em|rem)$/i.exec(value);
    if (!match) return value;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount)) return value;
    if (unit === 'px') return `${Math.min(amount, 30)}px`;
    if (unit === 'pt') return `${Math.min(amount, 22)}pt`;
    if (unit === 'em' || unit === 'rem') return `${Math.min(amount, 1.8)}${unit}`;
    return value;
}

function installAnkiMediaFallbackButtons(root: ParentNode, language: InterfaceLanguage): void {
    root.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => {
        const filename = ankiMediaFilenameFromElement(media);
        if (!filename) return;
        media.setAttribute('controls', '');
        media.insertAdjacentHTML('beforebegin', renderAnkiSoundChip(filename, language));
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
    chip.className = 'jpdb-reader-anki-sound';
    chip.dataset.action = 'anki-media-audio';
    chip.dataset.ankiMediaName = filename;
    chip.title = ankiAudioLabel(filename, language);
    chip.textContent = uiText(language, 'ankiCardAudio');
    return chip;
}

function ankiPlaybackMarkerNode(value: string, soundFilenames: string[], language: InterfaceLanguage): HTMLElement | null {
    const match = /^\[anki:play:[^:\]]+:(\d+)]$/i.exec(value);
    if (!match) return null;
    const filename = soundFilenames[Number(match[1])] ?? soundFilenames[0] ?? '';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'jpdb-reader-anki-sound jpdb-reader-anki-playback-marker';
    chip.dataset.action = 'anki-media-audio';
    if (filename) chip.dataset.ankiMediaName = filename;
    chip.title = filename ? ankiAudioLabel(filename, language) : uiText(language, 'ankiAudioUnavailablePreview');
    chip.disabled = !filename;
    chip.textContent = uiText(language, 'ankiCardAudio');
    return chip;
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
    if (context.sourceKind === 'immersion-kit' && context.immersionIndex !== undefined && context.immersionTotal) {
        return `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}`;
    }
    if (context.sourceKind === 'video' && context.sourceTitle) return `${uiText(language, 'contextVideo')}: ${context.sourceTitle}`;
    if (context.sourceKind === 'image' && context.sourceTitle) return `${uiText(language, 'contextImage')}: ${context.sourceTitle}`;
    if (context.sourceKind === 'jpdb' && context.sourceTitle) return `JPDB: ${context.sourceTitle}`;
    return context.sourceTitle || context.sourceUrl || uiText(language, 'contextCurrentPage');
}

export function renderReviewButtons(
    settings: ReaderSettings,
    ankiNote: AnkiExistingNote | null = null,
    options: { disabled?: boolean; title?: string; targetLabel?: string } = {},
): string {
    const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
    const grades = reviewButtonGrades(settings);
    const target = options.targetLabel ? `<div class="jpdb-reader-review-target">${escapeHtml(options.targetLabel)}</div>` : '';
    return `
        ${target}
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}">
            ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${reviewButtonAttrs(options, label, settings.interfaceLanguage)}>${label}</button>`).join('')}
        </div>
    `;
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

function reviewButtonGrades(settings: ReaderSettings): Array<[string, string]> {
    const language = settings.interfaceLanguage;
    return settings.twoButtonReviews
        ? [['fail', uiText(language, 'gradeFailLabel')], ['pass', uiText(language, 'gradePassLabel')]]
        : [['nothing', uiText(language, 'gradeNothingLabel')], ['something', uiText(language, 'gradeSomethingLabel')], ['hard', uiText(language, 'gradeHardLabel')], ['okay', uiText(language, 'gradeOkayLabel')], ['easy', uiText(language, 'gradeEasyLabel')]];
}

function ankiAudioLabel(filename: string, language: InterfaceLanguage): string {
    return filename ? formatUiText(language, 'ankiAudioFilenameLabel', { filename }) : uiText(language, 'audio');
}

function ankiCardReviewTargetLabel(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const target = [note.deckNames.join(', ') || note.modelName || 'Anki', note.primaryCardId ? `#${note.primaryCardId}` : '']
        .filter(Boolean)
        .join(' ');
    return formatUiText(language, 'gradeAnkiCardTarget', { target });
}

function displayAnkiFieldLabel(label: string): string {
    const cleaned = label.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return label;
    if (!/^[A-Z0-9\s]+$/.test(cleaned) || !/[A-Z]/.test(cleaned)) return cleaned;
    return cleaned.toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
}

const ANKI_STATE_LABEL_KEYS: Record<string, UiCopyKey> = {
    new: 'stateNew',
    learning: 'stateLearning',
    known: 'stateKnown',
    due: 'stateDue',
    failed: 'stateFailed',
    locked: 'stateLocked',
    'never-forget': 'stateNeverForget',
    blacklisted: 'stateBlacklisted',
    suspended: 'stateSuspended',
    'in-deck': 'stateInDeck',
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
};
