import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { clampNumber } from '../core/number-utils';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';

const SUBTITLE_MIN_VISIBLE_VIDEO_RATIO = 0.2;
const SUBTITLE_MIN_VISIBLE_VIDEO_WIDTH = 120;
const SUBTITLE_MIN_VISIBLE_VIDEO_HEIGHT = 80;
const TRANSCRIPT_PLACEMENTS = ['left', 'bottom', 'right'] as const satisfies readonly ReaderSettings['subtitleTranscriptPlacement'][];

export interface SubtitleElementLayout {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function renderPanelNavigationControls(enabled: boolean, language: InterfaceLanguage): string {
    const previous = uiText(language, 'previousSubtitle');
    const next = uiText(language, 'nextSubtitle');
    return `
        <div class="jpdb-subtitle-panel-nav" aria-label="${escapeHtml(uiText(language, 'subtitleNavigation'))}">
            <button type="button" data-action="previous" title="${escapeHtml(previous)}" aria-label="${escapeHtml(previous)}" ${enabled ? '' : 'disabled'}>‹</button>
            <button type="button" data-action="next" title="${escapeHtml(next)}" aria-label="${escapeHtml(next)}" ${enabled ? '' : 'disabled'}>›</button>
        </div>
    `;
}

export function renderPanelModeControls(mode: 'lines' | 'tracks', canShowLines: boolean, language: InterfaceLanguage): string {
    return `
        <div class="jpdb-subtitle-panel-mode" aria-label="${escapeHtml(uiText(language, 'subtitlePanelMode'))}">
            <button type="button" data-action="panel-lines" aria-pressed="${mode === 'lines'}" ${canShowLines ? '' : 'disabled'}>${escapeHtml(uiText(language, 'subtitleLines'))}</button>
            <button type="button" data-action="panel-tracks" aria-pressed="${mode === 'tracks'}">${escapeHtml(uiText(language, 'subtitleTracks'))}</button>
        </div>
    `;
}

export function renderPausePanelToggle(enabled: boolean, language: InterfaceLanguage): string {
    const label = uiText(language, enabled ? 'disableSubtitleAutoHide' : 'enableSubtitleAutoHide');
    return `
        <button class="jpdb-subtitle-drawer-auto" type="button" data-action="toggle-pause-panel" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${enabled}">
            ${subtitleIcon('auto-hide')}
            <span>${escapeHtml(uiText(language, 'subtitleAutoHideShort'))}</span>
        </button>
    `;
}

export function renderPanelPlacementControls(currentPlacement: ReaderSettings['subtitleTranscriptPlacement'], language: InterfaceLanguage): string {
    const label = uiText(language, 'subtitleTranscriptPlacement');
    return `
        <div class="jpdb-subtitle-panel-placement" role="group" aria-label="${escapeHtml(label)}">
            ${TRANSCRIPT_PLACEMENTS.map(placement => renderPanelPlacementButton(placement, currentPlacement, label, language)).join('')}
        </div>
    `;
}

function renderPanelPlacementButton(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    currentPlacement: ReaderSettings['subtitleTranscriptPlacement'],
    groupLabel: string,
    language: InterfaceLanguage,
): string {
    const placementLabel = uiText(language, placement);
    const label = `${groupLabel}: ${placementLabel}`;
    return `<button type="button" data-action="transcript-placement" data-placement="${placement}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${placement === currentPlacement}">${subtitleIcon(transcriptPlacementIcon(placement))}</button>`;
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

export type SubtitleIconName = 'auto-hide' | 'close' | 'copy' | 'eye' | 'eye-off' | 'menu' | 'panel-bottom' | 'panel-left' | 'panel-right' | 'pause' | 'play' | 'tracks' | 'transcript';

export function transcriptPlacementIcon(placement: ReaderSettings['subtitleTranscriptPlacement']): SubtitleIconName {
    if (placement === 'left') return 'panel-left';
    if (placement === 'bottom') return 'panel-bottom';
    return 'panel-right';
}

export function subtitleIcon(name: SubtitleIconName): string {
    const paths: Record<SubtitleIconName, string> = {
        'auto-hide': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/><path d="M8 9v6"/><path d="M11 9v6"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
        copy: '<path d="M14 3H6a2 2 0 0 0-2 2v12"/><path d="M10 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M14 11v6"/><path d="M11 14h6"/>',
        eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8"/><path d="M6.6 6.8A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
        menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
        'panel-bottom': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
        'panel-left': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
        'panel-right': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
        pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
        play: '<path d="M8 5v14l11-7-11-7Z"/>',
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
