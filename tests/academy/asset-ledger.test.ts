import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS } from '../../src/academy/assets';

interface AssetDelivery {
    readonly path: string;
    readonly sha256: string;
}

interface AssetEntry {
    readonly id: string;
    readonly verdict: string;
    readonly deliveries?: readonly AssetDelivery[];
}

describe('Academy runtime asset ledger', () => {
    const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8')) as {
        rules: { runtimeRequiresExplicitEntry: boolean };
        assets: AssetEntry[];
    };
    const approved = ledger.assets.filter(asset => asset.verdict.startsWith('approved-runtime'));
    const deliveries = approved.flatMap(asset => asset.deliveries ?? []);

    it('hashes every explicitly approved runtime delivery', () => {
        expect(ledger.rules.runtimeRequiresExplicitEntry).toBe(true);
        expect(approved.length).toBeGreaterThan(0);
        for (const delivery of deliveries) {
            const file = path.resolve('public', delivery.path.replace(/^\//, ''));
            expect(fs.existsSync(file), `missing ${delivery.path}`).toBe(true);
            const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
            expect(digest, delivery.path).toBe(delivery.sha256);
        }
    });

    it('ships no unledgered runtime art file', () => {
        const files = walk(path.resolve('public/academy/art'))
            .filter(file => path.basename(file) !== 'ASSET-USAGE.json')
            .map(file => `/${path.relative(path.resolve('public'), file).split(path.sep).join('/')}`)
            .sort();
        expect(files).toEqual(deliveries.map(delivery => delivery.path).sort());
    });

    it('binds every typed runtime art path to an approved ledger delivery', () => {
        const approvedPaths = new Set(deliveries.map(delivery => delivery.path));
        for (const assetPath of collectPaths(ACADEMY_ASSETS)) {
            expect(approvedPaths.has(assetPath), `unapproved typed asset ${assetPath}`).toBe(true);
        }
    });
});

function walk(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
    });
}

function collectPaths(value: unknown): string[] {
    if (typeof value === 'string') return value.startsWith('/academy/art/') ? [value] : [];
    if (!value || typeof value !== 'object') return [];
    return [...new Set(Object.values(value).flatMap(collectPaths))].sort();
}
