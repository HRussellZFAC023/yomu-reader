import { describe, expect, it } from 'vitest';

import { canFetchAnkiConnectFrom, needsHostedAnkiConnectSetupHint } from '../../src/reader/anki';

describe('AnkiConnect browser fetch eligibility', () => {
    it('lets the hosted new-tab app contact a configured AnkiConnect endpoint', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
        )).toBe(true);
        expect(canFetchAnkiConnectFrom(
            'http://tailscale-host.ts.net:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        )).toBe(true);
    });

    it('keeps arbitrary content pages on the userscript request bridge path', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'https://example.com/article',
        )).toBe(false);
    });

    it('keeps local development pages able to fetch AnkiConnect directly', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'http://127.0.0.1:5174/newtab/',
        )).toBe(true);
    });

    it('shows the hosted setup hint only for standalone hosted AnkiConnect requests', () => {
        expect(needsHostedAnkiConnectSetupHint(
            'http://127.0.0.1:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        )).toBe(true);
        expect(needsHostedAnkiConnectSetupHint(
            'http://127.0.0.1:8765',
            'http://127.0.0.1:5174/newtab/',
        )).toBe(false);
    });
});
