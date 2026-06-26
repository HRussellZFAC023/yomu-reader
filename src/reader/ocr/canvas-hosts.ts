// Any BookWalker host that can paint the DRM canvas reader. The browser viewer is
// served BOTH from the apex `bookwalker.jp` (per-book `/de.../` reader paths) and the
// `viewer.`/`viewer-trial.` subdomains; iOS Safari's address bar can hide the
// subdomain, so reports often show only `bookwalker.jp`.
export function isBookwalkerViewerHost(hostname: string = location.hostname): boolean {
    return hostname === 'bookwalker.jp' || hostname.endsWith('.bookwalker.jp');
}
