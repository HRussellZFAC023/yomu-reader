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
            const recoveryRoot = path.join(fixtureRoot, 'docs/academy/recovery');
            fs.mkdirSync(publicArt, { recursive: true });
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
            // No hosted mirror is asserted here: the reconciler writes
            // public/academy only, and scripts/sync-academy.cjs regenerates
            // docs/public/academy from it on every build:academy. The real-tree
            // parity assertion above still proves that sync ran.
            reconcile();
            expect(fs.readFileSync(path.join(publicArt, 'ASSET-USAGE.json'), 'utf8')).toBe(first);
        } finally {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });

    it('replaces the recovered Rie thinking candidate with the approved thoughtful performance', () => {
        expect(ledger.assets.find(asset => asset.id === 'rie-thinking-halfbody-v001')).toBeUndefined();
        expect(ledger.assets.find(asset => asset.id === 'character-rie-thoughtful-glasses-left')).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: [
                'dialogue:rie-reflection',
                'journal:rie-expression-gallery',
                'story:cast:rie:thoughtful',
                'cast-standardization:rie',
            ],
            orphan: 'active-runtime',
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
                { path: ACADEMY_ASSETS.locations.japanCentre.wide, sha256: '23b4628c6e49d30a451a9cbf2f9f3b238d3c9c1274fcec9831fd0e25f90d81df' },
                { path: ACADEMY_ASSETS.locations.japanCentre.mobile, sha256: '6ac942b9be7b3b0d8de0ec12ddb179fe9ac983d2c89562caac65db6678ad64dd' },
            ],
            status: expect.stringContaining('no-cast-likeness'),
        });
    });

    it('authorizes the completed Felix and Peter performance families', () => {
        const felixIds = [
            'character-felix-happy-curly-dark-blond-glasses-paper-cat-front-near-front-fullbody-v002',
            'character-felix-surprised-shocked-curly-dark-blond-glasses-paper-cat-right-three-quarter-fullbody-v002',
        ];
        for (const id of felixIds) {
            expect(ledger.assets.find(asset => asset.id === id)).toMatchObject({
                verdict: 'approved-runtime',
                orphan: 'active-runtime',
                status: expect.stringContaining('runtime-bound house-style sprite'),
            });
        }
        for (const id of [
            'character-peter-encouraging-listening-quiet-observer-right-three-quarter-fullbody-v003',
            'character-peter-thoughtful-quiet-observer-left-three-quarter-fullbody-v003',
        ]) {
            expect(ledger.assets.find(asset => asset.id === id)).toMatchObject({
                verdict: 'approved-runtime',
                orphan: 'active-runtime',
                status: expect.stringContaining('runtime-bound house-style sprite'),
            });
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
            'character-rie-happy-glasses-front': {
                path: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.happy-glasses-front'].files.default,
                homes: ['lesson-feedback:correct-retry', 'dialogue:rie-positive', 'journal:rie-expression-gallery'],
            },
            'character-rie-sad-vulnerable-glasses-left': {
                path: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.sad-vulnerable-glasses-left'].files.default,
                homes: ['lesson-feedback:repair', 'dialogue:rie-precise-hint', 'dialogue:rie-vulnerable-reflection', 'journal:rie-expression-gallery'],
            },
            'character-rie-comedic-glasses-right': {
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
                status: expect.any(String),
            });
            expect(candidate?.deliveries?.map(delivery => delivery.path)).toEqual([expectation.path]);
        }
        for (const deprecatedId of ['rie-neutral-halfbody-v001', 'rie-happy-halfbody-v001', 'rie-repair-halfbody-v001']) {
            expect(ledger.assets.find(asset => asset.id === deprecatedId)).toBeUndefined();
        }
    });

    it('records provenance, usage, and orphan state for the priority character upgrade', () => {
        const ids = [
            'character-rie-neutral-glasses',
            'character-rie-happy-glasses-front',
            'character-rie-determined-glasses-left',
            'character-rie-encouraging-glasses-right',
            'character-rie-sad-vulnerable-glasses-left',
            'character-rie-comedic-glasses-right',
            'character-tom2-neutral-reserved-dark-hair-notebook-front-near-front-halfbody-v002',
            'character-tom2-encouraging-listening-reserved-dark-hair-notebook-right-three-quarter-halfbody-v002',
            'character-tom2-happy-reserved-dark-hair-notebook-front-near-front-halfbody-v002',
            'character-tom2-thoughtful-reserved-dark-hair-notebook-left-three-quarter-halfbody-v002',
            'character-tom2-determined-reserved-dark-hair-notebook-left-three-quarter-halfbody-v002',
            'character-tom2-surprised-shocked-reserved-dark-hair-notebook-right-three-quarter-halfbody-v002',
            'character-tom2-sad-vulnerable-reserved-dark-hair-notebook-left-three-quarter-halfbody-v002',
            'character-steve-neutral-silver-hair-glasses-family-message-front-near-front-halfbody-v002',
            'character-steve-encouraging-listening-silver-hair-glasses-family-message-right-three-quarter-halfbody-v002',
            'character-steve-happy-silver-hair-glasses-family-message-front-near-front-halfbody-v002',
            'character-steve-thoughtful-silver-hair-glasses-family-message-left-three-quarter-halfbody-v002',
            'character-steve-determined-silver-hair-glasses-family-message-left-three-quarter-halfbody-v002',
            'character-steve-surprised-shocked-silver-hair-glasses-family-message-right-three-quarter-halfbody-v002',
            'character-steve-sad-vulnerable-silver-hair-glasses-family-message-left-three-quarter-halfbody-v002',
        ];
        for (const id of ids) {
            expect(ledger.assets.find(asset => asset.id === id)).toMatchObject({
                source: expect.any(String),
                provenance: expect.any(String),
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
        const sprite = ledger.assets.find(
            asset => asset.id === 'character-aakash-neutral-route-map-burgundy-hoodie-front-near-front-fullbody-v010',
        );
        const rainyScene = ledger.assets.find(asset => asset.id === 'rainy-directions-rie-aakash-v001');

        expect(sprite).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: expect.arrayContaining(['journal:aakash', 'world:person', 'lesson:l1-l01:cast']),
            status: 'identity-locked, visually inspected, runtime-bound house-style sprite',
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

    it('binds Shaun’s approved family to the character directory and story runtime', () => {
        const neutral = ledger.assets.find(
            asset => asset.id === 'character-shaun-neutral-layered-light-brown-round-glasses-beige-fleece-front-near-front-fullbody-v002',
        );
        expect(neutral).toMatchObject({
            verdict: 'approved-runtime',
            runtimeHome: expect.arrayContaining(['journal:shaun', 'class:people', 'story:cast:shaun']),
            sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            status: expect.stringContaining('runtime-bound house-style sprite'),
        });
        expect(neutral?.deliveries?.map(delivery => delivery.path)).toEqual([
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
