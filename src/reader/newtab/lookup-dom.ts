import type { AnkiLookupResult } from '../anki/index';
import { escapeHtml, HAS_JAPANESE } from '../dom/index';
import { cardStateLabel } from '../app/i18n';
import { updateKanjiMiningControlsMount } from '../kanji/mining-controls';
import { hasJpdbApiCredential } from '../settings/api-credential';
import type { NewTabLookupReviewTarget, NewTabLookupReviewTargetSelection } from './controller';
import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';

interface NewTabLookupMetaItemsOptions {
    card: JPDBCard;
    ankiLookup: AnkiLookupResult;
    jpdbState: string;
    isJpdbBacked: boolean;
    settings: ReaderSettings;
}

interface LookupPopoverDictionaryLinkRequest {
    link: HTMLAnchorElement;
    text: string;
    reading: string;
}

interface LookupTextButtonRequest {
    expression: string;
    reading: string;
}

interface InstallLookupOutsideDismissOptions {
    popover: HTMLElement;
    anchor: HTMLElement | undefined;
    signal: AbortSignal;
    isActive: () => boolean;
    dismiss: () => void;
}

export function newTabLookupReviewTargetSelection(button: HTMLButtonElement): NewTabLookupReviewTargetSelection | undefined {
    const target = button.dataset.newtabReviewTarget || button.dataset.reviewTarget || '';
    if (target === 'jpdb') return { kind: 'jpdb' };
    if (target === 'jiten') return { kind: 'jiten' };
    if (target === 'bunpro') return { kind: 'bunpro' };
    if (target === 'yomu-local') return { kind: 'yomu-local' };
    if (target !== 'anki') return undefined;
    const ankiCardId = Number(button.dataset.ankiCardId);
    return Number.isFinite(ankiCardId) && ankiCardId > 0
        ? { kind: 'anki', ankiCardId }
        : { kind: 'anki' };
}

export function newTabLookupMetaItems(options: NewTabLookupMetaItemsOptions): HTMLElement[] {
    const items: HTMLElement[] = [];
    if (options.card.frequencyRank) items.push(newLookupMetaLabel(`#${options.card.frequencyRank}`));
    const jpdbLabel = newTabLookupJpdbStatusLabel(options.isJpdbBacked, options.settings, options.jpdbState);
    if (jpdbLabel) items.push(newLookupMetaLabel(jpdbLabel, `jpdb-${options.jpdbState}`));
    const ankiLabel = newTabLookupAnkiStatusLabel(options.ankiLookup, options.settings);
    if (ankiLabel) items.push(newLookupMetaLabel(ankiLabel, `anki-${options.ankiLookup.state}`));
    return items;
}

export function renderNewTabLookupReviewButtons(
    grades: Array<[JPDBGrade, string]>,
    targets: NewTabLookupReviewTarget[],
): string {
    if (!grades.length) return '';
    if (targets.length > 1) return renderLookupReviewTargetControls(targets, grades);
    if (targets.length) return renderLookupReviewTargetButtons(targets[0]!, grades);
    return '';
}

export function updateKanjiLookupMiningControls(
    popover: HTMLElement,
    controls: string,
    setMiningControlsExpanded: (button: HTMLButtonElement, expanded: boolean) => void,
): void {
    updateKanjiMiningControlsMount(popover, controls, setMiningControlsExpanded);
}

export function lookupTextRequestFromPopoverButton(button: HTMLButtonElement): LookupTextButtonRequest {
    const expression = button.dataset.expression ?? button.dataset.lookup ?? button.dataset.term ?? '';
    const reading = button.dataset.reading ?? expression;
    return { expression, reading };
}

export function installLookupOutsideDismiss(options: InstallLookupOutsideDismissOptions): void {
    window.setTimeout(() => {
        if (options.signal.aborted || !options.isActive() || !options.popover.isConnected) return;
        const dismissIfOutside = (event: Event): void => {
            const target = event.target instanceof Node ? event.target : null;
            if (!target || !options.popover.isConnected || !options.isActive()) return;
            if (options.popover.contains(target)) return;
            if (options.anchor?.isConnected && options.anchor.contains(target)) return;
            options.dismiss();
        };
        document.addEventListener('pointerdown', dismissIfOutside, { capture: true, signal: options.signal });
        document.addEventListener('click', dismissIfOutside, { capture: true, signal: options.signal });
    }, 0);
}

export function lookupPopoverDictionaryLinkRequest(event: MouseEvent, popover: HTMLElement): LookupPopoverDictionaryLinkRequest | undefined {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]');
    if (!link || !popover.contains(link)) return undefined;
    const query = link.dataset.dictionaryLookup?.trim() ?? '';
    if (!HAS_JAPANESE.test(query)) return undefined;
    consumeLookupPopoverButtonEvent(event);
    return {
        link,
        text: link.dataset.dictionaryLookup ?? '',
        reading: link.dataset.dictionaryReading || query,
    };
}

export function lookupPopoverActionButton(event: Event, popover: HTMLElement): HTMLButtonElement | null {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    return button && popover.contains(button) ? button : null;
}

export function consumeLookupPopoverButtonEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
}

export function lookupPopoverParsedWordElement(event: MouseEvent, popover: HTMLElement): HTMLElement | null {
    const target = event.target as HTMLElement | null;
    if (isKanjiLookupActionTarget(target)) return null;
    const word = target?.closest<HTMLElement>('.jpdb-reader-word');
    return word && popover.contains(word) && word.dataset.jpdbReaderPassive !== 'true' ? word : null;
}

export function parsedWordLookupSentence(word: HTMLElement, expression: string, card: Pick<JPDBCard, 'spelling'> | undefined): string {
    return word.dataset.sentence || expression || card?.spelling || '';
}

function newLookupMetaLabel(label: string, stateClass = ''): HTMLElement {
    const item = document.createElement('span');
    if (stateClass) {
        const dot = document.createElement('span');
        dot.className = `jpdb-reader-state-dot ${stateClass}`;
        item.append(dot);
    }
    item.append(document.createTextNode(label));
    return item;
}

function newTabLookupJpdbStatusLabel(isJpdbBacked: boolean, settings: ReaderSettings, jpdbState: string): string {
    if (!isJpdbBacked) return '';
    if (!hasJpdbApiCredential(settings)) return '';
    return `JPDB ${lookupStateLabel(jpdbState, settings.interfaceLanguage)}`;
}

function newTabLookupAnkiStatusLabel(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (ankiLookup.trusted === false && !ankiLookup.primary) return '';
    return `Anki ${lookupStateLabel(ankiLookup.state, settings.interfaceLanguage)}`;
}

function lookupStateLabel(state: string, language: ReaderSettings['interfaceLanguage']): string {
    return cardStateLabel(state, language);
}

function renderLookupReviewTargetButtons(target: NewTabLookupReviewTarget, grades: Array<[JPDBGrade, string]>): string {
    const targetLabel = target.label;
    const label = targetLabel
        ? `<div class="jpdb-reader-sr-only jpdb-reader-newtab-sr-only" data-newtab-grade-target data-review-target-label><span data-newtab-grade-target-text>${escapeHtml(targetLabel)}</span></div>`
        : '';
    const targetAttrs = ` data-newtab-review-target="${target.kind}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}`;
    return `
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}" data-newtab-review-target-row="${escapeHtml(target.id)}" data-review-target-row="${escapeHtml(target.id)}">
            ${label}
            ${grades.map(([grade, buttonLabel]) => {
                const title = targetLabel ? ` title="${escapeHtml(targetLabel)}" aria-label="${escapeHtml(`${buttonLabel}: ${targetLabel}`)}"` : '';
                return `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${targetAttrs}${title}>${escapeHtml(buttonLabel)}</button>`;
            }).join('')}
        </div>
    `;
}

function renderLookupReviewTargetControls(targets: NewTabLookupReviewTarget[], grades: Array<[JPDBGrade, string]>): string {
    const selected = targets[0];
    if (!selected) return '';
    return `
        ${renderLookupReviewTargetGutter(selected)}
        ${renderLookupReviewTargetSelector(targets)}
        ${renderLookupReviewTargetButtons(selected, grades)}
    `;
}

function renderLookupReviewTargetGutter(target: NewTabLookupReviewTarget): string {
    return `<div class="jpdb-reader-actions-gutter jpdb-reader-review-target-gutter" data-review-target-gutter>
        <span class="jpdb-reader-review-target-current" data-review-target-current title="${escapeHtml(target.label)}" aria-label="${escapeHtml(target.label)}">${escapeHtml(target.shortLabel)}</span>
        <button class="jpdb-reader-review-target-toggle" type="button" data-action="review-target-toggle" title="Switch review target" aria-label="Switch review target">⇄</button>
        <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="${escapeHtml(target.label)}" aria-label="${escapeHtml(target.label)}"></button>
    </div>`;
}

function renderLookupReviewTargetSelector(targets: NewTabLookupReviewTarget[]): string {
    return `<div class="jpdb-reader-mining-panel jpdb-reader-review-target-panel" data-review-target-selector>
        <select class="jpdb-reader-newtab-grade-target-select" data-review-target-select aria-label="Review target">
            ${targets.map((target, index) => `<option value="${escapeHtml(target.id)}"${index === 0 ? ' selected' : ''} data-review-target="${target.kind}" data-review-target-label="${escapeHtml(target.label)}" data-review-target-short-label="${escapeHtml(target.shortLabel)}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}>${escapeHtml(target.shortLabel)}</option>`).join('')}
        </select>
    </div>`;
}

function isKanjiLookupActionTarget(target: HTMLElement | null): boolean {
    return Boolean(target?.closest('[data-action="kanji"][data-kanji]'));
}
