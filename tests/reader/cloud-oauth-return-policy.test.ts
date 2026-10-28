import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type ReturnPolicyModule = {
    isTrustedYomuSettingsReturnUrl: (value: string) => boolean;
    isTrustedYomuOAuthTransaction: (
        value: unknown,
        returnedState: string,
        expectedClientId: string,
    ) => boolean;
};

const CLIENT_ID = '697885991868-bj7l5ja9vgbgk5i2ojcf5jfnkdg5h47g.apps.googleusercontent.com';
const STATE = 'a'.repeat(48);

async function returnPolicy(): Promise<ReturnPolicyModule> {
    const moduleUrl = pathToFileURL(path.resolve('docs/public/oauth/google-drive-return-policy.js')).href;
    return await import(moduleUrl) as ReturnPolicyModule;
}

describe('public Google Drive OAuth broker return policy', () => {
    it.each([
        'https://yomureader.com/study/',
        'https://yomureader.com/study/#settings=backup',
        'https://hrussellzfac023.github.io/yomu-reader/study/',
        'https://hrussellzfac023.github.io/yomu-reader/study/#settings=backup',
    ])('accepts the canonical HTTPS Study destination %s', async value => {
        expect((await returnPolicy()).isTrustedYomuSettingsReturnUrl(value)).toBe(true);
    });

    it.each([
        'https://attacker.example/study/',
        'https://evil.yomureader.com/study/',
        'http://yomureader.com/study/',
        'https://yomureader.com:444/study/',
        'https://user:password@yomureader.com/study/',
        'https://yomureader.com/study/?return=https://attacker.example',
        'https://yomureader.com/study?',
        'https://yomureader.com/study',
        'https://yomureader.com/study/index.html#settings=backup',
        'https://yomureader.com/study/#access_token=credential',
        'https://yomureader.com/study/#settings=api',
        'https://yomureader.com/newtab/',
        'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        'https://hrussellzfac023.github.io/other/study/',
        'http://127.0.0.1:5174/study/',
        'http://localhost:5174/study/',
        'http://[::1]:5174/study/',
        'javascript:alert(1)',
    ])('rejects the non-canonical or credential-bearing destination %s', async value => {
        expect((await returnPolicy()).isTrustedYomuSettingsReturnUrl(value)).toBe(false);
    });

    it('accepts only an exact current broker transaction at callback time', async () => {
        const { isTrustedYomuOAuthTransaction } = await returnPolicy();
        expect(isTrustedYomuOAuthTransaction({
            clientId: CLIENT_ID,
            returnUrl: 'https://yomureader.com/study/#settings=backup',
            state: STATE,
        }, STATE, CLIENT_ID)).toBe(true);
    });

    it.each([
        [{ clientId: CLIENT_ID, returnUrl: 'https://attacker.example/study/', state: STATE }, STATE],
        [{ clientId: 'attacker-client', returnUrl: 'https://yomureader.com/study/', state: STATE }, STATE],
        [{ clientId: CLIENT_ID, returnUrl: 'https://yomureader.com/study/', state: STATE }, 'b'.repeat(48)],
        [{ clientId: CLIENT_ID, returnUrl: 'https://yomureader.com/study/', state: 'legacy-state' }, 'legacy-state'],
        [{ clientId: CLIENT_ID, returnUrl: 'https://yomureader.com/study/', state: STATE, extra: 'tampered' }, STATE],
    ])('rejects a stale or tampered persisted transaction %#', async (transaction, returnedState) => {
        expect((await returnPolicy()).isTrustedYomuOAuthTransaction(
            transaction,
            returnedState,
            CLIENT_ID,
        )).toBe(false);
    });

    it('pins the canonical client and no longer writes access tokens to window.name', () => {
        const broker = readFileSync('docs/public/oauth/google-drive.html', 'utf8');
        expect(broker).toContain("clientId !== YOMU_CLIENT_ID");
        expect(broker).toContain("/^[0-9a-f]{48}$/");
        expect(broker).toContain("from './google-drive-return-policy.js'");
        expect(broker).toContain('isTrustedYomuSettingsReturnUrl(returnUrl)');
        expect(broker).toContain('isTrustedYomuOAuthTransaction(transaction, returnedState, YOMU_CLIENT_ID)');
        expect(broker).toMatch(/if \(returnedState\) clearTransaction\(returnedState\)/u);
        expect(broker).not.toMatch(/window\.name\s*=/u);
    });
});
