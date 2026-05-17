import type { AnkiExistingNote, AnkiLookupResult, AnkiRenderedCard } from './anki';
import { escapeHtml } from './dom';
import { contextLabel, type StoredMiningContext } from './mining-context';
import type { ReaderSettings } from './types';
import { uiText } from './i18n';

export function renderAnkiActionRow(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (ankiLookup.primary) return '';
    return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(settings.interfaceLanguage, 'addToAnki')}</button></div>`;
}

export function renderAnkiExistingSection(ankiLookup: AnkiLookupResult, storedContext: StoredMiningContext | null): string {
    const note = ankiLookup.primary;
    if (!note) return '';
    const preview = ankiExistingPreview(note, storedContext);
    return `
        <details class="jpdb-reader-anki-existing">
            <summary>
                <span><span class="jpdb-reader-state-dot jpdb-${note.state}"></span>Anki</span>
                <small>${escapeHtml(preview.decks)}</small>
            </summary>
            <div class="jpdb-reader-anki-card-preview">
                ${preview.renderedCard}
                ${preview.fields}
                ${preview.context}
                ${renderAnkiNoteActions(note)}
            </div>
        </details>
    `;
}

function ankiExistingPreview(note: AnkiExistingNote, storedContext: StoredMiningContext | null): { decks: string; renderedCard: string; fields: string; context: string } {
    return {
        decks: note.deckNames.length ? note.deckNames.join(', ') : 'Anki',
        renderedCard: renderAnkiRenderedCard(note),
        fields: renderAnkiFields(note),
        context: storedContext ? renderLastMiningContext(storedContext) : '',
    };
}

function renderAnkiRenderedCard(note: AnkiExistingNote): string {
    const card = primaryRenderedCard(note);
    if (!card) return '';
    const question = renderAnkiRenderedSide('Front', card.question);
    const answer = renderAnkiRenderedSide('Back', card.answer);
    if (!question && !answer) return '';
    return `<div class="jpdb-reader-anki-rendered-card">${question}${answer}</div>`;
}

function primaryRenderedCard(note: AnkiExistingNote): AnkiRenderedCard | null {
    const cards = note.renderedCards ?? [];
    if (!cards.length) return null;
    return cards.find(card => card.cardId === note.primaryCardId) ?? cards[0] ?? null;
}

function renderAnkiRenderedSide(label: string, value: string): string {
    const html = sanitizeAnkiCardHtml(value);
    if (!html) return '';
    return `<section class="jpdb-reader-anki-rendered-side">
        <strong>${label}</strong>
        <div class="jpdb-reader-anki-rendered-side-body">${html}</div>
    </section>`;
}

function renderAnkiFields(note: AnkiExistingNote): string {
    const fields = Object.entries(note.fields)
        .map(([name, value]) => ({ name, value: value.trim() }))
        .filter(field => field.value)
        .slice(0, 14);
    if (!fields.length) return '';
    return `<div class="jpdb-reader-anki-fields">
        ${fields.map(field => previewField(field.name, field.value)).join('')}
    </div>`;
}

function previewField(label: string, value: string): string {
    return `<div class="jpdb-reader-anki-field"><strong>${escapeHtml(label)}</strong><span>${renderFieldText(value)}</span></div>`;
}

function renderFieldText(value: string): string {
    return escapeHtml(value).replace(/\[sound:([^\]]+)]/gi, (_, filename: string) =>
        `<span class="jpdb-reader-anki-sound">Audio ${escapeHtml(filename)}</span>`,
    );
}

function renderAnkiNoteActions(note: AnkiExistingNote): string {
    return `<div class="jpdb-reader-anki-note-actions">
        ${renderAnkiAudioMergeSelect(note)}
        <div class="jpdb-reader-anki-note-action-row">
            <button class="jpdb-reader-btn anki compact" data-action="anki-merge" data-note-id="${note.noteId}" title="Update matching fields and add Yomu media to this note">Merge Yomu</button>
            <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${note.noteId}">Edit in Anki</button>
        </div>
    </div>`;
}

function renderAnkiAudioMergeSelect(note: AnkiExistingNote): string {
    if (!noteHasAudio(note)) return '';
    return `<label class="jpdb-reader-anki-audio-merge">
        <span>Audio</span>
        <select data-anki-audio-merge>
            <option value="both">Keep both</option>
            <option value="theirs">Keep Anki</option>
            <option value="ours">Use Yomu</option>
        </select>
    </label>`;
}

function noteHasAudio(note: AnkiExistingNote): boolean {
    return Object.entries(note.fields).some(([name, value]) =>
        /audio|sound|voice|pronunciation/i.test(name) || /\[sound:[^\]]+]/i.test(value),
    );
}

function sanitizeAnkiCardHtml(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (typeof document === 'undefined') return escapeHtml(trimmed);
    const template = document.createElement('template');
    template.innerHTML = trimmed;
    sanitizeAnkiCardFragment(template.content);
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

function renderLastMiningContext(context: StoredMiningContext): string {
    return `<div class="jpdb-reader-anki-context"><strong>Last seen</strong><span>${escapeHtml(contextLabel(context))}</span><small>${escapeHtml(context.sentence)}</small></div>`;
}

export function renderReviewButtons(
    settings: ReaderSettings,
    ankiNote: AnkiExistingNote | null = null,
    options: { disabled?: boolean; title?: string } = {},
): string {
    const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
    const disabledAttrs = reviewButtonDisabledAttrs(options);
    const grades = reviewButtonGrades(settings);
    return `
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}">
            ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${disabledAttrs}>${label}</button>`).join('')}
        </div>
    `;
}

function reviewButtonDisabledAttrs(options: { disabled?: boolean; title?: string }): string {
    if (options.disabled) return ` disabled title="${escapeHtml(options.title || 'Unavailable')}"`;
    return options.title ? ` title="${escapeHtml(options.title)}"` : '';
}

function reviewButtonGrades(settings: ReaderSettings): Array<[string, string]> {
    return settings.twoButtonReviews
        ? [['fail', 'Fail'], ['pass', 'Pass']]
        : [['nothing', 'Nothing'], ['something', 'Something'], ['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy']];
}
