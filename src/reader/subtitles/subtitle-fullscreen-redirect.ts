// YouTube (and similar players) request the Fullscreen API on the BARE <video>
// element on their mobile / narrow responsive layout. A bare fullscreen <video>
// is promoted to the browser's top layer and paints above ALL other DOM, so the
// Yomu subtitle overlay — which lives in <body> / #movie_player, never INSIDE
// the <video> (a video element has no rendered children) — is completely
// occluded and the subtitles cannot be shown in fullscreen.
//
// Fix: intercept requestFullscreen on such a <video> and redirect it to the
// player container that wraps it (#movie_player / .html5-video-player /
// [data-yomu-video-frame]). The container holds both the video AND our overlay,
// so once the container is the top-layer fullscreen element the overlay renders
// on top of the video. The browser's UA `:fullscreen` rule then sizes the
// *container* instead of the video, so we also inject CSS that makes the video
// fill its container (otherwise it keeps its small inline layout size inside an
// otherwise-black fullscreen box).
//
// The patch must run in the page's MAIN world so it intercepts the page's own
// requestFullscreen call (the user gesture that triggers fullscreen). We mirror
// the same-realm / inject-script strategy used by canvas-mirror.ts.

const REDIRECT_FLAG = '__yomuSubtitleFullscreenRedirect';
const STYLE_ID = 'yomu-subtitle-fullscreen-redirect-style';

type PatchableWindow = Window & typeof globalThis & Record<string, unknown>;

// Runs IN the page realm (either a same-realm call or serialized via toString()
// and injected through a <script>). Must be fully self-contained: nothing in
// module scope survives the toString() injection.
function fullscreenRedirectBootstrap(win: PatchableWindow): void {
    const flag = '__yomuSubtitleFullscreenRedirect';
    if (win[flag]) return;
    // Known player containers whose bare-<video> fullscreen we redirect. Scoped
    // so unrelated sites that legitimately fullscreen a bare <video> are left
    // untouched.
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

// `:fullscreen` and the legacy `:-webkit-full-screen` cannot share a selector
// list (an unknown pseudo-class drops the whole rule), so emit each as its own
// block and let each engine apply the variant it understands.
function fullscreenRedirectStyleText(): string {
    const fill = 'width:100%!important;height:100%!important;left:0!important;top:0!important;';
    return [
        `#movie_player:fullscreen video.html5-main-video{${fill}}`,
        `#movie_player:fullscreen .html5-video-container{width:100%!important;height:100%!important;}`,
        `#movie_player:-webkit-full-screen video.html5-main-video{${fill}}`,
        `#movie_player:-webkit-full-screen .html5-video-container{width:100%!important;height:100%!important;}`,
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
        const nonce = [...document.querySelectorAll('script[nonce]')].map(el => el.getAttribute('nonce')).find(Boolean);
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
            trustedTypes?: { createPolicy?: (name: string, options: { createScript: (value: string) => string }) => { createScript?: (value: string) => unknown } | undefined };
        }).trustedTypes;
        if (!factory?.createPolicy) return null;
        const policy = factory.createPolicy('yomu-subtitle-fullscreen-redirect', { createScript: (value: string) => value });
        return policy?.createScript ? policy.createScript(code) : null;
    } catch {
        return null;
    }
}

// Install the bare-<video> fullscreen redirect + supporting CSS. Idempotent.
// Same realm (Chrome/Tampermonkey-in-page, the Playwright harness, iPad): patch
// this realm's HTMLElement prototype directly — it is shared with the page.
// Different realm (Firefox sandbox): inject a page-world script so the patch
// lands in the compartment where the page's own requestFullscreen call runs.
export function installSubtitleFullscreenRedirect(): void {
    injectFullscreenRedirectStyle();
    const uw = (globalThis as { unsafeWindow?: PatchableWindow }).unsafeWindow;
    const differentRealm = Boolean(uw) && uw !== (globalThis as unknown as Window);
    if (differentRealm && uw) {
        if (uw[REDIRECT_FLAG]) return;
        if (injectFullscreenRedirectScript()) return;
        // Injection blocked (CSP / Trusted Types): fall through to a same-realm
        // patch as a best effort.
    }
    fullscreenRedirectBootstrap(uw ?? (window as PatchableWindow));
}
