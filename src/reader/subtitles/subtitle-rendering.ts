import {
    cueHasExactWordTimings,
    escapeWithBreaks,
    karaokeCharacterProgress,
    renderKaraokeTextParts,
    type SubtitleCue,
} from './subtitle-cues';
import { uiText } from '../app/i18n';
import { setInnerHtml } from '../dom/html';
import { remintRenderedWordPrivateTokens } from '../dom/rendered-word-private-state';
import type { InterfaceLanguage } from '../app/types';
import { syncSubtitleContentLanguage, type SubtitleContentLanguage } from './subtitle-language-context';
import { bindPrivateCommandCapability } from '../dom/private-command-capabilities';

export interface SubtitlePrimaryRenderInput {
    cue?: SubtitleCue;
    text: string;
    parsedHtml?: string;
    hasParser: boolean;
    lastRenderedText: string;
    lastRenderedHtml: string;
    karaokeMode: boolean;
    time: number;
}

export interface SubtitlePrimaryRenderResult {
    // An empty string is an intentional no-commit state. Keeping the primary
    // container stable avoids DOM/layout churn, but no cue words are painted
    // until async ruby/pitch enrichment settles.
    html: string;
    karaokeActive: boolean;
    shouldRequestParse: boolean;
    nextRenderedPrimary?: { text: string; html: string };
}

export function renderSubtitlePrimary(input: SubtitlePrimaryRenderInput): SubtitlePrimaryRenderResult {
    const parsedHasReaderWords = subtitlePrimaryHasReaderWords(input.parsedHtml);
    const karaokeEligible = subtitleKaraokeEligible(input);
    const mode = subtitlePrimaryRenderMode(input, karaokeEligible, parsedHasReaderWords);
    return {
        html: renderSubtitlePrimaryHtml(input, mode),
        karaokeActive: subtitleKaraokeIsActive(karaokeEligible, mode),
        shouldRequestParse: subtitlePrimaryNeedsParse(input),
        nextRenderedPrimary: nextRenderedPrimaryCache(input, mode),
    };
}

type SubtitlePrimaryRenderMode = 'karaoke' | 'parsed' | 'cached-parser' | 'pending-parser' | 'plain';

function subtitlePrimaryHasReaderWords(html: string | undefined): boolean {
    return html?.includes('jpdb-reader-word') === true;
}

function subtitleKaraokeEligible(input: SubtitlePrimaryRenderInput): boolean {
    if (!input.karaokeMode) return false;
    return cueHasExactWordTimings(input.cue);
}

function subtitleKaraokeIsActive(eligible: boolean, mode: SubtitlePrimaryRenderMode): boolean {
    return eligible && mode !== 'pending-parser';
}

function subtitlePrimaryNeedsParse(input: SubtitlePrimaryRenderInput): boolean {
    return input.hasParser && input.parsedHtml === undefined;
}

function subtitlePrimaryRenderMode(
    input: SubtitlePrimaryRenderInput,
    karaokeActive: boolean,
    parsedHasReaderWords: boolean,
): SubtitlePrimaryRenderMode {
    if (parsedHasReaderWords) return 'parsed';
    if (input.parsedHtml !== undefined) return 'parsed';
    if (hasReusablePrimaryParserCache(input)) return 'cached-parser';
    if (input.hasParser) return 'pending-parser';
    if (hasPlainKaraokeRender(input, karaokeActive)) return 'karaoke';
    return 'plain';
}

function hasPlainKaraokeRender(input: SubtitlePrimaryRenderInput, karaokeActive: boolean): boolean {
    return Boolean(karaokeActive && input.cue);
}

function hasReusablePrimaryParserCache(input: SubtitlePrimaryRenderInput): boolean {
    return Boolean(input.hasParser && input.lastRenderedText === input.text && input.lastRenderedHtml);
}

function renderSubtitlePrimaryHtml(input: SubtitlePrimaryRenderInput, mode: SubtitlePrimaryRenderMode): string {
    return SUBTITLE_PRIMARY_RENDERERS[mode](input);
}

const SUBTITLE_PRIMARY_RENDERERS: Record<SubtitlePrimaryRenderMode, (input: SubtitlePrimaryRenderInput) => string> = {
    parsed: input => input.parsedHtml ?? '',
    karaoke: input => renderSubtitleKaraokeCue(input.cue, input.time),
    'cached-parser': input => input.lastRenderedHtml,
    'pending-parser': () => '',
    plain: input => escapeWithBreaks(input.text),
};

function nextRenderedPrimaryCache(input: SubtitlePrimaryRenderInput, mode: SubtitlePrimaryRenderMode): SubtitlePrimaryRenderResult['nextRenderedPrimary'] {
    if (input.parsedHtml !== undefined) return { text: input.text, html: input.parsedHtml };
    return mode === 'karaoke' ? { text: input.text, html: '' } : undefined;
}

export const SUBTITLE_SECONDARY_CLASS = 'jpdb-subtitle-secondary';
export const SUBTITLE_SECONDARY_BLURRED_CLASS = 'jpdb-subtitle-secondary-blurred';
export const SUBTITLE_SECONDARY_CLEAR_CLASS = 'jpdb-subtitle-secondary-clear';
export const TOGGLE_NATIVE_BLUR_ACTION = 'toggle-native-blur';

// The line looks like plain caption text, so learners keep asking how to hide
// the translation. aria-pressed is the cheap, non-intrusive half of the answer:
// it makes the line announce as a toggle button that is currently on or off,
// instead of as an unexplained label, and it costs no new UI copy.
//
// The live caption row re-syncs this control on every render tick, and that row
// is an aria-live region, so rewriting identical attributes there is churn a
// screen reader can read as fresh news. Every write is skipped when it would
// not change anything.
export function syncSubtitleSecondaryBlurState(button: HTMLElement, nativeBlurred: boolean, language: InterfaceLanguage = 'en'): void {
    button.classList.toggle(SUBTITLE_SECONDARY_BLURRED_CLASS, nativeBlurred);
    button.classList.toggle(SUBTITLE_SECONDARY_CLEAR_CLASS, !nativeBlurred);
    setAttributeIfChanged(button, 'aria-pressed', String(nativeBlurred));
    const label = uiText(language, 'toggleNativeSubtitleBlur');
    setAttributeIfChanged(button, 'title', label);
    setAttributeIfChanged(button, 'aria-label', label);
}

function setAttributeIfChanged(element: HTMLElement, name: string, value: string): void {
    if (element.getAttribute(name) === value) return;
    element.setAttribute(name, value);
}

// The native line is a control a finger presses, so it is built once and then
// mutated, never re-emitted as markup. A browser only delivers click when the
// pressed node is still in the document at release; re-creating this button
// mid-tap silently drops the tap.
function createSubtitleSecondaryLine(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = SUBTITLE_SECONDARY_CLASS;
    button.type = 'button';
    button.dataset.action = TOGGLE_NATIVE_BLUR_ACTION;
    bindPrivateCommandCapability(button, { kind: 'subtitle-action', action: 'toggle-native-blur' });
    return button;
}

export function reconcileSubtitleSecondaryLine(options: {
    host: HTMLElement | undefined;
    text: string | undefined;
    visible: boolean;
    content: SubtitleContentLanguage;
    blurred: boolean;
    language: InterfaceLanguage;
}): void {
    if (!options.host) return;
    const existing = options.host.querySelector<HTMLElement>(`.${SUBTITLE_SECONDARY_CLASS}`);
    const text = visibleSubtitleSecondaryText(options.visible, options.text);
    if (!text) return removeSubtitleSecondaryLine(existing);
    const line = existingSubtitleSecondaryLine(existing);
    syncSubtitleContentLanguage(line, options.content);
    syncSubtitleSecondaryText(line, text);
    syncSubtitleSecondaryBlurState(line, options.blurred, options.language);
    if (!existing) options.host.append(line);
}

function visibleSubtitleSecondaryText(visible: boolean, text: string | undefined): string {
    if (!visible) return '';
    return text ?? '';
}

function removeSubtitleSecondaryLine(existing: HTMLElement | null): void {
    existing?.remove();
}

function existingSubtitleSecondaryLine(existing: HTMLElement | null): HTMLElement {
    return existing ?? createSubtitleSecondaryLine();
}

function createSubtitlePrimaryRow(primaryHtml: string, content: SubtitleContentLanguage): HTMLElement {
    const row = document.createElement('div');
    row.className = 'jpdb-subtitle-primary-row';
    const primary = document.createElement('div');
    primary.className = 'jpdb-subtitle-primary';
    syncSubtitleContentLanguage(primary, content);
    setInnerHtml(primary, remintRenderedWordPrivateTokens(primaryHtml));
    row.append(primary);
    return row;
}

export interface SubtitlePrimaryRowReconcileInput {
    host: HTMLElement | undefined;
    html: string | null;
    appliedHtml: string;
    content: SubtitleContentLanguage;
}

export interface SubtitlePrimaryRowReconcileResult {
    changed: boolean;
    appliedHtml: string;
}

// The primary and secondary subtitle rows have independent DOM lifetimes. This
// Module owns the primary row's whole reconcile transaction so controller ticks
// cannot accidentally rebuild the secondary button while it is under a finger.
export function reconcileSubtitlePrimaryRow(input: SubtitlePrimaryRowReconcileInput): SubtitlePrimaryRowReconcileResult {
    if (!input.host) return { changed: false, appliedHtml: input.appliedHtml };
    const row = input.host.querySelector<HTMLElement>('.jpdb-subtitle-primary-row');
    if (input.html === null) return clearSubtitlePrimaryRow(row);
    return reconcileVisibleSubtitlePrimaryRow({
        host: input.host,
        html: input.html,
        appliedHtml: input.appliedHtml,
        content: input.content,
    }, row);
}

function clearSubtitlePrimaryRow(row: HTMLElement | null): SubtitlePrimaryRowReconcileResult {
    if (!row) return { changed: false, appliedHtml: '' };
    row.remove();
    return { changed: true, appliedHtml: '' };
}

function reconcileVisibleSubtitlePrimaryRow(
    input: SubtitlePrimaryRowReconcileInput & { host: HTMLElement; html: string },
    row: HTMLElement | null,
): SubtitlePrimaryRowReconcileResult {
    const primary = row?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
    if (!primary) return createVisibleSubtitlePrimaryRow(input, row);
    syncSubtitleContentLanguage(primary, input.content);
    if (input.appliedHtml === input.html) return { changed: false, appliedHtml: input.appliedHtml };
    setInnerHtml(primary, remintRenderedWordPrivateTokens(input.html));
    return { changed: true, appliedHtml: input.html };
}

function createVisibleSubtitlePrimaryRow(
    input: SubtitlePrimaryRowReconcileInput & { host: HTMLElement; html: string },
    row: HTMLElement | null,
): SubtitlePrimaryRowReconcileResult {
    row?.remove();
    input.host.prepend(createSubtitlePrimaryRow(input.html, input.content));
    return { changed: true, appliedHtml: input.html };
}

// Caption text carries newlines, so the children are markup rather than a
// textContent write. Replacing the button's children leaves the button itself
// under the finger, which is the node hit testing resolves the tap against.
function syncSubtitleSecondaryText(button: HTMLElement, text: string): void {
    if (button.dataset.subtitleSecondaryText === text) return;
    button.dataset.subtitleSecondaryText = text;
    setInnerHtml(button, escapeWithBreaks(text));
}

function renderSubtitleKaraokeCue(cue: SubtitleCue | undefined, time: number): string {
    if (!cue?.text.trim()) return '';
    if (!cueHasExactWordTimings(cue)) return escapeWithBreaks(cue.text);
    const words = cue.words;
    if (!words.length) return '';
    const progress = karaokeCharacterProgress(cue, words, time);
    return renderKaraokeTextParts(cue.text, progress);
}
