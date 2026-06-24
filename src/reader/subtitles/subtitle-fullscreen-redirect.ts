// Some mobile/narrow YouTube layouts request fullscreen on the bare <video>.
// A fullscreen video paints in the browser top layer above sibling DOM, so the
// Yomu subtitle overlay cannot be shown. Redirect those known video requests to
// the containing player frame, where both the video and overlay can be painted.

const REDIRECT_FLAG = '__yomuSubtitleFullscreenRedirect';
const STYLE_ID = 'yomu-subtitle-fullscreen-redirect-style';
const INLINE_FULLSCREEN_CLASS = 'jpdb-subtitle-inline-fullscreen';
const INLINE_FULLSCREEN_ATTRIBUTE = 'data-yomu-inline-fullscreen';

type PatchableWindow = Window & typeof globalThis & Record<string, unknown>;

function fullscreenRedirectBootstrap(win: PatchableWindow): void {
    const flag = '__yomuSubtitleFullscreenRedirect';
    const inlineKey = '__yomuSubtitleInlineFullscreenElement';
    const inlineClass = 'jpdb-subtitle-inline-fullscreen';
    const inlineAttribute = 'data-yomu-inline-fullscreen';
    if (win[flag]) return;

    const selector = '#movie_player, .html5-video-player, ytm-player, ytd-player, [data-yomu-video-frame]';
    const elementCtor = win.HTMLElement as typeof HTMLElement | undefined;
    const videoCtor = win.HTMLVideoElement as typeof HTMLVideoElement | undefined;
    const documentCtor = win.Document as typeof Document | undefined;
    const proto = elementCtor?.prototype as (HTMLElement & Record<string, unknown>) | undefined;
    const videoProto = videoCtor?.prototype as (HTMLVideoElement & Record<string, unknown>) | undefined;
    const documentProto = documentCtor?.prototype as (Document & Record<string, unknown>) | undefined;
    if (!proto || !videoCtor || !videoProto) return;

    const methods = ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen'];
    const requestNatives: Record<string, ((this: Element, ...args: unknown[]) => unknown) | undefined> = {};
    for (const name of methods) {
        const original = proto[name];
        if (typeof original !== 'function') continue;
        const native = original as (this: Element, ...args: unknown[]) => unknown;
        requestNatives[name] = native;
        proto[name] = function patchedRequestFullscreen(this: HTMLElement, ...args: unknown[]): unknown {
            const container = this instanceof videoCtor
                ? fullscreenContainerForVideo(this)
                : null;
            if (container && container !== this) return requestElementFullscreenOrInline(container, args);
            return native.apply(this, args);
        };
    }

    const enterVideoFullscreenMethods = ['webkitEnterFullscreen', 'webkitEnterFullScreen'];
    for (const name of enterVideoFullscreenMethods) {
        const original = videoProto[name];
        if (typeof original !== 'function') continue;
        const native = original as (this: HTMLVideoElement, ...args: unknown[]) => unknown;
        videoProto[name] = function patchedVideoFullscreen(this: HTMLVideoElement, ...args: unknown[]): unknown {
            const container = fullscreenContainerForVideo(this);
            if (container && container !== this) return requestElementFullscreenOrInline(container, args);
            return native.apply(this, args);
        };
    }

    const setPresentationMode = videoProto.webkitSetPresentationMode;
    if (typeof setPresentationMode === 'function') {
        const native = setPresentationMode as (this: HTMLVideoElement, mode: string, ...args: unknown[]) => unknown;
        videoProto.webkitSetPresentationMode = function patchedPresentationMode(this: HTMLVideoElement, mode: string, ...args: unknown[]): unknown {
            if (mode === 'fullscreen') {
                const container = fullscreenContainerForVideo(this);
                if (container && container !== this) return requestElementFullscreenOrInline(container, args);
            }
            if (mode === 'inline' || mode === 'picture-in-picture') exitInlineFullscreen();
            return native.apply(this, [mode, ...args]);
        };
    }

    const exitVideoFullscreenMethods = ['webkitExitFullscreen', 'webkitExitFullScreen'];
    for (const name of exitVideoFullscreenMethods) {
        const original = videoProto[name];
        if (typeof original !== 'function') continue;
        const native = original as (this: HTMLVideoElement, ...args: unknown[]) => unknown;
        videoProto[name] = function patchedVideoExitFullscreen(this: HTMLVideoElement, ...args: unknown[]): unknown {
            if (activeInlineFullscreenElement()) return exitInlineFullscreen();
            return native.apply(this, args);
        };
    }

    const exitDocumentFullscreenMethods = ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen', 'mozCancelFullScreen', 'msExitFullscreen'];
    if (documentProto) {
        for (const name of exitDocumentFullscreenMethods) {
            const original = documentProto[name];
            if (typeof original !== 'function') continue;
            const native = original as (this: Document, ...args: unknown[]) => unknown;
            documentProto[name] = function patchedDocumentExitFullscreen(this: Document, ...args: unknown[]): unknown {
                if (activeInlineFullscreenElement()) return exitInlineFullscreen();
                return native.apply(this, args);
            };
        }
    }

    win[flag] = true;

    function fullscreenContainerForVideo(video: HTMLVideoElement): HTMLElement | null {
        const closest = video.closest(selector) as HTMLElement | null;
        if (closest) return closest;
        if (!isMobileYouTube()) return null;
        return win.document.querySelector<HTMLElement>('ytm-player, #movie_player, .html5-video-player');
    }

    function requestElementFullscreenOrInline(target: HTMLElement, args: unknown[]): unknown {
        for (const name of methods) {
            const native = requestNatives[name];
            if (!native || typeof (target as unknown as Record<string, unknown>)[name] !== 'function') continue;
            try {
                return fallbackInlineOnRequestFailure(native.apply(target, args), target);
            } catch {
                return enterInlineFullscreen(target);
            }
        }
        return enterInlineFullscreen(target);
    }

    function fallbackInlineOnRequestFailure(result: unknown, target: HTMLElement): unknown {
        const promise = result as { catch?: (callback: () => unknown) => unknown } | undefined;
        return typeof promise?.catch === 'function'
            ? promise.catch(() => enterInlineFullscreen(target))
            : result;
    }

    function enterInlineFullscreen(target: HTMLElement): unknown {
        const current = activeInlineFullscreenElement();
        if (current && current !== target) clearInlineFullscreenElement(current);
        target.setAttribute(inlineAttribute, 'true');
        if (!target.hasAttribute('fullscreen')) {
            target.setAttribute('fullscreen', '');
            target.dataset.yomuInlineFullscreenAttr = 'true';
        }
        if (!target.classList.contains('ytp-fullscreen')) {
            target.classList.add('ytp-fullscreen');
            target.dataset.yomuInlineYtpFullscreenClass = 'true';
        }
        if (!target.classList.contains('fullscreen')) {
            target.classList.add('fullscreen');
            target.dataset.yomuInlineFullscreenClass = 'true';
        }
        win.document.documentElement.classList.add(inlineClass);
        win[inlineKey] = target;
        dispatchFullscreenLikeEvents();
        return typeof win.Promise?.resolve === 'function' ? win.Promise.resolve() : undefined;
    }

    function exitInlineFullscreen(): unknown {
        const current = activeInlineFullscreenElement();
        if (!current) return typeof win.Promise?.resolve === 'function' ? win.Promise.resolve() : undefined;
        clearInlineFullscreenElement(current);
        win.document.documentElement.classList.remove(inlineClass);
        delete win[inlineKey];
        dispatchFullscreenLikeEvents();
        return typeof win.Promise?.resolve === 'function' ? win.Promise.resolve() : undefined;
    }

    function clearInlineFullscreenElement(element: HTMLElement): void {
        element.removeAttribute(inlineAttribute);
        if (element.dataset.yomuInlineFullscreenAttr === 'true') element.removeAttribute('fullscreen');
        if (element.dataset.yomuInlineYtpFullscreenClass === 'true') element.classList.remove('ytp-fullscreen');
        if (element.dataset.yomuInlineFullscreenClass === 'true') element.classList.remove('fullscreen');
        delete element.dataset.yomuInlineFullscreenAttr;
        delete element.dataset.yomuInlineYtpFullscreenClass;
        delete element.dataset.yomuInlineFullscreenClass;
    }

    function activeInlineFullscreenElement(): HTMLElement | null {
        const current = win[inlineKey];
        return elementCtor && current instanceof elementCtor ? current : null;
    }

    function dispatchFullscreenLikeEvents(): void {
        for (const eventName of ['fullscreenchange', 'webkitfullscreenchange']) {
            try {
                win.document.dispatchEvent(new win.Event(eventName));
            } catch {
                // Older embedded WebKit event constructors can throw; resize below
                // still gives the subtitle controller a deterministic update.
            }
        }
        try {
            win.dispatchEvent(new win.Event('resize'));
        } catch {
            // Best effort only.
        }
    }

    function isMobileYouTube(): boolean {
        return /^m\.youtube\.com$/i.test(win.location.hostname);
    }
}

function fullscreenRedirectStyleText(): string {
    const fill = 'width:100%!important;height:100%!important;left:0!important;top:0!important;';
    return [
        `#movie_player:fullscreen video.html5-main-video{${fill}}`,
        '#movie_player:fullscreen .html5-video-container{width:100%!important;height:100%!important;}',
        `#movie_player:-webkit-full-screen video.html5-main-video{${fill}}`,
        '#movie_player:-webkit-full-screen .html5-video-container{width:100%!important;height:100%!important;}',
        `[data-yomu-video-frame]:fullscreen video{${fill}}`,
        `[data-yomu-video-frame]:-webkit-full-screen video{${fill}}`,
        `html.${INLINE_FULLSCREEN_CLASS},html.${INLINE_FULLSCREEN_CLASS} body{width:100%!important;height:100%!important;overflow:hidden!important;}`,
        `[${INLINE_FULLSCREEN_ATTRIBUTE}="true"]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;z-index:2147483640!important;background:#000!important;}`,
        `[${INLINE_FULLSCREEN_ATTRIBUTE}="true"] video{${fill}object-fit:contain!important;}`,
        `[${INLINE_FULLSCREEN_ATTRIBUTE}="true"] .html5-video-container{width:100%!important;height:100%!important;}`,
    ].join('\n');
}

function injectFullscreenRedirectStyle(): void {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = fullscreenRedirectStyleText();
    parent.append(style);
}

function injectFullscreenRedirectScript(): boolean {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const source = `;(${fullscreenRedirectBootstrap.toString()})(window);`;
    try {
        const script = document.createElement('script');
        const nonce = [...document.querySelectorAll('script[nonce]')]
            .map(el => el.getAttribute('nonce'))
            .find(Boolean);
        if (nonce) script.setAttribute('nonce', nonce);
        const trusted = createTrustedRedirectScript(source);
        if (trusted) (script as unknown as { textContent: unknown }).textContent = trusted;
        else script.textContent = source;
        parent.append(script);
        script.remove();
    } catch {
        return false;
    }
    const pageWin = (globalThis as { unsafeWindow?: PatchableWindow }).unsafeWindow ?? (window as PatchableWindow);
    return Boolean(pageWin[REDIRECT_FLAG]);
}

function createTrustedRedirectScript(code: string): unknown {
    try {
        const factory = (globalThis as {
            trustedTypes?: {
                createPolicy?: (
                    name: string,
                    options: { createScript: (value: string) => string },
                ) => { createScript?: (value: string) => unknown } | undefined;
            };
        }).trustedTypes;
        if (!factory?.createPolicy) return null;
        const policy = factory.createPolicy('yomu-subtitle-fullscreen-redirect', { createScript: (value: string) => value });
        return policy?.createScript ? policy.createScript(code) : null;
    } catch {
        return null;
    }
}

export function installSubtitleFullscreenRedirect(): void {
    injectFullscreenRedirectStyle();
    const unsafe = (globalThis as { unsafeWindow?: PatchableWindow }).unsafeWindow;
    const differentRealm = Boolean(unsafe) && unsafe !== (globalThis as unknown as Window);
    if (differentRealm && unsafe) {
        if (unsafe[REDIRECT_FLAG]) return;
        if (injectFullscreenRedirectScript()) return;
    }
    fullscreenRedirectBootstrap(unsafe ?? (window as PatchableWindow));
}
