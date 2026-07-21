// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AcademySyncClient, type AcademySyncStorage } from '../../src/academy/account/sync-client';
import { HttpAccessGateway, resumeInviteSession } from '../../src/academy/access/gateway';
import { createMemoryLearnerEventRepository, type LearnerEvent } from '../../src/academy/domain/learner-record';
import { derivePaidInviteCode } from '../../workers/yomu-academy/src/crypto';
import type { Env } from '../../workers/yomu-academy/src/env';
import { inviteCodeHash, mintPaidInvite } from '../../workers/yomu-academy/src/invites';
import worker from '../../workers/yomu-academy/src/index';
import { AcademyAccessBrowser, TestGoogleOidcProvider } from './helpers/academy-access-browser';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const PROFILE_SYNC_STORAGE_KEY = 'yomu:academy:profile-sync:v1';
const LOCAL_PROGRESS_AT = Date.now();
// One provider for the whole file: the Worker caches Google's JWKS at module
// scope, so per-test providers with distinct keys under one kid would poison
// later tests.
const provider = new TestGoogleOidcProvider();

describe('Academy access client and Worker integration', () => {
    it('does not rotate a healthy unlinked session when profile access asks for Google', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedClassInvite(academy.env);
            const browser = new AcademyAccessBrowser(worker, academy.env);
            const gateway = new HttpAccessGateway('/academy/api/session', browser.request);
            await gateway.exchange('OPEN2026');
            const before = academy.db.rows<{ token_hash: string }>('SELECT token_hash FROM sessions')[0]!.token_hash;
            const client = syncClient(browser, createMemoryLearnerEventRepository(), memoryStorage());

            expect((await client.connect()).phase).toBe('sign-in');

            expect(academy.db.rows<{ token_hash: string }>('SELECT token_hash FROM sessions')[0]!.token_hash).toBe(before);
            expect(academy.db.rows<{ count: number }>(
                "SELECT COUNT(*) AS count FROM rate_limits WHERE bucket = 'session-resume'",
            )[0]?.count).toBe(0);
        } finally {
            academy.close();
        }
    });

    it('gates the reusable class invite on Google sign-in and retains local encrypted progress across reload', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedClassInvite(academy.env);
            const browser = new AcademyAccessBrowser(worker, academy.env);
            const gateway = new HttpAccessGateway('/academy/api/session', browser.request);
            const session = await gateway.exchange(' open2026 ');
            const events = createMemoryLearnerEventRepository([localProgress()]);
            const storage = memoryStorage();
            const client = syncClient(browser, events, storage);

            expect(session.source).toBe('cloudflare');
            expect(session.accountRequired).toBe(true);
            // No anonymous server profile: the class invite must sign in first.
            expect((await client.connect()).phase).toBe('sign-in');

            client.beginGoogleLink();
            expect(new URL(browser.location).pathname).toBe('/academy/api/auth/google/start');
            expect((await followGoogleCallback(browser, 'class-learner-subject', provider)).status).toBe(302);
            expect(await client.completeGoogleReturn()).toBe(true);
            expect(client.status.phase).toBe('pair');
            const connected = await client.initializeAccountProfile();
            expect(connected.error).toBeNull();
            expect(connected.phase).toBe('ready');
            expect(client.status.profile?.accountId).not.toBeNull();
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

    it('proves two-device pairing, complete export, corrupt-key recovery, isolation, revocation, and deletion in D1', async () => {
        const academy = createSqliteAcademy();
        const subject = 'lifecycle-owner-subject';
        try {
            await seedClassInvite(academy.env);
            const sourceBrowser = new AcademyAccessBrowser(worker, academy.env);
            const sourceGateway = new HttpAccessGateway('/academy/api/session', sourceBrowser.request);
            await sourceGateway.exchange('OPEN2026');
            const sourceEvents = createMemoryLearnerEventRepository(
                Array.from({ length: 205 }, (_, index) => lifecycleProgress(index + 1)),
            );
            const sourceStorage = memoryStorage();
            const source = syncClient(sourceBrowser, sourceEvents, sourceStorage);
            expect((await source.connect()).phase).toBe('sign-in');
            source.beginGoogleLink();
            expect((await followGoogleCallback(sourceBrowser, subject, provider)).status).toBe(302);
            await source.completeGoogleReturn();
            expect((await source.initializeAccountProfile()).phase).toBe('ready');

            const sourceProfileId = source.status.profile?.profileId;
            const sourceAccountId = source.status.account?.accountId;
            if (!sourceProfileId || !sourceAccountId) throw new Error('Source account profile was not persisted.');
            expect(sourceProfileId).toMatch(/^[0-9a-f-]{36}$/u);
            expect(sourceAccountId).toMatch(/^[0-9a-f-]{36}$/u);
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM srs_events')[0]?.count).toBe(205);

            const targetBrowser = new AcademyAccessBrowser(worker, academy.env);
            const targetGateway = new HttpAccessGateway('/academy/api/session', targetBrowser.request);
            await targetGateway.exchange('OPEN2026');
            const targetEvents = createMemoryLearnerEventRepository();
            const targetStorage = memoryStorage();
            const target = syncClient(targetBrowser, targetEvents, targetStorage);
            await target.connect();
            target.beginGoogleLink();
            expect((await followGoogleCallback(targetBrowser, subject, provider)).status).toBe(302);
            await target.completeGoogleReturn();
            expect(target.status.phase).toBe('pair');

            const ticket = await source.startPairing();
            expect((await target.claimPairing(ticket.code)).phase).toBe('ready');
            expect(target.status.profile?.profileId).toBe(sourceProfileId);
            expect((await targetEvents.readAll()).map(event => event.eventId)).toEqual(
                (await sourceEvents.readAll()).map(event => event.eventId),
            );
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM profiles')[0]?.count).toBe(1);
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM profile_devices')[0]?.count).toBe(2);

            const targetOnly = lifecycleProgress(206);
            await targetEvents.append([targetOnly]);
            target.queueLocalEvents([targetOnly]);
            expect((await target.retry()).phase).toBe('ready');
            expect((await source.retry()).phase).toBe('ready');
            expect((await sourceEvents.readAll()).map(event => event.eventId)).toContain(targetOnly.eventId);

            const completeExportBlob = await source.exportData();
            if (!completeExportBlob) throw new Error('Account export did not produce the fallback Blob.');
            const completeExport = JSON.parse(await completeExportBlob.text()) as {
                account: { accountId: string };
                profile: { profileId: string };
                eventPage: { events: unknown[]; hasMore: boolean };
            };
            expect(completeExport.account.accountId).toBe(sourceAccountId);
            expect(completeExport.profile.profileId).toBe(sourceProfileId);
            expect(completeExport.eventPage).toMatchObject({ hasMore: false });
            expect(completeExport.eventPage.events).toHaveLength(206);

            await target.signOut();
            expect(target.status.phase).toBe('signed-out');
            expect((await targetBrowser.request('/academy/api/session')).status).toBe(401);
            await target.beginRecovery();
            expect((await followGoogleCallback(targetBrowser, subject, provider)).status).toBe(302);
            expect(await target.completeGoogleReturn()).toBe(true);
            expect(target.status.phase).toBe('ready');

            // Model a malformed persisted key/profile record while the local
            // canonical learner events remain intact. The client must refuse to
            // guess a key, expose pairing/reset, and recover through profile deletion.
            targetStorage.setItem(PROFILE_SYNC_STORAGE_KEY, '{"profile":"corrupt"}');
            const corrupted = syncClient(targetBrowser, targetEvents, targetStorage);
            expect((await corrupted.connect()).phase).toBe('pair');
            await corrupted.deleteRemoteData('profile');
            const profileReceipt = academy.db.rows<{
                scope: string;
                profile_count: number;
                device_count: number;
                synced_record_count: number;
            }>('SELECT scope, profile_count, device_count, synced_record_count FROM deletion_receipts')[0];
            expect(profileReceipt).toEqual({ scope: 'profile', profile_count: 1, device_count: 3, synced_record_count: 206 });

            await corrupted.beginRecovery();
            expect((await followGoogleCallback(targetBrowser, subject, provider)).status).toBe(302);
            await corrupted.completeGoogleReturn();
            expect(corrupted.status.phase).toBe('pair');
            expect((await corrupted.initializeAccountProfile()).phase).toBe('ready');
            expect(corrupted.status.profile?.profileId).not.toBe(sourceProfileId);
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM srs_events')[0]?.count).toBe(206);

            const isolatedBrowser = new AcademyAccessBrowser(worker, academy.env);
            const isolatedGateway = new HttpAccessGateway('/academy/api/session', isolatedBrowser.request);
            await isolatedGateway.exchange('OPEN2026');
            const isolated = syncClient(isolatedBrowser, createMemoryLearnerEventRepository(), memoryStorage());
            await isolated.connect();
            isolated.beginGoogleLink();
            expect((await followGoogleCallback(isolatedBrowser, 'different-lifecycle-subject', provider)).status).toBe(302);
            await isolated.completeGoogleReturn();
            expect((await isolated.initializeAccountProfile()).phase).toBe('ready');
            const isolatedExportBlob = await isolated.exportData();
            if (!isolatedExportBlob) throw new Error('Isolated export did not produce the fallback Blob.');
            expect(JSON.parse(await isolatedExportBlob.text()).eventPage.events).toHaveLength(0);
            const crossAccountTicket = await corrupted.startPairing();
            await expect(isolated.claimPairing(crossAccountTicket.code)).rejects.toMatchObject({ status: 409 });
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM profiles')[0]?.count).toBe(2);

            const finalExportBlob = await corrupted.exportData();
            if (!finalExportBlob) throw new Error('Recovered export did not produce the fallback Blob.');
            const finalExport = JSON.parse(await finalExportBlob.text()) as {
                eventPage: { events: unknown[] };
            };
            expect(finalExport.eventPage.events).toHaveLength(206);
            const recoveredProfileId = corrupted.status.profile?.profileId;
            if (!recoveredProfileId) throw new Error('Recovered profile was not persisted.');
            await corrupted.deleteRemoteData('account');
            expect((await targetBrowser.request('/academy/api/session')).status).toBe(401);
            expect(academy.db.rows('SELECT id FROM accounts WHERE public_id = ?', sourceAccountId)).toHaveLength(0);
            expect(academy.db.rows('SELECT id FROM profiles WHERE public_id = ?', recoveredProfileId)).toHaveLength(0);
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM srs_events')[0]?.count).toBe(0);
            expect(academy.db.rows<{
                profile_count: number;
                device_count: number;
                synced_record_count: number;
            }>(
                "SELECT profile_count, device_count, synced_record_count FROM deletion_receipts WHERE scope = 'account'",
            )[0]).toEqual({ profile_count: 1, device_count: 1, synced_record_count: 206 });

            const retainedReceipts = JSON.stringify(academy.db.rows('SELECT * FROM deletion_receipts'));
            expect(retainedReceipts).not.toContain(subject);
            expect(retainedReceipts).not.toContain(sourceAccountId);
            expect(retainedReceipts).not.toContain(sourceProfileId);

            const afterDeleteBrowser = new AcademyAccessBrowser(worker, academy.env);
            const afterDelete = syncClient(afterDeleteBrowser, createMemoryLearnerEventRepository(), memoryStorage());
            await afterDelete.beginRecovery();
            expect((await followGoogleCallback(afterDeleteBrowser, subject, provider)).status).toBe(302);
            await afterDelete.completeGoogleReturn();
            expect(afterDelete.status.phase).toBe('sign-in');
            expect(academy.db.rows('SELECT id FROM accounts WHERE public_id = ?', sourceAccountId)).toHaveLength(0);
        } finally {
            academy.close();
        }
    }, 20_000);

    it('gates paid codes on Google, limits an account to one redemption, and recovers its retained progress', async () => {
        const academy = createSqliteAcademy();
        try {
            const firstPaidCode = await seedPaidCode(academy.env, 'paid-access-one');
            const secondPaidCode = await seedPaidCode(academy.env, 'paid-access-two');
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

    it('rotates an expired short session in place and restores the account, profile, and entitlement', async () => {
        const academy = createSqliteAcademy();
        try {
            const paidCode = await seedPaidCode(academy.env, 'resume-paid-purchase');
            const browser = new AcademyAccessBrowser(worker, academy.env);
            const gateway = new HttpAccessGateway('/academy/api/session', browser.request);
            await gateway.exchange(paidCode);
            const events = createMemoryLearnerEventRepository([localProgress()]);
            const storage = memoryStorage();
            const client = syncClient(browser, events, storage);
            await client.connect();
            client.beginGoogleLink();
            expect((await followGoogleCallback(browser, 'resume-owner-subject', provider)).status).toBe(302);
            await client.completeGoogleReturn();
            expect((await client.initializeAccountProfile()).phase).toBe('ready');

            // Expire the eight-hour authorization while the fixed 30-day
            // offline-resume window stays open — the state a learner returns
            // to the next morning.
            const expiredTokenHash = academy.db.rows<{ token_hash: string }>('SELECT token_hash FROM sessions')[0]!.token_hash;
            academy.db.rows(
                'UPDATE sessions SET created_at = ?, expires_at = ? RETURNING public_id',
                Date.now() - 9 * 60 * 60_000,
                Date.now() - 60 * 60_000,
            );

            const reloaded = syncClient(browser, events, storage);
            const restored = await reloaded.connect();
            expect(restored.phase).toBe('ready');
            expect(restored.account).not.toBeNull();
            expect(restored.entitlement).toMatchObject({ entitlement: 'academy', status: 'active' });
            expect(await events.readAll()).toEqual([localProgress()]);

            // The cookie was rotated on the same session row: no invite was
            // spent, no second session or account appeared, and the old
            // token hash is gone.
            const sessions = academy.db.rows<{ token_hash: string; expires_at: number }>('SELECT token_hash, expires_at FROM sessions');
            expect(sessions).toHaveLength(1);
            expect(sessions[0]!.token_hash).not.toBe(expiredTokenHash);
            expect(sessions[0]!.expires_at).toBeGreaterThan(Date.now());
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM accounts')[0]?.count).toBe(1);
            expect(academy.db.rows<{ redeemed_by_account_id: string | null }>(
                'SELECT redeemed_by_account_id FROM purchases',
            )[0]?.redeemed_by_account_id).not.toBeNull();

            // The checkpoint-restore path rotates through the same endpoint.
            const rotatedAgain = await resumeInviteSession(browser.request);
            expect(rotatedAgain).toMatchObject({ accountRequired: true });
            expect(rotatedAgain!.expiresAt).toBeGreaterThan(Date.now());

            // Once the 30-day window itself closes, resume refuses and the
            // learner lands on the sign-in gate instead of a broken screen.
            academy.db.rows(
                'UPDATE sessions SET created_at = ?, expires_at = ?, offline_resume_until = ? RETURNING public_id',
                Date.now() - 40 * 24 * 60 * 60_000,
                Date.now() - 39 * 24 * 60 * 60_000,
                Date.now() - 10 * 24 * 60 * 60_000,
            );
            expect(await resumeInviteSession(browser.request)).toBeNull();
            const lapsed = syncClient(browser, events, storage);
            expect((await lapsed.connect()).phase).toBe('sign-in');
        } finally {
            academy.close();
        }
    });

    it('refuses recovery and redemption for a Google subject that does not own the entitlement', async () => {
        const academy = createSqliteAcademy();
        try {
            const paidCode = await seedPaidCode(academy.env, 'owned-paid-purchase');
            await seedClassInvite(academy.env);

            // The rightful owner binds the paid code.
            const ownerBrowser = new AcademyAccessBrowser(worker, academy.env);
            const ownerGateway = new HttpAccessGateway('/academy/api/session', ownerBrowser.request);
            await ownerGateway.exchange(paidCode);
            const owner = syncClient(ownerBrowser, createMemoryLearnerEventRepository(), memoryStorage());
            await owner.connect();
            owner.beginGoogleLink();
            expect((await followGoogleCallback(ownerBrowser, 'entitled-owner-subject', provider)).status).toBe(302);
            await owner.completeGoogleReturn();
            expect((await owner.initializeAccountProfile()).phase).toBe('ready');

            // A different Google subject cannot walk in through recovery: it
            // owns no Academy account, so the OIDC callback refuses the link.
            const intruderBrowser = new AcademyAccessBrowser(worker, academy.env);
            const intruder = syncClient(intruderBrowser, createMemoryLearnerEventRepository(), memoryStorage());
            await intruder.beginRecovery();
            const refused = await followGoogleCallback(intruderBrowser, 'intruder-subject', provider);
            expect(refused.status).toBe(302);
            expect(new URL(intruderBrowser.location).searchParams.get('account')).toBe('failed');
            expect(await intruder.completeGoogleReturn()).toBe(true);
            expect(intruder.status).toMatchObject({ phase: 'sign-in' });
            expect(intruder.status.error).toContain('No account data was changed');
            expect(intruderBrowser.location).not.toContain('account=');
            expect(academy.db.rows<{ count: number }>('SELECT COUNT(*) AS count FROM accounts')[0]?.count).toBe(1);

            // With its own legitimate class session and account, the intruder
            // still cannot re-bind the owner's already-redeemed code.
            const intruderGateway = new HttpAccessGateway('/academy/api/session', intruderBrowser.request);
            await intruderGateway.exchange('OPEN2026');
            await intruder.connect();
            intruder.beginGoogleLink();
            expect((await followGoogleCallback(intruderBrowser, 'intruder-subject', provider)).status).toBe(302);
            await intruder.completeGoogleReturn();
            expect((await intruder.initializeAccountProfile()).phase).toBe('ready');
            const theft = await intruder.redeemCode(paidCode);
            expect(theft.phase).toBe('conflict');
            expect(theft.error).toContain('already bound to another account');
            const redemption = academy.db.rows<{ redeemed_by_account_id: string }>(
                'SELECT redeemed_by_account_id FROM purchases WHERE id = ?', 'owned-paid-purchase',
            )[0]!;
            const ownerAccount = academy.db.rows<{ id: string }>(
                'SELECT a.id FROM accounts a JOIN sessions s ON s.account_id = a.id JOIN invites i ON i.id = s.invite_id WHERE i.kind = ?', 'paid',
            )[0]!;
            expect(redemption.redeemed_by_account_id).toBe(ownerAccount.id);
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

async function seedClassInvite(env: Env): Promise<void> {
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES ('ucl-2026', ?1, 10, 'seed', ?2, NULL, NULL, 1)",
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

function lifecycleProgress(index: number): LearnerEvent {
    const prefix = index.toString(16).padStart(8, '0');
    const suffix = index.toString(16).padStart(12, '0');
    return {
        schemaVersion: 1,
        eventId: `${prefix}-1111-4111-8111-${suffix}`,
        at: LOCAL_PROGRESS_AT + index,
        kind: 'profile-changed',
        profile: { displayName: `Lifecycle ${index}`, learningReason: 'private', portraitId: 'map' },
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
