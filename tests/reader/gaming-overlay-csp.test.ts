import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Yomu Gaming overlay content policy', () => {
    // The overlay's request route (renderer/http-transport.ts) is fetch() under this policy.
    // AnkiConnect listens on this machine over plain http, which an https-only policy
    // refused, so adding a word to Anki from a game could never leave the overlay.
    it('lets the overlay reach AnkiConnect on this machine and no other plain-http host', () => {
        const html = readFileSync(join(process.cwd(), 'src/gaming/renderer/index.html'), 'utf8');
        const connectSources = /connect-src ([^;"]+)/.exec(html)?.[1].trim().split(/\s+/) ?? [];
        expect(connectSources.filter(source => source.startsWith('http:'))).toEqual([
            'http://127.0.0.1:8765',
            'http://localhost:8765',
        ]);
    });
});
