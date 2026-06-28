import {
    TRANSCRIPT_PANEL_MARGIN,
    TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
    maxTranscriptBottomPanelHeight,
    type TranscriptPanelLayout,
} from './subtitle-layout';
import { clampNumber } from '../core/number-utils';
import type { ReaderSettings } from '../app/types';

export const TRANSCRIPT_PANEL_ANIMATION_MS = 180;

export const TRANSCRIPT_PANEL_MIN_SIDE_WIDTH = 300;
// Lowered the absolute floor (was 560) so side docking stays available on
// smaller screens instead of forcing the bottom layout; the ratio still keeps a
// balanced player on wide screens.
const TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_WIDTH = 400;
const TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_RATIO = 0.52;
const TRANSCRIPT_PANEL_KEYBOARD_STEP_PX = 48;

type TranscriptResizeKeyboardDirection = -1 | 0 | 1;

interface TranscriptResizeBounds {
    maxBottomHeight: number;
    maxSideWidth: number;
}

interface TranscriptResizeHandleMetricsOptions {
    bounds: TranscriptResizeBounds;
    layout?: TranscriptPanelLayout;
    panelRect?: DOMRect;
    placement: ReaderSettings['subtitleTranscriptPlacement'];
}

interface TranscriptResizeKeyboardOptions {
    bounds: TranscriptResizeBounds;
    direction: Exclude<TranscriptResizeKeyboardDirection, 0>;
    panelRect: DOMRect;
    placement: ReaderSettings['subtitleTranscriptPlacement'];
}

interface TranscriptResizePointerDragOptions {
    bounds: TranscriptResizeBounds;
    currentX: number;
    currentY: number;
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
}

interface TranscriptResizeHandleMetrics {
    current: number;
    max: number;
    min: number;
    orientation: 'horizontal' | 'vertical';
}

type TranscriptResizePatch =
    | { bottomHeight: number; sideWidth?: never }
    | { bottomHeight?: never; sideWidth: number };

export function transcriptResizeBounds(viewportWidth: number, viewportHeight: number): TranscriptResizeBounds {
    return {
        maxBottomHeight: maxTranscriptBottomPanelHeight(viewportHeight, TRANSCRIPT_PANEL_MARGIN),
        maxSideWidth: Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, viewportWidth - TRANSCRIPT_PANEL_MARGIN * 3),
    };
}

export function transcriptResizeKeyboardDirection(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    key: string,
): TranscriptResizeKeyboardDirection {
    if (key === transcriptResizeIncreaseKey(placement)) return 1;
    if (key === transcriptResizeDecreaseKey(placement)) return -1;
    return 0;
}

export function transcriptResizeHandleMetrics(options: TranscriptResizeHandleMetricsOptions): TranscriptResizeHandleMetrics {
    return isBottomTranscriptPlacement(options.layout?.placement ?? options.placement)
        ? transcriptBottomResizeHandleMetrics(options)
        : transcriptSideResizeHandleMetrics(options);
}

export function transcriptResizePatchForKeyboard(options: TranscriptResizeKeyboardOptions): TranscriptResizePatch {
    const delta = options.direction * TRANSCRIPT_PANEL_KEYBOARD_STEP_PX;
    if (isBottomTranscriptPlacement(options.placement)) {
        return {
            bottomHeight: Math.round(clampNumber(
                options.panelRect.height + delta,
                TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
                options.bounds.maxBottomHeight,
            )),
        };
    }
    return {
        sideWidth: Math.round(clampNumber(
            options.panelRect.width + delta,
            TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
            options.bounds.maxSideWidth,
        )),
    };
}

export function transcriptResizePatchForPointerDrag(options: TranscriptResizePointerDragOptions): TranscriptResizePatch {
    if (options.placement === 'bottom') {
        return {
            bottomHeight: Math.round(clampNumber(
                options.startHeight + options.startY - options.currentY,
                TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
                options.bounds.maxBottomHeight,
            )),
        };
    }
    const widthDelta = options.placement === 'left'
        ? options.currentX - options.startX
        : options.startX - options.currentX;
    return {
        sideWidth: Math.round(clampNumber(
            options.startWidth + widthDelta,
            TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
            options.bounds.maxSideWidth,
        )),
    };
}

export function shouldUseBottomTranscriptLayoutForAvailableWidth(videoWidth: number, availableWidth: number): boolean {
    const referenceWidth = Math.max(videoWidth, availableWidth);
    return availableWidth < minimumSideTranscriptPlayerWidth(referenceWidth);
}

export function minimumSideTranscriptPlayerWidth(referenceWidth: number): number {
    return Math.min(
        referenceWidth,
        Math.max(TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_WIDTH, referenceWidth * TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_RATIO),
    );
}

function transcriptBottomResizeHandleMetrics(options: TranscriptResizeHandleMetricsOptions): TranscriptResizeHandleMetrics {
    return {
        current: options.layout?.height ?? options.panelRect?.height ?? 0,
        max: options.bounds.maxBottomHeight,
        min: TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
        orientation: 'horizontal',
    };
}

function transcriptSideResizeHandleMetrics(options: TranscriptResizeHandleMetricsOptions): TranscriptResizeHandleMetrics {
    return {
        current: options.layout?.width ?? options.panelRect?.width ?? 0,
        max: options.layout?.maxWidth ?? options.bounds.maxSideWidth,
        min: TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
        orientation: 'vertical',
    };
}

function isBottomTranscriptPlacement(placement: ReaderSettings['subtitleTranscriptPlacement']): boolean {
    return placement === 'bottom';
}

function transcriptResizeIncreaseKey(placement: ReaderSettings['subtitleTranscriptPlacement']): string {
    if (placement === 'bottom') return 'ArrowUp';
    return placement === 'left' ? 'ArrowRight' : 'ArrowLeft';
}

function transcriptResizeDecreaseKey(placement: ReaderSettings['subtitleTranscriptPlacement']): string {
    if (placement === 'bottom') return 'ArrowDown';
    return placement === 'left' ? 'ArrowLeft' : 'ArrowRight';
}
