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

            database.exec(readFileSync(resolve(
                process.cwd(),
                'workers/yomu-support/migrations/0005_support_provider_roster.sql',
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
        } finally {
            database.close();
        }
    });
});
