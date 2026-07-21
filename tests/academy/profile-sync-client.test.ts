import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACADEMY_ACCOUNT_ACTION_EVENT, type AcademyAccountAction } from '../../src/academy/account/actions';
import {
    AcademySyncClient,
    createSyncingLearnerEventRepository,
    type AcademySyncStorage,
} from '../../src/academy/account/sync-client';
import { createMemoryLearnerEventRepository, type LearnerEvent } from '../../src/academy/domain/learner-record';
import { renderProfileSyncScreen } from '../../src/academy/ui/profile-sync-screen';
import { transitionAcademyRoute } from '../../src/academy/routing/route-history';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROFILE_ID = '66666666-6666-4666-8666-666666666666';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const PAIRING_ID = '44444444-4444-4444-8444-444444444444';
const PAIRING_CODE = '0234-5678-ABCD-EFGH-JKMN';

beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
});

describe('Academy encrypted profile sync client', () => {
    it('keeps anonymous learners local until they choose encrypted sync', async () => {
        const request = vi.fn();
        const events = createMemoryLearnerEventRepository();
        const client = new AcademySyncClient({ events, request });
        const repository = createSyncingLearnerEventRepository(events, client);

        await repository.append([event('anon-event', 'Rie')]);

        expect(client.status.phase).toBe('local');
        expect(request).not.toHaveBeenCalled();
        expect((await events.readAll())).toHaveLength(1);
    });

    it('ignores malformed persisted keys and envelopes without contacting the server', () => {
        const request = vi.fn();
        const storage = memoryStorage(JSON.stringify({
            profile: profile(), key: 'not-a-32-byte-key', cursor: 0, envelopes: {}, eventSyncIds: {}, lastSyncAt: null,
        }));
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request, storage });

        expect(client.status).toMatchObject({ phase: 'local', profile: null, pending: 0 });
        expect(request).not.toHaveBeenCalled();
    });

    it('never pins or uploads a key that cannot be stored durably', async () => {
        const request = fakeApi();
        const events = createMemoryLearnerEventRepository([event('storage-failure-event', 'Still local')]);
        const storage: AcademySyncStorage = {
            getItem: () => null,
            setItem: () => { throw new Error('Storage full'); },
            removeItem: () => {},
        };
        const client = new AcademySyncClient({ events, request, storage });

        expect((await client.connect()).phase).toBe('error');
        expect(client.status.error).toContain('could not save the encryption key');
        expect(request.mock.calls.map(([path]) => path)).not.toContain('/academy/api/profile/key');
        expect(request.mock.calls.map(([path]) => path)).not.toContain('/academy/api/srs/push');
        expect(await events.readAll()).toHaveLength(1);
    });

    it('connects an optional durable account without asking Google for learner payloads', async () => {
        const request = fakeApi({ accountId: ACCOUNT_ID });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });

        await client.connect();

        expect(client.status.account?.identity.label).toBe('Aakash#419213');
        expect(request.mock.calls.map(([path]) => path)).toContain('/academy/api/account');
        expect(JSON.stringify(request.mock.calls)).not.toContain('googleToken');
    });

    it('rotates an expired session cookie once and restores the account instead of demanding a new invite', async () => {
        const api = fakeApi({ accountId: ACCOUNT_ID });
        let expired = true;
        const request = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
            if (String(path) === '/academy/api/session/resume') {
                expect(init?.method).toBe('POST');
                expired = false;
                return response({
                    sessionId: 'rotated-session',
                    expiresAt: Date.now() + 60_000,
                    offlineResumeUntil: Date.now() + 120_000,
                    accountRequired: true,
                });
            }
            if (expired) return response({ error: 'No active session.' }, 401);
            return api(path, init);
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });

        const status = await client.connect();

        expect(status.phase).toBe('pair');
        expect(status.account?.identity.label).toBe('Aakash#419213');
        expect(request.mock.calls.filter(([path]) => String(path) === '/academy/api/session/resume')).toHaveLength(1);
    });

    it('surfaces the sign-in gate unchanged when the resume window has closed', async () => {
        const request = vi.fn(async (path: RequestInfo | URL) => String(path) === '/academy/api/session/resume'
            ? response({ error: 'No resumable session.' }, 401)
            : response({ error: 'No active session.' }, 401));
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });

        expect((await client.connect()).phase).toBe('sign-in');
        expect(request.mock.calls.filter(([path]) => String(path) === '/academy/api/session/resume')).toHaveLength(1);

        // The refusal is remembered: reconnecting does not burn another
        // rotation attempt on a session that is definitively gone.
        expect((await client.connect()).phase).toBe('sign-in');
        expect(request.mock.calls.filter(([path]) => String(path) === '/academy/api/session/resume')).toHaveLength(1);
    });

    it('requires explicit first-device setup before an account can mint its sync key', async () => {
        const request = fakeApi({ accountId: ACCOUNT_ID });
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository([event('first-device-event', 'First device')]),
            request,
        });

        expect((await client.connect()).phase).toBe('pair');
        expect(request.mock.calls.map(([path]) => path)).not.toContain('/academy/api/srs/push');
        expect((await client.initializeAccountProfile()).phase).toBe('ready');
        expect(request.mock.calls.map(([path]) => path)).toContain('/academy/api/srs/push');
    });

    it('lets only one empty account device pin the first encryption key', async () => {
        const request = fakeApi({ accountId: ACCOUNT_ID });
        const first = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        const second = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        expect((await first.connect()).phase).toBe('pair');
        expect((await second.connect()).phase).toBe('pair');

        const results = await Promise.all([first.initializeAccountProfile(), second.initializeAccountProfile()]);
        expect(results.map(result => result.phase).sort()).toEqual(['pair', 'ready']);
        expect(results.find(result => result.phase === 'pair')?.error).toContain('different encryption key');
        expect(request.mock.calls.filter(([path]) => path === '/academy/api/profile/key')).toHaveLength(2);
    });

    it('gates paid profiles on Google sign-in while a server-designated invite can connect anonymously', async () => {
        const navigate = vi.fn();
        const paidRequest = fakeApi({ profileStatus: 401, profileError: 'Sign in with Google to use an Academy profile.' });
        const paid = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request: paidRequest,
            navigate,
        });

        expect((await paid.connect()).phase).toBe('sign-in');
        expect(paidRequest.mock.calls.filter(([path]) => path === '/academy/api/session')).toHaveLength(1);
        expect(paidRequest.mock.calls.filter(([path]) => path === '/academy/api/session/resume')).toHaveLength(0);
        paid.beginGoogleLink();
        expect(navigate).toHaveBeenCalledWith('/academy/api/auth/google/start');

        const anonymousClass = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request: fakeApi() });
        expect((await anonymousClass.connect()).phase).toBe('ready');
        expect(anonymousClass.status.profile?.accountId).toBeNull();
    });

    it('surfaces pending activation and binds one paid code to one account', async () => {
        const pending = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request: fakeApi({ accountId: ACCOUNT_ID, profileStatus: 403, profileError: 'A paid entitlement must be redeemed by this account.' }),
        });
        expect((await pending.connect()).phase).toBe('pending');
        expect(pending.status.account?.accountId).toBe(ACCOUNT_ID);
        expect(pending.status.entitlement).toEqual({ entitlement: 'none' });

        const active = await pending.redeemCode('PAID-CODE');
        expect(active.phase).toBe('claimed');
        expect(active.entitlement).toEqual({ entitlement: 'academy', status: 'active', redeemedAt: 123 });

        const conflict = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request: fakeApi({ redeemStatus: 409, redeemError: 'This account already has a paid code.' }),
        });
        expect((await conflict.redeemCode('SECOND-CODE')).phase).toBe('conflict');
        expect(conflict.status.error).toContain('already has a paid code');
    });

    it('starts account recovery before Google and requires pairing for an existing encrypted profile', async () => {
        const navigate = vi.fn();
        const recoveryRequest = fakeApi();
        const recovering = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request: recoveryRequest, navigate });
        await recovering.beginRecovery();
        expect(recoveryRequest.mock.calls.find(([path]) => path === '/academy/api/auth/google/recovery')?.[1]?.method).toBe('POST');
        expect(navigate).toHaveBeenCalledWith('/academy/api/auth/google/start');

        const existing = new AcademySyncClient({
            events: createMemoryLearnerEventRepository([event('local-event', 'Local learner')]),
            request: fakeApi({ accountId: ACCOUNT_ID, pull: [remoteEnvelope()] }),
        });
        expect((await existing.connect()).phase).toBe('pair');
        expect(existing.status.pending).toBe(0);
        expect((await existing.initializeAccountProfile()).phase).toBe('pair');
        expect(existing.status.error).toContain('already has encrypted history');
    });

    it('rehydrates the signed-in account after Google returns and removes only the callback marker', async () => {
        let currentUrl = 'https://yomureader.com/academy/?qa-run=stream-7&account=linked#journal';
        const replaceUrl = vi.fn((url: string) => {
            currentUrl = new URL(url, currentUrl).href;
        });
        const request = fakeApi({ accountId: ACCOUNT_ID });
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request,
            currentUrl: () => currentUrl,
            replaceUrl,
        });

        expect(await client.completeGoogleReturn()).toBe(true);
        expect(client.status).toMatchObject({ phase: 'pair', account: { accountId: ACCOUNT_ID } });
        expect(replaceUrl).toHaveBeenCalledWith('/academy/?qa-run=stream-7#journal');
        expect(await client.completeGoogleReturn()).toBe(false);
        expect(request.mock.calls.filter(([path]) => path === '/academy/api/profile')).toHaveLength(1);
    });

    it('scrubs a failed Google callback without claiming that the account changed', async () => {
        let currentUrl = 'https://yomureader.com/academy/?qa-run=stream-7&account=failed#journal';
        const replaceUrl = vi.fn((url: string) => {
            currentUrl = new URL(url, currentUrl).href;
        });
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request: fakeApi({ profileStatus: 401 }),
            currentUrl: () => currentUrl,
            replaceUrl,
        });

        expect(await client.completeGoogleReturn()).toBe(true);
        expect(client.status.phase).toBe('sign-in');
        expect(client.status.error).toContain('No account data was changed');
        expect(replaceUrl).toHaveBeenCalledWith('/academy/?qa-run=stream-7#journal');
        expect(currentUrl).not.toContain('account=');
    });

    it('does not touch browser history or account endpoints outside a Google return', async () => {
        const request = fakeApi();
        const replaceUrl = vi.fn();
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request,
            currentUrl: () => 'https://yomureader.com/academy/?qa-run=stream-7',
            replaceUrl,
        });

        expect(await client.completeGoogleReturn()).toBe(false);
        expect(replaceUrl).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });

    it('never pushes a provisional key while an account profile is awaiting pairing', async () => {
        const storage = memoryStorage();
        const localEvents = createMemoryLearnerEventRepository([event('provisional-event', 'Local')]);
        const provisional = new AcademySyncClient({ events: localEvents, request: fakeApi(), storage });
        await provisional.connect();

        const accountRequest = fakeApi({ accountId: ACCOUNT_ID, profileId: OTHER_PROFILE_ID });
        const target = new AcademySyncClient({ events: localEvents, request: accountRequest, storage });
        expect((await target.connect()).phase).toBe('pair');
        expect(target.status.profile?.profileId).toBe(OTHER_PROFILE_ID);
        const pushesBefore = accountRequest.mock.calls.filter(([path]) => path === '/academy/api/srs/push').length;

        const repository = createSyncingLearnerEventRepository(localEvents, target);
        await repository.append([event('while-pairing', 'Still local')]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect((await target.retry()).phase).toBe('pair');
        expect(accountRequest.mock.calls.filter(([path]) => path === '/academy/api/srs/push')).toHaveLength(pushesBefore);
    });

    it('treats a pairing code as one-use from this device too', async () => {
        let claimed = false;
        const request = fakeApi({
            pairingClaim: async () => {
                if (claimed) return response({ error: 'Pairing code was already used.' }, 409);
                claimed = true;
                return response({
                    pairingId: PAIRING_ID, profileId: PROFILE_ID, deviceId: DEVICE_ID,
                    keyEnvelope: await pairingEnvelope(PAIRING_CODE, PAIRING_ID),
                });
            },
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });

        await client.claimPairing(PAIRING_CODE);
        await expect(client.claimPairing(PAIRING_CODE)).rejects.toThrow('already used');
    });

    it('persists a claimed key before account refresh can fail', async () => {
        const storage = memoryStorage();
        const request = fakeApi({
            accountId: ACCOUNT_ID,
            accountStatus: 503,
            pairingClaim: async () => response({
                pairingId: PAIRING_ID,
                profileId: PROFILE_ID,
                deviceId: DEVICE_ID,
                keyEnvelope: await pairingEnvelope(PAIRING_CODE, PAIRING_ID),
            }),
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request, storage });

        expect((await client.claimPairing(PAIRING_CODE)).phase).toBe('retry');
        expect(storage.getItem('yomu:academy:profile-sync:v1')).toContain(PROFILE_ID);
    });

    it('stops pairing follow-up when the recovered key cannot be stored', async () => {
        const storage: AcademySyncStorage = {
            getItem: () => null,
            setItem: () => { throw new Error('Storage full'); },
            removeItem: () => {},
        };
        const request = fakeApi({
            pairingClaim: async () => response({
                pairingId: PAIRING_ID,
                profileId: PROFILE_ID,
                deviceId: DEVICE_ID,
                keyEnvelope: await pairingEnvelope(PAIRING_CODE, PAIRING_ID),
            }),
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request, storage });

        expect((await client.claimPairing(PAIRING_CODE)).phase).toBe('error');
        expect(request.mock.calls.some(([path]) => String(path).startsWith('/academy/api/srs/pull'))).toBe(false);
    });

    it('re-establishes account metadata when retrying a paired key', async () => {
        let failAccount = true;
        const storage = memoryStorage();
        const api = fakeApi({
            accountId: ACCOUNT_ID,
            pairingClaim: async () => response({
                pairingId: PAIRING_ID,
                profileId: PROFILE_ID,
                deviceId: DEVICE_ID,
                keyEnvelope: await pairingEnvelope(PAIRING_CODE, PAIRING_ID),
            }),
        });
        const request = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
            if (String(path) === '/academy/api/account' && failAccount) {
                failAccount = false;
                return response({ error: 'Account unavailable.' }, 503);
            }
            return api(path, init);
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request, storage });

        expect((await client.claimPairing(PAIRING_CODE)).phase).toBe('retry');
        expect((await client.retry()).phase).toBe('ready');
        expect(client.status.account?.accountId).toBe(ACCOUNT_ID);
    });

    it('pulls remote ids before queueing retained local history after pairing', async () => {
        const retained = event('review-event', 'Retained');
        const request = fakeApi({
            pairingClaim: async () => response({
                pairingId: PAIRING_ID,
                profileId: PROFILE_ID,
                deviceId: DEVICE_ID,
                keyEnvelope: await pairingEnvelope(PAIRING_CODE, PAIRING_ID),
            }),
            pull: [await encryptedRemoteEnvelope(retained)],
        });
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository([retained]),
            request,
        });

        expect((await client.claimPairing(PAIRING_CODE)).phase).toBe('ready');
        expect(request.mock.calls.filter(([path]) => path === '/academy/api/srs/push')).toHaveLength(0);
    });

    it('wraps the source profile key with the Worker HKDF and pairing AAD contract', async () => {
        let wrapped: { keyVersion: number; salt: string; nonce: string; ciphertext: string } | undefined;
        const request = fakeApi({ pairingPut: envelope => { wrapped = envelope; } });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        expect((await client.startPairing()).code).toBe(PAIRING_CODE);
        expect(await unwrapPairingEnvelope(wrapped!, PAIRING_CODE, PAIRING_ID)).toHaveLength(32);
    });

    it('uploads only encrypted event envelopes and never plaintext learner data', async () => {
        const events = createMemoryLearnerEventRepository([event('secret-event', 'Aakash Secret Story')]);
        const request = fakeApi();
        const client = new AcademySyncClient({ events, request });

        await client.connect();

        const push = request.mock.calls.find(([path]) => path === '/academy/api/srs/push');
        const body = String(push?.[1]?.body);
        expect(body).toContain('ciphertext');
        expect(body).not.toContain('Aakash Secret Story');
        expect(body).not.toContain('profile-changed');
        expect(body).not.toContain('providerToken');
    });

    it('keeps only conflicting envelopes after a partially accepted Worker 409', async () => {
        const request = fakeApi({ pushConflictCount: 1 });
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository([
                event('conflicting-event', 'Private'),
                event('accepted-event', 'Accepted'),
            ]),
            request,
        });

        expect((await client.connect()).phase).toBe('conflict');
        expect(client.status.pending).toBe(1);
    });

    it('retains the only local sync key across sign-out and account recovery', async () => {
        const storage = memoryStorage();
        const request = fakeApi({ accountId: ACCOUNT_ID });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request, storage });
        await client.connect();
        await client.initializeAccountProfile();
        const keyedState = storage.getItem('yomu:academy:profile-sync:v1');

        await client.signOut();
        expect(client.status.phase).toBe('signed-out');
        expect(storage.getItem('yomu:academy:profile-sync:v1')).toBe(keyedState);

        const recovered = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request: fakeApi({ accountId: ACCOUNT_ID }),
            storage,
        });
        expect((await recovered.connect()).phase).toBe('ready');
    });

    it('keeps delayed resume work invalid after logout has reached the server', async () => {
        let releaseResume!: (response: Response) => void;
        let markResumeStarted!: () => void;
        const resumeStarted = new Promise<void>(resolve => { markResumeStarted = resolve; });
        const delayedResume = new Promise<Response>(resolve => { releaseResume = resolve; });
        const request = vi.fn(async (path: RequestInfo | URL) => {
            const url = String(path);
            if (url === '/academy/api/session/resume') {
                markResumeStarted();
                return delayedResume;
            }
            if (url === '/academy/api/logout') return response({ ok: true });
            return response({ error: 'No active session.' }, 401);
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });

        const connecting = client.connect();
        await resumeStarted;
        const signingOut = client.signOut();
        await vi.waitFor(() => expect(
            request.mock.calls.some(([path]) => path === '/academy/api/logout'),
        ).toBe(true));
        releaseResume(response({
            sessionId: 'too-late',
            expiresAt: Date.now() + 60_000,
            offlineResumeUntil: Date.now() + 120_000,
            accountRequired: true,
        }));
        await Promise.all([connecting, signingOut]);

        expect(client.status).toMatchObject({ phase: 'signed-out', account: null, entitlement: null });
        expect(request.mock.calls.filter(([path]) => path === '/academy/api/profile')).toHaveLength(1);
    });

    it('keeps post-sign-out learning queued without attempting the revoked session', async () => {
        const storage = memoryStorage();
        const request = fakeApi({ accountId: ACCOUNT_ID });
        const events = createMemoryLearnerEventRepository();
        const client = new AcademySyncClient({ events, request, storage });
        await client.connect();
        await client.initializeAccountProfile();
        await client.signOut();
        const callsAfterSignOut = request.mock.calls.length;

        await createSyncingLearnerEventRepository(events, client).append([event('signed-out-event', 'Local')]);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(client.status).toMatchObject({ phase: 'signed-out', pending: 1 });
        expect(request.mock.calls).toHaveLength(callsAfterSignOut);
    });

    it('queues offline work and retries without blocking the local event write', async () => {
        let online = false;
        const request = fakeApi();
        const events = createMemoryLearnerEventRepository([event('offline-event', 'Offline learner')]);
        const client = new AcademySyncClient({ events, request, online: () => online });

        await client.connect();
        expect(client.status.phase).toBe('offline');
        expect(client.status.pending).toBe(1);
        expect(request.mock.calls.map(([path]) => path)).not.toContain('/academy/api/srs/push');

        online = true;
        await client.retry();
        expect(client.status.phase).toBe('ready');
        expect(client.status.pending).toBe(0);
    });

    it('flushes locally committed review state exactly once when connectivity returns', async () => {
        let online = false;
        const request = fakeApi();
        const events = createMemoryLearnerEventRepository();
        const client = new AcademySyncClient({ events, request, online: () => online });
        const repository = createSyncingLearnerEventRepository(events, client);

        await client.connect();
        await repository.append([reviewEvent('reconnect-review')]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(client.status).toMatchObject({ phase: 'offline', pending: 1 });
        expect(request.mock.calls.map(([path]) => path)).not.toContain('/academy/api/srs/push');

        online = true;
        expect((await client.resumeOnReconnect()).phase).toBe('ready');
        await client.resumeOnReconnect();

        const pushes = request.mock.calls.filter(([path]) => path === '/academy/api/srs/push');
        expect(pushes).toHaveLength(1);
        expect(String(pushes[0]?.[1]?.body)).not.toContain('reconnect-review');
        expect(client.status.pending).toBe(0);
    });

    it('does not reconnect a signed-out/recovering account or provision an anonymous local learner', async () => {
        const localRequest = vi.fn();
        const local = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request: localRequest });
        await local.resumeOnReconnect();
        expect(localRequest).not.toHaveBeenCalled();

        const request = fakeApi({ accountId: ACCOUNT_ID });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request, navigate: vi.fn() });
        await client.connect();
        await client.initializeAccountProfile();
        await client.signOut();
        const callsAfterSignOut = request.mock.calls.length;

        await client.resumeOnReconnect();
        expect(request.mock.calls).toHaveLength(callsAfterSignOut);
        expect(client.status.phase).toBe('signed-out');

        await client.beginRecovery();
        const callsDuringRecovery = request.mock.calls.length;
        await client.resumeOnReconnect();
        expect(request.mock.calls).toHaveLength(callsDuringRecovery);
        expect(client.status.phase).toBe('recovery');
    });

    it('reprojects the same remote envelope idempotently without duplicate reviews', async () => {
        const storage = memoryStorage();
        const sourceEvents = createMemoryLearnerEventRepository([event('review-event', 'Remote name')]);
        const sourceRequests = fakeApi();
        const source = new AcademySyncClient({ events: sourceEvents, request: sourceRequests, storage });
        await source.connect();
        const pushed = JSON.parse(String(sourceRequests.mock.calls.find(([path]) => path === '/academy/api/srs/push')?.[1]?.body))
            .events[0];

        const targetEvents = createMemoryLearnerEventRepository();
        const targetStorage = memoryStorage(storage.getItem('yomu:academy:profile-sync:v1')!);
        const remote = { ...pushed, cursor: 1, sourceDeviceId: DEVICE_ID, receivedAt: Date.now() };
        const target = new AcademySyncClient({
            events: targetEvents,
            storage: targetStorage,
            request: fakeApi({ pull: [remote] }),
        });

        await target.retry();
        await target.retry();
        const history = await targetEvents.readAll();
        expect(history).toHaveLength(1);
        expect(history[0]?.kind).toBe('review-rated');
    });

    it('authenticates event identity and timestamps as AES-GCM additional data', async () => {
        const storage = memoryStorage();
        const sourceRequests = fakeApi();
        const source = new AcademySyncClient({
            events: createMemoryLearnerEventRepository([event('authenticated-event', 'Private')]),
            request: sourceRequests,
            storage,
        });
        await source.connect();
        const pushed = JSON.parse(String(sourceRequests.mock.calls.find(([path]) => path === '/academy/api/srs/push')?.[1]?.body))
            .events[0];
        const tampered = { ...pushed, occurredAt: pushed.occurredAt + 1, cursor: 1, sourceDeviceId: DEVICE_ID, receivedAt: 100 };
        const targetEvents = createMemoryLearnerEventRepository();
        const target = new AcademySyncClient({
            events: targetEvents,
            request: fakeApi({ pull: [tampered] }),
            storage: memoryStorage(storage.getItem('yomu:academy:profile-sync:v1')!),
        });

        expect((await target.retry()).phase).toBe('retry');
        expect(await targetEvents.readAll()).toHaveLength(0);
    });

    it('exports the selected profile and sends an explicit delete confirmation', async () => {
        const request = fakeApi({
            exportBody: { schemaVersion: 2, eventPage: { events: [], nextCursor: 0, hasMore: false, exportCursor: null } },
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        const blob = await client.exportData();
        if (!blob) throw new Error('fallback export blob missing');
        expect(await readBlobText(blob)).toContain('schemaVersion');
        await client.deleteRemoteData('profile');
        const deletion = request.mock.calls.find(([path, init]) => path === '/academy/api/profile' && init?.method === 'DELETE');
        expect(JSON.parse(String(deletion?.[1]?.body))).toEqual({ confirmation: 'delete-profile' });
        expect(client.status.phase).toBe('local');
    });

    it('assembles every bounded export page into one complete download', async () => {
        const first = await encryptedRemoteEnvelope(event('export-page-one', 'One'));
        const second = await encryptedRemoteEnvelope(event('export-page-two', 'Two'));
        const continuation = `v1.${'a'.repeat(43)}.7.${'b'.repeat(64)}`;
        const request = fakeApi({
            exportPages: {
                start: {
                    schemaVersion: 2,
                    profile: profile(),
                    eventPage: { events: [{ ...first, cursor: 7 }], nextCursor: 7, hasMore: true, exportCursor: continuation },
                },
                [continuation]: {
                    schemaVersion: 2,
                    eventPage: { events: [{ ...second, cursor: 9 }], nextCursor: 9, hasMore: false, exportCursor: null },
                },
            },
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        const blob = await client.exportData();
        if (!blob) throw new Error('fallback export blob missing');
        const exported = JSON.parse(await readBlobText(blob)) as {
            eventPage: { events: Array<{ id: string }>; nextCursor: number; hasMore: boolean };
        };
        expect(exported.eventPage.events.map(item => item.id)).toEqual([first.id, second.id]);
        expect(exported.eventPage).toMatchObject({ nextCursor: 9, hasMore: false });
        const exportCalls = request.mock.calls.filter(([path]) => path === '/academy/api/profile/export');
        expect(exportCalls).toHaveLength(2);
        expect(exportCalls.every(([, init]) => init?.method === 'POST')).toBe(true);
        expect(JSON.parse(String(exportCalls[1]?.[1]?.body))).toEqual({ cursor: continuation });
    });

    it('streams meaningful large ciphertext volume without retaining an aggregate browser copy', async () => {
        const pageCount = 12;
        const rowsPerPage = 200;
        const ciphertext = 'A'.repeat(8 * 1024);
        const base = await encryptedRemoteEnvelope(event('large-export', 'Large'));
        const exportPages: Record<string, unknown> = {};
        let pageKey = 'start';
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
            const nextCursor = (pageIndex + 1) * rowsPerPage;
            const continuation = pageIndex === pageCount - 1
                ? null
                : `v1.${'a'.repeat(43)}.${nextCursor.toString(36)}.${String(pageIndex).padStart(64, 'b')}`;
            exportPages[pageKey] = {
                ...(pageIndex === 0 ? { schemaVersion: 2, profile: profile() } : { schemaVersion: 2 }),
                eventPage: {
                    events: Array.from({ length: rowsPerPage }, (_, rowIndex) => ({
                        ...base,
                        cursor: pageIndex * rowsPerPage + rowIndex + 1,
                        ciphertext,
                    })),
                    nextCursor,
                    hasMore: continuation !== null,
                    exportCursor: continuation,
                },
            };
            if (continuation) pageKey = continuation;
        }
        const request = fakeApi({ exportPages });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        let totalBytes = 0;
        let largestChunk = 0;
        let writes = 0;
        const destination = new WritableStream<Uint8Array>({
            write(chunk) {
                totalBytes += chunk.byteLength;
                largestChunk = Math.max(largestChunk, chunk.byteLength);
                writes += 1;
            },
        });
        expect(await client.exportData(destination)).toBeNull();
        expect(totalBytes).toBeGreaterThan(18 * 1024 * 1024);
        expect(largestChunk).toBeLessThan(10 * 1024);
        expect(writes).toBeGreaterThan(pageCount * rowsPerPage);
        expect(request.mock.calls.filter(([path]) => path === '/academy/api/profile/export')).toHaveLength(pageCount);
    }, 20_000);

    it('fails the bounded Blob fallback with an explicit safety error', async () => {
        const envelope = await encryptedRemoteEnvelope(event('fallback-cap', 'Cap'));
        const request = fakeApi({
            exportBody: {
                schemaVersion: 2,
                eventPage: {
                    events: [{ ...envelope, cursor: 1, ciphertext: 'A'.repeat(2048) }],
                    nextCursor: 1,
                    hasMore: false,
                    exportCursor: null,
                },
            },
        });
        const client = new AcademySyncClient({
            events: createMemoryLearnerEventRepository(),
            request,
            exportFallbackByteLimit: 1024,
        });
        await client.connect();
        await expect(client.exportData()).rejects.toThrow('in-memory safety limit');
    });

    it('keeps source and target pairing controls keyboard-ready in the Journal', async () => {
        const onBack = vi.fn();
        const onClaim = vi.fn(async () => {});
        const screen = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'ready', profile: profile(), account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null },
            onBack,
            onConnect: vi.fn(async () => {}),
            onRetry: vi.fn(async () => {}),
            onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: Date.now() + 600_000 })),
            onClaimPairing: onClaim,
            onExport: vi.fn(async () => {}),
            onSignOut: vi.fn(async () => {}),
            onDelete: vi.fn(async () => {}),
        });
        document.body.replaceChildren(screen);
        screen.querySelector<HTMLButtonElement>('.academy-lesson-overview-back')?.click();
        expect(onBack).toHaveBeenCalledOnce();

        [...screen.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Pair another device')?.click();
        await vi.waitFor(() => expect(screen.querySelector('.academy-pairing-code')?.textContent).toBe(PAIRING_CODE));

        const target = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'pair', profile: { ...profile(), accountId: ACCOUNT_ID }, account: account(), entitlement: { entitlement: 'academy', status: 'active', redeemedAt: 123 }, pending: 0, lastSyncAt: null, error: null },
            onBack,
            onConnect: vi.fn(async () => {}),
            onRetry: vi.fn(async () => {}),
            onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: onClaim,
            onExport: vi.fn(async () => {}),
            onSignOut: vi.fn(async () => {}),
            onDelete: vi.fn(async () => {}),
        });
        document.body.replaceChildren(target);
        const input = target.querySelector<HTMLInputElement>('input[name="pairingCode"]')!;
        await Promise.resolve();
        expect(document.activeElement).toBe(input);
        expect(target.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('One-time pairing code');
        expect(input.autocomplete).toBe('one-time-code');
        expect(target.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain('device that already has your history');
        expect(target.textContent).toContain('Delete cloud learning data');
        expect(target.textContent).toContain('Delete account');
        input.value = PAIRING_CODE;
        input.closest('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(onClaim).toHaveBeenCalledWith(PAIRING_CODE);
    });

    it('continues into onboarding only after a recovered paid account is ready', async () => {
        const onContinue = vi.fn();
        const ready = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'ready', profile: { ...profile(), accountId: ACCOUNT_ID }, account: account(), entitlement: { entitlement: 'academy', status: 'active', redeemedAt: 123 }, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
            onContinue,
        });
        const pending = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'pending', profile: null, account: account(), entitlement: { entitlement: 'none' }, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
            onContinue,
        });

        expect(ready.textContent).toContain('Continue to Academy');
        expect(pending.textContent).not.toContain('Continue to Academy');
        // Offline first-run learners without a linked account must stay at the
        // Google gate; offline devices holding an account-bound profile may go on.
        const offlineAnonymous = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'offline', profile: null, account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
            onContinue,
        });
        const offlineLinked = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'offline', profile: { ...profile(), accountId: ACCOUNT_ID }, account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
            onContinue,
        });
        expect(offlineAnonymous.textContent).not.toContain('Continue to Academy');
        expect(offlineLinked.textContent).toContain('Continue to Academy');
        const readyAnonymous = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'ready', profile: profile(), account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
            onContinue,
        });
        expect(readyAnonymous.textContent).not.toContain('Continue to Academy');
        [...ready.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Continue to Academy')?.click();
        await Promise.resolve();
        expect(onContinue).toHaveBeenCalledOnce();
    });

    it('routes purchase activation through the account action boundary', async () => {
        let action: AcademyAccountAction | undefined;
        document.addEventListener(ACADEMY_ACCOUNT_ACTION_EVENT, event => {
            event.preventDefault();
            const detail = (event as CustomEvent<{ action: AcademyAccountAction; resolve: () => void }>).detail;
            action = detail.action;
            detail.resolve();
        }, { once: true });
        const screen = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'ready', profile: { ...profile(), accountId: ACCOUNT_ID }, account: account(), entitlement: { entitlement: 'none' }, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
        });
        document.body.replaceChildren(screen);
        const input = screen.querySelector<HTMLInputElement>('input[name="academyCode"]')!;
        expect(screen.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Paid Academy code');
        expect(screen.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain('Paid codes must be linked to Google');
        expect(screen.textContent).toContain('A paid code can be activated once');
        expect(screen.textContent).toContain('a Google account can hold one paid code');
        expect(screen.textContent).toContain('Class invitations also require signing in with Google');
        expect(screen.textContent).not.toContain('without an account');
        input.value = 'PAID-CODE';
        input.closest('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(action).toEqual({ kind: 'redeem', code: 'PAID-CODE' }));
    });

    it('does not offer pairing before a paid session completes Google sign-in', () => {
        const screen = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'sign-in', profile: null, account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
        });

        expect(screen.querySelector('input[name="pairingCode"]')).toBeNull();
        expect(screen.textContent).toContain('Sign in with Google');
        expect(screen.textContent).toContain('Every Academy invitation, including class invitations, is linked to a Google account');
        expect(screen.textContent).not.toContain('without an account');
        expect(screen.textContent).toContain('Recover another account');
    });

    it('keeps activation conflicts actionable and moves focus to another code', async () => {
        const screen = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'conflict', profile: { ...profile(), accountId: ACCOUNT_ID }, account: account(), entitlement: { entitlement: 'none' }, pending: 0, lastSyncAt: null, error: 'This paid code is already bound to another account.' },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: 200 })),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
        });
        document.body.replaceChildren(screen);

        [...screen.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Try another code')?.click();
        await Promise.resolve();

        expect(document.activeElement).toBe(screen.querySelector('input[name="academyCode"]'));
        expect(screen.textContent).toContain('Recover another account');
    });

    it('preserves the accessible status structure when an account action fails', async () => {
        const screen = renderProfileSyncScreen({
            language: 'en',
            status: { phase: 'ready', profile: profile(), account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null },
            onBack: vi.fn(), onConnect: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => { throw new Error('Pairing service is unavailable.'); }),
            onClaimPairing: vi.fn(async () => {}), onExport: vi.fn(async () => {}), onSignOut: vi.fn(async () => {}), onDelete: vi.fn(async () => {}),
        });
        document.body.replaceChildren(screen);
        const pair = [...screen.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Pair another device')!;
        pair.click();
        await vi.waitFor(() => expect(screen.querySelector('.academy-profile-sync-status-detail')?.textContent).toBe('Pairing service is unavailable.'));

        const status = screen.querySelector('.academy-profile-sync-status')!;
        expect(status.getAttribute('role')).toBe('alert');
        expect(status.getAttribute('aria-live')).toBe('assertive');
        expect(screen.querySelector('.academy-profile-sync-status-title')?.textContent).toBe('Action needed');
        expect(pair.disabled).toBe(false);
        expect(pair.hasAttribute('aria-busy')).toBe(false);
    });

    it('uses real route history when returning from the Journal profile surface', () => {
        const opened = transitionAcademyRoute(
            { route: 'journal', routeHistory: [{ route: 'campus' }], presentationMode: 'story' },
            { kind: 'push', route: 'profile-sync' },
        );
        expect(transitionAcademyRoute(opened, { kind: 'back' })).toEqual({
            route: 'journal', routeHistory: [{ route: 'campus' }], presentationMode: 'story',
        });
    });
});

function event(eventId: string, name: string): LearnerEvent {
    return eventId === 'review-event'
        ? reviewEvent(eventId)
        : { schemaVersion: 1, eventId, at: 100, kind: 'profile-changed', profile: { displayName: name, learningReason: 'private', portraitId: 'map' } };
}

function reviewEvent(eventId: string): LearnerEvent {
    return { schemaVersion: 1, eventId, at: 100, kind: 'review-rated', reviewItemId: 'yomu-local:word', rating: 'good' };
}

function profile() {
    return { profileId: PROFILE_ID, deviceId: DEVICE_ID, accountId: null, keyVersion: 1, createdAt: 1 };
}

function account() {
    return {
        accountId: ACCOUNT_ID,
        identity: { displayName: 'Aakash', discriminator: '419213', label: 'Aakash#419213' },
        nameChosen: true,
        avatarKey: null,
        boardVisible: false,
        shareAvatar: false,
        classes: [],
    } as const;
}

function fakeApi(options: {
    accountId?: string;
    accountStatus?: number;
    profileId?: string;
    pairingClaim?: () => Promise<Response>;
    pairingPut?: (envelope: { keyVersion: number; salt: string; nonce: string; ciphertext: string }) => void;
    pull?: unknown[];
    exportBody?: unknown;
    exportPages?: Readonly<Record<string, unknown>>;
    profileStatus?: number;
    profileError?: string;
    redeemStatus?: number;
    redeemError?: string;
    pushConflictCount?: number;
} = {}) {
    let profileKeyCommitment: string | null = null;
    return vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
        const url = String(path);
        if (url === '/academy/api/profile' && init?.method !== 'DELETE') {
            if (options.profileStatus) return response({ error: options.profileError ?? 'Profile unavailable.' }, options.profileStatus);
            return response({ profileId: options.profileId ?? PROFILE_ID, deviceId: DEVICE_ID, accountId: options.accountId ?? null, keyVersion: 1, createdAt: 1 });
        }
        if (url === '/academy/api/session') {
            return response({
                sessionId: 'live-session',
                expiresAt: Date.now() + 60_000,
                offlineResumeUntil: Date.now() + 120_000,
                accountRequired: true,
            });
        }
        if (url === '/academy/api/account') {
            if (options.accountStatus) return response({ error: 'Account unavailable.' }, options.accountStatus);
            return response({
                accountId: options.accountId ?? ACCOUNT_ID, displayName: 'Aakash', displayTag: 'Aakash#419213', nameChosen: true,
                avatarKey: null, boardVisible: false, shareAvatar: false, classes: [],
            });
        }
        if (url === '/academy/api/entitlement') return response({ entitlement: 'none' });
        if (url === '/academy/api/profile/key' && init?.method === 'POST') {
            const body = JSON.parse(String(init.body)) as { keyCommitment: string };
            if (profileKeyCommitment && profileKeyCommitment !== body.keyCommitment) {
                return response({ error: 'This profile already has a different encryption key. Pair this device instead.' }, 409);
            }
            profileKeyCommitment = body.keyCommitment;
            return response({ initialized: true });
        }
        if (url === '/academy/api/entitlement/redeem') {
            if (options.redeemStatus) return response({ error: options.redeemError ?? 'Code conflict.' }, options.redeemStatus);
            return response({ entitlement: 'academy', status: 'active', redeemedAt: 123 });
        }
        if (url === '/academy/api/auth/google/recovery') return response({ recovery: true }, 201);
        if (url === '/academy/api/pairings' && init?.method === 'POST') {
            return response({ pairingId: PAIRING_ID, code: PAIRING_CODE, expiresAt: Date.now() + 600_000 }, 201);
        }
        if (url === `/academy/api/pairings/${PAIRING_ID}` && init?.method === 'PUT') {
            options.pairingPut?.(JSON.parse(String(init.body)));
            return response({ pairingId: PAIRING_ID, ready: true });
        }
        if (url === '/academy/api/pairings/claim') return options.pairingClaim ? options.pairingClaim() : response({ error: 'No pairing.' }, 404);
        if (url === '/academy/api/srs/push') {
            const events = (JSON.parse(String(init?.body)) as { events: { id: string }[] }).events;
            const conflicts = events.slice(0, options.pushConflictCount ?? 0).map(event => event.id);
            const accepted = events.length - conflicts.length;
            return response({ accepted, inserted: accepted, duplicates: 0, conflicts }, conflicts.length ? 409 : 200);
        }
        if (url.startsWith('/academy/api/srs/pull')) return response({ events: options.pull ?? [], nextCursor: options.pull?.length ? 1 : 0, hasMore: false });
        if (url.endsWith('/export')) {
            const cursor = (JSON.parse(String(init?.body ?? '{}')) as { cursor?: string }).cursor ?? 'start';
            return response(options.exportPages?.[cursor]
                ?? options.exportBody
                ?? { schemaVersion: 2, eventPage: { events: [], nextCursor: 0, hasMore: false, exportCursor: null } });
        }
        if (url === '/academy/api/logout' || url === '/academy/api/profile') return response({ deleted: true });
        return response({ error: `Unhandled ${url}` }, 404);
    });
}

async function pairingEnvelope(code: string, pairingId: string) {
    const salt = new Uint8Array(16).fill(1);
    const nonce = new Uint8Array(12).fill(2);
    const compact = code.replaceAll('-', '');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(compact), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('yomu-academy-device-pairing-v1'),
    }, material, 256);
    const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
    const payload = new Uint8Array(32).fill(3);
    const additionalData = new TextEncoder().encode(`pairing:${pairingId}:v1`);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData }, key, payload));
    return { keyVersion: 1, salt: base64(salt), nonce: base64(nonce), ciphertext: base64(encrypted) };
}

async function encryptedRemoteEnvelope(value: LearnerEvent) {
    const id = '55555555-5555-4555-8555-555555555555';
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(3), 'AES-GCM', false, ['encrypt']);
    const nonce = new Uint8Array(12).fill(4);
    const additionalData = new TextEncoder().encode(`event:${id}:${value.at}:v1`);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData },
        key,
        new TextEncoder().encode(JSON.stringify(value)),
    ));
    return { id, cursor: 1, occurredAt: value.at, keyVersion: 1, nonce: base64(nonce), ciphertext: base64(ciphertext), sourceDeviceId: DEVICE_ID, receivedAt: 101 };
}

async function unwrapPairingEnvelope(
    envelope: { keyVersion: number; salt: string; nonce: string; ciphertext: string },
    code: string,
    pairingId: string,
): Promise<Uint8Array> {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.replaceAll('-', '')), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: cryptoBuffer(fromBase64(envelope.salt)),
        info: new TextEncoder().encode('yomu-academy-device-pairing-v1'),
    }, material, 256);
    const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
    const additionalData = new TextEncoder().encode(`pairing:${pairingId}:v${envelope.keyVersion}`);
    return new Uint8Array(await crypto.subtle.decrypt({
        name: 'AES-GCM', iv: cryptoBuffer(fromBase64(envelope.nonce)), additionalData,
    }, key, cryptoBuffer(fromBase64(envelope.ciphertext))));
}

function remoteEnvelope() {
    return {
        cursor: 1,
        id: '55555555-5555-4555-8555-555555555555',
        occurredAt: 100,
        keyVersion: 1,
        nonce: base64(new Uint8Array(12)),
        ciphertext: base64(new Uint8Array(17)),
        sourceDeviceId: DEVICE_ID,
        receivedAt: 100,
    };
}

function response(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

async function readBlobText(blob: Blob): Promise<string> {
    // Node's native Blob has text(), while Vitest's jsdom Blob is a different
    // realm and may omit it. FileReader is the browser-standard fallback and
    // keeps this assertion about exported bytes rather than the test runtime.
    if (typeof blob.text === 'function') return blob.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read exported Academy profile data.'));
        reader.readAsText(blob);
    });
}

function memoryStorage(seed?: string): AcademySyncStorage {
    let value = seed ?? null;
    return { getItem: () => value, setItem: (_key, next) => { value = next; }, removeItem: () => { value = null; } };
}

function base64(bytes: Uint8Array): string {
    let value = '';
    bytes.forEach(byte => { value += String.fromCharCode(byte); });
    return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64(value: string): Uint8Array {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function cryptoBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer as ArrayBuffer;
}
