import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { sha256File } from './helpers/hash-memo';

interface AssetDelivery {
    readonly path: string;
    readonly sha256: string;
}

interface AssetEntry {
    readonly id: string;
    readonly source?: string;
    readonly privacy?: string;
    readonly usage?: { readonly runtime: readonly string[]; readonly review: readonly string[] };
    readonly orphan?: string;
    readonly verdict: string;
    readonly runtimeHome?: readonly string[] | null;
    readonly reviewHome?: readonly string[];
    readonly deliveries?: readonly AssetDelivery[];
    readonly sourceSha256?: string;
    readonly status?: string;
}

describe('Academy runtime asset ledger', () => {
    const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8')) as {
        rules: { runtimeRequiresExplicitEntry: boolean };
        counts: {
            runtimeAssetHomes: number;
            runtimeFiles: number;
            nonRuntimeReviewFiles: number;
            nonRuntimeReviewFilesPresent: number;
            canonicalRecoveryInventoryFiles: number;
        };
        assets: AssetEntry[];
    };
    const runtimeAssets = ledger.assets.filter(
        asset => asset.verdict.startsWith('approved-runtime') || asset.verdict === 'review-candidate/runtime-preview',
    );
    const deliveries = runtimeAssets.flatMap(asset => asset.deliveries ?? []);
    const publicDeliveries = ledger.assets
        .flatMap(asset => asset.deliveries ?? [])
        .filter(delivery => fs.existsSync(path.resolve('public', delivery.path.replace(/^\//, ''))));

    it('hashes every explicit runtime delivery, including release-blocked previews', () => {
        expect(ledger.rules.runtimeRequiresExplicitEntry).toBe(true);
        expect(runtimeAssets.length).toBeGreaterThan(0);
        for (const delivery of deliveries) {
            const file = path.resolve('public', delivery.path.replace(/^\//, ''));
            expect(fs.existsSync(file), `missing ${delivery.path}`).toBe(true);
            const digest = sha256File(file);
            expect(digest, delivery.path).toBe(delivery.sha256);
        }
    });

    it('accounts for every public art file without treating non-runtime review as authorized', () => {
        const files = walk(path.resolve('public/academy/art'))
            .filter(file => path.basename(file) !== 'ASSET-USAGE.json')
            .map(file => `/${path.relative(path.resolve('public'), file).split(path.sep).join('/')}`)
            .sort();
        expect(files).toEqual(publicDeliveries.map(delivery => delivery.path).sort());
    });

    it('derives runtime counts from authorized visual deliveries and keeps the hosted ledger mirrored', () => {
        const visualRuntimeAssets = runtimeAssets.filter(asset =>
            asset.deliveries?.some(delivery => !delivery.path.endsWith('.json')),
        );
        const visualRuntimeFiles = deliveries.filter(delivery => !delivery.path.endsWith('.json'));
        const nonRuntimeReviewDeliveries = ledger.assets.filter(asset => !runtimeAssets.includes(asset) && asset.verdict.includes('review-candidate')).flatMap(asset => asset.deliveries ?? []);
        const nonRuntimeReviewFilesPresent = nonRuntimeReviewDeliveries.filter(delivery => fs.existsSync(path.resolve('public', delivery.path.replace(/^\//, ''))));
        const recoveryInventory = ledger.assets.find(asset => asset.id === 'recovered-art-review-collection-v1');
        expect(ledger.counts.runtimeAssetHomes).toBe(visualRuntimeAssets.length);
        expect(ledger.counts.runtimeFiles).toBe(visualRuntimeFiles.length);
        expect(ledger.counts.nonRuntimeReviewFiles).toBe(nonRuntimeReviewDeliveries.length);
        expect(ledger.counts.nonRuntimeReviewFilesPresent).toBe(nonRuntimeReviewFilesPresent.length);
        expect(ledger.counts.canonicalRecoveryInventoryFiles).toBe(recoveryInventory?.deliveries?.length);
        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json'), 'utf8'))
            .toBe(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
    });

    it('preserves catalog-only recovery inventory across clean-worktree reconciliation and a second run', () => {
        const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-art-reconcile-'));
        try {
            const publicArt = path.join(fixtureRoot, 'public/academy/art');
            const hostedArt = path.join(fixtureRoot, 'docs/public/academy/art');
            const recoveryRoot = path.join(fixtureRoot, 'docs/academy/recovery');
            fs.mkdirSync(publicArt, { recursive: true });
            fs.mkdirSync(hostedArt, { recursive: true });
            fs.mkdirSync(recoveryRoot, { recursive: true });
            const runtimeBytes = Buffer.from('runtime-art');
            const missingRecoveryBytes = Buffer.from('catalog-only-recovery-art');
            const runtimeSha256 = crypto.createHash('sha256').update(runtimeBytes).digest('hex');
            const recoverySha256 = crypto.createHash('sha256').update(missingRecoveryBytes).digest('hex');
            fs.writeFileSync(path.join(publicArt, 'runtime.png'), runtimeBytes);
            const usage = {
                rules: { directoryApprovalForbidden: true },
                counts: {
                    runtimeAssetHomes: 0,
                    runtimeFiles: 0,
                    nonRuntimeReviewFiles: 0,
                    nonRuntimeReviewFilesPresent: 0,
                    canonicalRecoveryInventoryFiles: 0,
                },
                assets: [
                    {
                        id: 'runtime',
                        verdict: 'approved-runtime',
                        runtimeHome: ['fixture'],
                        deliveries: [{ path: '/academy/art/runtime.png', sha256: runtimeSha256 }],
                    },
                    {
                        id: 'recovered-art-review-collection-v1',
                        verdict: 'review-candidate/non-runtime',
                        runtimeHome: [],
                        deliveries: [],
                    },
                ],
            };
            const catalog = {
                mode: 'catalog-only',
                canonicalImages: [
                    { path: 'public/academy/art/runtime.png', sha256: runtimeSha256 },
                    {
                        path: 'public/academy/art/_incoming/missing.png',
                        sha256: recoverySha256,
                    },
                ],
            };
            fs.writeFileSync(path.join(publicArt, 'ASSET-USAGE.json'), JSON.stringify(usage));
            fs.writeFileSync(path.join(hostedArt, 'ASSET-USAGE.json'), JSON.stringify(usage));
            fs.writeFileSync(path.join(recoveryRoot, 'ACADEMY-ART-CATALOG.json'), JSON.stringify(catalog));

            const reconcile = () =>
                execFileSync(process.execPath, [path.resolve('scripts/reconcile-academy-art-usage.mjs')], {
                    cwd: path.resolve('.'),
                    env: {
                        ...process.env,
                        ACADEMY_ART_RECONCILE_REPO_ROOT: fixtureRoot,
                    },
                    encoding: 'utf8',
                });
            reconcile();
            const first = fs.readFileSync(path.join(publicArt, 'ASSET-USAGE.json'), 'utf8');
            const reconciled = JSON.parse(first) as typeof ledger;
            expect(reconciled.counts).toMatchObject({
                runtimeAssetHomes: 1,
                runtimeFiles: 1,
                nonRuntimeReviewFiles: 1,
                nonRuntimeReviewFilesPresent: 0,
                canonicalRecoveryInventoryFiles: 1,
            });
            expect(reconciled.assets.find(asset => asset.id === 'recovered-art-review-collection-v1')?.deliveries).toEqual([{ path: '/academy/art/_incoming/missing.png', sha256: recoverySha256 }]);
            expect(fs.existsSync(path.join(publicArt, '_incoming/missing.png'))).toBe(false);
            expect(fs.readFileSync(path.join(hostedArt, 'ASSET-USAGE.json'), 'utf8')).toBe(first);

            reconcile();
            expect(fs.readFileSync(path.join(publicArt, 'ASSET-USAGE.json'), 'utf8')).toBe(first);
            expect(fs.readFileSync(path.join(hostedArt, 'ASSET-USAGE.json'), 'utf8')).toBe(first);
        } finally {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });

    it('keeps the recovered Rie thinking sprite as non-runtime review evidence', () => {
        expect(ledger.assets.find(asset => asset.id === 'rie-thinking-halfbody-v001')).toMatchObject({
            verdict: 'review-candidate/non-runtime',
            runtimeHome: [],
            reviewHome: ['production:sprite-performance-contract', 'production:sprite-batch-manifest'],
            status: expect.stringContaining('not-runtime-bound'),
        });
    });

    it('keeps the recovered mission ticket reviewable without claiming a runtime home', () => {
        const ticket = ledger.assets.find(asset => asset.id === 'mission-ticket-letter-v001') as AssetEntry & {
            recoveryArchive?: AssetDelivery;
        };
        expect(ticket).toMatchObject({
            verdict: 'review-candidate/recovery-only',
            runtimeHome: [],
            recoveryArchive: {
                path: 'docs/academy/recovery/recovered-assets/codex-production-v1/lesson-assets/wide/mission-ticket-letter.jpg',
                sha256: 'f2c1348655e3145eb8e2722ce0a9708330adf1b6124831ecee4dbc9d0e62a795',
            },
            status: expect.stringContaining('not-runtime-bound'),
        });
        expect(ticket.deliveries).toBeUndefined();
        expect(fs.existsSync(path.resolve('public/academy/art/events/items/mission-ticket-letter__v001.jpg'))).toBe(false);
        expect(fs.existsSync(path.resolve('docs/public/academy/art/events/items/mission-ticket-letter__v001.jpg'))).toBe(false);
    });

    it('restores the class-ensemble plate to the access gate and keeps the recovered desk on world routes', () => {
        expect(ledger.assets.find(asset => asset.id === 'campus-home-ensemble-spring')).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: ['access:campus-ensemble'],
            deliveries: [{ path: ACADEMY_ASSETS.locations.campusEnsemble.wide }],
            status: expect.stringContaining('restored-owner-preferred-class-ensemble-entrance'),
        });
        expect(ledger.assets.find(asset => asset.id === 'home-morning-desk-v001')).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: ['location:home', 'lesson:l2-l03'],
            sourceSha256: '99fa2dbb6eaf91ebb9d4f93e24141e14daa340d70f5fdcd003db05d9cd6be3c1',
            deliveries: [{ path: ACADEMY_ASSETS.locations.home.wide }],
            status: expect.stringContaining('approved single-source mobile art direction'),
        });
    });

    it('pins the cafe order inspector to the manifest-reviewed recovery byte and exact runtime home', () => {
        const item = ledger.assets.find(asset => asset.id === 'cafe-order-scene-v001');
        expect(item).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: ['reward:cafe:inspectable-order-scene'],
            sourceSha256: '13773a75ec1369166c763ac2b57f4d1f7bf01baeb7530d0638e104c80de1cf74',
            deliveries: [{
                path: ACADEMY_ASSETS.items.cafeOrderScene,
                sha256: '13773a75ec1369166c763ac2b57f4d1f7bf01baeb7530d0638e104c80de1cf74',
            }],
            status: expect.stringContaining('exact cafe order-scene inspector'),
        });
    });

    it('authorizes the reviewed no-likeness place items with exact reward homes', () => {
        const expected = {
            'station-ticket-memory-v001': [ACADEMY_ASSETS.items.stationTicket, ['reward:station:platform-ticket']],
            'konbini-shopping-list-v001': [ACADEMY_ASSETS.items.konbiniShoppingList, ['reward:konbini:shopping-receipt']],
            'ramen-quantity-board-v001': [ACADEMY_ASSETS.items.ramenQuantityBoard, ['reward:ramen:order-ticket']],
            'classroom-belongings-v001': [ACADEMY_ASSETS.items.classroomBelongings, ['reward:classroom:board-note', 'lesson:l1-l01:classroom-language-prop']],
            'library-photo-album-v001': [ACADEMY_ASSETS.items.libraryPhotoAlbum, ['reward:library:review-bookmark']],
            'street-direction-map-v001': [ACADEMY_ASSETS.items.streetDirectionMap, ['reward:street:directions-map']],
            'japan-centre-omiyage-tag-v001': [ACADEMY_ASSETS.items.japanCentreOmiyageTag, ['reward:japan-centre:omiyage-tag']],
        } as const;

        for (const [id, [assetPath, runtimeHomes]] of Object.entries(expected)) {
            const item = ledger.assets.find(asset => asset.id === id);
            expect(item).toMatchObject({
                verdict: 'approved-runtime',
                runtimeHome: runtimeHomes,
                deliveries: [{ path: assetPath }],
                status: expect.stringContaining('no-cast-likeness'),
            });
            expect(item?.sourceSha256).toBe(item?.deliveries?.[0]?.sha256);
        }
    });

    it('records the dedicated Japan Centre scene pair with exact delivered hashes and local no-likeness source', () => {
        const scene = ledger.assets.find(asset => asset.id === 'japan-centre-rain-evening-gifts-v001');
        expect(scene).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: ['location:japan-centre', 'activity:gift-counter'],
            sourceSha256: 'f5568175c3e6511e703d60dc50907bfc91a4b93d845f3adc64c8a6f8709dadfd',
            deliveries: [
                { path: ACADEMY_ASSETS.locations.japanCentre.wide, sha256: '10d578d43f4df93e8fd8ec42f89dc2d747b88333cf3d03b1bad604ad12add493' },
                { path: ACADEMY_ASSETS.locations.japanCentre.mobile, sha256: 'e83c8f8689197b395956f9dc127b2d3f80a4d780441d992aa25840c53909dba2' },
            ],
            status: expect.stringContaining('no-cast-likeness'),
        });
    });

    it('keeps the new Peter and Felix angle candidates outside approved authorization', () => {
        const ids = [
            'felix-happy-left-three-quarter-halfbody-v001',
            'felix-surprised-right-three-quarter-halfbody-v001',
            'peter-encouraging-right-three-quarter-halfbody-v001',
            'peter-thoughtful-left-three-quarter-halfbody-v001',
        ];
        for (const id of ids) {
            expect(ledger.assets.find(asset => asset.id === id)).toMatchObject({
                verdict: 'review-candidate/runtime-preview',
            });
            expect(ledger.assets.find(asset => asset.id === id)?.status).toContain('owner-approval-required');
        }
    });

    it('binds every typed runtime art path to an explicit ledger delivery', () => {
        const ledgeredPaths = new Set(deliveries.map(delivery => delivery.path));
        for (const assetPath of collectPaths(ACADEMY_ASSETS)) {
            expect(ledgeredPaths.has(assetPath), `unledgered typed asset ${assetPath}`).toBe(true);
        }
    });

    it('authorizes the glasses-on Rie reactions and removes their deprecated runtime predecessors', () => {
        const expected = {
            'rie-happy-glasses-front-near-front-halfbody-v001': {
                path: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.happy-glasses-front'].files.default,
                homes: ['lesson-feedback:correct-retry', 'dialogue:rie-positive', 'journal:rie-expression-gallery'],
            },
            'rie-sad-vulnerable-glasses-left-three-quarter-halfbody-v001': {
                path: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.sad-vulnerable-glasses-left'].files.default,
                homes: ['lesson-feedback:repair', 'dialogue:rie-precise-hint', 'dialogue:rie-vulnerable-reflection', 'journal:rie-expression-gallery'],
            },
            'rie-comedic-glasses-right-three-quarter-halfbody-v001': {
                path: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.comedic-glasses-right'].files.default,
                homes: ['dialogue:rie-light-recovery', 'journal:rie-expression-gallery'],
            },
        } as const;

        for (const [id, expectation] of Object.entries(expected)) {
            const candidate = ledger.assets.find(asset => asset.id === id);
            expect(candidate).toMatchObject({
                verdict: 'approved-runtime',
                runtimeHome: expectation.homes,
                orphan: 'active-runtime',
                status: expect.stringContaining('mobile-framing-reviewed-2026-07-17'),
            });
            expect(candidate?.deliveries?.map(delivery => delivery.path)).toEqual([expectation.path]);
        }
        for (const deprecatedId of ['rie-neutral-halfbody-v001', 'rie-happy-halfbody-v001', 'rie-repair-halfbody-v001']) {
            expect(ledger.assets.find(asset => asset.id === deprecatedId)).toBeUndefined();
        }
    });

    it('records privacy, usage, and orphan state for the priority character upgrade', () => {
        const ids = [
            'rie-neutral-glasses-front-near-front-halfbody-v001',
            'rie-happy-glasses-front-near-front-halfbody-v001',
            'rie-determined-glasses-left-three-quarter-halfbody-v001',
            'rie-encouraging-glasses-right-three-quarter-halfbody-v001',
            'rie-sad-vulnerable-glasses-left-three-quarter-halfbody-v001',
            'rie-comedic-glasses-right-three-quarter-halfbody-v001',
            'tom2-neutral-right-three-quarter-halfbody-v001',
            'tom2-encouraging-front-near-front-halfbody-v001',
            'tom2-surprised-left-three-quarter-halfbody-v001',
            'steve-neutral-front-near-front-halfbody-v001',
            'steve-happy-right-three-quarter-halfbody-v001',
            'steve-determined-left-three-quarter-halfbody-v001',
        ];
        for (const id of ids) {
            expect(ledger.assets.find(asset => asset.id === id)).toMatchObject({
                source: expect.any(String),
                privacy: expect.any(String),
                status: expect.any(String),
                usage: { runtime: expect.any(Array), review: expect.any(Array) },
                orphan: expect.stringMatching(/active-runtime|review-bound/),
            });
        }
        expect(JSON.stringify(ledger.assets.filter(asset => ids.includes(asset.id))))
            .not.toMatch(/\/var\/folders|\/Users\/|GPS|EXIF/i);
        expect(ledger.assets.find(asset => asset.id === 'onke-private-reference-gate')).toMatchObject({
            privacy: expect.stringContaining('generation-forbidden'),
            orphan: 'blocked-no-delivery',
        });
    });

    it('keeps the approved Aakash sprite separate from the rainy scene CG', () => {
        const sprite = ledger.assets.find(asset => asset.id === 'aakash-neutral-front-near-front-v009');
        const rainyScene = ledger.assets.find(asset => asset.id === 'rainy-directions-rie-aakash-v001');

        expect(sprite).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: expect.arrayContaining(['journal:aakash', 'world:person', 'lesson:l1-l01:cast']),
            status: 'owner-approved 2026-07-21; runtime replacement for neutral v005',
        });
        expect(rainyScene?.runtimeHome).not.toContain('journal:aakash');
        expect(rainyScene?.status).not.toContain('sprite');
    });

    it('records the rejected Xingyu likeness without tracking, shipping, or binding it', () => {
        const preview = ledger.assets.find(asset => asset.id === 'xingyu-neutral-halfbody-v001');
        const review = JSON.parse(fs.readFileSync(
            path.resolve('docs/academy/art-review/xingyu__neutral__halfbody__v001.json'),
            'utf8',
        )) as {
            verdict: string;
            recoveryDecision: string;
            rejection: { outputSha256: string; policy: string };
            identityEvidence: { confidence: string };
            auditedCandidates: Array<{ family: string; sha256: string[]; outcome: string; recover: boolean }>;
            blockedGap: { reason: string; requiredEvidence: string[] };
        };
        const recoveryLedger = JSON.parse(fs.readFileSync(
            path.resolve('docs/academy/recovery/ASSET-CARRYOVER.json'),
            'utf8',
        )) as {
            assets: Array<{ assetType: string; characters: string[]; sha256: string }>;
        };
        expect(preview).toMatchObject({
            verdict: 'rejected-wrong-likeness',
            runtimeHome: [],
            status: 'owner-rejected-2026-07-14; must-not-bind-or-use-as-generation-reference',
        });
        const rejectedPath = '/academy/art/characters/xingyu/xingyu__neutral__halfbody__v001.png';
        expect(preview?.deliveries).toEqual([{
            path: rejectedPath,
            sha256: review.rejection.outputSha256,
        }]);
        const trackedPaths = execFileSync('git', ['ls-files', '--',
            `public${rejectedPath}`, `docs/public${rejectedPath}`], { encoding: 'utf8' });
        expect(trackedPaths).toBe('');
        for (const root of ['public', 'docs/public']) {
            const file = path.resolve(root, rejectedPath.replace(/^\//, ''));
            if (fs.existsSync(file)) {
                expect(sha256File(file), `local recovered review evidence ${file}`)
                    .toBe(review.rejection.outputSha256);
            }
        }
        expect(collectPaths(ACADEMY_ASSETS)).not.toContain(rejectedPath);
        expect(collectPaths(ACADEMY_RUNTIME_ASSET_REGISTRY)).not.toContain(rejectedPath);

        expect(review).toMatchObject({
            verdict: 'owner-rejected-wrong-likeness',
            recoveryDecision: 'blocked-no-defensible-candidate',
            rejection: {
                outputSha256: 'd66ecccf0c25183923b83bf99f589996e21bd9d7618f9205c294084b7ee5f132',
                policy: 'must-not-bind-or-use-as-generation-reference',
            },
            identityEvidence: { confidence: 'blocked-owner-match-required' },
            blockedGap: {
                reason: expect.stringContaining('No audited standalone Xingyu payload'),
                requiredEvidence: expect.arrayContaining([
                    expect.stringContaining('Owner confirmation'),
                    expect.stringContaining('without any rejected Xingyu raster'),
                    expect.stringContaining('Owner likeness approval'),
                ]),
            },
        });
        expect(review.auditedCandidates.every(candidate => candidate.recover === false)).toBe(true);

        const auditedHashes = new Set(review.auditedCandidates.flatMap(candidate => candidate.sha256));
        const historicalStandaloneHashes = recoveryLedger.assets
            .filter(asset => asset.assetType === 'character-sprite' && asset.characters.includes('xingyu'))
            .map(asset => asset.sha256);
        expect(historicalStandaloneHashes.length).toBeGreaterThan(0);
        expect(historicalStandaloneHashes.every((sha256: string) => auditedHashes.has(sha256))).toBe(true);

        const serializedReview = JSON.stringify(review);
        expect(serializedReview).not.toMatch(/generated_images/i);
        expect(serializedReview).not.toMatch(/"prompt":/i);
    });

    it('binds Shaun only as a locked character-directory review candidate', () => {
        const preview = ledger.assets.find(asset => asset.id === 'shaun-neutral-halfbody-v001');
        expect(preview).toMatchObject({
            verdict: 'review-candidate/runtime-preview',
            runtimeHome: ['journal:shaun'],
            sourceSha256: 'a41b98d3d41efe9f4a59d8bb98879a74c6b94466546d98e2a6ead1b9d1964cea',
            status: 'owner-requested-preview; release-blocked-pending-likeness-and-cast-scale-approval',
        });
        expect(preview?.deliveries?.map(delivery => delivery.path)).toEqual([
            ACADEMY_ASSETS.characters.journalReview.shaun,
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
