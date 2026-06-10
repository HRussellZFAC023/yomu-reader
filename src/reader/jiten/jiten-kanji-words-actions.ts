import { escapeHtml, setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import {
    jitenKanjiWordsPageSize,
    renderJitenKanjiWordsMoreButton,
    renderJitenKanjiWordsPage,
} from './jiten-kanji-info-render';
import type { JitenKanjiWordsPage } from '../dictionaries/jiten';

// Shared behavior for the Jiten kanji "words using this kanji" grid (reading
// filter pills + load-more paging), used by the popover, the new tab, and the
// hosted runtime so the three surfaces stay identical.
export interface JitenKanjiWordsActionContext {
    lookupKanjiWords(character: string, options: { reading?: string; page: number; pageSize: number }): Promise<JitenKanjiWordsPage | null>;
    language(): InterfaceLanguage;
    afterRender?(): void;
    onError?(details: Record<string, unknown>, error: unknown): void;
}

export async function filterJitenKanjiWords(button: HTMLButtonElement, context: JitenKanjiWordsActionContext): Promise<void> {
    if (button.disabled) return;
    const character = button.dataset.jitenKanjiCharacter?.trim() ?? '';
    const reading = button.dataset.jitenKanjiReading?.trim() ?? '';
    const source = button.closest<HTMLElement>('.jpdb-reader-jiten-kanji');
    const grid = source?.querySelector<HTMLElement>('.jpdb-reader-jiten-kanji-vocabulary');
    if (!character || !reading || !source || !grid) return;
    source.querySelectorAll<HTMLButtonElement>('[data-action="jiten-kanji-reading"]').forEach(candidate => {
        candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false');
    });
    button.disabled = true;
    try {
        const wordsPage = await context.lookupKanjiWords(character, { reading, page: 1, pageSize: jitenKanjiWordsPageSize() });
        if (!source.isConnected || !grid.isConnected) return;
        const wordsHtml = renderJitenKanjiWordsPage(wordsPage, reading);
        const rendered = wordsPage?.items.length ?? 0;
        const total = wordsPage?.total ?? rendered;
        const moreHtml = renderJitenKanjiWordsMoreButton(character, reading, rendered, total, 2, context.language());
        setInnerHtml(grid, wordsHtml || moreHtml
            ? `${wordsHtml}${moreHtml}`
            : `<div class="jpdb-reader-help">${escapeHtml(uiText(context.language(), 'noSimilarWords'))}</div>`);
        context.afterRender?.();
    } catch (error) {
        // Keep the previous list visible if the filtered Jiten page misses.
        context.onError?.({ character, reading }, error);
    } finally {
        if (button.isConnected) button.disabled = false;
    }
}

export async function loadMoreJitenKanjiWords(button: HTMLButtonElement, context: JitenKanjiWordsActionContext): Promise<void> {
    if (button.disabled) return;
    const character = button.dataset.jitenKanjiCharacter?.trim() ?? '';
    if (!character) return;
    const page = Math.max(2, Number(button.dataset.jitenKanjiPage) || 2);
    const pageSize = Math.max(1, Number(button.dataset.jitenKanjiPageSize) || jitenKanjiWordsPageSize());
    button.disabled = true;
    try {
        const wordsPage = await context.lookupKanjiWords(character, {
            reading: button.dataset.jitenKanjiReading || undefined,
            page,
            pageSize,
        });
        if (!button.isConnected) return;
        appendJitenKanjiWords(button, wordsPage, page, context);
    } catch (error) {
        context.onError?.({ character, page }, error);
        if (button.isConnected) button.disabled = false;
    }
}

function appendJitenKanjiWords(button: HTMLButtonElement, page: JitenKanjiWordsPage | null, requestedPage: number, context: JitenKanjiWordsActionContext): void {
    const html = renderJitenKanjiWordsPage(page, button.dataset.jitenKanjiReading || '');
    const grid = button.closest<HTMLElement>('.jpdb-reader-jiten-kanji-vocabulary');
    if (!html || !grid) {
        button.remove();
        return;
    }
    button.insertAdjacentHTML('beforebegin', html);
    removeDuplicateJitenKanjiWords(grid);
    const total = page?.total || Number(button.dataset.jitenKanjiTotal) || 0;
    const rendered = grid.querySelectorAll('[data-jiten-kanji-word-key]').length;
    if (!page?.items.length || (total > 0 && rendered >= total)) {
        button.remove();
    } else {
        button.dataset.jitenKanjiPage = String(requestedPage + 1);
        button.dataset.jitenKanjiTotal = String(total);
        const status = button.querySelector<HTMLElement>('.jpdb-reader-source-status');
        if (status) status.textContent = String(Math.max(0, total - rendered));
        button.disabled = false;
    }
    context.afterRender?.();
}

function removeDuplicateJitenKanjiWords(grid: HTMLElement): void {
    const seen = new Set<string>();
    grid.querySelectorAll<HTMLElement>('[data-jiten-kanji-word-key]').forEach(word => {
        const key = word.dataset.jitenKanjiWordKey ?? '';
        if (!key || !seen.has(key)) {
            if (key) seen.add(key);
            return;
        }
        word.remove();
    });
}
