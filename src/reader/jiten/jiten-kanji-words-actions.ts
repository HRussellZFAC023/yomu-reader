import { escapeHtml, setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { targetCanLookupCharacter, usesJapaneseProviders } from '../languages/character-lookup';
import {
    jitenKanjiWordsPageSize,
    renderJitenKanjiWordsMoreButton,
    renderJitenKanjiWordsPage,
} from './jiten-kanji-info-render';
import type { JitenKanjiWordsPage } from '../dictionaries/jiten';
import {
    bindPrivateCommandCapability,
    readJitenKanjiWordsCommandCapability,
    type JitenKanjiWordsCommandCapability,
} from '../dom/private-command-capabilities';

// Shared behavior for the Jiten kanji "words using this kanji" grid (reading
// filter pills + load-more paging), used by the popover, the new tab, and the
// hosted runtime so the three surfaces stay identical.
export interface JitenKanjiWordsActionContext {
    lookupKanjiWords(character: string, options: { reading?: string; page: number; pageSize: number }): Promise<JitenKanjiWordsPage | null>;
    language(): InterfaceLanguage;
    afterRender?(): void;
    onError?(details: Record<string, unknown>, error: unknown): void;
}

interface JitenFilterRequest {
    command: JitenKanjiWordsCommandCapability;
    surface: { source: HTMLElement; grid: HTMLElement };
}

interface JitenMoreRequest {
    command: JitenKanjiWordsCommandCapability;
    page: number;
    pageSize: number;
}

export function runJitenKanjiWordsAction(
    button: HTMLButtonElement,
    action: JitenKanjiWordsCommandCapability['action'],
    context: JitenKanjiWordsActionContext | null,
): Promise<void> {
    if (!context) return Promise.resolve();
    return action === 'more'
        ? loadMoreJitenKanjiWords(button, context)
        : filterJitenKanjiWords(button, context);
}

export async function filterJitenKanjiWords(button: HTMLButtonElement, context: JitenKanjiWordsActionContext): Promise<void> {
    const request = jitenFilterRequest(button);
    if (!request) return;
    markSelectedJitenReading(request.surface.source, button);
    await runJitenWordsAction(
        button,
        () => performJitenFilter(request, context),
        error => notifyJitenWordsError(context, {
            character: request.command.character,
            reading: request.command.reading,
        }, error),
    );
}

export async function loadMoreJitenKanjiWords(button: HTMLButtonElement, context: JitenKanjiWordsActionContext): Promise<void> {
    const request = jitenMoreRequest(button);
    if (!request) return;
    await runJitenWordsAction(
        button,
        () => performJitenLoadMore(button, request, context),
        error => notifyJitenWordsError(context, {
            character: request.command.character,
            page: request.page,
        }, error),
    );
}

async function runJitenWordsAction(button: HTMLButtonElement, action: () => Promise<void>, onError: (error: unknown) => void): Promise<void> {
    button.disabled = true;
    try {
        await action();
    } catch (error) {
        onError(error);
    } finally {
        button.disabled = false;
    }
}

async function performJitenFilter(request: JitenFilterRequest, context: JitenKanjiWordsActionContext): Promise<void> {
    const { command, surface } = request;
    const wordsPage = await context.lookupKanjiWords(command.character, {
        reading: command.reading,
        page: 1,
        pageSize: jitenKanjiWordsPageSize(),
    });
    if (!jitenFilterResultIsCurrent(command.character, surface)) return;
    renderFilteredJitenWords(surface.grid, command, wordsPage, context.language());
    notifyJitenWordsRendered(context);
}

async function performJitenLoadMore(button: HTMLButtonElement, request: JitenMoreRequest, context: JitenKanjiWordsActionContext): Promise<void> {
    const { command, page, pageSize } = request;
    const wordsPage = await context.lookupKanjiWords(command.character, {
        reading: optionalJitenReading(command.reading),
        page,
        pageSize,
    });
    if (!jitenMoreResultIsCurrent(button, command.character)) return;
    appendJitenKanjiWords(button, command, wordsPage, page, context);
}

function optionalJitenReading(reading: string): string | undefined {
    return reading || undefined;
}

function jitenMoreResultIsCurrent(button: HTMLButtonElement, character: string): boolean {
    return activeJitenCharacter(character) && button.isConnected;
}

function notifyJitenWordsRendered(context: JitenKanjiWordsActionContext): void {
    context.afterRender?.();
}

function notifyJitenWordsError(context: JitenKanjiWordsActionContext, details: Record<string, unknown>, error: unknown): void {
    // Keep the previous list visible if a Jiten page request misses.
    context.onError?.(details, error);
}

function jitenFilterRequest(button: HTMLButtonElement): JitenFilterRequest | null {
    const command = enabledJitenWordsCommand(button);
    if (!isJitenFilterCommand(command)) return null;
    if (!activeJitenCharacter(command.character)) return null;
    const surface = jitenFilterSurface(button);
    return surface ? { command, surface } : null;
}

function jitenMoreRequest(button: HTMLButtonElement): JitenMoreRequest | null {
    const command = enabledJitenWordsCommand(button);
    if (!isJitenMoreCommand(command)) return null;
    if (!activeJitenCharacter(command.character)) return null;
    return {
        command,
        page: requestedJitenPage(command),
        pageSize: requestedJitenPageSize(command),
    };
}

function enabledJitenWordsCommand(button: HTMLButtonElement): JitenKanjiWordsCommandCapability | undefined {
    return button.disabled ? undefined : readJitenKanjiWordsCommandCapability(button);
}

function isJitenFilterCommand(command: JitenKanjiWordsCommandCapability | undefined): command is JitenKanjiWordsCommandCapability {
    return command?.action === 'filter' && Boolean(command.reading);
}

function isJitenMoreCommand(command: JitenKanjiWordsCommandCapability | undefined): command is JitenKanjiWordsCommandCapability {
    return command?.action === 'more';
}

function requestedJitenPage(command: JitenKanjiWordsCommandCapability): number {
    return Math.max(2, command.page ?? 2);
}

function requestedJitenPageSize(command: JitenKanjiWordsCommandCapability): number {
    return Math.max(1, command.pageSize ?? jitenKanjiWordsPageSize());
}

function activeJitenCharacter(character: string): boolean {
    return usesJapaneseProviders() && targetCanLookupCharacter(character);
}

function jitenFilterSurface(button: HTMLButtonElement): { source: HTMLElement; grid: HTMLElement } | null {
    const source = button.closest<HTMLElement>('.jpdb-reader-jiten-kanji');
    const grid = source?.querySelector<HTMLElement>('.jpdb-reader-jiten-kanji-vocabulary');
    return source && grid ? { source, grid } : null;
}

function jitenFilterSurfaceConnected(surface: { source: HTMLElement; grid: HTMLElement }): boolean {
    return surface.source.isConnected && surface.grid.isConnected;
}

function jitenFilterResultIsCurrent(character: string, surface: { source: HTMLElement; grid: HTMLElement }): boolean {
    return activeJitenCharacter(character) && jitenFilterSurfaceConnected(surface);
}

function markSelectedJitenReading(source: HTMLElement, selected: HTMLButtonElement): void {
    source.querySelectorAll<HTMLButtonElement>('[data-action="jiten-kanji-reading"]')
        .forEach(candidate => candidate.setAttribute('aria-pressed', candidate === selected ? 'true' : 'false'));
}

function renderFilteredJitenWords(grid: HTMLElement, command: JitenKanjiWordsCommandCapability, page: JitenKanjiWordsPage | null, language: InterfaceLanguage): void {
    const wordsHtml = renderJitenKanjiWordsPage(page, command.reading);
    const { rendered, total } = jitenPageProgress(page);
    const moreHtml = renderJitenKanjiWordsMoreButton(command.character, command.reading, rendered, total, 2, language);
    setInnerHtml(grid, renderJitenWordsResult(wordsHtml, moreHtml, language));
}

function jitenPageProgress(page: JitenKanjiWordsPage | null): { rendered: number; total: number } {
    const rendered = page?.items.length ?? 0;
    return { rendered, total: page?.total ?? rendered };
}

function renderJitenWordsResult(wordsHtml: string, moreHtml: string, language: InterfaceLanguage): string {
    if (wordsHtml || moreHtml) return `${wordsHtml}${moreHtml}`;
    return `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'noSimilarWords'))}</div>`;
}

function appendJitenKanjiWords(button: HTMLButtonElement, command: JitenKanjiWordsCommandCapability, page: JitenKanjiWordsPage | null, requestedPage: number, context: JitenKanjiWordsActionContext): void {
    const html = renderJitenKanjiWordsPage(page, command.reading);
    const grid = appendJitenWordsPage(button, html);
    if (!grid) {
        button.remove();
        return;
    }
    removeDuplicateJitenKanjiWords(grid);
    const total = jitenPageTotal(page, command.total);
    const rendered = grid.querySelectorAll('[data-jiten-kanji-word-key]').length;
    updateJitenContinuation(button, command, page, requestedPage, total, rendered);
    notifyJitenWordsRendered(context);
}

function appendJitenWordsPage(button: HTMLButtonElement, html: string): HTMLElement | null {
    const grid = button.closest<HTMLElement>('.jpdb-reader-jiten-kanji-vocabulary');
    if (!html || !grid) return null;
    const template = document.createElement('template');
    setInnerHtml(template, html);
    button.before(template.content);
    return grid;
}

function updateJitenContinuation(button: HTMLButtonElement, command: JitenKanjiWordsCommandCapability, page: JitenKanjiWordsPage | null, requestedPage: number, total: number, rendered: number): void {
    if (jitenPageIsExhausted(page, total, rendered)) {
        button.remove();
        return;
    }
    updateJitenMoreButton(button, command, requestedPage, total, rendered);
}

function jitenPageTotal(page: JitenKanjiWordsPage | null, commandTotal: number | undefined): number {
    return page?.total || commandTotal || 0;
}

function jitenPageIsExhausted(page: JitenKanjiWordsPage | null, total: number, rendered: number): boolean {
    return !page?.items.length || (total > 0 && rendered >= total);
}

function updateJitenMoreButton(button: HTMLButtonElement, command: JitenKanjiWordsCommandCapability, requestedPage: number, total: number, rendered: number): void {
    button.dataset.jitenKanjiPage = String(requestedPage + 1);
    button.dataset.jitenKanjiTotal = String(total);
    bindPrivateCommandCapability(button, { ...command, page: requestedPage + 1, total });
    const status = button.querySelector<HTMLElement>('.jpdb-reader-source-status');
    if (status) status.textContent = String(Math.max(0, total - rendered));
    button.disabled = false;
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
