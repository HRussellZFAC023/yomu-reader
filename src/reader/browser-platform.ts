export function isAppleTouchBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent ?? '';
    const platform = navigator.platform ?? '';
    return /iPad|iPhone|iPod/i.test(userAgent)
        || ((platform === 'MacIntel' || /Mac/i.test(platform))
            && (navigator.maxTouchPoints ?? 0) > 1
            && (/Macintosh|Mac OS X/i.test(userAgent) || platform === 'MacIntel'));
}
