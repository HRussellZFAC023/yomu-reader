import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import { clampNumber } from '../core/number-utils';
import { setStylePropertyIfChanged } from './subtitle-surface';
import type { ReaderSettings } from '../app/types';

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
export const TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT = 220;
const TRANSCRIPT_PANEL_SIZE_KEY = 'jpdb-reader-transcript-panel-size';
export const SUBTITLE_DRAG_OFFSET_KEY = 'jpdb-reader-subtitle-drag-offset';

// The manual drag offset is stored as a fraction of the viewport height (negative
// = nudged up) rather than raw pixels so the remembered position scales sensibly
// across players of different sizes, orientations, and fullscreen. The live drag
// already keeps the overlay on-screen, so this band is only a defensive guard
// against a corrupted/imported value. It mirrors the live drag's reach: up to
// most of the viewport upward, and no further down than the live downward cap so
// a stray positive value can't drop a bottom-anchored line below the fold.
const SUBTITLE_DRAG_OFFSET_MIN_FRACTION = -0.9;
const SUBTITLE_DRAG_OFFSET_MAX_FRACTION = 0.35;

function clampSubtitleDragOffsetFraction(fraction: number): number {
    if (!Number.isFinite(fraction)) return 0;
    return Math.min(SUBTITLE_DRAG_OFFSET_MAX_FRACTION, Math.max(SUBTITLE_DRAG_OFFSET_MIN_FRACTION, fraction));
}

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
    const size = options.size ?? {};
    const preferredPlacement = options.preferredPlacement ?? 'right';
    const margin = options.compactPanel || preferredPlacement === 'bottom' ? 0 : TRANSCRIPT_PANEL_MARGIN;
    return options.compactPanel || preferredPlacement === 'bottom'
        ? compactSubtitleDrawerLayout(options, size, margin)
        : sideSubtitleDrawerLayout(options, size, margin, preferredPlacement);
}

function compactSubtitleDrawerLayout(options: SubtitleDrawerLayoutOptions, size: TranscriptPanelSize, margin: number): TranscriptPanelLayout {
    const maxHeight = maxTranscriptBottomPanelHeight(options.viewportHeight, margin);
    const height = clampNumber(
        size.bottomHeight ?? Math.min(420, options.viewportHeight * 0.46),
        TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
        maxHeight,
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

// Users may pull the bottom drawer as high as they like; only the viewport
// itself (minus margins) limits the drag.
export function maxTranscriptBottomPanelHeight(viewportHeight: number, margin = TRANSCRIPT_PANEL_MARGIN): number {
    return Math.max(TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT, viewportHeight - margin * 3);
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

export function loadSubtitleDragOffsetFraction(): number {
    try {
        const parsed = gmStorageGetSync<{ fraction?: number }>(SUBTITLE_DRAG_OFFSET_KEY, {});
        return clampSubtitleDragOffsetFraction(parsed?.fraction ?? 0);
    } catch {
        return 0;
    }
}

export function saveSubtitleDragOffsetFraction(fraction: number): void {
    try {
        gmStorageSetSync(SUBTITLE_DRAG_OFFSET_KEY, { fraction: clampSubtitleDragOffsetFraction(fraction) });
    } catch {
        // Best-effort preference only.
    }
}
