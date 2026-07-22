// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const migrationDirectory = resolve(process.cwd(), 'workers/yomu-academy/migrations');

describe('Reader access-tier migration', () => {
    let database: NodeDatabaseSync | undefined;

    afterEach(() => database?.close());

    it('preserves sessionless recoverable Academy owners without granting paid or incomplete accounts', () => {
        database = new DatabaseSync(':memory:');
        for (const migration of readdirSync(migrationDirectory).filter(name => /^00(0[1-9]|1[01])_.+\.sql$/u.test(name)).sort()) {
            database.exec(readFileSync(resolve(migrationDirectory, migration), 'utf8'));
        }
        database.exec(`
            INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, account_required)
            VALUES
                ('seed-invite', 'seed-hash', 1, 'seed', 100, 1),
                ('paid-invite', 'paid-hash', 1, 'paid', 100, 1);
            INSERT INTO accounts (
                id, public_id, google_sub_hash, display_name, name_chosen, discriminator,
                board_visible, share_avatar, created_at, updated_at, recovery_bound_at
            ) VALUES
                ('legacy-owner', 'public-legacy', 'sub-legacy', 'Legacy', 1, '100001', 0, 0, 100, 200, 150),
                ('seed-owner', 'public-seed', 'sub-seed', 'Seed', 1, '100002', 0, 0, 100, 200, 150),
                ('mixed-owner', 'public-mixed', 'sub-mixed', 'Mixed', 1, '100003', 0, 0, 100, 200, 150),
                ('paid-owner', 'public-paid', 'sub-paid', 'Paid', 1, '100004', 0, 0, 130, 200, 150),
                ('incomplete-owner', 'public-incomplete', 'sub-incomplete', 'Incomplete', 0, '100005', 0, 0, 100, 200, NULL);
            INSERT INTO sessions (
                token_hash, public_id, invite_id, created_at, expires_at,
                offline_resume_until, account_id
            ) VALUES ('seed-token', 'seed-session', 'seed-invite', 100, 200, 300, 'seed-owner');
            INSERT INTO purchases (
                id, claim_hash, checkout_session_id, amount_pence, status, created_at,
                fulfilled_at, invite_id, redeemed_by_account_id, redeemed_at
            ) VALUES (
                'paid-purchase', 'paid-claim', 'paid-checkout', 500, 'paid', 100,
                120, 'paid-invite', 'paid-owner', 130
            );
            INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, account_required)
            VALUES ('mixed-paid-invite', 'mixed-paid-hash', 1, 'paid', 100, 1);
            INSERT INTO purchases (
                id, claim_hash, checkout_session_id, amount_pence, status, created_at,
                fulfilled_at, invite_id, redeemed_by_account_id, redeemed_at
            ) VALUES (
                'mixed-paid-purchase', 'mixed-paid-claim', 'mixed-paid-checkout', 500, 'paid', 100,
                120, 'mixed-paid-invite', 'mixed-owner', 130
            );
        `);

        database.exec(readFileSync(resolve(migrationDirectory, '0012_reader_access_tier.sql'), 'utf8'));

        expect(database.prepare(
            'SELECT account_id, source_invite_id, grant_reason FROM account_academy_grants ORDER BY account_id',
        ).all()).toEqual([
            { account_id: 'legacy-owner', source_invite_id: null, grant_reason: 'legacy-academy-account' },
            { account_id: 'mixed-owner', source_invite_id: null, grant_reason: 'legacy-academy-account' },
            { account_id: 'seed-owner', source_invite_id: 'seed-invite', grant_reason: 'seed-invite' },
        ]);
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
});
