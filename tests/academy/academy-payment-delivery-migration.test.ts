// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const migrationDirectory = resolve(process.cwd(), 'workers/yomu-academy/migrations');

describe('paid-code delivery migration', () => {
    let database: NodeDatabaseSync | undefined;

    afterEach(() => database?.close());

    it('backfills only canonical active unredeemed purchases without an email or code column', () => {
        database = new DatabaseSync(':memory:');
        for (const migration of readdirSync(migrationDirectory)
            .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name) && name < '0017_')
            .sort()) {
            database.exec(readFileSync(resolve(migrationDirectory, migration), 'utf8'));
        }
        populateCanonicalPurchase(database, 'open', null, 4_000_000_000_000);
        populateCanonicalPurchase(database, 'redeemed', 1_770_000_000_500, 4_000_000_000_000);
        populateCanonicalPurchase(database, 'expired', null, 1_770_000_000_500);

        database.exec(readFileSync(
            resolve(migrationDirectory, '0017_payment_code_deliveries.sql'),
            'utf8',
        ));

        const rows = database.prepare(
            'SELECT purchase_id, id, provider, status, attempt_count, available_at, '
            + 'lease_token_hash, lease_expires_at, completed_at FROM payment_code_deliveries',
        ).all();
        expect(rows).toEqual([{
            purchase_id: 'purchase-open',
            id: expect.stringMatching(/^paydel_[a-f0-9]{40}$/u),
            provider: 'patreon',
            status: 'pending',
            attempt_count: 0,
            available_at: 1_770_000_000_001,
            lease_token_hash: null,
            lease_expires_at: null,
            completed_at: null,
        }]);
        const columnNames = database.prepare('PRAGMA table_info(payment_code_deliveries)')
            .all()
            .map(row => String(row.name));
        expect(columnNames).not.toContain('email');
        expect(columnNames).not.toContain('code');
        expect(columnNames).not.toContain('recipient');
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
});

function populateCanonicalPurchase(
    database: NodeDatabaseSync,
    suffix: string,
    redeemedAt: number | null,
    inviteExpiresAt: number,
): void {
    database.prepare(
        'INSERT INTO accounts (id, public_id, google_sub_hash, discriminator, created_at, updated_at) '
        + 'SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ?6 IS NOT NULL',
    ).run(
        `account-${suffix}`,
        `public-${suffix}`,
        `google-${suffix}`,
        suffix === 'open' ? '100010' : '100011',
        1_770_000_000_000,
        redeemedAt,
    );
    database.prepare(
        'INSERT INTO invites ('
        + 'id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required'
        + ") VALUES (?1, ?2, 1, 'paid', ?3, ?4, ?5, 1)",
    ).run(
        `invite-${suffix}`,
        `code-hash-${suffix}`,
        1_770_000_000_000,
        inviteExpiresAt,
        `purchase-${suffix}`,
    );
    database.prepare(
        'INSERT INTO purchases ('
        + 'id, claim_hash, amount_pence, status, created_at, fulfilled_at, invite_id, redeemed_by_account_id, redeemed_at'
        + ") VALUES (?1, ?2, 500, 'paid', ?3, ?4, ?5, ?6, ?7)",
    ).run(
        `purchase-${suffix}`,
        `claim-hash-${suffix}`,
        1_770_000_000_000,
        1_770_000_000_001,
        `invite-${suffix}`,
        redeemedAt === null ? null : `account-${suffix}`,
        redeemedAt,
    );
    database.prepare(
        'INSERT INTO payment_subjects ('
        + 'id, provider, provider_subject_hash, subject_kind, created_at, updated_at'
        + ") VALUES (?1, 'patreon', ?2, 'member', ?3, ?3)",
    ).run(`subject-${suffix}`, `subject-hash-${suffix}`, 1_770_000_000_000);
    database.prepare(
        'INSERT INTO payment_entitlements ('
        + 'id, provider, subject_id, purchase_id, state, effective_at, expires_at, updated_at'
        + ") VALUES (?1, 'patreon', ?2, ?3, 'active', ?4, NULL, ?5)",
    ).run(
        `entitlement-${suffix}`,
        `subject-${suffix}`,
        `purchase-${suffix}`,
        1_770_000_000_000,
        1_770_000_000_001,
    );
}
