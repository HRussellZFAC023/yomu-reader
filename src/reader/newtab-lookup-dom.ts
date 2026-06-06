import type { AnkiLookupResult } from './anki';
import { escapeHtml, HAS_JAPANESE, htmlToFirstElement, setInnerHtml } from './dom';
import { uiText, type UiCopyKey } from './i18n';
import type { NewTabLookupReviewTarget, NewTabLookupReviewTargetSelection } from './new-tab-controller';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';

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
    if (button.dataset.newtabReviewTarget === 'jpdb') return { kind: 'jpdb' };
    if (button.dataset.newtabReviewTarget !== 'anki') return undefined;
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
    fallbackLabel: string,
): string {
    if (!grades.length) return '';
    if (targets.length) return targets.map(target => renderLookupReviewTargetButtons(target, grades)).join('');
    return renderLookupReviewTargetButtons({ id: 'current', kind: 'jpdb', label: fallbackLabel, shortLabel: 'JPDB' }, grades);
}

export function updateKanjiLookupMiningControls(
    popover: HTMLElement,
    controls: string,
    setMiningControlsExpanded: (button: HTMLButtonElement, expanded: boolean) => void,
): void {
    const actions = popover.querySelector<HTMLElement>('[data-kanji-actions]');
    const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
    if (!actions || !miningMount) return;
    const hasControls = Boolean(controls);
    const hasReview = actions.dataset.kanjiHasReview === 'true';
    actions.hidden = !hasControls && !hasReview;
    actions.classList.toggle('jpdb-reader-actions-has-mining', hasControls);
    actions.classList.toggle('jpdb-reader-actions-mining-collapsed', hasControls);
    const gutter = actions.querySelector<HTMLElement>('.jpdb-reader-actions-gutter');
    if (gutter) gutter.hidden = !hasControls;
    const collapseButton = actions.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');
    if (collapseButton && hasControls) setMiningControlsExpanded(collapseButton, false);
    miningMount.hidden = !hasControls;
    setInnerHtml(miningMount, controls);
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
    return word && popover.contains(word) ? word : null;
}

export function parsedWordLookupSentence(word: HTMLElement, expression: string, card: Pick<JPDBCard, 'spelling'> | undefined): string {
    return word.dataset.sentence || expression || card?.spelling || '';
}

export function replaceOptionalElement(parent: Element, selector: string, html: string, before: Element | null = null): void {
    const existing = parent.querySelector<HTMLElement>(selector);
    const next = htmlToFirstElement(html);
    if (existing && next) {
        existing.replaceWith(next);
        return;
    }
    if (existing) {
        existing.remove();
        return;
    }
    if (next) parent.insertBefore(next, before);
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
    if (!settings.apiKey.trim()) return '';
    return `JPDB ${lookupStateLabel(jpdbState, settings.interfaceLanguage)}`;
}

function newTabLookupAnkiStatusLabel(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!settings.ankiEnabled && !settings.ankiSectionEnabled) return '';
    if (ankiLookup.trusted === false && !ankiLookup.primary) return '';
    return `Anki ${lookupStateLabel(ankiLookup.state, settings.interfaceLanguage)}`;
}

function lookupStateLabel(state: string, language: ReaderSettings['interfaceLanguage']): string {
    const key = LOOKUP_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : state;
}

function renderLookupReviewTargetButtons(target: NewTabLookupReviewTarget, grades: Array<[JPDBGrade, string]>): string {
    const targetLabel = target.label;
    const chip = target.shortLabel
        ? `<span class="jpdb-reader-newtab-grade-target-chip" data-newtab-grade-target-chip="${escapeHtml(target.kind)}">${escapeHtml(target.shortLabel)}</span>`
        : '';
    const label = targetLabel
        ? `<div class="jpdb-reader-newtab-grade-target" data-newtab-grade-target>${chip}<span data-newtab-grade-target-text>${escapeHtml(targetLabel)}</span></div>`
        : '';
    const targetAttrs = ` data-newtab-review-target="${target.kind}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}`;
    return `
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}" data-newtab-review-target-row="${escapeHtml(target.id)}">
            ${label}
            ${grades.map(([grade, buttonLabel]) => {
                const title = targetLabel ? ` title="${escapeHtml(targetLabel)}" aria-label="${escapeHtml(`${buttonLabel}: ${targetLabel}`)}"` : '';
                return `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${targetAttrs}${title}>${escapeHtml(buttonLabel)}</button>`;
            }).join('')}
        </div>
    `;
}

function isKanjiLookupActionTarget(target: HTMLElement | null): boolean {
    return Boolean(target?.closest('[data-action="kanji"][data-kanji]'));
}

const LOOKUP_STATE_LABEL_KEYS: Record<string, UiCopyKey> = {
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
