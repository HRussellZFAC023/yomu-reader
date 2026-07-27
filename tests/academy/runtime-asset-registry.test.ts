import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_APPROVED_CHARACTER_SPRITES,
    ACADEMY_ASSETS,
    ACADEMY_CAST_SPRITE_COVERAGE,
    ACADEMY_ITEM_PRESENTATION_COVERAGE,
    ACADEMY_PURPOSEFUL_ASSET_COVERAGE,
    ACADEMY_RUNTIME_ASSET_REGISTRY,
} from '../../src/academy/assets';
import { getAcademyCastMember } from '../../src/academy/domain/cast-registry';
import { filesHaveSameContent } from './helpers/hash-memo';

interface RuntimeLedgerAsset {
    readonly verdict: string;
    readonly runtimeHome?: readonly string[] | null;
    readonly deliveries?: readonly { path: string; sha256: string }[];
}

describe('Academy runtime asset registry', () => {
    const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8')) as {
        assets: RuntimeLedgerAsset[];
    };
    const authorized = ledger.assets.filter(asset =>
        asset.verdict.startsWith('approved-runtime') || asset.verdict === 'review-candidate/runtime-preview',
    );
    const authorizedVisualPaths = new Set(authorized
        .flatMap(asset => asset.deliveries ?? [])
        .map(delivery => delivery.path)
        .filter(assetPath => !assetPath.endsWith('.json')));

    it('keeps every rendered typed asset registered and every authorized visual file explicit', () => {
        const registryPaths = registryAssetPaths();
        expect(new Set(registryPaths).size).toBe(registryPaths.length);
        expect(new Set(registryPaths)).toEqual(authorizedVisualPaths);
        for (const assetPath of collectAssetPaths(ACADEMY_ASSETS)) {
            expect(registryPaths).toContain(assetPath);
        }
    });

    it('exposes no typed asset collection without a runtime consumer', () => {
        const runtimeSource = readTypeScriptFiles(path.resolve('src/academy'))
            .filter(file => file !== path.resolve('src/academy/assets.ts'))
            .map(file => fs.readFileSync(file, 'utf8'))
            .join('\n');

        for (const key of Object.keys(ACADEMY_ASSETS)) {
            expect(runtimeSource, `ACADEMY_ASSETS.${key} is registry-only`)
                .toMatch(new RegExp(`ACADEMY_ASSETS\\.${escapeRegExp(key)}\\b`, 'u'));

            const collection = ACADEMY_ASSETS[key as keyof typeof ACADEMY_ASSETS];
            if (!collection || typeof collection !== 'object') continue;
            const prefix = `ACADEMY_ASSETS.${key}`;
            const hasDynamicConsumer = new RegExp(`${escapeRegExp(prefix)}(?:\\s+as|\\[)`, 'u').test(runtimeSource);
            if (hasDynamicConsumer) continue;
            for (const member of Object.keys(collection)) {
                expect(runtimeSource, `${prefix}.${member} is registry-only`)
                    .toMatch(new RegExp(`${escapeRegExp(prefix)}\\.${escapeRegExp(member)}\\b`, 'u'));
            }
        }
    });

    it('requires physical, authorized files and an explicit runtime home', () => {
        for (const [id, asset] of Object.entries(ACADEMY_RUNTIME_ASSET_REGISTRY)) {
            expect(asset.runtimeHomes.length, `${id} has no runtime home`).toBeGreaterThan(0);
            for (const assetPath of Object.values(asset.files)) {
                const ledgerAsset = authorized.find(candidate => candidate.deliveries?.some(delivery => delivery.path === assetPath));
                expect(assetPath, id).toMatch(/^\/academy\/art\//);
                expect(authorizedVisualPaths.has(assetPath), `${id} is not runtime-authorized`).toBe(true);
                expect(fs.existsSync(path.resolve('public', assetPath.slice(1))), `${id} is missing ${assetPath}`).toBe(true);
                expect(ledgerAsset?.runtimeHome, `${id} runtime homes drifted`).toEqual(asset.runtimeHomes);
                expect(asset.status === 'review-preview', `${id} preview status drifted`).toBe(
                    ledgerAsset?.verdict.includes('preview') ?? false,
                );
            }
        }
    });

    it('wires only likeness-cleared cast performances into the approved sprite map', () => {
        expect(ACADEMY_APPROVED_CHARACTER_SPRITES).toEqual({
            aakash: '/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v009.png',
            xingyuNeutral: '/academy/art/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.png',
            xingyuListening: '/academy/art/characters/xingyu/xingyu__encouraging-listening-short-hair-round-glasses__right-three-quarter__fullbody__v002.png',
            mikaSound: '/academy/art/characters/mika/mika__encouraging-listening-headphones__right-three-quarter__fullbody__v002.png',
            rie: '/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.png',
            rieHappy: '/academy/art/characters/rie/rie__happy-glasses__front-near-front__halfbody__v001.png',
            rieDetermined: '/academy/art/characters/rie/rie__determined-glasses__left-three-quarter__halfbody__v001.png',
            rieEncouraging: '/academy/art/characters/rie/rie__encouraging-glasses__right-three-quarter__halfbody__v001.png',
            rieSadVulnerable: '/academy/art/characters/rie/rie__sad-vulnerable-glasses__left-three-quarter__halfbody__v001.png',
            rieComedic: '/academy/art/characters/rie/rie__comedic-glasses__right-three-quarter__halfbody__v001.png',
            sophie: '/academy/art/characters/sophie/sophie__neutral__front-near-front__halfbody__v004.png',
            sophieEncouraging: '/academy/art/characters/sophie/sophie__encouraging-listening__right-three-quarter__halfbody__v004.png',
            sophieDetermined: '/academy/art/characters/sophie/sophie__determined__left-three-quarter__halfbody__v004.png',
            ruparnaNeutral: '/academy/art/characters/ruparna/ruparna__neutral__front-near-front__halfbody__v002.png',
            ruparnaNoteRoute: '/academy/art/characters/ruparna/ruparna__note-route__right-three-quarter__halfbody__v002.png',
            samNeutral: '/academy/art/characters/sam/sam__standardized-neutral__front-near-front__halfbody__v001.png',
            samListening: '/academy/art/characters/sam/sam__standardized-encouraging-listening__front-near-front__halfbody__v001.png',
            steve: '/academy/art/characters/steve/steve__neutral__front-near-front__halfbody__v001.png',
            steveHappy: '/academy/art/characters/steve/steve__happy__right-three-quarter__halfbody__v001.png',
            steveDetermined: '/academy/art/characters/steve/steve__determined__left-three-quarter__halfbody__v001.png',
        });
        expect(ACADEMY_ASSETS.characters.approved).toEqual({
            aakash: ACADEMY_APPROVED_CHARACTER_SPRITES.aakash,
            xingyu: ACADEMY_APPROVED_CHARACTER_SPRITES.xingyuNeutral,
            mika: ACADEMY_APPROVED_CHARACTER_SPRITES.mikaSound,
            rie: ACADEMY_APPROVED_CHARACTER_SPRITES.rie,
            sophie: ACADEMY_APPROVED_CHARACTER_SPRITES.sophie,
            ruparna: ACADEMY_APPROVED_CHARACTER_SPRITES.ruparnaNeutral,
            sam: ACADEMY_APPROVED_CHARACTER_SPRITES.samNeutral,
            steve: ACADEMY_APPROVED_CHARACTER_SPRITES.steve,
        });
        for (const id of [
            'character.aakash.neutral',
            'character.xingyu.listening',
            'character.mika.encouraging-listening-headphones-right-three-quarter-fullbody-v002',
            'character.sophie.neutral-front-near-front-halfbody-v004',
            'character.sophie.encouraging-listening-right-three-quarter-halfbody-v004',
            'character.sophie.determined-left-three-quarter-halfbody-v004',
            'character.rie.neutral-glasses',
            'character.rie.happy-glasses-front',
            'character.rie.determined-glasses-left',
            'character.rie.encouraging-glasses-right',
            'character.rie.sad-vulnerable-glasses-left',
            'character.rie.comedic-glasses-right',
            'character.ruparna.neutral-front-near-front-halfbody-v002',
            'character.ruparna.note-route-right-three-quarter-halfbody-v002',
            'character.sam.standardized-neutral-front-near-front-halfbody-v001',
            'character.sam.standardized-encouraging-listening-front-near-front-halfbody-v001',
            'character.steve.neutral-front',
            'character.steve.happy-right',
            'character.steve.determined-left',
        ] as const) {
            expect(ACADEMY_RUNTIME_ASSET_REGISTRY[id].status).toBe('approved');
        }
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['character.peter.neutral'].status).toBe('review-preview');
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['character.felix.neutral'].status).toBe('review-preview');
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['character.tom2.neutral-right'].status).toBe('review-preview');
    });

    it('covers every cast cutout with an explicit presentation gate and runtime home', () => {
        const spriteIds = Object.entries(ACADEMY_RUNTIME_ASSET_REGISTRY)
            .filter(([, asset]) => asset.kind === 'character-sprite')
            .map(([id]) => id)
            .sort();
        expect(Object.keys(ACADEMY_CAST_SPRITE_COVERAGE).sort()).toEqual(spriteIds);

        for (const [id, coverage] of Object.entries(ACADEMY_CAST_SPRITE_COVERAGE)) {
            const asset = ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY];
            expect(asset.runtimeHomes).toContain(coverage.primaryUse);
            expect(coverage.presentation === 'approved-runtime').toBe(asset.status === 'approved');
            if (coverage.presentation === 'approved-runtime') {
                expect(getAcademyCastMember(coverage.castId).eligibility.likenessRuntime, `${id} bypasses cast consent`)
                    .toBe(true);
            }
        }
    });

    it('exhaustively types the purpose and primary use of every world, event, and item asset', () => {
        const purposefulAssets = Object.entries(ACADEMY_RUNTIME_ASSET_REGISTRY)
            .filter(([, asset]) => ['background', 'event-art', 'item-art'].includes(asset.kind))
            .map(([id]) => id)
            .sort();
        expect(Object.keys(ACADEMY_PURPOSEFUL_ASSET_COVERAGE).sort()).toEqual(purposefulAssets);

        for (const [id, coverage] of Object.entries(ACADEMY_PURPOSEFUL_ASSET_COVERAGE)) {
            const asset = ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY];
            expect(asset.runtimeHomes, `${id} has a stale primary use`).toContain(coverage.primaryUse);
            expect(coverage.purpose).toBe(asset.kind === 'background'
                ? 'world-scene'
                : asset.kind === 'event-art' ? 'story-event' : 'inspectable-item');
        }
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY).not.toHaveProperty('item.mission-ticket-letter');
        expect(Object.keys(ACADEMY_ASSETS.items).sort()).toEqual([
            'cafeOrderScene',
            'classroomBelongings',
            'japanCentreOmiyageTag',
            'konbiniShoppingList',
            'libraryPhotoAlbum',
            'ramenQuantityBoard',
            'stationTicket',
            'streetDirectionMap',
        ]);
    });

    it('binds every approved item asset to its exact world presentation and ledger home', () => {
        const itemIds = Object.entries(ACADEMY_RUNTIME_ASSET_REGISTRY)
            .filter(([, asset]) => asset.kind === 'item-art')
            .map(([id]) => id)
            .sort();
        expect(Object.keys(ACADEMY_ITEM_PRESENTATION_COVERAGE).sort()).toEqual(itemIds);

        for (const [id, coverage] of Object.entries(ACADEMY_ITEM_PRESENTATION_COVERAGE)) {
            const asset = ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY];
            expect(coverage.presentation).toBe(id === 'item.cafe-order-scene'
                ? 'inspectable-source-prop'
                : 'world-reward-prop');
            expect(asset.runtimeHomes).toContain(coverage.primaryUse);
            expect(asset.status).toBe('approved');
        }
    });

    it('promotes the reviewed cafe order scene only into the cafe inspector', () => {
        const asset = ACADEMY_RUNTIME_ASSET_REGISTRY['item.cafe-order-scene'];
        const archive = path.resolve('docs/academy/recovery/recovered-assets/codex-production-v1/lesson-assets/wide/food-cafe-order.jpg');
        expect(asset).toMatchObject({
            kind: 'item-art',
            status: 'approved',
            provenance: 'recovered-academy-tree',
            runtimeHomes: ['reward:cafe:inspectable-order-scene'],
            files: { default: ACADEMY_ASSETS.items.cafeOrderScene },
        });
        expect(filesHaveSameContent(path.resolve('public', ACADEMY_ASSETS.items.cafeOrderScene.slice(1)), archive)).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public', ACADEMY_ASSETS.items.cafeOrderScene.slice(1)), archive)).toBe(true);
    });

    it('recovers six no-likeness place items into exact reward homes and mirrors', () => {
        const recovered = {
            'item.station-ticket': ['mobile/travel-ticket-memory.jpg', ACADEMY_ASSETS.items.stationTicket],
            'item.konbini-shopping-list': ['wide/handwriting-food-backplate.jpg', ACADEMY_ASSETS.items.konbiniShoppingList],
            'item.ramen-quantity-board': ['wide/kanji-size-quantity-mnemonic.jpg', ACADEMY_ASSETS.items.ramenQuantityBoard],
            'item.classroom-belongings': ['wide/classroom-belongings.jpg', ACADEMY_ASSETS.items.classroomBelongings],
            'item.library-photo-album': ['wide/class-keepsake-photo-album.jpg', ACADEMY_ASSETS.items.libraryPhotoAlbum],
            'item.street-direction-map': ['wide/direction-map-tabletop.jpg', ACADEMY_ASSETS.items.streetDirectionMap],
        } as const;

        for (const [id, [archivePath, assetPath]] of Object.entries(recovered)) {
            const asset = ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY];
            expect(asset).toMatchObject({
                kind: 'item-art',
                status: 'approved',
                provenance: 'recovered-academy-tree',
                files: { default: assetPath },
            });
            const expectedHomes = id === 'item.classroom-belongings'
                ? ['reward:classroom:board-note', 'lesson:l1-l01:classroom-language-prop']
                : [expect.stringMatching(/^reward:/)];
            expect(asset.runtimeHomes).toEqual(expectedHomes);
            const archived = path.resolve(
                'docs/academy/recovery/recovered-assets/codex-production-v1/lesson-assets',
                archivePath,
            );
            expect(filesHaveSameContent(path.resolve('public', assetPath.slice(1)), archived)).toBe(true);
            expect(filesHaveSameContent(path.resolve('docs/public', assetPath.slice(1)), archived)).toBe(true);
        }
    });

    it('keeps the Japan Centre tag as a generated no-likeness prop derived from approved local art', () => {
        const asset = ACADEMY_RUNTIME_ASSET_REGISTRY['item.japan-centre-omiyage-tag'];
        expect(asset).toMatchObject({
            kind: 'item-art',
            status: 'approved',
            provenance: 'current-production',
            runtimeHomes: ['reward:japan-centre:omiyage-tag'],
            files: { default: ACADEMY_ASSETS.items.japanCentreOmiyageTag },
        });
    });

    it('binds Japan Centre to its dedicated generated wide/mobile pair, not the konbini fallback', () => {
        const asset = ACADEMY_RUNTIME_ASSET_REGISTRY['location.japan-centre'];
        expect(asset).toMatchObject({
            kind: 'background',
            status: 'approved',
            provenance: 'current-production',
            runtimeHomes: ['location:japan-centre', 'activity:gift-counter'],
            files: ACADEMY_ASSETS.locations.japanCentre,
        });
        expect(Object.values(asset.files)).not.toEqual(Object.values(ACADEMY_ASSETS.locations.konbini));
        for (const assetPath of Object.values(asset.files)) {
            expect(fs.existsSync(path.resolve('public', assetPath.slice(1)))).toBe(true);
            expect(fs.existsSync(path.resolve('docs/public', assetPath.slice(1)))).toBe(true);
        }
    });

    it('binds the restored class-ensemble plate to the access gate', () => {
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['location.campus-ensemble']).toMatchObject({
            kind: 'background',
            status: 'approved',
            provenance: 'recovered-academy-tree',
            runtimeHomes: ['access:campus-ensemble'],
            files: {
                wide: '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp',
                mobile: '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp',
            },
            responsivePresentation: {
                mobile: {
                    strategy: 'art-directed-crop',
                    sourceVariant: 'wide',
                    objectPosition: '72% center',
                },
            },
        });
    });

    it('promotes the recovered no-likeness home desk only to the existing home routes', () => {
        const home = ACADEMY_RUNTIME_ASSET_REGISTRY['location.home'];
        const archive = path.resolve('docs/academy/recovery/recovered-assets/codex-production-v1/lesson-assets/wide/home-morning-desk.jpg');
        expect(home).toMatchObject({
            kind: 'background',
            status: 'approved',
            provenance: 'recovered-academy-tree',
            runtimeHomes: ['location:home', 'lesson:l2-l03'],
            files: {
                wide: '/academy/art/locations/wide/home-morning-desk__routine--wide.jpg',
                mobile: '/academy/art/locations/wide/home-morning-desk__routine--wide.jpg',
            },
            responsivePresentation: {
                mobile: {
                    strategy: 'art-directed-crop',
                    sourceVariant: 'wide',
                    objectPosition: '62% center',
                },
            },
        });
        for (const assetPath of Object.values(home.files)) {
            expect(filesHaveSameContent(path.resolve('public', assetPath.slice(1)), archive)).toBe(true);
            expect(filesHaveSameContent(path.resolve('docs/public', assetPath.slice(1)), archive)).toBe(true);
        }
    });

    it.each([
        ['location.station', 'railway-station__day-commute', ['location:station', 'activity:station-announcements', 'lesson:l2-l02', 'lesson:l2-l05', 'lesson:l2-l10', 'lesson:l2-l11']],
        ['location.station-platform', 'tube-platform__blue-hour-rain', ['location:station-platform', 'activity:station-platform-transfer']],
    ] as const)('promotes the reviewed %s pair from the recovery archive', (id, archiveStem, runtimeHomes) => {
        const station = ACADEMY_RUNTIME_ASSET_REGISTRY[id];
        expect(station).toMatchObject({
            kind: 'background',
            status: 'approved',
            provenance: 'recovered-academy-tree',
            runtimeHomes,
        });
        expect(Object.values(station.files)).toHaveLength(2);
        for (const [variant, assetPath] of Object.entries(station.files)) {
            const archived = path.resolve(
                `docs/academy/recovery/recovered-assets/codex-production-v1/backgrounds/${variant}/${archiveStem}--${variant}.webp`,
            );
            expect(filesHaveSameContent(path.resolve('public', assetPath.slice(1)), archived)).toBe(true);
            expect(filesHaveSameContent(path.resolve('docs/public', assetPath.slice(1)), archived)).toBe(true);
        }
    });

    it('recovers the reviewed street pair into the open rainy-directions route and its exact mirrors', () => {
        const street = ACADEMY_RUNTIME_ASSET_REGISTRY['location.street'];
        expect(street).toMatchObject({
            kind: 'background',
            status: 'approved',
            provenance: 'recovered-academy-tree',
            runtimeHomes: ['location:street', 'activity:rainy-directions'],
        });
        for (const [variant, assetPath] of Object.entries(street.files)) {
            const archived = path.resolve(
                `docs/academy/recovery/recovered-assets/codex-production-v1/backgrounds/${variant}/bloomsbury-street__day-route--${variant}.webp`,
            );
            const publicFile = path.resolve('public', assetPath.slice(1));
            const docsFile = path.resolve('docs/public', assetPath.slice(1));
            expect(filesHaveSameContent(publicFile, archived)).toBe(true);
            expect(filesHaveSameContent(docsFile, archived)).toBe(true);
        }
    });

    it.each([
        ['location.ramen', 'ramen__evening-steam', ['location:ramen', 'activity:ramen-ordering', 'lesson:l2-l07']],
        ['location.park', 'park__day-overcast', ['location:park', 'activity:park-weather-sketchbook', 'lesson:l2-l08']],
    ] as const)('promotes the hash-verified %s pair into its open world route', (id, archiveStem, runtimeHomes) => {
        const asset = ACADEMY_RUNTIME_ASSET_REGISTRY[id];
        expect(asset).toMatchObject({
            kind: 'background',
            status: 'approved',
            provenance: 'recovered-academy-tree',
            runtimeHomes,
        });
        for (const [variant, assetPath] of Object.entries(asset.files)) {
            const archived = path.resolve(
                `docs/academy/recovery/recovered-assets/codex-production-v1/backgrounds/${variant}/${archiveStem}--${variant}.webp`,
            );
            expect(filesHaveSameContent(path.resolve('public', assetPath.slice(1)), archived)).toBe(true);
            expect(filesHaveSameContent(path.resolve('docs/public', assetPath.slice(1)), archived)).toBe(true);
        }
    });

    it('keeps unpromoted recovery files visibly orphaned from runtime', () => {
        const recovery = JSON.parse(fs.readFileSync(path.resolve('docs/academy/recovery/ASSET-CARRYOVER.json'), 'utf8')) as {
            counts: { byOrphanState: Record<string, number> };
            assets: Array<{ orphanState: string; destination: { status: string; path: string | null } }>;
        };
        expect(recovery.counts.byOrphanState['historical-runtime-only']).toBeGreaterThan(0);
        expect(recovery.counts.byOrphanState['never-runtime-referenced']).toBeGreaterThan(0);
        const archivedOrphans = recovery.assets.filter(asset => asset.destination.status === 'recovered-non-runtime');
        expect(archivedOrphans.length).toBeGreaterThan(0);
        expect(archivedOrphans.every(asset => asset.orphanState === 'recovered-archive-only')).toBe(true);
        expect(archivedOrphans.some(asset => asset.destination.path?.includes('lesson-assets/'))).toBe(true);
    });
});

function registryAssetPaths(): string[] {
    const byPath = new Map<string, string>();
    for (const [id, asset] of Object.entries(ACADEMY_RUNTIME_ASSET_REGISTRY)) {
        for (const assetPath of Object.values(asset.files)) {
            const owner = byPath.get(assetPath);
            if (owner && owner !== id) throw new TypeError(`${assetPath} is owned by both ${owner} and ${id}.`);
            byPath.set(assetPath, id);
        }
    }
    return [...byPath.keys()].sort();
}

function collectAssetPaths(value: unknown): string[] {
    if (typeof value === 'string') return value.startsWith('/academy/art/') ? [value] : [];
    if (!value || typeof value !== 'object') return [];
    return [...new Set(Object.values(value).flatMap(collectAssetPaths))].sort();
}

function readTypeScriptFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return readTypeScriptFiles(target);
        return entry.isFile() && target.endsWith('.ts') ? [target] : [];
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
