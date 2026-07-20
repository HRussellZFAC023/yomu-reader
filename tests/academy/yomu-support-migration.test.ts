// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('support provider donation ledger migration', () => {
    it('deduplicates provider events and derives the total from immutable rows', () => {
        const database = new DatabaseSync(':memory:');
        try {
            database.exec(readFileSync(resolve(
                process.cwd(), 'workers/yomu-support/migrations/0002_provider_donation_events.sql',
            ), 'utf8'));
            const insert = database.prepare(`
                INSERT OR IGNORE INTO provider_donation_events (
                    provider, event_id, day, amount_minor, currency, event_type, occurred_at, received_at
                ) VALUES (?, ?, ?, ?, 'gbp', ?, ?, ?)
            `);
            const values = ['kofi', 'message-42', '2026-07-20', 100, 'donation', 1_774_137_723_000, '2026-07-20T01:02:03Z'] as const;

            expect(insert.run(...values).changes).toBe(1);
            expect(insert.run(...values).changes).toBe(0);
            expect(database.prepare(
                "SELECT provider, SUM(amount_minor) AS total_minor FROM provider_donation_events WHERE currency = 'gbp' GROUP BY provider",
            ).all()).toEqual([{ provider: 'kofi', total_minor: 100 }]);
        } finally {
            database.close();
        }
    });
});
