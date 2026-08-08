import {
    cueHasExactWordTimings,
    escapeWithBreaks,
    karaokeCharacterProgress,
    renderKaraokeTextParts,
    type SubtitleCue,
} from './subtitle-cues';
import { uiText } from '../app/i18n';
import { setInnerHtml } from '../dom/html';
import type { InterfaceLanguage } from '../app/types';
import { syncSubtitleContentLanguage, type SubtitleContentLanguage } from './subtitle-language-context';

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
    html: string;
    karaokeActive: boolean;
    shouldRequestParse: boolean;
    nextRenderedPrimary?: { text: string; html: string };
}

export function renderSubtitlePrimary(input: SubtitlePrimaryRenderInput): SubtitlePrimaryRenderResult {
    const activeCue = input.cue;
    const parsedHasReaderWords = input.parsedHtml?.includes('jpdb-reader-word') ?? false;
    const karaokeActive = input.karaokeMode && cueHasExactWordTimings(activeCue);
    const mode = subtitlePrimaryRenderMode(input, karaokeActive, parsedHasReaderWords);
    return {
        html: renderSubtitlePrimaryHtml(input, mode),
        karaokeActive,
        shouldRequestParse: input.hasParser && !input.parsedHtml,
        nextRenderedPrimary: nextRenderedPrimaryCache(input, karaokeActive),
    };
}

type SubtitlePrimaryRenderMode = 'karaoke' | 'parsed' | 'cached-parser' | 'loading-parser' | 'plain';

function subtitlePrimaryRenderMode(
    input: SubtitlePrimaryRenderInput,
    karaokeActive: boolean,
    parsedHasReaderWords: boolean,
): SubtitlePrimaryRenderMode {
    if (parsedHasReaderWords) return 'parsed';
    if (hasPlainKaraokeRender(input, karaokeActive)) return 'karaoke';
    if (input.parsedHtml) return 'parsed';
    if (hasReusablePrimaryParserCache(input)) return 'cached-parser';
    return parserFallbackRenderMode(input.hasParser);
}

function hasPlainKaraokeRender(input: SubtitlePrimaryRenderInput, karaokeActive: boolean): boolean {
    return Boolean(karaokeActive && input.cue);
}

function parserFallbackRenderMode(hasParser: boolean): SubtitlePrimaryRenderMode {
    return hasParser ? 'loading-parser' : 'plain';
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
    'loading-parser': input => `<span class="jpdb-subtitle-primary-loading">${escapeWithBreaks(input.text)}</span>`,
    plain: input => escapeWithBreaks(input.text),
};

function nextRenderedPrimaryCache(input: SubtitlePrimaryRenderInput, karaokeActive: boolean): SubtitlePrimaryRenderResult['nextRenderedPrimary'] {
    if (input.parsedHtml) return { text: input.text, html: input.parsedHtml };
    return karaokeActive ? { text: input.text, html: '' } : undefined;
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
export function createSubtitleSecondaryLine(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = SUBTITLE_SECONDARY_CLASS;
    button.type = 'button';
    button.dataset.action = TOGGLE_NATIVE_BLUR_ACTION;
    return button;
}

export function createSubtitlePrimaryRow(primaryHtml: string, content: SubtitleContentLanguage): HTMLElement {
    const row = document.createElement('div');
    row.className = 'jpdb-subtitle-primary-row';
    const primary = document.createElement('div');
    primary.className = 'jpdb-subtitle-primary';
    syncSubtitleContentLanguage(primary, content);
    setInnerHtml(primary, primaryHtml);
    row.append(primary);
    return row;
}

// Caption text carries newlines, so the children are markup rather than a
// textContent write. Replacing the button's children leaves the button itself
// under the finger, which is the node hit testing resolves the tap against.
export function syncSubtitleSecondaryText(button: HTMLElement, text: string): void {
    if (button.dataset.subtitleSecondaryText === text) return;
    button.dataset.subtitleSecondaryText = text;
    setInnerHtml(button, escapeWithBreaks(text));
}

export function renderSubtitleKaraokeCue(cue: SubtitleCue | undefined, time: number): string {
    if (!cue?.text.trim()) return '';
    if (!cueHasExactWordTimings(cue)) return escapeWithBreaks(cue.text);
    const words = cue.words;
    if (!words.length) return '';
    const progress = karaokeCharacterProgress(cue, words, time);
    return renderKaraokeTextParts(cue.text, progress);
}
