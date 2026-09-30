import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ACADEMY_ASSETS, ACADEMY_APPROVED_CHARACTER_SPRITES, ACADEMY_LIKENESS_CLEARED_CAST_IDS, defaultCastPortrait } from '../../src/academy/assets';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';
import { ACADEMY_CAST_STANDARDIZATION_MANIFEST } from '../../src/academy/domain/cast-standardization-manifest';
import { createDefaultCastPortraitResolver, type DefaultCastPortraitAsset } from '../../src/academy/domain/default-cast-portrait';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import { worldRouteForPlace } from '../../src/academy/domain/world-locations';
import { CURRENT_WORLD_AUDIO_PLACE_IDS } from '../../src/academy/vn/world-location-audio';
import { EXISTING_CAST_PORTRAIT_PLACEMENTS, existingCastPortraitHomes } from '../../src/academy/domain/cast-portrait-placements';

// v1.9.3's cutouts with recorded likeness clearance. Registry or manifest
// approval alone never adds a person here; clearance must be recorded first.
const LIKENESS_CLEARED = ['aakash', 'mika', 'rie', 'ruparna', 'sam', 'sophie', 'steve', 'xingyu'];
const RUNTIME_USES = ['world:person', 'class:week-cast', 'lesson-overview:roster',
    'lesson:foundation-00:mission-host', 'lesson:foundation-00:sentence-frame-host',
    'lesson:foundation-00:repeat-request-host'] as const;

describe('default cast portraits', () => {
    it('renders runtime likenesses only for people with recorded likeness clearance', () => {
        expect([...ACADEMY_LIKENESS_CLEARED_CAST_IDS].sort()).toEqual(LIKENESS_CLEARED);
        for (const member of ACADEMY_CAST) {
            const uses = [...RUNTIME_USES, `story:cast:${member.id}` as const];
            const rendered = uses.filter(use => defaultCastPortrait(member.id, use));
            if (!LIKENESS_CLEARED.includes(member.id)) expect(rendered, member.id).toEqual([]);
        }
        expect(Object.keys(ACADEMY_ASSETS.characters.approved).sort()).toEqual(LIKENESS_CLEARED);
    });

    it.each(ACADEMY_CAST.filter(member => LIKENESS_CLEARED.includes(member.id)))(
        'provides the authorized world portrait for $id', member => {
            const neutral = ACADEMY_CAST_STANDARDIZATION_MANIFEST.find(asset => asset.castId === member.id
                && asset.expression === 'neutral' && asset.angle === 'front-near-front'
                && asset.status === 'approved' && asset.runtimePresentation === 'approved-runtime'
                && (asset.runtimeHomes as readonly string[]).includes('world:person'));
            expect(neutral).toBeDefined();
            expect(defaultCastPortrait(member.id, 'world:person')).toBe(neutral!.assetPath);
        },
    );

    it.each([
        ['aakash', ACADEMY_APPROVED_CHARACTER_SPRITES.aakash, 'world:person'],
        ['xingyu', ACADEMY_APPROVED_CHARACTER_SPRITES.xingyuNeutral, 'world:person'],
        ['mika', ACADEMY_APPROVED_CHARACTER_SPRITES.mikaSound, 'story:mika-listening'],
        ['rie', ACADEMY_APPROVED_CHARACTER_SPRITES.rie, 'world:person'],
        ['sophie', ACADEMY_APPROVED_CHARACTER_SPRITES.sophie, 'world:person'],
        ['ruparna', ACADEMY_APPROVED_CHARACTER_SPRITES.ruparnaNeutral, 'world:person'],
        ['sam', ACADEMY_APPROVED_CHARACTER_SPRITES.samNeutral, 'world:person'],
        ['steve', ACADEMY_APPROVED_CHARACTER_SPRITES.steve, 'world:person'],
    ] as const)('retains the permitted override for %s', (id, expected, use) => {
        expect(defaultCastPortrait(id, use)).toBe(expected);
    });

    it('denies uncleared, lesson-ineligible Shaun a runtime portrait without removing Journal art', () => {
        expect(defaultCastPortrait('shaun', 'world:person')).toBeUndefined();
        expect(defaultCastPortrait('shaun', 'lesson-overview:roster')).toBeUndefined();
        expect(defaultCastPortrait('shaun', 'class:week-cast')).toBeUndefined();
        expect(ACADEMY_ASSETS.characters.journalReview.shaun).toBeDefined();
        expect(defaultCastPortrait('shaun', 'lesson:foundation-00:host')).toBeUndefined();
    });

    it.each(CURRENT_WORLD_AUDIO_PLACE_IDS)('renders exact authorized image paths in %s', place => {
        for (const visits of [1, 2, 3]) {
            const root = renderWorldPlaceScreen({
                language: 'en', place, route: worldRouteForPlace(place),
                progress: { completedScenes: [], completedEncounterIds: [],
                    worldVisits: { [place]: visits }, seenIntroductions: [`place:${place}`] },
                onTravel() {}, onActivity() {}, onClaimStamp() {},
            });
            for (const actor of root.querySelectorAll<HTMLElement>('[data-world-character]')) {
                const id = actor.dataset.worldCharacter!;
                if (!LIKENESS_CLEARED.includes(id)) {
                    expect(actor.querySelector('img'), `${place}/${id}`).toBeNull();
                    expect(actor.querySelector('.academy-world-character-silhouette'), `${place}/${id}`).not.toBeNull();
                    continue;
                }
                const neutral = ACADEMY_CAST_STANDARDIZATION_MANIFEST.find(asset => asset.castId === id
                    && asset.expression === 'neutral' && asset.angle === 'front-near-front');
                expect(neutral, `${place}/${id}`).toBeDefined();
                expect(actor.querySelector('img')?.getAttribute('src'), `${place}/${id}`).toBe(neutral!.assetPath);
                expect(actor.querySelector('.academy-world-character-silhouette')).toBeNull();
            }
        }
    });

    const person = { id: 'peer', eligibility: { story: true, lessons: true, likenessRuntime: true } };
    const asset: DefaultCastPortraitAsset = {
        castId: 'peer', path: '/neutral.webp', status: 'approved', presentation: 'approved-runtime',
        homes: ['world:person', 'lesson-overview:roster'],
    };

    it.each(['story', 'likenessRuntime', 'lessons'] as const)('enforces person %s permission', permission => {
        const resolve = createDefaultCastPortraitResolver([
            { ...person, eligibility: { ...person.eligibility, [permission]: false } },
        ], [asset], { peer: asset.path }, {});
        expect(resolve('peer', permission === 'lessons' ? 'lesson-overview:roster' : 'world:person')).toBeUndefined();
    });

    it.each([
        { ...asset, homes: ['journal:peer'] },
        { ...asset, status: 'review-preview' },
        { ...asset, presentation: 'review-preview' },
        { ...asset, castId: 'someone-else' },
    ])('rejects an unauthorized asset %#', candidate => {
        const resolve = createDefaultCastPortraitResolver([person], [candidate], { peer: asset.path }, {});
        expect(resolve('peer', 'world:person')).toBeUndefined();
    });

    it('fails closed for missing, ambiguous, and unknown assets or people', () => {
        for (const assets of [[], [asset, asset]]) {
            const resolve = createDefaultCastPortraitResolver([person], assets, { peer: asset.path }, {});
            expect(resolve('peer', 'world:person')).toBeUndefined();
            expect(resolve('unknown', 'world:person')).toBeUndefined();
        }
    });

    it('falls back from a wrong-home override without promoting a Journal preview', () => {
        const preview = { ...asset, path: '/preview.webp', status: 'review-preview', homes: ['journal:peer'] };
        const resolve = createDefaultCastPortraitResolver([person], [asset, preview], { peer: asset.path }, { peer: preview.path });
        expect(resolve('peer', 'world:person')).toBe('/neutral.webp');
        expect(resolve('peer', 'story:cast:peer')).toBeUndefined();
        expect(preview.status).toBe('review-preview');
    });

    it.each(EXISTING_CAST_PORTRAIT_PLACEMENTS)('preserves only the recorded placements for $castId', placement => {
        const record = ACADEMY_CAST_STANDARDIZATION_MANIFEST.find(candidate => candidate.assetId === placement.assetId)!;
        expect(record.castId).toBe(placement.castId);
        expect(record.assetPath).toBe(placement.path);
        expect(record.status).toBe('approved');
        expect(record.runtimePresentation).toBe('approved-runtime');
        expect(createHash('sha256').update(readFileSync(`public${placement.path}`)).digest('hex')).toBe(record.sha256);
        for (const home of placement.homes) expect(defaultCastPortrait(placement.castId, home)).toBe(placement.path);
        expect(defaultCastPortrait(placement.castId, 'lesson:foundation-00:unrecorded-host')).toBeUndefined();
        expect(existingCastPortraitHomes('wrong-asset', placement.castId, placement.path)).toEqual([]);
        expect(existingCastPortraitHomes(placement.assetId, 'wrong-person', placement.path)).toEqual([]);
        expect(existingCastPortraitHomes(placement.assetId, placement.castId, '/replacement.webp')).toEqual([]);
    });

    it.each(['story', 'lessons', 'likenessRuntime'] as const)('existing placements cannot bypass revoked %s eligibility', permission => {
        const placement = EXISTING_CAST_PORTRAIT_PLACEMENTS[0];
        const resolve = createDefaultCastPortraitResolver([
            { id: placement.castId, eligibility: { story: true, lessons: true, likenessRuntime: true, [permission]: false } },
        ], [{ castId: placement.castId, path: placement.path, status: 'approved', presentation: 'approved-runtime',
            homes: existingCastPortraitHomes(placement.assetId, placement.castId, placement.path) }],
        { [placement.castId]: placement.path }, {});
        expect(resolve(placement.castId, 'lesson:foundation-00:mission-host')).toBeUndefined();
    });

    it.each([
        { status: 'review-preview', presentation: 'approved-runtime' },
        { status: 'approved', presentation: 'review-preview' },
    ])('recorded placement does not approve an asset %#', policy => {
        const placement = EXISTING_CAST_PORTRAIT_PLACEMENTS[0];
        const resolve = createDefaultCastPortraitResolver([
            { id: placement.castId, eligibility: { story: true, lessons: true, likenessRuntime: true } },
        ], [{ ...policy, castId: placement.castId, path: placement.path,
            homes: existingCastPortraitHomes(placement.assetId, placement.castId, placement.path) }],
        { [placement.castId]: placement.path }, {});
        expect(resolve(placement.castId, 'lesson:foundation-00:mission-host')).toBeUndefined();
    });
});
