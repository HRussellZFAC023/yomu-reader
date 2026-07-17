import { describe, expect, it } from 'vitest';
import { createLocalQaAccessGateway, localQaAuthBypassEnabled } from '../../src/academy/access/local-qa';

describe('Academy local QA authentication seam', () => {
    it('requires both development mode and an explicit localhost query flag', () => {
        const local = { hostname: '127.0.0.1', href: 'http://127.0.0.1:5199/academy/?qa-auth=bypass' };
        expect(localQaAuthBypassEnabled(local, true)).toBe(true);
        expect(localQaAuthBypassEnabled(local, false)).toBe(false);
        expect(localQaAuthBypassEnabled({ ...local, hostname: 'yomureader.com', href: 'https://yomureader.com/academy/?qa-auth=bypass' }, true)).toBe(false);
        expect(localQaAuthBypassEnabled({ ...local, href: 'http://127.0.0.1:5199/academy/' }, true)).toBe(false);
    });

    it('creates only short-lived local QA sessions', async () => {
        const session = await createLocalQaAccessGateway(() => 1_000).exchange('LOCAL-QA');
        expect(session).toMatchObject({ source: 'local-qa', accountRequired: true, expiresAt: 86_401_000 });
        expect(session.offlineResumeUntil).toBe(604_801_000);
    });
});
