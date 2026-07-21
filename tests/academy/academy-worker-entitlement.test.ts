// @vitest-environment node
import worker from '../../workers/yomu-academy/src/index';
import { linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import type { ExecutionContext } from '../../workers/yomu-academy/src/cf';
import { derivePaidInviteCode, hmacSha256Hex, toBase64Url } from '../../workers/yomu-academy/src/crypto';
import { bindPaidEntitlement } from '../../workers/yomu-academy/src/entitlements';
import type { Env } from '../../workers/yomu-academy/src/env';
import { inviteCodeHash, mintPaidInvite } from '../../workers/yomu-academy/src/invites';
import { handleMedia, type MediaManifest } from '../../workers/yomu-academy/src/media';
import { handleGoogleCallback, handleGoogleStart } from '../../workers/yomu-academy/src/oauth';
import { ensureSessionProfile } from '../../workers/yomu-academy/src/profiles';
import { handleClaim, handleCreateCheckout, handleStripeWebhook } from '../../workers/yomu-academy/src/stripe';
import { activeSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const context: ExecutionContext = {
    waitUntil(promise): void {
        void promise.catch(() => undefined);
    },
};

const signingKey = crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
);

async function dispatch(env: Env, request: Request): Promise<Response> {
    return worker.fetch(request, env, context);
}

function mutation(env: Env, path: string, method: 'POST' | 'DELETE', body: unknown, cookie?: string): Request {
    return new Request(`${env.ACADEMY_ORIGIN}${path}`, {
        method,
        headers: {
            origin: env.ACADEMY_ORIGIN,
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            'cf-connecting-ip': '198.51.100.24',
            ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
    });
}

function get(env: Env, path: string, cookie?: string): Request {
    return new Request(`${env.ACADEMY_ORIGIN}${path}`, {
        headers: {
            'cf-connecting-ip': '198.51.100.24',
            ...(cookie ? { cookie } : {}),
        },
    });
}

function cookie(response: Response): string {
    const value = response.headers.get('set-cookie')?.split(';')[0];
    if (!value) throw new Error('response cookie missing');
    return value;
}

async function createSession(env: Env, code: string): Promise<{ response: Response; cookie: string }> {
    const response = await dispatch(env, mutation(env, '/academy/api/session', 'POST', { code }));
    return { response, cookie: response.status === 200 ? cookie(response) : '' };
}

async function seedInvite(
    env: Env,
    code: string,
    id: string = crypto.randomUUID(),
    accountRequired = true,
): Promise<void> {
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES (?1, ?2, 20, 'seed', ?3, NULL, NULL, ?4)",
    ).bind(id, await inviteCodeHash(env, code), Date.now() - 1, accountRequired ? 1 : 0).run();
}

async function insertGoogleAccount(env: Env, id: string, subject: string, discriminator: string, now: number): Promise<void> {
    await env.ACADEMY_DB.prepare(
        'INSERT INTO accounts '
        + '(id, public_id, google_sub_hash, display_name, name_chosen, discriminator, board_visible, share_avatar, created_at, updated_at) '
        + "VALUES (?1, ?2, ?3, 'Learner', 0, ?4, 0, 0, ?5, ?5)",
    ).bind(
        id,
        crypto.randomUUID(),
        await hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `google-sub:${subject}`),
        discriminator,
        now,
    ).run();
}

async function signedIdToken(env: Env, nonce: string, subject: string, now: number): Promise<{ token: string; jwk: JsonWebKey }> {
    const pair = await signingKey;
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    Object.assign(jwk, { kid: 'academy-entitlement-test-key', alg: 'RS256', use: 'sig' });
    const encode = (value: unknown): string => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
    const head = encode({ alg: 'RS256', kid: 'academy-entitlement-test-key' });
    const claims = encode({
        iss: 'https://accounts.google.com',
        aud: env.GOOGLE_OIDC_CLIENT_ID,
        exp: Math.floor(now / 1000) + 3600,
        iat: Math.floor(now / 1000),
        nonce,
        sub: subject,
        email: 'must-not-persist@example.invalid',
    });
    const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, new TextEncoder().encode(`${head}.${claims}`),
    );
    return { token: `${head}.${claims}.${toBase64Url(new Uint8Array(signature))}`, jwk };
}

async function signInWithGoogle(env: Env, sessionCookie: string, subject: string, now = Date.now()): Promise<Response> {
    const start = await handleGoogleStart(new Request(`${env.ACADEMY_ORIGIN}/academy/api/auth/google/start`, {
        headers: {
            cookie: sessionCookie,
            'sec-fetch-site': 'same-origin',
            'cf-connecting-ip': '198.51.100.24',
        },
    }), env, () => now);
    const authorization = new URL(start.headers.get('location') ?? '');
    const flowCookie = cookie(start);
    const signed = await signedIdToken(env, authorization.searchParams.get('nonce') ?? '', subject, now);
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
        if (String(input) === 'https://oauth2.googleapis.com/token') {
            return new Response(JSON.stringify({ id_token: signed.token }), { status: 200 });
        }
        if (String(input) === 'https://www.googleapis.com/oauth2/v3/certs') {
            return new Response(JSON.stringify({ keys: [signed.jwk] }), { status: 200 });
        }
        throw new Error(`unexpected Google request: ${String(input)}`);
    };
    const callback = new URL(`${env.ACADEMY_ORIGIN}/academy/api/auth/google/callback`);
    callback.searchParams.set('code', 'test-authorization-code');
    callback.searchParams.set('state', authorization.searchParams.get('state') ?? '');
    callback.searchParams.set('iss', 'https://accounts.google.com');
    return handleGoogleCallback(new Request(callback, {
        headers: {
            cookie: `${sessionCookie}; ${flowCookie}`,
            'cf-connecting-ip': '198.51.100.24',
        },
    }), env, () => now + 1, fetcher);
}

describe('Academy Google account and paid entitlement policy', () => {
    it('account-gates even a legacy account-free invite row in the migrated schema', async () => {
        const academy = createSqliteAcademy();
        try {
            // A pre-0008 row with account_required = 0 no longer bypasses the
            // gate: the Worker never reads the column and requires sign-in.
            await seedInvite(academy.env, 'OPEN2026', 'legacy-anonymous', false);
            const legacy = await createSession(academy.env, 'OPEN2026');
            expect(legacy.response.status).toBe(200);
            expect(await legacy.response.json()).toMatchObject({ accountRequired: true });
            expect((await dispatch(academy.env, get(academy.env, '/academy/api/profile', legacy.cookie))).status).toBe(401);
        } finally {
            academy.close();
        }
    });

    it('keeps paid-code sessions auth-only until the owning Google account is bound', async () => {
        const academy = createSqliteAcademy();
        const now = Date.now();
        const env: Env = {
            ...academy.env,
            ACADEMY_MEDIA: {
                async get(key) {
                    return key === 'lesson/audio.wav' ? {
                        key,
                        size: 1,
                        httpEtag: 'test-etag',
                        body: new Response(new Uint8Array([1])).body!,
                    } : null;
                },
                async head() {
                    return null;
                },
            },
        };
        const mediaManifest: MediaManifest = {
            version: 1,
            bucket: 'test-media',
            objects: [{ key: 'lesson/audio.wav', contentType: 'audio/wav', bytes: 1, sha256: 'a'.repeat(64) }],
        };
        const mediaRequest = (sessionCookie: string): Promise<Response> => handleMedia(
            get(env, '/academy/media/audio/lesson/audio.wav', sessionCookie),
            env,
            () => now + 10,
            mediaManifest,
        );
        try {
            await seedInvite(env, 'OPEN2026', 'invite-ucl-media');
            const ucl = await createSession(env, 'OPEN2026');
            expect(await ucl.response.clone().json()).toMatchObject({ accountRequired: true });
            // Class invites are account-gated too: media 401 until sign-in.
            await expect(mediaRequest(ucl.cookie)).rejects.toMatchObject({ status: 401 });
            expect((await signInWithGoogle(env, ucl.cookie, 'ucl-media-subject', now)).status).toBe(302);
            expect((await mediaRequest(ucl.cookie)).status).toBe(200);

            const purchaseId = crypto.randomUUID();
            await env.ACADEMY_DB.prepare(
                'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
                + "VALUES (?1, 'media-claim', 500, 'paid', ?2, ?2)",
            ).bind(purchaseId, now).run();
            const inviteId = await mintPaidInvite(env, purchaseId, now);
            await env.ACADEMY_DB.prepare('UPDATE purchases SET invite_id = ?1 WHERE id = ?2')
                .bind(inviteId, purchaseId).run();
            const code = await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, purchaseId);

            const owner = await createSession(env, code);
            expect(await owner.response.clone().json()).toMatchObject({ accountRequired: true });
            await expect(mediaRequest(owner.cookie)).rejects.toMatchObject({ status: 401 });

            expect((await signInWithGoogle(env, owner.cookie, 'media-owner', now + 1)).status).toBe(302);
            expect((await mediaRequest(owner.cookie)).status).toBe(200);

            const competing = await createSession(env, code);
            await expect(mediaRequest(competing.cookie)).rejects.toMatchObject({ status: 401 });
        } finally {
            academy.close();
        }
    });

    it('account-gates every server profile, including the reusable class invite', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedInvite(academy.env, 'OPEN2026', 'invite-ucl');
            await seedInvite(academy.env, 'STAFF2026', 'invite-staff');
            const ucl = await createSession(academy.env, 'OPEN2026');
            const secondUcl = await createSession(academy.env, 'OPEN2026');
            const staff = await createSession(academy.env, 'STAFF2026');
            expect(ucl.response.status).toBe(200);
            expect(secondUcl.response.status).toBe(200);
            expect(staff.response.status).toBe(200);
            expect(await ucl.response.json()).toMatchObject({ accountRequired: true });
            expect(await staff.response.json()).toMatchObject({ accountRequired: true });
            expect((await dispatch(academy.env, get(academy.env, '/academy/api/profile', ucl.cookie))).status).toBe(401);
            expect((await activeSession(
                get(academy.env, '/academy/api/session', secondUcl.cookie), academy.env, Date.now(),
            ))?.account_id).toBeNull();
            expect((await dispatch(academy.env, get(
                academy.env, '/academy/api/profile', secondUcl.cookie,
            ))).status).toBe(401);
            expect((await dispatch(academy.env, get(academy.env, '/academy/api/profile', staff.cookie))).status).toBe(401);

            expect((await signInWithGoogle(academy.env, ucl.cookie, 'ucl-class-subject')).status).toBe(302);
            expect((await dispatch(academy.env, get(academy.env, '/academy/api/profile', ucl.cookie))).status).toBe(200);

            expect((await signInWithGoogle(academy.env, staff.cookie, 'staff-google-subject')).status).toBe(302);
            const profile = await dispatch(academy.env, get(academy.env, '/academy/api/profile', staff.cookie));
            expect(profile.status).toBe(200);
            expect(await profile.json()).toMatchObject({ accountId: expect.any(String) });

            const recovery = await dispatch(academy.env, mutation(
                academy.env, '/academy/api/auth/google/recovery', 'POST', {},
            ));
            await expect(signInWithGoogle(academy.env, cookie(recovery), 'unknown-recovery-subject'))
                .rejects.toMatchObject({ status: 403 });
            expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(2);
        } finally {
            academy.close();
        }
    });

    it('does not recover a bare account row left by an interrupted account link', async () => {
        const academy = createSqliteAcademy();
        const subject = 'orphaned-google-subject';
        const now = Date.now();
        try {
            await insertGoogleAccount(academy.env, 'orphan-account', subject, '800001', now);

            const recovery = await dispatch(academy.env, mutation(
                academy.env, '/academy/api/auth/google/recovery', 'POST', {},
            ));
            expect(recovery.status).toBe(201);
            expect(await recovery.clone().json()).toMatchObject({ accountRequired: true });
            await expect(signInWithGoogle(academy.env, cookie(recovery), subject, now + 1))
                .rejects.toMatchObject({ status: 403 });
            expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(0);
            expect(academy.db.rows('SELECT * FROM sessions WHERE account_id IS NOT NULL')).toHaveLength(0);
        } finally {
            academy.close();
        }
    });

    it('recovers a paid account when entitlement binding completed before profile attachment', async () => {
        const academy = createSqliteAcademy();
        const subject = 'paid-interrupted-subject';
        const now = Date.now();
        try {
            await insertGoogleAccount(academy.env, 'paid-interrupted-account', subject, '800002', now);
            await academy.env.ACADEMY_DB.prepare(
                'INSERT INTO purchases '
                + '(id, claim_hash, amount_pence, status, created_at, fulfilled_at, redeemed_by_account_id, redeemed_at) '
                + "VALUES ('paid-interrupted-purchase', 'paid-interrupted-claim', 500, 'paid', ?1, ?1, "
                + "'paid-interrupted-account', ?1)",
            ).bind(now).run();

            const recovery = await dispatch(academy.env, mutation(
                academy.env, '/academy/api/auth/google/recovery', 'POST', {},
            ));
            const recoveryCookie = cookie(recovery);
            expect((await signInWithGoogle(academy.env, recoveryCookie, subject, now + 1)).status).toBe(302);
            expect((await dispatch(academy.env, get(
                academy.env, '/academy/api/profile', recoveryCookie,
            ))).status).toBe(200);
            expect(academy.db.rows('SELECT * FROM profiles WHERE account_id = ?', 'paid-interrupted-account'))
                .toHaveLength(1);
        } finally {
            academy.close();
        }
    });

    it('fulfils in Stripe test mode, redeems after OIDC, recovers, exports, and tombstones deletion', async () => {
        const academy = createSqliteAcademy();
        const env: Env = {
            ...academy.env,
            ACADEMY_ORIGIN: 'https://academy.test',
            STRIPE_SECRET_KEY: 'sk_test_academy',
            STRIPE_WEBHOOK_SECRET: 'whsec_academy_test',
        };
        const now = Date.now();
        try {
            const checkout = await handleCreateCheckout(
                mutation(env, '/academy/api/checkout', 'POST', { amountGbp: 10 }),
                env,
                () => now,
                vi.fn(async () => new Response(JSON.stringify({
                    id: 'cs_test_paid123',
                    livemode: false,
                    url: 'https://checkout.stripe.com/c/pay/cs_test_paid123',
                }), { status: 200 })) as unknown as typeof fetch,
            );
            expect(checkout.status).toBe(200);
            const claimCookie = cookie(checkout);
            const [purchase] = academy.db.rows<{ id: string }>('SELECT id FROM purchases');
            if (!purchase) throw new Error('pending purchase missing');

            const event = {
                id: 'evt_test_paid_claim',
                type: 'checkout.session.completed',
                livemode: false,
                data: { object: {
                    id: 'cs_test_paid123',
                    payment_status: 'paid',
                    currency: 'gbp',
                    amount_total: 1000,
                    metadata: { yomu_academy_purchase: purchase.id },
                } },
            };
            const raw = JSON.stringify(event);
            const timestamp = Math.floor(now / 1000);
            const signature = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${raw}`);
            const webhook = await handleStripeWebhook(new Request(`${env.ACADEMY_ORIGIN}/academy/api/stripe/webhook`, {
                method: 'POST',
                headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
                body: raw,
            }), env, () => now);
            expect(webhook.status).toBe(200);

            const claimRequest = (): Request => get(env, '/academy/api/claim?session_id=cs_test_paid123', claimCookie);
            const firstClaim = await handleClaim(claimRequest(), env, () => now + 1);
            const claimBody = await firstClaim.json() as { status: string; code: string };
            expect(claimBody.status).toBe('paid');
            expect(await (await handleClaim(claimRequest(), env, () => now + 2)).json()).toEqual(claimBody);

            const paid = await createSession(env, claimBody.code);
            expect(paid.response.status).toBe(200);
            expect((await dispatch(env, get(env, '/academy/api/profile', paid.cookie))).status).toBe(401);
            expect((await signInWithGoogle(env, paid.cookie, 'paid-owner-subject', now + 3)).status).toBe(302);
            const ownerProfile = await (await dispatch(env, get(env, '/academy/api/profile', paid.cookie))).json() as { profileId: string };
            const bound = academy.db.rows<{ redeemed_by_account_id: string | null; redeemed_at: number | null }>(
                'SELECT redeemed_by_account_id, redeemed_at FROM purchases WHERE id = ?', purchase.id,
            )[0];
            expect(bound).toMatchObject({ redeemed_by_account_id: expect.any(String), redeemed_at: expect.any(Number) });

            const competing = await createSession(env, claimBody.code);
            expect(competing.response.status).toBe(403);
            expect(competing.cookie).toBe('');
            expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(1);
            expect(academy.db.rows<{ uses_remaining: number }>('SELECT uses_remaining FROM invites WHERE purchase_id = ?', purchase.id)[0]?.uses_remaining).toBe(1);

            const secondPurchaseId = crypto.randomUUID();
            await env.ACADEMY_DB.prepare(
                'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
                + "VALUES (?1, ?2, 500, 'paid', ?3, ?3)",
            ).bind(secondPurchaseId, 'manual-second-claim-hash', now + 5).run();
            const secondInviteId = await mintPaidInvite(env, secondPurchaseId, now + 5);
            await env.ACADEMY_DB.prepare('UPDATE purchases SET invite_id = ?1 WHERE id = ?2')
                .bind(secondInviteId, secondPurchaseId).run();
            const secondCode = await derivePaidInviteCode(env.ACADEMY_INVITE_HMAC_KEY, secondPurchaseId);
            const secondRedeem = await dispatch(env, mutation(
                env, '/academy/api/entitlement/redeem', 'POST', { code: secondCode }, paid.cookie,
            ));
            expect(secondRedeem.status).toBe(409);
            expect(academy.db.rows<{ redeemed_at: number | null }>('SELECT redeemed_at FROM purchases WHERE id = ?', secondPurchaseId)[0]?.redeemed_at).toBeNull();

            const recovery = await dispatch(env, mutation(env, '/academy/api/auth/google/recovery', 'POST', {}));
            expect(recovery.status).toBe(201);
            const recoveryCookie = cookie(recovery);
            expect((await dispatch(env, get(env, '/academy/api/profile', recoveryCookie))).status).toBe(401);
            expect((await signInWithGoogle(env, recoveryCookie, 'paid-owner-subject', now + 6)).status).toBe(302);
            expect(await (await dispatch(env, get(env, '/academy/api/profile', recoveryCookie))).json()).toMatchObject({
                profileId: ownerProfile.profileId,
            });
            expect(await (await dispatch(env, get(env, '/academy/api/entitlement', recoveryCookie))).json()).toMatchObject({
                entitlement: 'academy', status: 'active',
            });

            const exported = await dispatch(env, mutation(
                env, '/academy/api/account/export', 'POST', {}, recoveryCookie,
            ));
            expect(exported.status).toBe(200);
            expect(await exported.json()).toMatchObject({
                paidEntitlement: { status: 'paid', amountPence: 1000, redeemedAt: expect.any(Number) },
            });
            const deleted = await dispatch(env, mutation(
                env, '/academy/api/account', 'DELETE', { confirmation: 'delete-account' }, recoveryCookie,
            ));
            expect(deleted.status).toBe(200);
            const tombstone = academy.db.rows<{
                checkout_session_id: string | null;
                redeemed_by_account_id: string | null;
                redeemed_at: number | null;
            }>(
                'SELECT checkout_session_id, redeemed_by_account_id, redeemed_at FROM purchases WHERE id = ?', purchase.id,
            )[0];
            expect(tombstone?.checkout_session_id).toBeNull();
            expect(tombstone?.redeemed_by_account_id).toBeNull();
            expect(tombstone?.redeemed_at).toEqual(expect.any(Number));
            expect((await dispatch(env, claimRequest())).status).toBe(404);

            const afterDelete = await createSession(env, claimBody.code);
            expect(afterDelete.response.status).toBe(403);
            await expect(bindPaidEntitlement(env, purchase.id, 'post-delete-account', now + 7))
                .rejects.toMatchObject({ status: 409 });
            expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(0);
        } finally {
            academy.close();
        }
    });

    it('resolves competing writes to one code per account and one account per code', async () => {
        const academy = createSqliteAcademy();
        const now = Date.now();
        try {
            for (const [id, subject, discriminator] of [
                ['account-a', 'subject-a', '100001'],
                ['account-b', 'subject-b', '100002'],
                ['account-c', 'subject-c', '100003'],
            ]) {
                await academy.env.ACADEMY_DB.prepare(
                    'INSERT INTO accounts '
                    + '(id, public_id, google_sub_hash, display_name, name_chosen, discriminator, board_visible, share_avatar, created_at, updated_at) '
                    + "VALUES (?1, ?2, ?3, 'Learner', 0, ?4, 0, 0, ?5, ?5)",
                ).bind(id, crypto.randomUUID(), subject, discriminator, now).run();
            }
            for (const id of ['purchase-a', 'purchase-b', 'purchase-c']) {
                await academy.env.ACADEMY_DB.prepare(
                    'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
                    + "VALUES (?1, ?2, 500, 'paid', ?3, ?3)",
                ).bind(id, `claim-${id}`, now).run();
            }

            const onePerAccount = await Promise.allSettled([
                bindPaidEntitlement(academy.env, 'purchase-a', 'account-a', now + 1),
                bindPaidEntitlement(academy.env, 'purchase-b', 'account-a', now + 1),
            ]);
            expect(onePerAccount.filter(result => result.status === 'fulfilled')).toHaveLength(1);
            expect(onePerAccount.filter(result => result.status === 'rejected')).toHaveLength(1);

            const oneAccountPerCode = await Promise.allSettled([
                bindPaidEntitlement(academy.env, 'purchase-c', 'account-b', now + 2),
                bindPaidEntitlement(academy.env, 'purchase-c', 'account-c', now + 2),
            ]);
            expect(oneAccountPerCode.filter(result => result.status === 'fulfilled')).toHaveLength(1);
            expect(oneAccountPerCode.filter(result => result.status === 'rejected')).toHaveLength(1);
            const purchases = academy.db.rows<{ id: string; redeemed_by_account_id: string | null }>(
                'SELECT id, redeemed_by_account_id FROM purchases ORDER BY id',
            );
            expect(purchases.filter(row => row.redeemed_by_account_id === 'account-a')).toHaveLength(1);
            expect(purchases.find(row => row.id === 'purchase-c')?.redeemed_by_account_id).toMatch(/^account-[bc]$/u);
        } finally {
            academy.close();
        }
    });

    it('does not leave a recoverable orphan account when two Google subjects race for one paid code', async () => {
        const academy = createSqliteAcademy();
        const now = Date.now();
        try {
            const purchaseId = crypto.randomUUID();
            await academy.env.ACADEMY_DB.prepare(
                'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
                + "VALUES (?1, 'race-claim', 500, 'paid', ?2, ?2)",
            ).bind(purchaseId, now).run();
            const inviteId = await mintPaidInvite(academy.env, purchaseId, now);
            await academy.env.ACADEMY_DB.prepare('UPDATE purchases SET invite_id = ?1 WHERE id = ?2')
                .bind(inviteId, purchaseId).run();
            const code = await derivePaidInviteCode(academy.env.ACADEMY_INVITE_HMAC_KEY, purchaseId);
            const [first, second] = await Promise.all([createSession(academy.env, code), createSession(academy.env, code)]);
            const firstSession = await activeSession(get(academy.env, '/academy/api/session', first.cookie), academy.env, now + 1);
            const secondSession = await activeSession(get(academy.env, '/academy/api/session', second.cookie), academy.env, now + 1);
            if (!firstSession || !secondSession) throw new Error('paid race sessions missing');

            const linked = await Promise.allSettled([
                linkGoogleSubject(academy.env, firstSession, 'race-subject-a', now + 2),
                linkGoogleSubject(academy.env, secondSession, 'race-subject-b', now + 2),
            ]);
            expect(linked.filter(result => result.status === 'fulfilled')).toHaveLength(1);
            expect(linked.filter(result => result.status === 'rejected')).toHaveLength(1);
            expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(1);
            expect(academy.db.rows<{ redeemed_by_account_id: string | null }>(
                'SELECT redeemed_by_account_id FROM purchases WHERE id = ?', purchaseId,
            )[0]?.redeemed_by_account_id).toEqual(expect.any(String));
        } finally {
            academy.close();
        }
    });

    it('rolls back paidCodeWasBound when an independently encrypted profile causes a 409', async () => {
        const academy = createSqliteAcademy();
        const now = Date.now();
        const subject = 'paid-profile-conflict-subject';
        try {
            await seedInvite(academy.env, 'OWNER2026', 'paid-profile-conflict-owner');
            const owner = await createSession(academy.env, 'OWNER2026');
            const ownerSession = await activeSession(get(academy.env, '/academy/api/session', owner.cookie), academy.env, now);
            if (!ownerSession) throw new Error('owner session missing');
            await linkGoogleSubject(academy.env, ownerSession, subject, now);

            const purchaseId = crypto.randomUUID();
            await academy.env.ACADEMY_DB.prepare(
                'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
                + "VALUES (?1, 'profile-conflict-claim', 500, 'paid', ?2, ?2)",
            ).bind(purchaseId, now).run();
            const inviteId = await mintPaidInvite(academy.env, purchaseId, now);
            await academy.env.ACADEMY_DB.prepare('UPDATE purchases SET invite_id = ?1 WHERE id = ?2')
                .bind(inviteId, purchaseId).run();
            const paidCode = await derivePaidInviteCode(academy.env.ACADEMY_INVITE_HMAC_KEY, purchaseId);
            const paid = await createSession(academy.env, paidCode);
            const paidSession = await activeSession(get(academy.env, '/academy/api/session', paid.cookie), academy.env, now + 1);
            if (!paidSession) throw new Error('paid session missing');
            const legacy = await ensureSessionProfile(academy.env, paidSession, now + 1);
            await academy.env.ACADEMY_DB.prepare(
                'INSERT INTO srs_events '
                + '(profile_id, event_id, occurred_at, key_version, nonce, ciphertext, event_hash, received_at) '
                + 'VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?3)',
            ).bind(
                legacy.profile.id,
                '91919191-9191-4919-8919-919191919191',
                now,
                toBase64Url(new Uint8Array(12).fill(9)),
                toBase64Url(new Uint8Array(32).fill(9)),
                '9'.repeat(64),
            ).run();

            await expect(linkGoogleSubject(academy.env, paidSession, subject, now + 2))
                .rejects.toMatchObject({ status: 409, category: 'profile_conflict' });
            const paidCodeWasBound = academy.db.rows<{
                redeemed_by_account_id: string | null;
                redeemed_at: number | null;
            }>('SELECT redeemed_by_account_id, redeemed_at FROM purchases WHERE id = ?', purchaseId)[0];
            expect(paidCodeWasBound).toEqual({ redeemed_by_account_id: null, redeemed_at: null });
            expect(academy.db.rows('SELECT id FROM accounts')).toHaveLength(1);
            expect(academy.db.rows('SELECT id FROM profiles')).toHaveLength(2);
            expect(academy.db.rows<{ account_id: string | null }>(
                'SELECT account_id FROM sessions WHERE public_id = ?', paidSession.public_id,
            )[0]?.account_id).toBeNull();
        } finally {
            academy.close();
        }
    });

    it.each([5, 8, 11])('rolls back every account write when D1 fails after statement %s', async failurePoint => {
        const academy = createSqliteAcademy();
        const now = Date.now();
        try {
            const purchaseId = crypto.randomUUID();
            await academy.env.ACADEMY_DB.prepare(
                'INSERT INTO purchases (id, claim_hash, amount_pence, status, created_at, fulfilled_at) '
                + "VALUES (?1, 'injected-failure-claim', 500, 'paid', ?2, ?2)",
            ).bind(purchaseId, now).run();
            const inviteId = await mintPaidInvite(academy.env, purchaseId, now);
            await academy.env.ACADEMY_DB.prepare('UPDATE purchases SET invite_id = ?1 WHERE id = ?2')
                .bind(inviteId, purchaseId).run();
            const paidCode = await derivePaidInviteCode(academy.env.ACADEMY_INVITE_HMAC_KEY, purchaseId);
            const paid = await createSession(academy.env, paidCode);
            const paidSession = await activeSession(get(academy.env, '/academy/api/session', paid.cookie), academy.env, now + 1);
            if (!paidSession) throw new Error('paid session missing');

            academy.db.failNextBatchAfter(failurePoint);
            await expect(linkGoogleSubject(academy.env, paidSession, 'injected-failure-subject', now + 2))
                .rejects.toMatchObject({ status: 503, category: 'transaction_failed' });

            expect(academy.db.rows('SELECT id FROM accounts')).toHaveLength(0);
            expect(academy.db.rows('SELECT id FROM profiles')).toHaveLength(0);
            expect(academy.db.rows('SELECT id FROM profile_devices')).toHaveLength(0);
            expect(academy.db.rows('SELECT class_id FROM class_memberships')).toHaveLength(0);
            expect(academy.db.rows<{ account_id: string | null; profile_id: string | null; device_id: string | null }>(
                'SELECT account_id, profile_id, device_id FROM sessions WHERE public_id = ?', paidSession.public_id,
            )[0]).toEqual({ account_id: null, profile_id: null, device_id: null });
            expect(academy.db.rows<{ redeemed_by_account_id: string | null; redeemed_at: number | null }>(
                'SELECT redeemed_by_account_id, redeemed_at FROM purchases WHERE id = ?', purchaseId,
            )[0]).toEqual({ redeemed_by_account_id: null, redeemed_at: null });
        } finally {
            academy.close();
        }
    });
});
