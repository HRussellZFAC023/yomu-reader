import { escapeHtml, setInnerHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { clampNumber } from '../core/number-utils';
import { FONT_FAMILY_PRESETS } from '../settings/font-presets';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { subtitleText } from './i18n';
import { nativeSubtitleDisplayMode } from './native-subtitle-display';
import {
    privateCommandAttributes,
    type SubtitleCommandAction,
    type SubtitleCommandCapability,
    type SubtitleStyleSetting,
} from '../dom/private-command-capabilities';

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

export interface SubtitlePlayerSurfaceElements {
    root: HTMLElement;
    subtitleLines: HTMLElement;
    transcriptPanel: HTMLElement;
    stylePopover?: HTMLElement;
}

export type SubtitlePanelMode = 'lines' | 'shadow' | 'tracks' | 'mine';

export function createSubtitlePlayerSurface(settings: ReaderSettings): SubtitlePlayerSurfaceElements {
    const root = document.createElement('div');
    root.className = 'jpdb-subtitle-player';
    root.dataset.jpdbReaderRoot = 'true';
    setInnerHtml(root, renderSubtitlePlayerSurface(settings));
    return {
        root,
        subtitleLines: requiredSubtitleSurfaceElement(root, '.jpdb-subtitle-lines'),
        transcriptPanel: requiredSubtitleSurfaceElement(root, '.jpdb-subtitle-list'),
        stylePopover: root.querySelector<HTMLElement>('[data-subtitle-style-popover]') ?? undefined,
    };
}

function requiredSubtitleSurfaceElement(root: HTMLElement, selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing subtitle surface element: ${selector}`);
    return element;
}

function renderSubtitlePlayerSurface(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const previousLabel = uiText(language, 'previousSubtitle');
    const nextLabel = uiText(language, 'nextSubtitle');
    const visibilityLabel = uiText(language, 'subtitleOverlayVisible');
    const panelLabel = uiText(language, 'openSubtitlePanel');
    const moveLabel = uiText(language, 'moveSubtitles');
    const moveAccessibleLabel = uiText(language, 'moveSubtitlesAccessible');
    const moveControlsLabel = uiText(language, 'moveSubtitleControls');
    return `
        <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines" aria-live="polite"></div><button class="jpdb-subtitle-drag-handle" type="button" data-subtitle-drag-handle data-jpdb-reader-surface-ignore title="${escapeHtml(moveLabel)}" aria-label="${escapeHtml(moveAccessibleLabel)}" aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home 0"><span aria-hidden="true"></span></button></div>
        <div class="jpdb-subtitle-status" aria-live="polite" data-jpdb-reader-surface-ignore></div>
        <div class="jpdb-subtitle-rail" data-jpdb-reader-surface-ignore>
            <button class="jpdb-subtitle-rail-move" type="button" data-action="rail-expand"${subtitleActionAttributes('rail-expand')} data-subtitle-rail-drag-handle title="${escapeHtml(moveControlsLabel)}" aria-label="${escapeHtml(moveControlsLabel)}" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home 0">${subtitleIcon('grip')}</button>
            <button type="button" data-action="previous"${subtitleActionAttributes('previous')} title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
            <button type="button" data-action="next"${subtitleActionAttributes('next')} title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
            ${renderSubtitleOcrTrigger(settings)}
            <button class="jpdb-subtitle-visibility-toggle" type="button" data-action="visibility"${subtitleActionAttributes('visibility')} title="${escapeHtml(visibilityLabel)}" aria-label="${escapeHtml(visibilityLabel)}">${subtitleIcon(subtitleVisibilityIcon(settings))}</button>
            <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel"${subtitleActionAttributes('panel')} title="${escapeHtml(panelLabel)}" aria-label="${escapeHtml(panelLabel)}">${subtitleIcon('panel-right')}</button>
            ${renderSubtitleStyleControls(settings, language)}
        </div>
        <div class="jpdb-subtitle-list" hidden></div>
    `;
}

function renderSubtitleOcrTrigger(settings: ReaderSettings): string {
    if (!settings.ocrEnabled || settings.ocrProvider === 'off') return '';
    const label = uiText(settings.interfaceLanguage, settings.ocrVideoPauseFrames ? 'readVideoFrameStop' : 'readVideoFrame');
    return `<button class="jpdb-subtitle-ocr-trigger${subtitleOcrActiveClass(settings)}" type="button" data-action="ocr"${subtitleActionAttributes('ocr')} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${settings.ocrVideoPauseFrames}">${subtitleIcon('scan')}</button>`;
}

function subtitleOcrActiveClass(settings: ReaderSettings): string {
    return settings.ocrVideoPauseFrames ? ' jpdb-subtitle-ocr-active' : '';
}

function subtitleVisibilityIcon(settings: ReaderSettings): SubtitleIconName {
    return settings.subtitleOverlayVisible ? 'eye' : 'eye-off';
}

export function subtitleActionAttributes(
    action: SubtitleCommandAction,
    details: Omit<SubtitleCommandCapability, 'kind' | 'action'> = {},
): string {
    return privateCommandAttributes({ kind: 'subtitle-action', action, ...details });
}

function subtitleStyleControlAttributes(setting: SubtitleStyleSetting): string {
    return privateCommandAttributes({ kind: 'subtitle-style-control', setting });
}

function renderPanelModeControls(mode: SubtitlePanelMode, canShowLines: boolean, language: InterfaceLanguage): string {
    return `
        <div class="jpdb-subtitle-panel-mode" role="group" aria-label="${escapeHtml(uiText(language, 'subtitlePanelMode'))}">
            <button type="button" data-action="panel-lines"${subtitleActionAttributes('panel-lines')} aria-pressed="${mode === 'lines'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(uiText(language, 'subtitleLines'))}</button>
            <button type="button" data-action="panel-shadow"${subtitleActionAttributes('panel-shadow')} aria-pressed="${mode === 'shadow'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(uiText(language, 'shadow'))}</button>
            <button type="button" data-action="panel-mine"${subtitleActionAttributes('panel-mine')} aria-pressed="${mode === 'mine'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(subtitleText(language, 'bmTab'))}</button>
            <button type="button" data-action="panel-tracks"${subtitleActionAttributes('panel-tracks')} aria-pressed="${mode === 'tracks'}">${escapeHtml(uiText(language, 'subtitleTracks'))}</button>
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
function renderPanelOptionsControls(state: PanelOptionsControlsState): string {
    const language = state.language;
    const label = uiText(language, 'subtitlePanelOptions');
    // Constant visible label; aria-pressed carries the on/off state and the
    // title spells out what the next press does.
    const autoLabel = uiText(language, 'enableSubtitleAutoHide');
    const autoTitle = uiText(language, state.pausePanelEnabled ? 'disableSubtitleAutoHide' : 'enableSubtitleAutoHide');
    const placementLabel = uiText(language, 'subtitleTranscriptPlacement');
    return `
        <div class="jpdb-subtitle-panel-options" data-panel-options>
            <button class="jpdb-subtitle-panel-options-toggle" type="button" data-action="panel-options"${subtitleActionAttributes('panel-options')} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-haspopup="true" aria-expanded="${state.menuOpen}">${subtitleIcon(transcriptPlacementIcon(state.placement))}</button>
            <div class="jpdb-subtitle-panel-options-menu" role="group" aria-label="${escapeHtml(label)}" ${state.menuOpen ? '' : 'hidden'}>
                <div class="jpdb-subtitle-panel-options-placement" role="group" aria-label="${escapeHtml(placementLabel)}">
                    ${TRANSCRIPT_PLACEMENTS.map(placement => renderPanelOptionsPlacementItem(placement, state.placement, placementLabel, language)).join('')}
                </div>
                <button class="jpdb-subtitle-panel-options-item jpdb-subtitle-panel-options-auto" type="button" data-action="toggle-pause-panel"${subtitleActionAttributes('toggle-pause-panel')} title="${escapeHtml(autoTitle)}" aria-pressed="${state.pausePanelEnabled}">
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
function renderPanelCloseButton(language: InterfaceLanguage): string {
    const closeLabel = uiText(language, 'closeSubtitlePanel');
    return `<button class="jpdb-subtitle-panel-close" type="button" data-action="close-panel"${subtitleActionAttributes('close-panel')} title="${escapeHtml(closeLabel)}" aria-label="${escapeHtml(closeLabel)}">${subtitleIcon('close')}</button>`;
}

export interface DrawerHeadState {
    mode: SubtitlePanelMode;
    title: string;
    meta: string;
    metaTitle?: string;
    canShowLines: boolean;
    options: PanelOptionsControlsState;
    // Mode-specific extra buttons rendered after the tabs (e.g. the lines
    // panel's jump-to-current locate button).
    extraActions?: string;
    // The tracks panel opens before any video/transcript exists, where the
    // mode tabs are meaningless — it hides them instead of disabling them.
    showModeTabs?: boolean;
}

// Two-row drawer head shared by every panel mode. The title row keeps only the
// options popover and the close X so the title/track label gets the full head
// width (the ‹ › ▶ cluster there used to truncate the track name); the
// transport lives at the trailing edge of the actions row beside the mode tabs
// — this drawer is the single home for subtitle-by-subtitle transport, the
// on-video rail no longer duplicates it.
export function renderDrawerHead(state: DrawerHeadState): string {
    const language = state.options.language;
    return `
        <div class="jpdb-subtitle-drawer-head">
            <div class="jpdb-subtitle-drawer-top">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">${escapeHtml(state.title)}</strong>
                    <span class="jpdb-subtitle-drawer-meta" title="${escapeHtml(state.metaTitle ?? state.meta)}">${escapeHtml(state.meta)}</span>
                </div>
                <div class="jpdb-subtitle-drawer-top-actions">
                    ${renderPanelOptionsControls(state.options)}
                    ${renderPanelCloseButton(language)}
                </div>
            </div>
            <div class="jpdb-subtitle-drawer-actions">
                ${state.showModeTabs === false ? '' : renderPanelModeControls(state.mode, state.canShowLines, language)}
                ${state.extraActions ?? ''}
                ${renderDrawerPlayback(language)}
            </div>
        </div>
    `;
}

function renderDrawerPlayback(language: InterfaceLanguage): string {
    const previousLabel = uiText(language, 'previousSubtitle');
    const nextLabel = uiText(language, 'nextSubtitle');
    return `
        <div class="jpdb-subtitle-drawer-playback">
            <button type="button" data-action="previous"${subtitleActionAttributes('previous')} title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
            <button type="button" data-action="next"${subtitleActionAttributes('next')} title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
        </div>
    `;
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
        <button class="jpdb-subtitle-panel-options-item" type="button" data-action="transcript-placement" data-placement="${placement}"${subtitleActionAttributes('transcript-placement', { placement })} title="${escapeHtml(label)}" aria-pressed="${placement === currentPlacement}">
            ${subtitleIcon(transcriptPlacementIcon(placement))}
            <span>${escapeHtml(placementLabel)}</span>
        </button>
    `;
}

function renderSubtitleStyleControls(settings: ReaderSettings, language: InterfaceLanguage): string {
    const label = uiText(language, 'subtitleStyle');
    const nativeDisplay = nativeSubtitleDisplayMode(settings);
    return `
        <button class="jpdb-subtitle-style-toggle" type="button" data-action="style"${subtitleActionAttributes('style')} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-haspopup="true" aria-expanded="false" aria-controls="jpdb-subtitle-style-popover">${subtitleIcon('style')}</button>
        <div class="jpdb-subtitle-style-popover" id="jpdb-subtitle-style-popover" data-subtitle-style-popover role="group" aria-label="${escapeHtml(label)}" hidden>
            <label class="jpdb-subtitle-style-field jpdb-subtitle-style-select">
                <span>${escapeHtml(uiText(language, 'subtitleNativeDisplay'))}</span>
                <select data-subtitle-style-setting="subtitleNativeDisplay"${subtitleStyleControlAttributes('subtitleNativeDisplay')}>
                    ${renderNativeSubtitleDisplayOptions(nativeDisplay, language)}
                </select>
            </label>
            ${renderSubtitleStyleRange('subtitleNativeBlurStrength', uiText(language, 'subtitleNativeBlurStrength'), settings.subtitleNativeBlurStrength, 4, 20, 1, 'px', nativeDisplay !== 'blurred')}
            ${renderSubtitleStyleRange('subtitleFontSize', uiText(language, 'subtitleFontSize'), settings.subtitleFontSize, 16, 64, 2, 'px')}
            ${renderSubtitleStyleRange('subtitleFontWeight', uiText(language, 'subtitleFontWeight'), settings.subtitleFontWeight, 300, 900, 20, 'weight')}
            ${renderSubtitleStyleRange('subtitleBackgroundOpacity', uiText(language, 'subtitleBackgroundOpacity'), settings.subtitleBackgroundOpacity, 0, 0.7, 0.05, '')}
            <label class="jpdb-subtitle-style-field jpdb-subtitle-style-select">
                <span>${escapeHtml(uiText(language, 'subtitleFontFamily'))}</span>
                <select data-subtitle-style-setting="subtitleFontFamily"${subtitleStyleControlAttributes('subtitleFontFamily')}>
                    ${SUBTITLE_STYLE_FONT_PRESETS.map(preset => renderSubtitleStyleFontOption(preset, settings.subtitleFontFamily, language)).join('')}
                </select>
            </label>
            <label class="jpdb-subtitle-style-toggle-field">
                <input type="checkbox" data-subtitle-style-setting="subtitleMiningPause"${subtitleStyleControlAttributes('subtitleMiningPause')} ${checkedAttribute(settings.subtitleMiningPause)}>
                <span>${escapeHtml(uiText(language, 'subtitleMiningPause'))}</span>
            </label>
            <label class="jpdb-subtitle-style-toggle-field">
                <input type="checkbox" data-subtitle-style-setting="subtitleHoverPause"${subtitleStyleControlAttributes('subtitleHoverPause')} ${checkedAttribute(settings.subtitleHoverPause)}>
                <span>${escapeHtml(uiText(language, 'subtitleHoverPause'))}</span>
            </label>
            <button class="jpdb-subtitle-style-reset" type="button" data-action="style-reset"${subtitleActionAttributes('style-reset')}>${escapeHtml(uiText(language, 'subtitleResetDefaults'))}</button>
        </div>
    `;
}

function renderNativeSubtitleDisplayOptions(
    current: ReturnType<typeof nativeSubtitleDisplayMode>,
    language: InterfaceLanguage,
): string {
    const options = [
        { value: 'blurred', label: 'subtitleNativeDisplayBlurred' },
        { value: 'shown', label: 'subtitleNativeDisplayShown' },
        { value: 'hidden', label: 'subtitleNativeDisplayHidden' },
    ] as const;
    return options.map(option => {
        const authority = privateCommandAttributes({ kind: 'subtitle-style-option', setting: 'subtitleNativeDisplay', value: option.value });
        return `<option value="${option.value}"${authority} ${selectedAttribute(option.value === current)}>${escapeHtml(uiText(language, option.label))}</option>`;
    }).join('');
}

function selectedAttribute(selected: boolean): string {
    return selected ? 'selected' : '';
}

function checkedAttribute(checked: boolean): string {
    return checked ? 'checked' : '';
}

function renderSubtitleStyleRange(
    setting: 'subtitleNativeBlurStrength' | 'subtitleFontSize' | 'subtitleFontWeight' | 'subtitleBackgroundOpacity',
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    suffix: string,
    hidden = false,
): string {
    return `
        <label class="jpdb-subtitle-style-field" data-subtitle-style-field="${setting}" ${hidden ? 'hidden' : ''}>
            <span>${escapeHtml(label)}</span>
            <output data-subtitle-style-output="${setting}">${escapeHtml(subtitleStyleDisplayValue(value, suffix))}</output>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-subtitle-style-setting="${setting}"${subtitleStyleControlAttributes(setting)}>
        </label>
    `;
}

function renderSubtitleStyleFontOption(
    preset: typeof SUBTITLE_STYLE_FONT_PRESETS[number],
    current: string,
    language: InterfaceLanguage,
): string {
    return `<option value="${escapeHtml(preset.value)}"${privateCommandAttributes({ kind: 'subtitle-style-option', setting: 'subtitleFontFamily', value: preset.value })} ${preset.value === current ? 'selected' : ''}>${escapeHtml(uiText(language, preset.labelKey))}</option>`;
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

export type SubtitleIconName = 'auto-hide' | 'check' | 'close' | 'copy' | 'eye' | 'eye-off' | 'grip' | 'locate' | 'menu' | 'mic' | 'panel-bottom' | 'panel-left' | 'panel-right' | 'pause' | 'pin' | 'play' | 'repeat' | 'scan' | 'stop' | 'style' | 'tracks' | 'transcript';

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
        grip: '<circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
        locate: '<path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
        menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
        mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8 21h8"/>',
        'panel-bottom': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
        'panel-left': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
        'panel-right': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
        pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
        pin: '<path d="m8 3 8 8"/><path d="m14 5 5 5-4 2-3 3-2 4-5-5 4-2 3-3 2-4Z"/><path d="m5 19 4-4"/>',
        play: '<path d="M8 5v14l11-7-11-7Z"/>',
        repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
        scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M7 12h10"/>',
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

export function rectArea(rect: DOMRect): number {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
}
