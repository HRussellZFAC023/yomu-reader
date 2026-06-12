import { describe, expect, it } from 'vitest';

import { ankiStatusLineForSettings, renderAnkiStatusHtml } from '../../src/reader/settings/status-lines';

describe('Anki adapter state machine (P1)', () => {
    it('exposes disabled and probing states from settings', () => {
        expect(ankiStatusLineForSettings({ ankiEnabled: false, ankiConnectUrl: 'http://127.0.0.1:8765' }, 'en').state).toBe('disabled');
        expect(ankiStatusLineForSettings({ ankiEnabled: true, ankiConnectUrl: 'http://127.0.0.1:8765' }, 'en').state).toBe('probing');
    });

    it('renders the state chip and confidence details', () => {
        const html = renderAnkiStatusHtml({
            message: 'Scan found 3 decks.',
            tone: 'success',
            state: 'suggested',
            details: [
                { label: 'expression: Front', suffix: 'high match' },
                { label: 'audio: —', suffix: 'unmapped' },
            ],
        }, 'en');
        expect(html).toContain('data-adapter-state="suggested"');
        expect(html).toContain('Mapped');
        expect(html).toContain('expression: Front');
        expect(html).toContain('unmapped');
    });

    it('keeps the unreachable checklist after the confidence details', () => {
        const html = renderAnkiStatusHtml({
            message: 'AnkiConnect unreachable.',
            tone: 'pending',
            state: 'unreachable',
            action: 'anki-unreachable',
        }, 'en');
        expect(html).toContain('data-adapter-state="unreachable"');
        expect(html).toContain('jpdb-reader-status-checklist');
    });
});
