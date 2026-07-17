// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AcademySyncClient, type AcademySyncStorage } from '../../src/academy/account/sync-client';
import { HttpAccessGateway } from '../../src/academy/access/gateway';
import { createMemoryLearnerEventRepository, type LearnerEvent } from '../../src/academy/domain/learner-record';
import { derivePaidInviteCode } from '../../workers/yomu-academy/src/crypto';
import type { Env } from '../../workers/yomu-academy/src/env';
import { inviteCodeHash, mintPaidInvite } from '../../workers/yomu-academy/src/invites';
import worker from '../../workers/yomu-academy/src/index';
import { AcademyAccessBrowser, TestGoogleOidcProvider } from './helpers/academy-access-browser';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const PROFILE_SYNC_STORAGE_KEY = 'yomu:academy:profile-sync:v1';
const LOCAL_PROGRESS_AT = Date.now();

describe('Academy access client and Worker integration', () => {
    it('admits OPEN2026 anonymously and retains local encrypted progress across reload', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedAnonymousInvite(academy.env);
            const browser = new AcademyAccessBrowser(worker, academy.env);
            const gateway = new HttpAccessGateway('/academy/api/session', browser.request);
            const session = await gateway.exchange(' open2026 ');
            const events = createMemoryLearnerEventRepository([localProgress()]);
            const storage = memoryStorage();
            const client = syncClient(browser, events, storage);

            expect(session.source).toBe('cloudflare');
            const connected = await client.connect();
            expect(connected.error).toBeNull();
            expect(connected.phase).toBe('ready');
            expect(client.status.profile?.accountId).toBeNull();
            expect(await events.readAll()).toEqual([localProgress()]);
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM srs_events')[0]?.count).toBe(1);
            expect(JSON.stringify(academy.db.rows('SELECT ciphertext FROM srs_events'))).not.toContain('Retained local learner');

            const reloaded = syncClient(browser, events, storage);
            expect((await reloaded.connect()).phase).toBe('ready');
            expect(await events.readAll()).toEqual([localProgress()]);
            expect(storage.getItem(PROFILE_SYNC_STORAGE_KEY)).toContain('profileId');
        } finally {
            academy.close();
        }
    });

    it('gates paid codes on Google, limits an account to one redemption, and recovers its retained progress', async () => {
        const academy = createSqliteAcademy();
        try {
            const firstPaidCode = await seedPaidCode(academy.env, 'paid-access-one');
            const secondPaidCode = await seedPaidCode(academy.env, 'paid-access-two');
            const provider = new TestGoogleOidcProvider();
            const browser = new AcademyAccessBrowser(worker, academy.env);
            const gateway = new HttpAccessGateway('/academy/api/session', browser.request);
            await gateway.exchange(firstPaidCode);

            const events = createMemoryLearnerEventRepository([localProgress()]);
            const storage = memoryStorage();
            const client = syncClient(browser, events, storage);
            expect((await client.connect()).phase).toBe('sign-in');

            client.beginGoogleLink();
            expect(new URL(browser.location).pathname).toBe('/academy/api/auth/google/start');
            expect((await followGoogleCallback(browser, 'paid-owner-subject', provider)).status).toBe(302);
            expect(await client.completeGoogleReturn()).toBe(true);
            expect(client.status.phase).toBe('pair');
            const initialized = await client.initializeAccountProfile();
            expect(initialized.error).toBeNull();
            expect(initialized.phase).toBe('ready');
            expect(client.status.entitlement).toMatchObject({ entitlement: 'academy', status: 'active' });
            expect(await events.readAll()).toEqual([localProgress()]);

            const rejectedSecondCode = await client.redeemCode(secondPaidCode);
            expect(rejectedSecondCode.phase).toBe('conflict');
            expect(rejectedSecondCode.error).toContain('already has a paid code');
            expect(academy.db.rows<{ redeemed_at: number | null }>(
                'SELECT redeemed_at FROM purchases WHERE id = ?', 'paid-access-one',
            )[0]?.redeemed_at).toEqual(expect.any(Number));
            expect(academy.db.rows<{ redeemed_at: number | null }>(
                'SELECT redeemed_at FROM purchases WHERE id = ?', 'paid-access-two',
            )[0]?.redeemed_at).toBeNull();
            expect(JSON.stringify(academy.db.rows('SELECT google_sub_hash FROM accounts'))).not.toContain('paid-owner-subject');

            const recoveryBrowser = new AcademyAccessBrowser(worker, academy.env);
            const recovered = syncClient(recoveryBrowser, events, storage);
            await recovered.beginRecovery();
            expect(new URL(recoveryBrowser.location).pathname).toBe('/academy/api/auth/google/start');
            expect((await followGoogleCallback(recoveryBrowser, 'paid-owner-subject', provider)).status).toBe(302);
            expect(await recovered.completeGoogleReturn()).toBe(true);
            expect(recovered.status).toMatchObject({
                phase: 'ready',
                entitlement: { entitlement: 'academy', status: 'active' },
            });
            expect(await events.readAll()).toEqual([localProgress()]);
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM srs_events')[0]?.count).toBe(1);
        } finally {
            academy.close();
        }
    });
});

function syncClient(
    browser: AcademyAccessBrowser,
    events: ReturnType<typeof createMemoryLearnerEventRepository>,
    storage: AcademySyncStorage,
): AcademySyncClient {
    return new AcademySyncClient({
        events,
        storage,
        request: browser.request,
        navigate: browser.navigate,
        currentUrl: () => browser.location,
        replaceUrl: browser.replaceUrl,
        online: () => true,
    });
}

async function seedAnonymousInvite(env: Env): Promise<void> {
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES ('ucl-2026', ?1, 10, 'seed', ?2, NULL, NULL, 0)",
    ).bind(await inviteCodeHash(env, 'OPEN2026'), Date.now() - 1).run();
}

async function seedPaidCode(env: Env, purchaseId: string): Promise<string> {
    const now = Date.now();
    // Fixture a fulfilled purchase directly; this suite never calls Stripe or Checkout.
    await env.ACADEMY_DB.prepare(
        'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
        + "VALUES (?1, ?2, 500, 'paid', ?3, ?3)",
    ).bind(purchaseId, `test-claim-${purchaseId}`, now).run();
    const inviteId = await mintPaidInvite(env, purchaseId, now);
    await env.ACADEMY_DB.prepare('UPDATE purchases SET invite_id = ?1 WHERE id = ?2')
        .bind(inviteId, purchaseId).run();
    return derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, purchaseId);
}

function localProgress(): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: '11111111-1111-4111-8111-111111111111',
        at: LOCAL_PROGRESS_AT,
        kind: 'profile-changed',
        profile: { displayName: 'Retained local learner', learningReason: 'private', portraitId: 'map' },
    };
}

function memoryStorage(): AcademySyncStorage {
    const values = new Map<string, string>();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: key => { values.delete(key); },
    };
}

async function followGoogleCallback(
    browser: AcademyAccessBrowser,
    subject: string,
    provider: TestGoogleOidcProvider,
): Promise<Response> {
    vi.stubGlobal('fetch', provider.fetch);
    try {
        return await browser.followGoogleCallback(subject, provider);
    } finally {
        vi.unstubAllGlobals();
    }
}
