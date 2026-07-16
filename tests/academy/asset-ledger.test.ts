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
    readonly runtimeHome?: readonly string[] | null;
    readonly deliveries?: readonly AssetDelivery[];
    readonly sourceSha256?: string;
    readonly status?: string;
}

describe('Academy runtime asset ledger', () => {
    const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8')) as {
        rules: { runtimeRequiresExplicitEntry: boolean };
        assets: AssetEntry[];
    };
    const runtimeAssets = ledger.assets.filter(
        asset => asset.verdict.startsWith('approved-runtime') || asset.verdict === 'review-candidate/runtime-preview',
    );
    const deliveries = runtimeAssets.flatMap(asset => asset.deliveries ?? []);

    it('hashes every explicit runtime delivery, including release-blocked previews', () => {
        expect(ledger.rules.runtimeRequiresExplicitEntry).toBe(true);
        expect(runtimeAssets.length).toBeGreaterThan(0);
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

    it('binds every typed runtime art path to an explicit ledger delivery', () => {
        const ledgeredPaths = new Set(deliveries.map(delivery => delivery.path));
        for (const assetPath of collectPaths(ACADEMY_ASSETS)) {
            expect(ledgeredPaths.has(assetPath), `unledgered typed asset ${assetPath}`).toBe(true);
        }
    });

    it('keeps the three Rie expression previews release-blocked with exact prospective homes', () => {
        const expected = {
            'rie-happy-halfbody-v001': {
                path: ACADEMY_ASSETS.rieExpressions.happy,
                homes: ['lesson-feedback:correct-retry', 'dialogue:rie-positive', 'journal:rie-expression-gallery'],
            },
            'rie-encouraging-halfbody-v001': {
                path: ACADEMY_ASSETS.rieExpressions.encouraging,
                homes: ['lesson-feedback:attempt', 'dialogue:rie-listening', 'journal:rie-expression-gallery'],
            },
            'rie-repair-halfbody-v001': {
                path: ACADEMY_ASSETS.rieExpressions.repair,
                homes: ['lesson-feedback:repair', 'dialogue:rie-precise-hint', 'journal:rie-expression-gallery'],
            },
        } as const;

        for (const [id, expectation] of Object.entries(expected)) {
            const candidate = ledger.assets.find(asset => asset.id === id);
            expect(candidate).toMatchObject({
                verdict: 'review-candidate/runtime-preview',
                runtimeHome: expectation.homes,
                status: 'release-blocked-pending-owner-approval',
            });
            expect(candidate?.deliveries?.map(delivery => delivery.path)).toEqual([expectation.path]);
        }
    });

    it('keeps the Aakash journal preview honest and separate from the rainy scene CG', () => {
        const preview = ledger.assets.find(asset => asset.id === 'aakash-neutral-halfbody-v001');
        const rainyScene = ledger.assets.find(asset => asset.id === 'rainy-directions-rie-aakash-v001');

        expect(preview).toMatchObject({
            verdict: 'approved-runtime-preview',
            runtimeHome: ['journal:aakash'],
            status: 'owner-requested-preview; release-blocked-pending-likeness-approval',
        });
        expect(rainyScene?.runtimeHome).not.toContain('journal:aakash');
        expect(rainyScene?.status).not.toContain('sprite');
    });

    it('keeps Xingyu as an unbound review candidate until likeness approval', () => {
        const preview = ledger.assets.find(asset => asset.id === 'xingyu-neutral-halfbody-v001');
        expect(preview).toMatchObject({
            verdict: 'review-candidate/runtime-preview',
            runtimeHome: ['mission:lesson-zero-sound-host'],
            status: 'not-runtime-bound; release-blocked-pending-owner-likeness-and-cast-scale-approval',
        });
        expect(preview?.deliveries?.map(delivery => delivery.path)).toEqual([
            '/academy/art/characters/xingyu/xingyu__neutral__halfbody__v001.png',
        ]);
    });

    it('binds Shaun only as a first-term journal review candidate', () => {
        const preview = ledger.assets.find(asset => asset.id === 'shaun-neutral-halfbody-v001');
        expect(preview).toMatchObject({
            verdict: 'review-candidate/runtime-preview',
            runtimeHome: ['journal:shaun'],
            sourceSha256: 'a41b98d3d41efe9f4a59d8bb98879a74c6b94466546d98e2a6ead1b9d1964cea',
            status: 'owner-requested-preview; release-blocked-pending-likeness-and-cast-scale-approval',
        });
        expect(preview?.deliveries?.map(delivery => delivery.path)).toEqual([
            ACADEMY_ASSETS.characters.shaun,
        ]);
    });

    it('records Mira only as private reference evidence until a neutral sample passes review', () => {
        const reference = ledger.assets.find(asset => asset.id === 'mira-private-likeness-reference');
        expect(reference).toMatchObject({
            verdict: 'reference-only',
            runtimeHome: null,
            sourceSha256: '69cdbe8bf0ff2ab74e87b83e5495cd658a82b70b391245256f8538bfc875febe',
            status: 'release-blocked-neutral-sample-not-generated',
        });
        expect(reference?.deliveries).toBeUndefined();
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
