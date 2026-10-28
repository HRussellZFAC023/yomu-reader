import { describe, expect, it } from 'vitest';
import {
    diagnoseAnkiConnectFailure,
    registerSettingsFormCleanup,
    uiText,
} from './fixtures';

describe('AnkiConnect failure diagnosis (diagnostic-UX ticket)', () => {
    registerSettingsFormCleanup();

    it('classifies an opaque no-cors success as cors-blocked and a network error as unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ type: 'opaque' })));
        await expect(diagnoseAnkiConnectFailure('http://127.0.0.1:8765')).resolves.toBe('cors-blocked');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('NetworkError'); }));
        await expect(diagnoseAnkiConnectFailure('http://127.0.0.1:8765')).resolves.toBe('unreachable');
        vi.unstubAllGlobals();
    });

    it('names the exact origin to allow in the cors-blocked settings message', () => {
        const en = uiText('en', 'ankiCorsBlocked');
        expect(en).toContain('webCorsOriginList');
        expect(en).toContain('{origin}');
        const ja = uiText('ja', 'ankiCorsBlocked');
        expect(ja).toContain('webCorsOriginList');
        expect(ja).toContain('{origin}');
    });
});
