import { isYouTubeAppHostname } from '../app/youtube-host';
import { videoFrameDataUrl } from '../dom/video-frame-raster';
import { fittedObjectSize, objectPositionOffset } from './ocr-overlay-geometry';
import { setOcrArtifactPosition } from './ocr-position-pass';
import { privateRasterHost } from './private-raster-presenter';

const VIDEO_FRAME_PLAYER_SELECTOR = [
    '#movie_player',
    '.html5-video-player',
    'ytd-player',
    '#player',
    '#player-container',
    '#player-container-outer',
    '[data-yomu-video-frame]',
].join(',');

const VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR = [
    '[data-yomu-inline-fullscreen="true"]',
    '[data-fullscreen-active="true"]',
    '[fullscreen]',
    '#movie_player.ytp-fullscreen',
    '.html5-video-player.ytp-fullscreen',
    'ytd-watch-flexy[fullscreen]',
    'ytm-player[fullscreen]',
    'ytm-player.fullscreen',
    'ytm-player.ytp-fullscreen',
].join(',');

// YouTube feed/preview tile containers are never the main watch player. The
// body-level hover preview reuses player markup, so the wrapper is authoritative.
const VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR = [
    'ytd-thumbnail',
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-playlist-thumbnail',
    'ytd-video-preview',
    'yt-thumbnail-view-model',
    'yt-lockup-view-model',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-video-with-context-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
].join(',');

// These links also wrap the main mobile player, so size decides ambiguous cases.
const VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR = [
    'a[href*="/watch"]',
    'a[href*="/shorts/"]',
].join(',');

export const OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR = [
    VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR,
    'yt-image',
    '.yt-core-image',
].join(',');

export function captureVideoFrameDataUrl(video: HTMLVideoElement): string | undefined {
    try {
        if (!videoHasDecodedFrame(video)) return undefined;
        return videoFrameDataUrl(video);
    } catch {
        return undefined;
    }
}

function videoHasDecodedFrame(video: HTMLVideoElement): boolean {
    return Math.min(video.videoWidth, video.videoHeight) > 0 && video.readyState >= 2;
}

export function isLikelyPausedVideoThumbnail(video: HTMLVideoElement): boolean {
    if (isExplicitVideoThumbnail(video)) return true;
    if (video.closest(VIDEO_FRAME_PLAYER_SELECTOR)) return false;
    return Boolean(video.closest(VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR))
        && !isPrimaryPlayerSizedVideo(video);
}

function isExplicitVideoThumbnail(video: HTMLVideoElement): boolean {
    return isTwitterHost() || Boolean(video.closest(VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR));
}

function isTwitterHost(hostname = location.hostname): boolean {
    return hostname === 'twitter.com'
        || hostname === 'x.com'
        || hostname.endsWith('.twitter.com')
        || hostname.endsWith('.x.com');
}

function isPrimaryPlayerSizedVideo(video: HTMLVideoElement): boolean {
    const rect = video.getBoundingClientRect();
    if (!hasMinimumPlayerSize(rect)) return false;
    const viewport = currentViewportSize();
    if (!viewport) return hasFallbackPrimaryPlayerSize(rect);
    return isViewportProminentVideo(rect, viewport);
}

function hasMinimumPlayerSize(rect: DOMRect): boolean {
    return rect.width >= 280 && rect.height >= 160;
}

function hasFallbackPrimaryPlayerSize(rect: DOMRect): boolean {
    return rect.width >= 480 && rect.height >= 270;
}

function currentViewportSize(): { width: number; height: number } | undefined {
    const width = firstNonZeroDimension(window.innerWidth, document.documentElement.clientWidth);
    const height = firstNonZeroDimension(window.innerHeight, document.documentElement.clientHeight);
    if (!width) return undefined;
    return height ? { width, height } : undefined;
}

function firstNonZeroDimension(primary: number, fallback: number): number {
    return primary || fallback || 0;
}

function isViewportProminentVideo(rect: DOMRect, viewport: { width: number; height: number }): boolean {
    return rect.width >= viewport.width * 0.6
        || rect.width * rect.height >= viewport.width * viewport.height * 0.25;
}

export function positionVideoFrameImage(frame: HTMLImageElement, rect: DOMRect, video: HTMLVideoElement): void {
    const content = videoContentBox(rect, video);
    for (const element of [privateRasterHost(frame), frame]) {
        setOcrArtifactPosition(element, content.left, content.top);
        element.style.width = `${content.width}px`;
        element.style.height = `${content.height}px`;
    }
}

export function positionVideoFrameResumeControl(control: HTMLElement, rect: DOMRect, video: HTMLVideoElement): void {
    const root = videoFrameArtifactRoot(video);
    if (attachVideoFrameResumeControlToSubtitleRail(control, root)) return;
    attachVideoFrameResumeControlFallback(control, root);
    const content = videoContentBox(rect, video);
    setOcrArtifactPosition(control, content.left + content.width - 12, content.top + 12);
}

export function positionVideoFrameStatus(status: HTMLElement, rect: DOMRect, video: HTMLVideoElement): void {
    const content = videoContentBox(rect, video);
    positionOcrImageStatus(status, content);
}

export function positionOcrImageStatus(status: HTMLElement, rect: DOMRect): void {
    const maxWidth = Math.max(96, Math.min(Math.max(96, rect.width - 24), 320));
    setOcrArtifactPosition(status, Math.max(8, rect.left + 12), Math.max(8, rect.top + 12));
    status.style.maxWidth = `${maxWidth}px`;
}

export function appendOcrArtifactToRoot(element: HTMLElement, root: HTMLElement): void {
    const oldRoot = element.parentElement;
    const fullscreenHosted = root !== document.body;
    if (fullscreenHosted) prepareOcrFullscreenHost(root);
    element.dataset.yomuOcrFullscreenHosted = fullscreenHosted ? 'true' : 'false';
    if (oldRoot !== root) root.append(element);
    clearOcrFullscreenHostMarker(oldRoot);
}

export function removeOcrArtifact(element: HTMLElement): void {
    const oldRoot = element.parentElement;
    element.remove();
    clearOcrFullscreenHostMarker(oldRoot);
}

function clearOcrFullscreenHostMarker(root: Element | null): void {
    if (!isFullscreenArtifactContainer(root)) return;
    if (root.querySelector('[data-yomu-ocr-fullscreen-hosted="true"]')) return;
    delete root.dataset.yomuOcrFullscreenHost;
    clearPreparedFullscreenHostPosition(root);
}

function isFullscreenArtifactContainer(root: Element | null): root is HTMLElement {
    return root instanceof HTMLElement && root !== document.body;
}

function clearPreparedFullscreenHostPosition(root: HTMLElement): void {
    if (root.dataset.yomuOcrFullscreenHostPosition === 'relative') {
        root.style.position = '';
        delete root.dataset.yomuOcrFullscreenHostPosition;
    }
}

function prepareOcrFullscreenHost(root: HTMLElement): void {
    root.dataset.yomuOcrFullscreenHost = 'true';
    const position = getComputedStyle(root).position;
    if (position && position !== 'static') return;
    root.style.position = 'relative';
    root.dataset.yomuOcrFullscreenHostPosition = 'relative';
}

export function videoFrameArtifactRoot(video: HTMLVideoElement): HTMLElement {
    return activeVideoFullscreenHost(video) ?? document.body;
}

function activeVideoFullscreenHost(video: HTMLVideoElement): HTMLElement | null {
    const active = activeFullscreenElement();
    return documentFullscreenArtifactHost(active)
        ?? activeElementArtifactHost(active, video)
        ?? closestFullscreenArtifactHost(video)
        ?? youtubeFullscreenHostForOcrVideo(video);
}

function documentFullscreenArtifactHost(active: HTMLElement | null): HTMLElement | null {
    return [document.body, document.documentElement].includes(active as HTMLElement)
        ? document.body
        : null;
}

function activeElementArtifactHost(active: HTMLElement | null, video: HTMLVideoElement): HTMLElement | null {
    if (!active) return null;
    if (active === video) return fullscreenVideoArtifactHost(video);
    return active.contains(video) ? active : null;
}

function closestFullscreenArtifactHost(video: HTMLVideoElement): HTMLElement | null {
    return connectedVideoAncestor(video.closest<HTMLElement>(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR), video);
}

function fullscreenVideoArtifactHost(video: HTMLVideoElement): HTMLElement | null {
    const host = video.closest<HTMLElement>(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR)
        ?? video.closest<HTMLElement>(VIDEO_FRAME_PLAYER_SELECTOR);
    return connectedVideoAncestor(host, video) ?? youtubeFullscreenHostForOcrVideo(video);
}

function connectedVideoAncestor(host: HTMLElement | null, video: HTMLVideoElement): HTMLElement | null {
    return isConnectedVideoAncestor(host, video) ? host : null;
}

function isConnectedVideoAncestor(host: HTMLElement | null, video: HTMLVideoElement): host is HTMLElement {
    return host !== null
        && host !== video
        && host.isConnected
        && host.contains(video);
}

function youtubeFullscreenHostForOcrVideo(video: HTMLVideoElement): HTMLElement | null {
    if (!isYouTubeAppHostname()) return null;
    return scopedYoutubeFullscreenHost(video) ?? unscopedYoutubeFullscreenHost(video);
}

function scopedYoutubeFullscreenHost(video: HTMLVideoElement): HTMLElement | null {
    return [
        video.closest<HTMLElement>('[data-yomu-inline-fullscreen="true"]'),
        video.closest<HTMLElement>('.html5-video-player.ytp-fullscreen'),
        video.closest<HTMLElement>('#movie_player.ytp-fullscreen'),
        video.closest<HTMLElement>('ytd-watch-flexy[fullscreen] #movie_player'),
        video.closest<HTMLElement>('ytd-watch-flexy[fullscreen] ytd-player'),
        video.closest<HTMLElement>('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen'),
    ].find((element): element is HTMLElement => Boolean(element && element !== video)) ?? null;
}

function unscopedYoutubeFullscreenHost(video: HTMLVideoElement): HTMLElement | null {
    return [
        document.querySelector<HTMLElement>('[data-yomu-inline-fullscreen="true"]'),
        document.querySelector<HTMLElement>('.html5-video-player.ytp-fullscreen'),
        document.querySelector<HTMLElement>('#movie_player.ytp-fullscreen'),
        document.querySelector<HTMLElement>('ytd-watch-flexy[fullscreen] #movie_player'),
        document.querySelector<HTMLElement>('ytd-watch-flexy[fullscreen] ytd-player'),
        document.querySelector<HTMLElement>('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen'),
    ].find(element => Boolean(element && element !== video && youtubeFullscreenHostContainsVideo(element, video))) ?? null;
}

function youtubeFullscreenHostContainsVideo(element: HTMLElement, video: HTMLVideoElement): boolean {
    return element.contains(video) || isYouTubeMobileFullscreenHostForOcr(element);
}

function isYouTubeMobileFullscreenHostForOcr(element: HTMLElement): boolean {
    return /^m\.youtube\.com$/i.test(location.hostname)
        && element.matches('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen');
}

function activeFullscreenElement(): HTMLElement | null {
    const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
    };
    return [
        doc.fullscreenElement,
        doc.webkitFullscreenElement,
        doc.mozFullScreenElement,
        doc.msFullscreenElement,
    ].find((element): element is HTMLElement => element instanceof HTMLElement) ?? null;
}

function attachVideoFrameResumeControlToSubtitleRail(control: HTMLElement, root: HTMLElement): boolean {
    const rail = connectedSubtitleRailForOcrRoot(root);
    if (!rail) return false;
    const oldParent = control.parentElement;
    const oldRoot = subtitlePlayerRoot(control);
    control.classList.remove('jpdb-ocr-video-frame-resume-fallback');
    control.dataset.yomuOcrFullscreenHosted = 'false';
    control.style.left = '';
    control.style.top = '';
    insertResumeControlIntoSubtitleRail(control, rail);
    clearOcrFullscreenHostMarker(oldParent);
    updateSubtitleRailResumeState(oldRoot);
    updateSubtitleRailResumeState(subtitlePlayerRoot(control));
    return true;
}

function connectedSubtitleRailForOcrRoot(root: HTMLElement): HTMLElement | null {
    const rail = subtitleRailForOcrRoot(root);
    return rail?.isConnected ? rail : null;
}

function insertResumeControlIntoSubtitleRail(control: HTMLElement, rail: HTMLElement): void {
    if (control.parentElement === rail) return;
    const panelButton = rail.querySelector<HTMLElement>('.jpdb-subtitle-panel-toggle');
    rail.insertBefore(control, panelButton);
}

function attachVideoFrameResumeControlFallback(control: HTMLElement, root: HTMLElement): void {
    const oldRoot = subtitlePlayerRoot(control);
    appendOcrArtifactToRoot(control, root);
    control.classList.add('jpdb-ocr-video-frame-resume-fallback');
    updateSubtitleRailResumeState(oldRoot);
}

export function removeVideoFrameResumeControl(control: HTMLElement): void {
    const root = subtitlePlayerRoot(control);
    removeOcrArtifact(control);
    updateSubtitleRailResumeState(root);
}

function subtitleRailForOcrRoot(root: HTMLElement): HTMLElement | null {
    const rails = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-player[data-jpdb-reader-root="true"] .jpdb-subtitle-rail'));
    if (root === document.body) return rails.find(rail => rail.isConnected) ?? null;
    return rails.find(rail => rail.isConnected && root.contains(rail)) ?? null;
}

function subtitlePlayerRoot(control: HTMLElement): HTMLElement | null {
    return control.closest<HTMLElement>('.jpdb-subtitle-player');
}

function updateSubtitleRailResumeState(root: HTMLElement | null): void {
    if (!root) return;
    root.classList.toggle('jpdb-ocr-video-frame-resume-active', Boolean(root.querySelector('.jpdb-ocr-video-frame-resume')));
}

export function playVideoIcon(): string {
    return `<svg class="jpdb-ocr-video-frame-resume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7-11-7Z"></path></svg>`;
}

function videoContentBox(rect: DOMRect, video: HTMLVideoElement): DOMRect {
    const intrinsicWidth = video.videoWidth;
    const intrinsicHeight = video.videoHeight;
    if (!hasVideoContentDimensions(rect, intrinsicWidth, intrinsicHeight)) return rect;
    const style = getComputedStyle(video);
    const object = fittedObjectSize(videoObjectFit(style.objectFit), intrinsicWidth, intrinsicHeight, rect.width, rect.height);
    const offset = objectPositionOffset(style.objectPosition || '50% 50%', rect.width - object.width, rect.height - object.height);
    return new DOMRect(rect.left + offset.x, rect.top + offset.y, object.width, object.height);
}

function hasVideoContentDimensions(rect: DOMRect, intrinsicWidth: number, intrinsicHeight: number): boolean {
    return Math.min(intrinsicWidth, intrinsicHeight, rect.width, rect.height) > 0;
}

function videoObjectFit(value: string): string {
    return ['contain', 'cover', 'none', 'scale-down'].includes(value) ? value : 'contain';
}
