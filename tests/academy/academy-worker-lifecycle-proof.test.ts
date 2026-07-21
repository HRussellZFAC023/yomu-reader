// @vitest-environment node
import { linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import {
    DELETION_RECEIPT_RETENTION_MS,
    handleCreateLifecycleProofGrant,
    handleDeleteLifecycleProofAccount,
    handleVerifyLifecycleProofGrant,
    runScheduledLifecycleMaintenance,
} from '../../workers/yomu-academy/src/lifecycle';
import { activeSession, handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy, type SqliteAcademy } from './helpers/sqlite-academy-env';

const now = Date.UTC(2026, 6, 21, 12);
const runNonce = 'r'.repeat(43);

interface LinkedFixture {
    readonly cookie: string;
    readonly accountId: string;
    readonly internalAccountId: string;
}

async function createLinkedAccount(
    academy: SqliteAcademy,
    suffix: string,
    subject: string,
): Promise<LinkedFixture> {
    const code = `PROOF-${suffix}-2026`;
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO invites '
        + '(id, code_hash, uses_remaining, kind, created_at, expires_at, revoked_at, purchase_id, account_required, class_id) '
        + 'VALUES (?1, ?2, 10, \'seed\', ?3, NULL, NULL, NULL, 1, NULL)',
    ).bind(`proof-invite-${suffix}`, await inviteCodeHash(academy.env, code), now - 1).run();
    const sessionResponse = await handleCreateSession(mutation('/academy/api/session', 'POST', '', { code }), academy.env, () => now);
    const cookie = (sessionResponse.headers.get('set-cookie') ?? '').split(';')[0];
    const session = await activeSession(get('/academy/api/session', cookie), academy.env, now);
    if (!session) throw new Error('proof fixture session missing');
    const account = await linkGoogleSubject(academy.env, session, subject, now + 1);
    return { cookie, accountId: account.public_id, internalAccountId: account.id };
}

async function mintGrant(academy: SqliteAcademy, accountId: string, nonce = runNonce) {
    const response = await handleCreateLifecycleProofGrant(new Request(
        'https://yomureader.com/academy/api/admin/lifecycle-proof-grants',
        {
            method: 'POST',
            headers: {
                authorization: `Bearer ${academy.env.ACADEMY_ADMIN_TOKEN}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ accountId, runNonce: nonce }),
        },
    ), academy.env, () => now + 2);
    return response.json() as Promise<{ proofToken: string; runNonce: string; expiresAt: number }>;
}

function proofBody(proofToken: string, nonce = runNonce) {
    return { confirmation: 'delete-account', proofToken, runNonce: nonce };
}

function get(path: string, cookie: string): Request {
    return new Request(`https://yomureader.com${path}`, { headers: { cookie } });
}

function mutation(
    path: string,
    method: 'POST' | 'DELETE',
    cookie: string,
    body: unknown,
): Request {
    return new Request(`https://yomureader.com${path}`, {
        method,
        headers: {
            cookie,
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

describe('Academy production lifecycle proof authorization', () => {
    it('cannot delete an unmarked normal account through the proof route', async () => {
        const academy = createSqliteAcademy();
        try {
            const account = await createLinkedAccount(academy, 'UNMARKED', 'unmarked-subject');
            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                account.cookie,
                proofBody('x'.repeat(43)),
            ), academy.env, () => now + 3)).rejects.toMatchObject({ status: 403 });
            expect(academy.db.rows('SELECT id FROM accounts WHERE id = ?', account.internalAccountId)).toHaveLength(1);
            expect(academy.db.rows('SELECT id FROM deletion_receipts')).toHaveLength(0);
        } finally {
            academy.close();
        }
    });

    it('binds verification and deletion to the exact account, production scope, and run nonce', async () => {
        const academy = createSqliteAcademy();
        try {
            const marked = await createLinkedAccount(academy, 'MARKED', 'marked-subject');
            const other = await createLinkedAccount(academy, 'OTHER', 'other-subject');
            const grant = await mintGrant(academy, marked.accountId);

            const verified = await handleVerifyLifecycleProofGrant(mutation(
                '/academy/api/account/lifecycle-proof/verify',
                'POST',
                marked.cookie,
                { proofToken: grant.proofToken, runNonce },
            ), academy.env, () => now + 3);
            expect(await verified.json()).toMatchObject({
                verified: true,
                accountId: marked.accountId,
                environment: 'production',
                scope: 'account-lifecycle-production-test',
            });

            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                other.cookie,
                proofBody(grant.proofToken),
            ), academy.env, () => now + 4)).rejects.toMatchObject({ status: 403 });
            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                marked.cookie,
                proofBody(grant.proofToken, 'n'.repeat(43)),
            ), academy.env, () => now + 4)).rejects.toMatchObject({ status: 403 });
            expect(academy.db.rows('SELECT id FROM accounts')).toHaveLength(2);

            const mutableEnv = academy.env as { ACADEMY_ENVIRONMENT: 'production' | 'staging' | 'development' };
            mutableEnv.ACADEMY_ENVIRONMENT = 'staging';
            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                marked.cookie,
                proofBody(grant.proofToken),
            ), academy.env, () => now + 4)).rejects.toMatchObject({ status: 403 });
            mutableEnv.ACADEMY_ENVIRONMENT = 'production';
            expect(academy.db.rows('SELECT id FROM accounts')).toHaveLength(2);
        } finally {
            academy.close();
        }
    });

    it('fails closed for expired and consumed grants without deleting the account', async () => {
        const academy = createSqliteAcademy();
        try {
            const account = await createLinkedAccount(academy, 'REPLAY', 'replay-subject');
            const expired = await mintGrant(academy, account.accountId, 'e'.repeat(43));
            academy.db.database.prepare(
                'UPDATE account_lifecycle_proof_grants SET expires_at = ?1 WHERE token_hash IS NOT NULL',
            ).run(now + 3);
            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                account.cookie,
                proofBody(expired.proofToken, 'e'.repeat(43)),
            ), academy.env, () => now + 4)).rejects.toMatchObject({ status: 403 });

            const consumed = await mintGrant(academy, account.accountId, 'c'.repeat(43));
            const verified = await handleVerifyLifecycleProofGrant(mutation(
                '/academy/api/account/lifecycle-proof/verify',
                'POST',
                account.cookie,
                { proofToken: consumed.proofToken, runNonce: 'c'.repeat(43) },
            ), academy.env, () => now + 3);
            expect(verified.status).toBe(200);
            academy.db.database.prepare(
                'UPDATE account_lifecycle_proof_grants SET consumed_at = ?1, consume_nonce = ?2 '
                + 'WHERE expires_at > ?1 AND consumed_at IS NULL',
            ).run(now + 3, crypto.randomUUID());
            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                account.cookie,
                proofBody(consumed.proofToken, 'c'.repeat(43)),
            ), academy.env, () => now + 4)).rejects.toMatchObject({ status: 403 });
            expect(academy.db.rows('SELECT id FROM accounts WHERE id = ?', account.internalAccountId)).toHaveLength(1);
            expect(academy.db.rows('SELECT id FROM deletion_receipts')).toHaveLength(0);
        } finally {
            academy.close();
        }
    });

    it('rolls grant consumption back with a failed deletion transaction and consumes it exactly once on retry', async () => {
        const academy = createSqliteAcademy();
        try {
            const account = await createLinkedAccount(academy, 'ROLLBACK', 'rollback-subject');
            const grant = await mintGrant(academy, account.accountId);
            academy.db.failNextBatchAfter(2);
            await expect(handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                account.cookie,
                proofBody(grant.proofToken),
            ), academy.env, () => now + 4)).rejects.toThrow('Injected D1 batch failure');
            expect(academy.db.rows('SELECT consumed_at FROM account_lifecycle_proof_grants')[0]).toMatchObject({ consumed_at: null });
            expect(academy.db.rows('SELECT id FROM accounts WHERE id = ?', account.internalAccountId)).toHaveLength(1);

            const deleted = await handleDeleteLifecycleProofAccount(mutation(
                '/academy/api/account/lifecycle-proof',
                'DELETE',
                account.cookie,
                proofBody(grant.proofToken),
            ), academy.env, () => now + 5);
            expect(deleted.status).toBe(200);
            expect(academy.db.rows('SELECT id FROM accounts WHERE id = ?', account.internalAccountId)).toHaveLength(0);
            expect(academy.db.rows('SELECT consumed_at, account_id FROM account_lifecycle_proof_grants')[0])
                .toMatchObject({ consumed_at: now + 5, account_id: null });
            expect(academy.db.rows('SELECT scope FROM deletion_receipts')).toEqual([{ scope: 'account' }]);
        } finally {
            academy.close();
        }
    });
});

describe('scheduled lifecycle retention', () => {
    it('retries an observable scheduled prune and removes receipts at the exact 90-day boundary', async () => {
        const academy = createSqliteAcademy();
        const logs: string[] = [];
        try {
            academy.db.database.prepare(
                'INSERT INTO deletion_receipts '
                + '(id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after) '
                + "VALUES (?1, 'profile', ?2, 1, 0, 0, ?3)",
            ).run(crypto.randomUUID(), now - DELETION_RECEIPT_RETENTION_MS, now);
            academy.db.failNextBatchAfter(1);
            const metrics = await runScheduledLifecycleMaintenance(academy.env, () => now, {
                attempts: 2,
                sleep: async () => undefined,
                logger: {
                    info: message => logs.push(String(message)),
                    warn: message => logs.push(String(message)),
                    error: message => logs.push(String(message)),
                },
            });
            expect(metrics.deletionReceipts).toBe(1);
            expect(academy.db.rows('SELECT id FROM deletion_receipts')).toHaveLength(0);
            expect(logs.map(value => JSON.parse(value))).toMatchObject([
                { outcome: 'retry', attempt: 1 },
                { outcome: 'success', attempt: 2, deletionReceipts: 1 },
            ]);
        } finally {
            academy.close();
        }
    });
});
