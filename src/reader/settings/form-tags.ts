import { escapeHtml, setInnerHtml } from '../dom';
import { uiText } from '../i18n';
import { uniqueStrings } from '../core/string-utils';
import type { InterfaceLanguage } from '../types';

export function renderAnkiTagsEditor(value: string, language: InterfaceLanguage): string {
    const tags = ankiTagList(value);
    return `
        <div class="jpdb-reader-tag-editor" data-anki-tags-editor>
            <input type="hidden" name="ankiTags" value="${escapeHtml(tags.join(' '))}">
            <label class="jpdb-reader-settings-label-text" for="jpdb-reader-anki-tag-input">${escapeHtml(uiText(language, 'ankiTags'))}</label>
            <div class="jpdb-reader-tag-chip-list" data-anki-tag-chips>${renderAnkiTagChipHtml(tags, language)}</div>
            <div class="jpdb-reader-tag-add-row">
                <input id="jpdb-reader-anki-tag-input" type="text" data-anki-tag-input autocomplete="off" placeholder="${escapeHtml(language === 'ja' ? 'タグを追加' : 'Add tag')}">
                <button class="jpdb-reader-btn secondary" type="button" data-action="anki-tag-add">${escapeHtml(language === 'ja' ? '追加' : 'Add')}</button>
            </div>
        </div>
    `;
}

export function updateAnkiTagsEditor(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined): void {
    const editor = control?.closest<HTMLElement>('[data-anki-tags-editor]') ?? form.querySelector<HTMLElement>('[data-anki-tags-editor]');
    const hidden = editor?.querySelector<HTMLInputElement>('input[name="ankiTags"]');
    if (!editor || !hidden) return;
    const language = formInterfaceLanguage(form);
    const tags = ankiTagList(hidden.value);
    if (action === 'anki-tag-add') {
        const input = editor.querySelector<HTMLInputElement>('[data-anki-tag-input]');
        ankiTagList(input?.value ?? '').forEach(tag => {
            if (!tags.includes(tag)) tags.push(tag);
        });
        if (input) input.value = '';
    } else {
        const tag = control?.dataset.tag?.trim();
        if (tag) {
            const index = tags.indexOf(tag);
            if (index >= 0) tags.splice(index, 1);
        }
    }
    hidden.value = tags.join(' ');
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    renderAnkiTagChips(editor, tags, language);
}

function ankiTagList(value: string): string[] {
    return uniqueStrings(value.split(/[\s,]+/u).map(tag => tag.trim()).filter(Boolean));
}

function renderAnkiTagChipHtml(tags: string[], language: InterfaceLanguage): string {
    return tags.map(tag => `
        <button class="jpdb-reader-tag-chip" type="button" data-action="anki-tag-remove" data-tag="${escapeHtml(tag)}" aria-label="${escapeHtml(tagRemoveLabel(tag, language))}">
            <span>${escapeHtml(tag)}</span>
            <span aria-hidden="true">×</span>
        </button>
    `).join('');
}

function renderAnkiTagChips(editor: HTMLElement, tags: string[], language: InterfaceLanguage): void {
    const list = editor.querySelector<HTMLElement>('[data-anki-tag-chips]');
    if (!list) return;
    setInnerHtml(list, renderAnkiTagChipHtml(tags, language));
}

function tagRemoveLabel(tag: string, language: InterfaceLanguage): string {
    return language === 'ja' ? `タグを削除: ${tag}` : `${uiText(language, 'remove')}: ${tag}`;
}

function formInterfaceLanguage(form: HTMLFormElement): InterfaceLanguage {
    const control = form.elements.namedItem('interfaceLanguage');
    const value = control instanceof HTMLSelectElement ? control.value : form.lang;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : 'en';
}
