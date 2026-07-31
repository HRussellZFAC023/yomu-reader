// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('support provider donation ledger migration', () => {
    it('migrates the complete schema and deduplicates immutable events for every support provider', () => {
        const database = new DatabaseSync(':memory:');
        try {
            for (const migration of [
                '0001_donation_events.sql',
                '0002_provider_donation_events.sql',
                '0003_donation_currency.sql',
                '0004_support_observability_counters.sql',
            ]) {
                database.exec(readFileSync(resolve(
                    process.cwd(), 'workers/yomu-support/migrations', migration,
                ), 'utf8'));
            }
            const legacyInsert = database.prepare(`
                INSERT INTO provider_donation_events (
                    provider, event_id, day, amount_minor, currency, base_currency,
                    base_amount_minor, needs_rate, event_type, occurred_at, received_at
                ) VALUES (?, ?, '2026-07-19', ?, 'gbp', 'gbp', ?, 0, 'legacy', ?, '2026-07-19T01:02:03Z')
            `);
            legacyInsert.run('kofi', 'legacy-kofi', 111, 111, 1_774_051_323_000);
            legacyInsert.run('patreon', 'legacy-patreon', 222, 222, 1_774_051_323_000);
            const stripeInsert = database.prepare(`
                INSERT INTO donation_events (
                    id, day, amount_minor, currency, event_type,
                    stripe_session_id, stripe_created_at, received_at
                ) VALUES (?, '2026-07-19', ?, ?, 'checkout.session.completed', ?, ?, '2026-07-19T01:02:03Z')
            `);
            stripeInsert.run('evt-gbp', 500, 'gbp', 'cs_live_gbp', 1_774_051_323);
            stripeInsert.run('evt-usd', 700, 'usd', 'cs_live_usd', 1_774_051_323);

            database.exec(readFileSync(resolve(
                process.cwd(),
                'workers/yomu-support/migrations/0005_support_provider_roster.sql',
            ), 'utf8'));
            database.exec(readFileSync(resolve(
                process.cwd(),
                'workers/yomu-support/migrations/0006_stripe_reporting_currency.sql',
            ), 'utf8'));
            database.exec(readFileSync(resolve(
                process.cwd(),
                'workers/yomu-support/migrations/0007_patreon_income_high_water.sql',
            ), 'utf8'));
            expect(database.prepare(`
                SELECT provider, event_id, amount_minor, base_amount_minor, event_type
                FROM provider_donation_events
                WHERE event_id LIKE 'legacy-%'
                ORDER BY provider
            `).all()).toEqual([
                {
                    provider: 'kofi',
                    event_id: 'legacy-kofi',
                    amount_minor: 111,
                    base_amount_minor: 111,
                    event_type: 'legacy',
                },
                {
                    provider: 'patreon',
                    event_id: 'legacy-patreon',
                    amount_minor: 222,
                    base_amount_minor: 222,
                    event_type: 'legacy',
                },
            ]);

            const insert = database.prepare(`
                INSERT OR IGNORE INTO provider_donation_events (
                    provider, event_id, day, amount_minor, currency, base_currency,
                    base_amount_minor, needs_rate, event_type, occurred_at, received_at
                ) VALUES (?, ?, '2026-07-20', ?, 'gbp', 'gbp', ?, 0, 'donation', ?, '2026-07-20T01:02:03Z')
            `);
            const providers = [
                ['kofi', 100],
                ['patreon', 200],
                ['bmac', 300],
                ['paypal', 400],
            ] as const;

            for (const [provider, amountMinor] of providers) {
                const values = [provider, 'shared-event-42', amountMinor, amountMinor, 1_774_137_723_000] as const;
                expect(insert.run(...values).changes).toBe(1);
                expect(insert.run(...values).changes).toBe(0);
            }
            expect(database.prepare(
                `SELECT provider, COUNT(*) AS event_count, SUM(base_amount_minor) AS total_minor
                 FROM provider_donation_events
                 WHERE base_currency = 'gbp'
                 GROUP BY provider
                 ORDER BY provider`,
            ).all()).toEqual([
                { provider: 'bmac', event_count: 1, total_minor: 300 },
                { provider: 'kofi', event_count: 2, total_minor: 211 },
                { provider: 'patreon', event_count: 2, total_minor: 422 },
                { provider: 'paypal', event_count: 1, total_minor: 400 },
            ]);
            expect(database.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'support_observability_counters'",
            ).get()).toEqual({ name: 'support_observability_counters' });
            expect(database.prepare(`
                SELECT id, amount_minor, currency, base_currency, base_amount_minor, needs_rate
                FROM donation_events
                ORDER BY id
            `).all()).toEqual([
                {
                    id: 'evt-gbp',
                    amount_minor: 500,
                    currency: 'gbp',
                    base_currency: 'gbp',
                    base_amount_minor: 500,
                    needs_rate: 0,
                },
                {
                    id: 'evt-usd',
                    amount_minor: 700,
                    currency: 'usd',
                    base_currency: 'gbp',
                    base_amount_minor: 0,
                    needs_rate: 1,
                },
            ]);
            expect(database.prepare(`
                SELECT session_id
                FROM (
                    SELECT 'cs_live_exact' AS session_id
                    UNION ALL SELECT 'csXliveYwildcards'
                    UNION ALL SELECT 'CS_LIVE_UPPERCASE'
                    UNION ALL SELECT 'cs_test_not-live'
                )
                WHERE session_id GLOB 'cs_live_*'
            `).all()).toEqual([{ session_id: 'cs_live_exact' }]);

            const reconcileStripeCurrency = database.prepare(`
                UPDATE donation_events
                SET
                    base_amount_minor = CAST(ROUND(amount_minor * ?) AS INTEGER),
                    needs_rate = 0
                WHERE lower(currency) = 'usd'
                    AND base_currency = 'gbp'
                    AND needs_rate = 1
                    AND stripe_session_id GLOB 'cs_live_*'
                    AND ROUND(amount_minor * ?) BETWEEN 1 AND ?
            `);
            expect(reconcileStripeCurrency.run(0.00001, 0.00001, Number.MAX_SAFE_INTEGER).changes).toBe(0);
            expect(reconcileStripeCurrency.run(1e20, 1e20, Number.MAX_SAFE_INTEGER).changes).toBe(0);
            expect(database.prepare(`
                SELECT base_amount_minor, needs_rate
                FROM donation_events
                WHERE id = 'evt-usd'
            `).get()).toEqual({ base_amount_minor: 0, needs_rate: 1 });
            expect(reconcileStripeCurrency.run(0.5, 0.5, Number.MAX_SAFE_INTEGER).changes).toBe(1);
            expect(reconcileStripeCurrency.run(0.25, 0.25, Number.MAX_SAFE_INTEGER).changes).toBe(0);
            expect(database.prepare(`
                SELECT amount_minor, base_amount_minor, needs_rate
                FROM donation_events
                WHERE id = 'evt-usd'
            `).get()).toEqual({ amount_minor: 700, base_amount_minor: 350, needs_rate: 0 });

            expect(database.prepare(`
                INSERT OR IGNORE INTO donation_events (
                    id, day, amount_minor, currency, event_type, stripe_session_id,
                    stripe_created_at, received_at, base_currency, base_amount_minor, needs_rate
                ) VALUES (
                    'evt-usd-retry', '2026-07-19', 700, 'usd',
                    'checkout.session.async_payment_succeeded', 'cs_live_usd',
                    1774051323, '2026-07-19T01:02:04Z', 'gbp', 0, 1
                )
            `).run().changes).toBe(0);

            const patreonSnapshot = database.prepare(`
                INSERT INTO patreon_member_accounting (
                    campaign_id, member_id, currency, lifetime_support_minor,
                    last_charge_at, event_id, updated_at
                ) VALUES ('campaign-123', 'member-123', 'gbp', ?, ?, ?, '2026-07-20T01:02:03Z')
                ON CONFLICT(campaign_id, member_id, currency) DO UPDATE SET
                    lifetime_support_minor = excluded.lifetime_support_minor,
                    last_charge_at = excluded.last_charge_at,
                    event_id = excluded.event_id,
                    updated_at = excluded.updated_at
                WHERE excluded.lifetime_support_minor > patreon_member_accounting.lifetime_support_minor
                  AND excluded.last_charge_at >= patreon_member_accounting.last_charge_at
            `);
            patreonSnapshot.run(0, 0, 'patreon-baseline');
            patreonSnapshot.run(500, 1_774_137_723_000, 'patreon-charge-1');
            patreonSnapshot.run(500, 1_774_137_723_000, 'patreon-charge-1-retry');
            patreonSnapshot.run(1_000, 1_776_816_123_000, 'patreon-charge-2');
            patreonSnapshot.run(1_500, 1_770_000_000_000, 'patreon-out-of-order');
            expect(database.prepare(`
                SELECT event_id, amount_minor, base_amount_minor, needs_rate
                FROM provider_donation_events
                WHERE event_id LIKE 'patreon-charge-%'
                ORDER BY event_id
            `).all()).toEqual([
                {
                    event_id: 'patreon-charge-1',
                    amount_minor: 500,
                    base_amount_minor: 500,
                    needs_rate: 0,
                },
                {
                    event_id: 'patreon-charge-2',
                    amount_minor: 500,
                    base_amount_minor: 500,
                    needs_rate: 0,
                },
            ]);
        } finally {
            database.close();
        }
    });
});
