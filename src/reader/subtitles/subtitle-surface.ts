import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { clampNumber } from '../core/number-utils';
import { FONT_FAMILY_PRESETS } from '../settings/font-presets';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { subtitleText } from './i18n';

const SUBTITLE_MIN_VISIBLE_VIDEO_RATIO = 0.45;
const SUBTITLE_MIN_VISIBLE_VIDEO_WIDTH = 120;
const SUBTITLE_MIN_VISIBLE_VIDEO_HEIGHT = 80;
const TRANSCRIPT_PLACEMENTS = ['left', 'bottom', 'right'] as const satisfies readonly ReaderSettings['subtitleTranscriptPlacement'][];
const SUBTITLE_STYLE_FONT_PRESETS = FONT_FAMILY_PRESETS;

export const SUBTITLE_STYLE_FONT_FAMILY_VALUES: readonly string[] = SUBTITLE_STYLE_FONT_PRESETS.map(preset => preset.value);

export interface SubtitleElementLayout {
    left: number;
    top: number;
    width: number;
    height: number;
}

export type SubtitlePanelMode = 'lines' | 'shadow' | 'tracks' | 'mine';

export function renderPanelModeControls(mode: SubtitlePanelMode, canShowLines: boolean, language: InterfaceLanguage): string {
    return `
        <div class="jpdb-subtitle-panel-mode" role="group" aria-label="${escapeHtml(uiText(language, 'subtitlePanelMode'))}">
            <button type="button" data-action="panel-lines" aria-pressed="${mode === 'lines'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(uiText(language, 'subtitleLines'))}</button>
            <button type="button" data-action="panel-shadow" aria-pressed="${mode === 'shadow'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(uiText(language, 'shadow'))}</button>
            <button type="button" data-action="panel-mine" aria-pressed="${mode === 'mine'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(subtitleText(language, 'bmTab'))}</button>
            <button type="button" data-action="panel-tracks" aria-pressed="${mode === 'tracks'}">${escapeHtml(uiText(language, 'subtitleTracks'))}</button>
        </div>
    `;
}

export interface PanelOptionsControlsState {
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    pausePanelEnabled: boolean;
    menuOpen: boolean;
    language: InterfaceLanguage;
}

// One drawer-head button owning placement and pause auto-open — as
// separate head buttons these wrapped into a second ragged row on phones.
// The close (X) lives OUTSIDE this popover as its own head button so it is a
// one-click action like every other side panel (see renderPanelCloseButton).
export function renderPanelOptionsControls(state: PanelOptionsControlsState): string {
    const language = state.language;
    const label = uiText(language, 'subtitlePanelOptions');
    // Constant visible label; aria-pressed carries the on/off state and the
    // title spells out what the next press does.
    const autoLabel = uiText(language, 'enableSubtitleAutoHide');
    const autoTitle = uiText(language, state.pausePanelEnabled ? 'disableSubtitleAutoHide' : 'enableSubtitleAutoHide');
    const placementLabel = uiText(language, 'subtitleTranscriptPlacement');
    return `
        <div class="jpdb-subtitle-panel-options" data-panel-options>
            <button class="jpdb-subtitle-panel-options-toggle" type="button" data-action="panel-options" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-haspopup="true" aria-expanded="${state.menuOpen}">${subtitleIcon(transcriptPlacementIcon(state.placement))}</button>
            <div class="jpdb-subtitle-panel-options-menu" role="group" aria-label="${escapeHtml(label)}" ${state.menuOpen ? '' : 'hidden'}>
                <div class="jpdb-subtitle-panel-options-placement" role="group" aria-label="${escapeHtml(placementLabel)}">
                    ${TRANSCRIPT_PLACEMENTS.map(placement => renderPanelOptionsPlacementItem(placement, state.placement, placementLabel, language)).join('')}
                </div>
                <button class="jpdb-subtitle-panel-options-item jpdb-subtitle-panel-options-auto" type="button" data-action="toggle-pause-panel" title="${escapeHtml(autoTitle)}" aria-pressed="${state.pausePanelEnabled}">
                    ${subtitleIcon('auto-hide')}
                    <span>${escapeHtml(autoLabel)}</span>
                </button>
            </div>
        </div>
    `;
}

// Standalone drawer-head close: a plain X that dismisses the panel in one click,
// matching how the reader's other side panels close. Rendered as the last head
// action so it sits at the trailing edge of the drawer bar.
export function renderPanelCloseButton(language: InterfaceLanguage): string {
    const closeLabel = uiText(language, 'closeSubtitlePanel');
    return `<button class="jpdb-subtitle-panel-close" type="button" data-action="close-panel" title="${escapeHtml(closeLabel)}" aria-label="${escapeHtml(closeLabel)}">${subtitleIcon('close')}</button>`;
}

function renderPanelOptionsPlacementItem(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    currentPlacement: ReaderSettings['subtitleTranscriptPlacement'],
    groupLabel: string,
    language: InterfaceLanguage,
): string {
    const placementLabel = uiText(language, placement);
    const label = `${groupLabel}: ${placementLabel}`;
    return `
        <button class="jpdb-subtitle-panel-options-item" type="button" data-action="transcript-placement" data-placement="${placement}" title="${escapeHtml(label)}" aria-pressed="${placement === currentPlacement}">
            ${subtitleIcon(transcriptPlacementIcon(placement))}
            <span>${escapeHtml(placementLabel)}</span>
        </button>
    `;
}

export function renderSubtitleStyleControls(settings: ReaderSettings, language: InterfaceLanguage): string {
    const label = uiText(language, 'subtitleStyle');
    return `
        <button class="jpdb-subtitle-style-toggle" type="button" data-action="style" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-haspopup="true" aria-expanded="false" aria-controls="jpdb-subtitle-style-popover">${subtitleIcon('style')}</button>
        <div class="jpdb-subtitle-style-popover" id="jpdb-subtitle-style-popover" data-subtitle-style-popover role="group" aria-label="${escapeHtml(label)}" hidden>
            ${renderSubtitleStyleRange('subtitleFontSize', uiText(language, 'subtitleFontSize'), settings.subtitleFontSize, 16, 64, 2, 'px')}
            ${renderSubtitleStyleRange('subtitleFontWeight', uiText(language, 'subtitleFontWeight'), settings.subtitleFontWeight, 300, 900, 20, 'weight')}
            ${renderSubtitleStyleRange('subtitleBottomOffset', uiText(language, 'subtitleBottomOffset'), settings.subtitleBottomOffset, 2, 40, 1, '%')}
            ${renderSubtitleStyleRange('subtitleBackgroundOpacity', uiText(language, 'subtitleBackgroundOpacity'), settings.subtitleBackgroundOpacity, 0, 0.7, 0.05, '')}
            <label class="jpdb-subtitle-style-field jpdb-subtitle-style-select">
                <span>${escapeHtml(uiText(language, 'subtitleFontFamily'))}</span>
                <select data-subtitle-style-setting="subtitleFontFamily">
                    ${SUBTITLE_STYLE_FONT_PRESETS.map(preset => renderSubtitleStyleFontOption(preset, settings.subtitleFontFamily, language)).join('')}
                </select>
            </label>
            <label class="jpdb-subtitle-style-toggle-field">
                <input type="checkbox" data-subtitle-style-setting="subtitleMiningPause" ${settings.subtitleMiningPause ? 'checked' : ''}>
                <span>${escapeHtml(uiText(language, 'subtitleMiningPause'))}</span>
            </label>
            <label class="jpdb-subtitle-style-toggle-field">
                <input type="checkbox" data-subtitle-style-setting="subtitleHoverPause" ${settings.subtitleHoverPause ? 'checked' : ''}>
                <span>${escapeHtml(uiText(language, 'subtitleHoverPause'))}</span>
            </label>
            <button class="jpdb-subtitle-style-reset" type="button" data-action="style-reset">${escapeHtml(uiText(language, 'subtitleResetDefaults'))}</button>
        </div>
    `;
}

function renderSubtitleStyleRange(
    setting: 'subtitleFontSize' | 'subtitleFontWeight' | 'subtitleBottomOffset' | 'subtitleBackgroundOpacity',
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    suffix: string,
): string {
    return `
        <label class="jpdb-subtitle-style-field">
            <span>${escapeHtml(label)}</span>
            <output data-subtitle-style-output="${setting}">${escapeHtml(subtitleStyleDisplayValue(value, suffix))}</output>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-subtitle-style-setting="${setting}">
        </label>
    `;
}

function renderSubtitleStyleFontOption(
    preset: typeof SUBTITLE_STYLE_FONT_PRESETS[number],
    current: string,
    language: InterfaceLanguage,
): string {
    return `<option value="${escapeHtml(preset.value)}" ${preset.value === current ? 'selected' : ''}>${escapeHtml(uiText(language, preset.labelKey))}</option>`;
}

function subtitleStyleDisplayValue(value: number, suffix: string): string {
    if (suffix === 'weight') return String(Math.round(value));
    if (!suffix) return `${Math.round(value * 100)}%`;
    return `${Math.round(value)}${suffix}`;
}

export function subtitleOverlayLayout(rect: DOMRect): SubtitleElementLayout {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const minWidth = Math.min(260, viewportWidth);
    const minHeight = Math.min(160, viewportHeight);
    const overflowX = rect.left < 0 || rect.right > viewportWidth;
    const overflowY = rect.top < 0 || rect.bottom > viewportHeight;
    const left = overlayAxisStart(rect.left, rect.right, viewportWidth, minWidth, overflowX);
    const top = overlayAxisStart(rect.top, rect.bottom, viewportHeight, minHeight, overflowY);
    return {
        left,
        top,
        width: overlayAxisSize(rect.left, rect.right, viewportWidth, minWidth, overflowX, left),
        height: overlayAxisSize(rect.top, rect.bottom, viewportHeight, minHeight, overflowY, top),
    };
}

export function applyElementLayout(element: HTMLElement, layout: SubtitleElementLayout): void {
    setStylePropertyIfChanged(element, 'left', `${Math.round(layout.left)}px`);
    setStylePropertyIfChanged(element, 'top', `${Math.round(layout.top)}px`);
    setStylePropertyIfChanged(element, 'right', 'auto');
    setStylePropertyIfChanged(element, 'bottom', 'auto');
    setStylePropertyIfChanged(element, 'width', `${Math.round(layout.width)}px`);
    setStylePropertyIfChanged(element, 'height', `${Math.round(layout.height)}px`);
}

export function setStylePropertyIfChanged(element: HTMLElement, property: string, value: string): void {
    if (element.style.getPropertyValue(property) === value) return;
    element.style.setProperty(property, value);
}

export type SubtitleIconName = 'auto-hide' | 'check' | 'close' | 'copy' | 'eye' | 'eye-off' | 'fullscreen' | 'fullscreen-exit' | 'locate' | 'menu' | 'mic' | 'panel-bottom' | 'panel-left' | 'panel-right' | 'pause' | 'play' | 'repeat' | 'stop' | 'style' | 'tracks' | 'transcript';

export function transcriptPlacementIcon(placement: ReaderSettings['subtitleTranscriptPlacement']): SubtitleIconName {
    if (placement === 'left') return 'panel-left';
    if (placement === 'bottom') return 'panel-bottom';
    return 'panel-right';
}

export function subtitleIcon(name: SubtitleIconName): string {
    const paths: Record<SubtitleIconName, string> = {
        'auto-hide': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/><path d="M8 9v6"/><path d="M11 9v6"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
        copy: '<path d="M14 3H6a2 2 0 0 0-2 2v12"/><path d="M10 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M14 11v6"/><path d="M11 14h6"/>',
        eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8"/><path d="M6.6 6.8A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
        fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/>',
        'fullscreen-exit': '<path d="M9 3v4a2 2 0 0 1-2 2H3"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/><path d="M15 21v-4a2 2 0 0 1 2-2h4"/><path d="M9 21v-4a2 2 0 0 0-2-2H3"/>',
        locate: '<path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
        menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
        mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8 21h8"/>',
        'panel-bottom': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
        'panel-left': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
        'panel-right': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
        pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
        play: '<path d="M8 5v14l11-7-11-7Z"/>',
        repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
        stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
        style: '<path d="M4 7h5"/><path d="M15 7h5"/><circle cx="12" cy="7" r="2"/><path d="M4 17h9"/><path d="M19 17h1"/><circle cx="16" cy="17" r="2"/>',
        tracks: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/>',
        transcript: '<path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    };
    return `<svg class="jpdb-subtitle-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

export function compareSubtitleVideoCandidates(a: HTMLVideoElement, b: HTMLVideoElement): number {
    return videoElementVisibleArea(b) - videoElementVisibleArea(a)
        || videoElementArea(b) - videoElementArea(a);
}

// A hidden video keeps a positive rect when hidden via visibility/opacity
// (unlike display:none), so the rect check alone leaves the overlay rail
// floating over unrelated content.
export function isSubtitleVideoElementRenderable(video: HTMLVideoElement): boolean {
    if (video.hidden) return false;
    const style = getComputedStyle(video);
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0.01;
}

export function isSubtitleOverlayVideoVisible(rect: DOMRect): boolean {
    const visible = rectViewportIntersection(rect);
    if (visible.width < SUBTITLE_MIN_VISIBLE_VIDEO_WIDTH || visible.height < SUBTITLE_MIN_VISIBLE_VIDEO_HEIGHT) return false;
    const area = rectArea(rect);
    return area > 0 && rectArea(visible) / area >= SUBTITLE_MIN_VISIBLE_VIDEO_RATIO;
}

function overlayAxisStart(start: number, end: number, viewportSize: number, minSize: number, overflow: boolean): number {
    if (!overflow) return start;
    const visibleStart = clampNumber(start, 0, Math.max(0, viewportSize - 1));
    const visibleEnd = clampNumber(end, visibleStart, viewportSize);
    const size = Math.max(minSize, visibleEnd - visibleStart || viewportSize);
    return clampNumber(visibleStart, 0, Math.max(0, viewportSize - size));
}

function overlayAxisSize(start: number, end: number, viewportSize: number, minSize: number, overflow: boolean, clampedStart: number): number {
    if (!overflow) return Math.max(minSize, end - start);
    const visibleEnd = clampNumber(end, clampedStart, viewportSize);
    return Math.max(minSize, visibleEnd - clampedStart);
}

function videoElementArea(video: HTMLVideoElement): number {
    const rect = video.getBoundingClientRect();
    return rect.width * rect.height;
}

function videoElementVisibleArea(video: HTMLVideoElement): number {
    return rectViewportIntersectionArea(video.getBoundingClientRect());
}

function rectViewportIntersectionArea(rect: DOMRect): number {
    return rectArea(rectViewportIntersection(rect));
}

function rectViewportIntersection(rect: DOMRect): DOMRect {
    const left = clampNumber(rect.left, 0, window.innerWidth);
    const top = clampNumber(rect.top, 0, window.innerHeight);
    const right = clampNumber(rect.right, left, window.innerWidth);
    const bottom = clampNumber(rect.bottom, top, window.innerHeight);
    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function rectArea(rect: DOMRect): number {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
}
