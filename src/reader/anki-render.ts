import type { AnkiExistingNote, AnkiLookupResult, AnkiRenderedCard } from './anki';
import { escapeHtml } from './dom';
import type { StoredMiningContext } from './mining-context';
import type { InterfaceLanguage, ReaderSettings } from './types';
import { uiText, type UiCopyKey } from './i18n';

export function renderAnkiActionRow(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (ankiLookup.primary) return '';
    return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(settings.interfaceLanguage, 'addToAnki')}</button></div>`;
}

export function renderAnkiExistingSection(ankiLookup: AnkiLookupResult, storedContext: StoredMiningContext | null, language: InterfaceLanguage): string {
    const note = ankiLookup.primary;
    if (!note) return '';
    const preview = ankiExistingPreview(note, storedContext, language);
    return `
        <details class="jpdb-reader-anki-existing">
            <summary>
                <span><span class="jpdb-reader-state-dot jpdb-${note.state}"></span>Anki</span>
                <small>${escapeHtml(preview.summary)}</small>
            </summary>
            <div class="jpdb-reader-anki-card-preview">
                ${preview.renderedCard}
                ${preview.fields}
                ${preview.context}
                ${renderAnkiNoteActions(note, language)}
            </div>
        </details>
    `;
}

function ankiExistingPreview(note: AnkiExistingNote, storedContext: StoredMiningContext | null, language: InterfaceLanguage): { summary: string; renderedCard: string; fields: string; context: string } {
    return {
        summary: ankiExistingSummary(note, language),
        renderedCard: renderAnkiRenderedCard(note, language),
        fields: renderAnkiFields(note, language),
        context: storedContext ? renderLastMiningContext(storedContext, language) : '',
    };
}

function ankiExistingSummary(note: AnkiExistingNote, language: InterfaceLanguage): string {
    return [
        ankiStateLabel(note.state, language),
        note.deckNames.length ? note.deckNames.join(', ') : '',
        ankiReviewMetricsLabel(note, language),
    ].filter(Boolean).join(' · ') || 'Anki';
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
    const card = primaryRenderedCard(note);
    if (!card) return '';
    const soundFilenames = ankiSoundFilenames(note);
    const question = renderAnkiRenderedSide(uiText(language, 'front'), card.question, soundFilenames, language);
    const answer = renderAnkiRenderedSide(uiText(language, 'back'), card.answer, soundFilenames, language);
    if (!question && !answer) return '';
    return `<div class="jpdb-reader-anki-rendered-card">${question}${answer}</div>`;
}

function primaryRenderedCard(note: AnkiExistingNote): AnkiRenderedCard | null {
    const cards = note.renderedCards ?? [];
    if (!cards.length) return null;
    return cards.find(card => card.cardId === note.primaryCardId) ?? cards[0] ?? null;
}

function renderAnkiRenderedSide(label: string, value: string, soundFilenames: string[], language: InterfaceLanguage): string {
    const html = sanitizeAnkiCardHtml(value, soundFilenames, language);
    if (!html) return '';
    return `<section class="jpdb-reader-anki-rendered-side">
        <strong>${label}</strong>
        <div class="jpdb-reader-anki-rendered-side-body">${html}</div>
    </section>`;
}

function renderAnkiFields(note: AnkiExistingNote, language: InterfaceLanguage): string {
    const fields = Object.entries(note.fields)
        .map(([name, value]) => ({ name, value: value.trim() }))
        .filter(field => field.value)
        .slice(0, 14);
    if (!fields.length) return '';
    return `<div class="jpdb-reader-anki-fields">
        ${fields.map(field => previewField(field.name, field.value, language)).join('')}
    </div>`;
}

function previewField(label: string, value: string, language: InterfaceLanguage): string {
    return `<div class="jpdb-reader-anki-field"><strong>${escapeHtml(label)}</strong><span>${renderFieldText(value, language)}</span></div>`;
}

function renderFieldText(value: string, language: InterfaceLanguage): string {
    return escapeHtml(value).replace(/\[sound:([^\]]+)]/gi, (_, filename: string) =>
        renderAnkiSoundChip(filename, language),
    );
}

function renderAnkiSoundChip(filename: string, language: InterfaceLanguage): string {
    const label = ankiAudioLabel(filename, language);
    return `<button class="jpdb-reader-anki-sound" type="button" data-action="anki-media-audio" data-anki-media-name="${escapeHtml(filename)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

function renderAnkiNoteActions(note: AnkiExistingNote, language: InterfaceLanguage): string {
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

function sanitizeAnkiCardHtml(value: string, soundFilenames: string[], language: InterfaceLanguage): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (typeof document === 'undefined') return escapeHtml(trimmed);
    const template = document.createElement('template');
    template.innerHTML = trimmed;
    sanitizeAnkiCardFragment(template.content);
    replaceAnkiPlaybackMarkers(template.content, soundFilenames, language);
    return template.innerHTML.trim();
}

function sanitizeAnkiCardFragment(fragment: DocumentFragment): void {
    fragment.querySelectorAll('script, style, link, iframe, object, embed, base, meta').forEach(node => node.remove());
    fragment.querySelectorAll('*').forEach(node => sanitizeAnkiCardElement(node));
}

function sanitizeAnkiCardElement(element: Element): void {
    for (const attr of Array.from(element.attributes)) {
        if (shouldRemoveAnkiCardAttribute(attr.name, attr.value)) element.removeAttribute(attr.name);
    }
}

function replaceAnkiPlaybackMarkers(root: ParentNode, soundFilenames: string[], language: InterfaceLanguage): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    textNodes.forEach(node => replaceAnkiPlaybackMarkerText(node, soundFilenames, language));
}

function replaceAnkiPlaybackMarkerText(node: Text, soundFilenames: string[], language: InterfaceLanguage): void {
    const parts = node.textContent?.split(/(\[anki:play:[^\]]+])/gi) ?? [];
    if (parts.length < 2) return;
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
        if (!part) continue;
        fragment.append(ankiPlaybackMarkerNode(part, soundFilenames, language) ?? document.createTextNode(part));
    }
    node.replaceWith(fragment);
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
    chip.textContent = uiText(language, 'audio');
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
    options: { disabled?: boolean; title?: string } = {},
): string {
    const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
    const disabledAttrs = reviewButtonDisabledAttrs(options, settings.interfaceLanguage);
    const grades = reviewButtonGrades(settings);
    return `
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}">
            ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${disabledAttrs}>${label}</button>`).join('')}
        </div>
    `;
}

function reviewButtonDisabledAttrs(options: { disabled?: boolean; title?: string }, language: InterfaceLanguage): string {
    if (options.disabled) return ` disabled title="${escapeHtml(options.title || uiText(language, 'unavailable'))}"`;
    return options.title ? ` title="${escapeHtml(options.title)}"` : '';
}

function reviewButtonGrades(settings: ReaderSettings): Array<[string, string]> {
    const language = settings.interfaceLanguage;
    return settings.twoButtonReviews
        ? [['fail', uiText(language, 'gradeFailLabel')], ['pass', uiText(language, 'gradePassLabel')]]
        : [['nothing', uiText(language, 'gradeNothingLabel')], ['something', uiText(language, 'gradeSomethingLabel')], ['hard', uiText(language, 'gradeHardLabel')], ['okay', uiText(language, 'gradeOkayLabel')], ['easy', uiText(language, 'gradeEasyLabel')]];
}

function ankiAudioLabel(filename: string, language: InterfaceLanguage): string {
    const audio = uiText(language, 'audio');
    return filename ? `${audio} ${filename}` : audio;
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
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
};
