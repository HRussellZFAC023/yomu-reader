// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const migrationDirectory = resolve(process.cwd(), 'workers/yomu-academy/migrations');
const foundationMigrations = [
    '0001_access.sql',
    '0002_accounts.sql',
    '0003_profile_sync.sql',
    '0004_account_entitlements.sql',
    '0005_profile_key_commitment.sql',
    '0006_account_recovery_binding.sql',
    '0007_invite_account_requirement.sql',
    '0008_all_invites_require_account.sql',
    '0010_payment_ingress.sql',
];

describe('permanent donation access migration', () => {
    let database: NodeDatabaseSync | undefined;

    afterEach(() => database?.close());

    it('commits with populated foreign keys and preserves rows and indexes', () => {
        database = new DatabaseSync(':memory:');
        for (const migration of foundationMigrations) database.exec(readMigration(migration));
        populatePaymentGraph(database);

        database.exec('BEGIN IMMEDIATE');
        database.exec(readMigration('0011_permanent_donation_access.sql'));
        expect(() => database!.exec('COMMIT')).not.toThrow();

        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(database.prepare('SELECT id, amount_pence, invite_id FROM purchases').all()).toEqual([
            { id: 'purchase-1', amount_pence: 500, invite_id: 'invite-1' },
        ]);
        expect(database.prepare('SELECT id, subject_id, amount_minor FROM payment_transactions').all()).toEqual([
            { id: 'transaction-1', subject_id: 'subject-1', amount_minor: 500 },
        ]);
        expect(userIndexNames(database, 'purchases')).toEqual([
            'idx_purchases_redeemed_account',
            'idx_purchases_redeemed_at',
            'idx_purchases_status_created_at',
        ]);
        expect(userIndexNames(database, 'payment_transactions')).toEqual(['idx_payment_transactions_subject']);
    });
});

function readMigration(name: string): string {
    return readFileSync(resolve(migrationDirectory, name), 'utf8');
}

function populatePaymentGraph(database: NodeDatabaseSync): void {
    database.exec(`
        INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, account_required)
        VALUES ('invite-1', 'code-hash-1', 1, 'paid', 1770000000000, 1);
        INSERT INTO purchases (
            id, claim_hash, checkout_session_id, amount_pence, status, created_at,
            fulfilled_at, invite_id, redeemed_by_account_id, redeemed_at
        ) VALUES (
            'purchase-1', 'claim-hash-1', 'session-1', 500, 'paid', 1770000000000,
            1770000000000, 'invite-1', NULL, NULL
        );
        INSERT INTO payment_subjects (
            id, provider, provider_subject_hash, subject_kind, created_at, updated_at
        ) VALUES ('subject-1', 'stripe', 'subject-hash-1', 'transaction', 1770000000000, 1770000000000);
        INSERT INTO payment_transactions (
            id, provider, provider_transaction_hash, provider_session_hash, subject_id,
            currency, amount_minor, status, occurred_at, received_at
        ) VALUES (
            'transaction-1', 'stripe', 'transaction-hash-1', 'session-hash-1', 'subject-1',
            'gbp', 500, 'settled', 1770000000000, 1770000000001
        );
        INSERT INTO payment_entitlements (
            id, provider, subject_id, purchase_id, state, effective_at, expires_at, updated_at
        ) VALUES (
            'entitlement-1', 'stripe', 'subject-1', 'purchase-1', 'active',
            1770000000000, NULL, 1770000000001
        );
        INSERT INTO payment_events (
            id, provider, provider_event_hash, event_type, subject_id, transaction_id,
            occurred_at, received_at, disposition
        ) VALUES (
            'event-1', 'stripe', 'event-hash-1', 'charge.settled', 'subject-1', 'transaction-1',
            1770000000000, 1770000000001, 'accepted'
        );
    `);
}

function userIndexNames(database: NodeDatabaseSync, table: string): string[] {
    return database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name",
    ).all(table).map(row => String(row.name));
}
