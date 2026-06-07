import { createWindowEvent, dispatchWindowEvent } from '../window-events';
import { setStylePropertyIfChanged } from './subtitle-surface';

export type SubtitleVideoInsetSide = 'left' | 'right' | 'bottom';

export interface ApplySubtitleVideoInsetOptions {
    video?: HTMLVideoElement;
    side: SubtitleVideoInsetSide;
    playerSize: number;
    panelSize: number;
    videoRect: DOMRect;
    margin: number;
}

export class SubtitleVideoInsetAdapter {
    private lastSignature = '';

    apply(options: ApplySubtitleVideoInsetOptions): void {
        const metrics = videoInsetMetrics(options);
        if (metrics.signature === this.lastSignature) return;

        this.lastSignature = metrics.signature;
        document.documentElement.classList.toggle('jpdb-subtitle-video-inset-left', options.side === 'left');
        document.documentElement.classList.toggle('jpdb-subtitle-video-inset-right', options.side === 'right');
        document.documentElement.classList.toggle('jpdb-subtitle-video-inset-bottom', options.side === 'bottom');
        document.documentElement.style.setProperty('--jpdb-subtitle-video-inset', metrics.inset);
        applyYouTubePlayerInset(options.side, metrics.width, metrics.insetPixels, metrics.height);
        applyGenericVideoInsetIfNeeded(options, metrics);
        requestYouTubePlayerResize(metrics.width, metrics.height);
    }

    clear(video?: HTMLVideoElement): void {
        if (!hasActiveVideoInset(this.lastSignature)) return;
        this.lastSignature = '';
        document.documentElement.classList.remove('jpdb-subtitle-video-inset-left', 'jpdb-subtitle-video-inset-right', 'jpdb-subtitle-video-inset-bottom');
        document.documentElement.style.removeProperty('--jpdb-subtitle-video-inset');
        const watchFlexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
        watchFlexy?.style.removeProperty('--ytd-watch-flexy-player-width');
        watchFlexy?.style.removeProperty('--ytd-watch-flexy-player-height');
        watchFlexy?.style.removeProperty('--ytd-watch-flexy-min-player-height');
        for (const element of youtubePlayerContainers()) clearYouTubePlayerContainerInset(element);
        if (video) clearGenericVideoInset(video);
        resetYouTubePlayerResizeTracking();
    }
}

function hasActiveVideoInset(lastSignature: string): boolean {
    return Boolean(lastSignature)
        || document.documentElement.classList.contains('jpdb-subtitle-video-inset-left')
        || document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')
        || document.documentElement.classList.contains('jpdb-subtitle-video-inset-bottom');
}

interface VideoInsetMetrics {
    insetPixels: number;
    inset: string;
    width: number;
    height: number;
    signature: string;
}

function videoInsetMetrics(options: ApplySubtitleVideoInsetOptions): VideoInsetMetrics {
    const insetPixels = Math.max(0, Math.round(options.panelSize) + options.margin);
    const width = videoInsetWidth(options);
    const height = videoInsetHeight(options, width);
    const inset = `${insetPixels}px`;
    return {
        insetPixels,
        inset,
        width,
        height,
        signature: `${options.side}:${inset}:${width}:${height}`,
    };
}

function videoInsetWidth(options: ApplySubtitleVideoInsetOptions): number {
    return options.side === 'bottom'
        ? Math.max(320, Math.round(options.videoRect.width))
        : Math.max(320, Math.round(options.playerSize));
}

function videoInsetHeight(options: ApplySubtitleVideoInsetOptions, _width: number): number {
    if (options.side === 'bottom') return Math.max(180, Math.round(options.playerSize));
    return Math.max(180, Math.round(options.videoRect.height));
}

function applyGenericVideoInsetIfNeeded(options: ApplySubtitleVideoInsetOptions, metrics: VideoInsetMetrics): void {
    if (!isYouTubePage() && options.video) {
        applyGenericVideoInset(options.video, options.side, options.side === 'bottom' ? metrics.height : metrics.width, metrics.height);
    }
}

export function createSubtitleVideoInsetAdapter(): SubtitleVideoInsetAdapter {
    return new SubtitleVideoInsetAdapter();
}

export function subtitleVideoLayoutRect(video?: HTMLVideoElement): DOMRect {
    if (isYouTubePage()) {
        const scopedRect = video ? youtubePlayerRectForVideo(video) : undefined;
        if (scopedRect) return scopedRect;
        const rect = youtubeVisiblePlayerRect();
        if (rect) return rect;
    }
    return video?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

export function transcriptAvoidanceTarget(video: HTMLVideoElement): HTMLElement {
    const videoRect = video.getBoundingClientRect();
    let best: HTMLElement = genericVideoLayoutTarget(video);
    for (let ancestor = video.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        if (isUsefulTranscriptAvoidanceTarget(ancestor, videoRect)) best = ancestor;
    }
    return best;
}

function isUsefulTranscriptAvoidanceTarget(element: HTMLElement, videoRect: DOMRect): boolean {
    const rect = element.getBoundingClientRect();
    return usableVideoRect(rect)
        && rectContainsRect(rect, videoRect, 2)
        && !isViewportSizedVideoRect(rect)
        && hasMeaningfulVideoInsetSpace(rect, videoRect);
}

function isViewportSizedVideoRect(rect: DOMRect): boolean {
    return rect.width > window.innerWidth * 0.92 || rect.height > window.innerHeight * 0.9;
}

function hasMeaningfulVideoInsetSpace(rect: DOMRect, videoRect: DOMRect): boolean {
    return rect.width - videoRect.width >= 180
        || rect.height - videoRect.height >= 80;
}

function videoAspectRatio(video?: HTMLVideoElement): number {
    if (!video) return 9 / 16;
    if (video.videoWidth && video.videoHeight) return video.videoHeight / video.videoWidth;
    if (!video.currentSrc && !video.src) return 9 / 16;
    const rect = video.getBoundingClientRect();
    return rect.height / Math.max(1, rect.width);
}

function applyYouTubePlayerInset(side: SubtitleVideoInsetSide, width: number, inset: number, height: number): void {
    const watchFlexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
    applyYouTubeWatchFlexyInset(watchFlexy, side, width, height);
    for (const element of youtubePlayerContainers()) {
        applyYouTubePlayerContainerInset(element, side, width, inset, bottomInsetHeight(side, height));
    }
}

function applyYouTubeWatchFlexyInset(watchFlexy: HTMLElement | null, side: SubtitleVideoInsetSide, width: number, height: number): void {
    if (side !== 'bottom') watchFlexy?.style.setProperty('--ytd-watch-flexy-player-width', `${width}px`);
    if (height) watchFlexy?.style.setProperty('--ytd-watch-flexy-player-height', `${height}px`);
    if (side === 'bottom' && height) watchFlexy?.style.setProperty('--ytd-watch-flexy-min-player-height', `${height}px`);
}

function bottomInsetHeight(side: SubtitleVideoInsetSide, height: number): number {
    return side === 'bottom' ? height : 0;
}

const youtubePlayerContainerBaseRects = new WeakMap<HTMLElement, { left: number; right: number }>();

function youtubePlayerContainers(): HTMLElement[] {
    if (!isYouTubePage()) return [];
    return [
        document.querySelector<HTMLElement>('ytd-watch-flexy #primary'),
        document.querySelector<HTMLElement>('ytd-watch-flexy #primary-inner'),
    ].filter((element): element is HTMLElement => Boolean(element));
}

function applyYouTubePlayerContainerInset(element: HTMLElement, side: SubtitleVideoInsetSide, width: number, inset: number, height = 0): void {
    if (side === 'bottom') {
        applyBottomYouTubePlayerContainerInset(element, height);
        return;
    }
    applySideYouTubePlayerContainerInset(element, side, width, inset);
}

function applyBottomYouTubePlayerContainerInset(element: HTMLElement, height: number): void {
    if (!height) return;
    setStylePropertyIfChanged(element, 'height', `${height}px`);
    setStylePropertyIfChanged(element, 'max-height', `${height}px`);
    setStylePropertyIfChanged(element, 'min-height', '0px');
}

function applySideYouTubePlayerContainerInset(element: HTMLElement, side: Exclude<SubtitleVideoInsetSide, 'bottom'>, width: number, inset: number): void {
    const rect = element.getBoundingClientRect();
    const baseRect = youtubePlayerContainerBaseRects.get(element) ?? { left: rect.left, right: rect.right };
    if (!youtubePlayerContainerBaseRects.has(element)) youtubePlayerContainerBaseRects.set(element, baseRect);
    const widthValue = `${width}px`;
    setStylePropertyIfChanged(element, 'width', widthValue);
    setStylePropertyIfChanged(element, 'max-width', widthValue);
    setStylePropertyIfChanged(element, 'min-width', '0px');
    const margin = side === 'left'
        ? `${Math.max(0, Math.round(inset - baseRect.left))}px`
        : `${Math.max(0, Math.round(baseRect.right - (window.innerWidth - inset)))}px`;
    setStylePropertyIfChanged(element, side === 'left' ? 'margin-left' : 'margin-right', margin);
    setStylePropertyIfChanged(element, side === 'left' ? 'margin-right' : 'margin-left', '0px');
}

function youtubeVisiblePlayerRect(): DOMRect | undefined {
    const rects = [
        '#movie_player',
        '.html5-video-player',
        'ytd-watch-flexy #player-container-inner',
        'ytd-watch-flexy #player-container-outer',
        'ytd-watch-flexy #player',
    ].flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)))
        .map(element => element.getBoundingClientRect())
        .filter(usableVideoRect);
    return rects.sort(compareVideoLayoutRects)[0];
}

function youtubePlayerRectForVideo(video: HTMLVideoElement): DOMRect | undefined {
    const candidates = [
        video.closest<HTMLElement>('#movie_player'),
        video.closest<HTMLElement>('.html5-video-player'),
        video.closest<HTMLElement>('ytd-player'),
        video.closest<HTMLElement>('ytd-reel-video-renderer'),
        video.closest<HTMLElement>('ytd-shorts'),
    ];
    for (const element of candidates) {
        const rect = element?.getBoundingClientRect();
        if (usableVideoRect(rect)) return rect;
    }
    const rect = video.getBoundingClientRect();
    return usableVideoRect(rect) ? rect : undefined;
}

function compareVideoLayoutRects(a: DOMRect, b: DOMRect): number {
    return rectViewportIntersectionArea(b) - rectViewportIntersectionArea(a)
        || rectArea(b) - rectArea(a);
}

function rectViewportIntersectionArea(rect: DOMRect): number {
    const left = Math.max(0, Math.min(window.innerWidth, rect.left));
    const top = Math.max(0, Math.min(window.innerHeight, rect.top));
    const right = Math.max(left, Math.min(window.innerWidth, rect.right));
    const bottom = Math.max(top, Math.min(window.innerHeight, rect.bottom));
    return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function rectArea(rect: DOMRect): number {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function requestYouTubePlayerResize(width: number, height: number): void {
    if (!isYouTubePage()) return;
    const signature = youtubeResizeSignature(width, height);
    if (signature === lastYouTubePlayerResizeSignature) return;
    lastYouTubePlayerResizeSignature = signature;
    const player = youtubeMoviePlayer();
    try {
        if (canResizeYouTubePlayer(player, width, height)) player.setSize(Math.round(width), Math.round(height));
    } catch {
        // YouTube's player API is private and best-effort.
    }
    dispatchWindowEvent(createWindowEvent('resize'));
    scheduleYouTubeResizeEvent();
}

let lastYouTubePlayerResizeSignature = '';
let pendingYouTubeResizeEvent: number | undefined;

function youtubeResizeSignature(width: number, height: number): string {
    return `${Math.round(width)}:${Math.round(height)}`;
}

function scheduleYouTubeResizeEvent(): void {
    if (pendingYouTubeResizeEvent !== undefined) window.clearTimeout(pendingYouTubeResizeEvent);
    pendingYouTubeResizeEvent = window.setTimeout(() => {
        pendingYouTubeResizeEvent = undefined;
        dispatchWindowEvent(createWindowEvent('resize'));
    }, 80);
}

function resetYouTubePlayerResizeTracking(): void {
    lastYouTubePlayerResizeSignature = '';
    if (pendingYouTubeResizeEvent !== undefined) window.clearTimeout(pendingYouTubeResizeEvent);
    pendingYouTubeResizeEvent = undefined;
}

function youtubeMoviePlayer(): { setSize?: (width: number, height: number) => void } | null {
    return document.querySelector('#movie_player') as { setSize?: (width: number, height: number) => void } | null;
}

function canResizeYouTubePlayer(
    player: { setSize?: (width: number, height: number) => void } | null,
    width: number,
    height: number,
): player is { setSize: (width: number, height: number) => void } {
    return Boolean(player?.setSize && width > 0 && height > 0);
}

function clearYouTubePlayerContainerInset(element: HTMLElement): void {
    for (const property of ['width', 'max-width', 'min-width', 'height', 'max-height', 'min-height', 'margin-left', 'margin-right']) {
        if (element.style.getPropertyValue(property)) element.style.removeProperty(property);
    }
    youtubePlayerContainerBaseRects.delete(element);
}

type GenericInsetProperty = 'width' | 'height' | 'maxWidth' | 'maxHeight' | 'minWidth' | 'minHeight' | 'marginLeft' | 'marginRight' | 'justifySelf' | 'objectFit';

const genericVideoInsetStyles = new WeakMap<HTMLElement, Partial<Record<GenericInsetProperty, string>>>();
const genericVideoInsetBaseRects = new WeakMap<HTMLElement, { left: number; right: number; height: number }>();
const genericVideoInsetTargets = new WeakMap<HTMLVideoElement, HTMLElement>();

function applyGenericVideoInset(video: HTMLVideoElement, side: SubtitleVideoInsetSide, size: number, height = 0): void {
    const target = prepareGenericVideoInsetTarget(video, side);
    if (side === 'bottom') {
        applyGenericBottomInset(target, size, video);
        return;
    }
    applyGenericSideInset(target, side, size, height, video);
}

function prepareGenericVideoInsetTarget(video: HTMLVideoElement, side: SubtitleVideoInsetSide): HTMLElement {
    const previousTarget = genericVideoInsetTargets.get(video);
    const target = previousTarget && side !== 'bottom'
        ? previousTarget
        : genericVideoLayoutTarget(video, side);
    if (previousTarget && previousTarget !== target) clearGenericVideoInsetTarget(previousTarget);
    genericVideoInsetTargets.set(video, target);
    rememberGenericVideoInsetStyles(target);
    return target;
}

function rememberGenericVideoInsetStyles(target: HTMLElement): void {
    if (genericVideoInsetStyles.has(target)) return;
    const rect = target.getBoundingClientRect();
    genericVideoInsetBaseRects.set(target, { left: rect.left, right: rect.right, height: rect.height });
    genericVideoInsetStyles.set(target, {
        width: target.style.width,
        height: target.style.height,
        maxWidth: target.style.maxWidth,
        maxHeight: target.style.maxHeight,
        minWidth: target.style.minWidth,
        minHeight: target.style.minHeight,
        marginLeft: target.style.marginLeft,
        marginRight: target.style.marginRight,
        justifySelf: target.style.justifySelf,
        objectFit: target.style.objectFit,
    });
}

function applyGenericBottomInset(target: HTMLElement, size: number, video: HTMLVideoElement): void {
    restoreGenericSideInsetStyles(target);
    const height = genericBottomInsetHeight(target, size, video);
    setStylePropertyIfChanged(target, 'height', `${Math.round(height)}px`);
    setStylePropertyIfChanged(target, 'max-height', `${Math.round(height)}px`);
    setStylePropertyIfChanged(target, 'min-height', '0px');
    if (target === video) setStylePropertyIfChanged(target, 'object-fit', 'contain');
}

function genericBottomInsetHeight(target: HTMLElement, size: number, video: HTMLVideoElement): number {
    if (!target.matches('[data-yomu-video-frame]')) return size;
    return Math.min(size, target.getBoundingClientRect().width * videoAspectRatio(video));
}

function applyGenericSideInset(target: HTMLElement, side: SubtitleVideoInsetSide, size: number, height: number, video: HTMLVideoElement): void {
    restoreGenericBottomInsetStyles(target);
    const rect = target.getBoundingClientRect();
    const baseRect = genericVideoInsetBaseRects.get(target) ?? rect;
    const inset = Number.parseFloat(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')) || 0;
    const margin = side === 'left'
        ? Math.max(0, Math.round(inset - baseRect.left))
        : Math.max(0, Math.round(baseRect.right - (window.innerWidth - inset)));
    const stableHeight = sideInsetStableHeight(target, height);
    setStylePropertyIfChanged(target, 'width', `${Math.round(size)}px`);
    setStylePropertyIfChanged(target, 'max-width', `${Math.round(size)}px`);
    setStylePropertyIfChanged(target, 'min-width', '0px');
    setStylePropertyIfChanged(target, 'justify-self', 'start');
    if (stableHeight > 0) {
        setStylePropertyIfChanged(target, 'height', `${Math.round(stableHeight)}px`);
        setStylePropertyIfChanged(target, 'max-height', `${Math.round(stableHeight)}px`);
        setStylePropertyIfChanged(target, 'min-height', '0px');
    }
    if (target === video) setStylePropertyIfChanged(target, 'object-fit', 'contain');
    else applyContainedVideoHeight(video, height);
    setStylePropertyIfChanged(target, side === 'left' ? 'margin-left' : 'margin-right', `${margin}px`);
    setStylePropertyIfChanged(target, side === 'left' ? 'margin-right' : 'margin-left', '0px');
}

function sideInsetStableHeight(target: HTMLElement, fallbackHeight: number): number {
    const rectHeight = genericVideoInsetBaseRects.get(target)?.height ?? target.getBoundingClientRect().height;
    return Math.max(0, Math.round(rectHeight || fallbackHeight));
}

function applyContainedVideoHeight(video: HTMLVideoElement, height: number): void {
    const stableHeight = sideInsetStableHeight(video, height);
    if (stableHeight <= 0) return;
    rememberGenericVideoInsetStyles(video);
    setStylePropertyIfChanged(video, 'height', `${Math.round(stableHeight)}px`);
    setStylePropertyIfChanged(video, 'max-height', `${Math.round(stableHeight)}px`);
    setStylePropertyIfChanged(video, 'min-height', '0px');
    setStylePropertyIfChanged(video, 'object-fit', 'contain');
}

function restoreGenericSideInsetStyles(target: HTMLElement): void {
    restoreGenericInsetStyleProperties(target, [
        'width',
        'height',
        'maxWidth',
        'maxHeight',
        'minWidth',
        'minHeight',
        'marginLeft',
        'marginRight',
        'justifySelf',
        'objectFit',
    ]);
}

function restoreGenericBottomInsetStyles(target: HTMLElement): void {
    restoreGenericInsetStyleProperties(target, ['height', 'maxHeight', 'minHeight']);
}

function clearGenericVideoInset(video: HTMLVideoElement): void {
    const target = genericVideoInsetTargets.get(video) ?? genericVideoLayoutTarget(video, 'right');
    clearGenericVideoInsetTarget(target);
    if (target !== video) clearGenericVideoInsetTarget(video);
    genericVideoInsetTargets.delete(video);
}

function clearGenericVideoInsetTarget(target: HTMLElement): void {
    if (!restoreGenericInsetStyleProperties(target, [
        'width',
        'height',
        'maxWidth',
        'maxHeight',
        'minWidth',
        'minHeight',
        'marginLeft',
        'marginRight',
        'justifySelf',
        'objectFit',
    ])) return;
    genericVideoInsetStyles.delete(target);
    genericVideoInsetBaseRects.delete(target);
}

function restoreGenericInsetStyleProperties(target: HTMLElement, properties: GenericInsetProperty[]): boolean {
    const previous = genericVideoInsetStyles.get(target);
    if (!previous) return false;
    properties.forEach(property => {
        setRestoredStyleProperty(target, stylePropertyName(property), previous[property]);
    });
    return true;
}

function stylePropertyName(property: GenericInsetProperty): string {
    return property.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
}

function genericVideoLayoutTarget(video: HTMLVideoElement, side: SubtitleVideoInsetSide = 'right'): HTMLElement {
    const parent = video.parentElement;
    if (!isGenericVideoLayoutParent(parent)) return video;
    if (side === 'bottom' && !parent.matches('[data-yomu-video-frame]')) return video;
    const parentRect = parent.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    return shouldUseGenericVideoParent(parent, parentRect, videoRect) ? parent : video;
}

function isGenericVideoLayoutParent(parent: HTMLElement | null): parent is HTMLElement {
    return Boolean(parent && parent !== document.body && parent !== document.documentElement);
}

function shouldUseGenericVideoParent(parent: HTMLElement, parentRect: DOMRect, videoRect: DOMRect): boolean {
    if (parent.matches('[data-yomu-video-frame]')) return true;
    if (rectsHaveMatchingSize(parentRect, videoRect, 3)) return false;
    return rectContainsRect(parentRect, videoRect);
}

function rectsHaveMatchingSize(a: DOMRect, b: DOMRect, tolerance: number): boolean {
    return Math.abs(a.width - b.width) <= tolerance
        && Math.abs(a.height - b.height) <= tolerance;
}

function rectContainsRect(container: DOMRect, child: DOMRect, tolerance = 0): boolean {
    return container.left <= child.left + tolerance
        && container.top <= child.top + tolerance
        && container.right >= child.right - tolerance
        && container.bottom >= child.bottom - tolerance;
}

function setRestoredStyleProperty(element: HTMLElement, property: string, value: string | undefined): void {
    if (value) {
        element.style.setProperty(property, value);
    } else {
        element.style.removeProperty(property);
    }
}

function usableVideoRect(rect?: DOMRect): rect is DOMRect {
    return Boolean(rect && rect.width >= 120 && rect.height >= 80);
}

function isYouTubePage(): boolean {
    return /(^|\.)youtube\.com$/i.test(location.hostname);
}
