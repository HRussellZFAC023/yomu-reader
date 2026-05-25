import { gmStorageGetSync, gmStorageSetSync } from './storage';
import type { ReaderSettings } from './types';

export interface TranscriptPanelLayout {
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    left: number;
    top: number;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    margin: number;
    maxWidth?: number;
}

export const TRANSCRIPT_PANEL_MARGIN = 10;
const TRANSCRIPT_PANEL_SIZE_KEY = 'jpdb-reader-transcript-panel-size';

export interface TranscriptPanelSize {
    sideWidth?: number;
    bottomHeight?: number;
}

export interface SubtitleDrawerLayoutOptions {
    viewportWidth: number;
    viewportHeight: number;
    anchorTop?: number;
    compactPanel: boolean;
    preferredPlacement?: ReaderSettings['subtitleTranscriptPlacement'];
    size?: TranscriptPanelSize;
}

export function computeSubtitleDrawerLayout(options: SubtitleDrawerLayoutOptions): TranscriptPanelLayout {
    const margin = options.compactPanel ? 0 : TRANSCRIPT_PANEL_MARGIN;
    const size = options.size ?? {};
    const preferredPlacement = options.preferredPlacement ?? 'right';
    return options.compactPanel || preferredPlacement === 'bottom'
        ? compactSubtitleDrawerLayout(options, size, margin)
        : sideSubtitleDrawerLayout(options, size, margin, preferredPlacement);
}

function compactSubtitleDrawerLayout(options: SubtitleDrawerLayoutOptions, size: TranscriptPanelSize, margin: number): TranscriptPanelLayout {
    const height = clampNumber(
        size.bottomHeight ?? Math.min(420, options.viewportHeight * 0.46),
        220,
        Math.max(220, options.viewportHeight - margin * 3),
    );
    return {
        placement: 'bottom',
        left: margin,
        top: Math.max(margin, options.viewportHeight - height - margin),
        width: options.viewportWidth - margin * 2,
        height,
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
        margin,
    };
}

function sideSubtitleDrawerLayout(
    options: SubtitleDrawerLayoutOptions,
    size: TranscriptPanelSize,
    margin: number,
    preferredPlacement: ReaderSettings['subtitleTranscriptPlacement'],
): TranscriptPanelLayout {
    const top = clampNumber(options.anchorTop ?? 72, margin, Math.max(margin, options.viewportHeight - 280));
    const width = clampNumber(
        size.sideWidth ?? Math.min(460, options.viewportWidth * 0.32),
        340,
        Math.max(340, options.viewportWidth - margin * 3),
    );
    const placement = preferredPlacement === 'left' ? 'left' : 'right';
    return {
        placement,
        left: placement === 'left' ? margin : Math.max(margin, options.viewportWidth - width - margin),
        top,
        width,
        height: Math.max(260, options.viewportHeight - top - margin),
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
        margin,
        maxWidth: Math.max(340, options.viewportWidth - margin * 3),
    };
}

export function shouldUseCompactSubtitleDrawer(viewportWidth: number): boolean {
    return viewportWidth < 700;
}

export function applyTranscriptPanelLayout(panel: HTMLElement, layout: TranscriptPanelLayout): void {
    setStylePropertyIfChanged(panel, 'position', 'fixed');
    setStylePropertyIfChanged(panel, 'left', `${Math.round(layout.left)}px`);
    setStylePropertyIfChanged(panel, 'top', `${Math.round(layout.top)}px`);
    setStylePropertyIfChanged(panel, 'right', 'auto');
    setStylePropertyIfChanged(panel, 'bottom', 'auto');
    setStylePropertyIfChanged(panel, 'box-sizing', 'border-box');
    setStylePropertyIfChanged(panel, 'z-index', '2147483645');
    setStylePropertyIfChanged(panel, 'pointer-events', 'auto');
    setStylePropertyIfChanged(panel, 'width', `${Math.round(Math.max(260, Math.min(layout.width, layout.viewportWidth - layout.margin * 2)))}px`);
    const minHeight = layout.placement === 'bottom' ? 80 : 150;
    const height = `${Math.round(Math.max(minHeight, layout.height))}px`;
    setStylePropertyIfChanged(panel, 'height', height);
    setStylePropertyIfChanged(panel, 'max-height', height);
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function setStylePropertyIfChanged(element: HTMLElement, property: string, value: string): void {
    if (element.style.getPropertyValue(property) === value) return;
    element.style.setProperty(property, value);
}

export function loadTranscriptPanelSize(): TranscriptPanelSize {
    try {
        const parsed = gmStorageGetSync<TranscriptPanelSize>(TRANSCRIPT_PANEL_SIZE_KEY, {});
        return {
            sideWidth: Number.isFinite(parsed.sideWidth) ? parsed.sideWidth : undefined,
            bottomHeight: Number.isFinite(parsed.bottomHeight) ? parsed.bottomHeight : undefined,
        };
    } catch {
        return {};
    }
}

export function saveTranscriptPanelSize(size: TranscriptPanelSize): void {
    try {
        gmStorageSetSync(TRANSCRIPT_PANEL_SIZE_KEY, size);
    } catch {
        // Best-effort preference only.
    }
}
