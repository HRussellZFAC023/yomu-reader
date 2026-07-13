const REMOTE_COOKIE_PREFIX = '__Host-academy_';
const LOCAL_COOKIE_PREFIX = 'academy_dev_';

/**
 * Browsers correctly reject the production Worker's Secure `__Host-` cookie
 * on the HTTP-only 127.0.0.1 Vite origin. Rewrite only Academy cookies at the
 * local proxy boundary; the Worker and production response stay untouched.
 */
export function academySetCookieForLocal(header: string): string {
    if (!header.startsWith(REMOTE_COOKIE_PREFIX)) return header;
    return header
        .replace(REMOTE_COOKIE_PREFIX, LOCAL_COOKIE_PREFIX)
        .replace(/;\s*Secure(?=;|$)/gi, '');
}

/** Restore local Academy cookie names before forwarding a request upstream. */
export function academyCookieForRemote(header: string): string {
    return header.split(';').map(part => {
        const cookie = part.trim();
        return cookie.startsWith(LOCAL_COOKIE_PREFIX)
            ? cookie.replace(LOCAL_COOKIE_PREFIX, REMOTE_COOKIE_PREFIX)
            : cookie;
    }).join('; ');
}
