import { afterEach, describe, expect, it, vi } from 'vitest';
import { jpdbApiFetchCandidates } from '../../src/reader/jpdb/jpdb-api';

const TARGET = 'https://jpdb.io/api/v1/list-user-decks';
const PROXY = 'https://yomu-proxy.example/fetch';
const PROXIED = `${PROXY}?url=${encodeURIComponent(TARGET)}`;

function stubLocation(href: string): void {
    const url = new URL(href);
    vi.stubGlobal('location', {
        href: url.href,
        origin: url.origin,
        hostname: url.hostname,
        pathname: url.pathname,
    });
}

function stubNavigator(overrides: Partial<{ userAgent: string; platform: string; maxTouchPoints: number }>): void {
    vi.stubGlobal('navigator', {
        userAgent: overrides.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: overrides.platform ?? 'Win32',
        maxTouchPoints: overrides.maxTouchPoints ?? 0,
    });
}

describe('jpdbApiFetchCandidates candidate order', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('prefers the configured proxy before direct fetch on the hosted GitHub Pages app', () => {
        stubLocation('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([PROXIED, TARGET]);
    });

    it('prefers the configured proxy before direct fetch on any cross-origin http page', () => {
        stubLocation('https://example.com/reader');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([PROXIED, TARGET]);
    });

    it('prefers the configured proxy before direct fetch on Apple touch browsers', () => {
        // Same-origin jpdb.io page (not cross-origin, not hosted) so only the
        // Apple-touch branch can force the proxy-first ordering.
        stubLocation('https://jpdb.io/deck');
        stubNavigator({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 });
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([PROXIED, TARGET]);
    });

    it('fetches direct before the configured proxy on a plain desktop jpdb.io page', () => {
        stubLocation('https://jpdb.io/deck');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([TARGET, PROXIED]);
    });

    it('uses only the direct URL when no proxy is configured', () => {
        stubLocation('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, '')).toEqual([TARGET]);
    });
});
