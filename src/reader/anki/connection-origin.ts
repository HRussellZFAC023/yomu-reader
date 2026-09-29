/** Host permissions authorize extension pages; ordinary pages still need the manager bridge. */
export function canDirectFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    try {
        const current = new URL(currentHref);
        const target = new URL(url, current);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
        return target.origin === current.origin || Boolean(current.hostname
            && /^(?:moz|chrome|safari-web)-extension:$/u.test(current.protocol));
    } catch {
        return false;
    }
}
