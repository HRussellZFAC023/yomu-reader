// Some mobile/narrow YouTube layouts request fullscreen on the bare <video>.
// A fullscreen video paints in the browser top layer above sibling DOM, so the
// Yomu subtitle overlay cannot be shown. Redirect those known video requests to
// the containing player frame, where both the video and overlay can be painted.

const REDIRECT_FLAG = '__yomuSubtitleFullscreenRedirect';
const STYLE_ID = 'yomu-subtitle-fullscreen-redirect-style';

type PatchableWindow = Window & typeof globalThis & Record<string, unknown>;

function fullscreenRedirectBootstrap(win: PatchableWindow): void {
    const flag = '__yomuSubtitleFullscreenRedirect';
    if (win[flag]) return;

    const selector = '#movie_player, .html5-video-player, [data-yomu-video-frame]';
    const elementCtor = win.HTMLElement as typeof HTMLElement | undefined;
    const videoCtor = win.HTMLVideoElement as typeof HTMLVideoElement | undefined;
    const proto = elementCtor?.prototype as (HTMLElement & Record<string, unknown>) | undefined;
    if (!proto || !videoCtor) return;

    const methods = ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen'];
    for (const name of methods) {
        const original = proto[name];
        if (typeof original !== 'function') continue;
        const native = original as (this: Element, ...args: unknown[]) => unknown;
        proto[name] = function patchedRequestFullscreen(this: HTMLElement, ...args: unknown[]): unknown {
            const container = this instanceof videoCtor
                ? (this.closest(selector) as (HTMLElement & Record<string, unknown>) | null)
                : null;
            const target = container && container !== this && typeof container[name] === 'function'
                ? container
                : this;
            return native.apply(target, args);
        };
    }
    win[flag] = true;
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
