export function isRedditHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    return normalized === 'reddit.com' || normalized.endsWith('.reddit.com');
}

/**
 * Reddit's tablet stylesheet applies broad zoom rules to body-mounted controls.
 * An inline-priority reset keeps Yomu's fixed pixel geometry authoritative while
 * leaving the host page and every non-Reddit site untouched.
 */
export function applyRedditOverlayScale(element: HTMLElement, hostname = location.hostname): void {
    if (!isRedditHostname(hostname)) return;
    element.style.setProperty('zoom', '1', 'important');
}
