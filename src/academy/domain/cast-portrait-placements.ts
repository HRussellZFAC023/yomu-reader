/**
 * Existing renderer placements missing from the asset routing metadata.
 * These do not grant likeness permission or approve assets. The resolver still
 * requires the person and exact asset to be approved for runtime delivery.
 * Baseline renderer paths and byte hashes: planning/rebuild-20260913/portrait-placements.md.
 */
export const EXISTING_CAST_PORTRAIT_PLACEMENTS = [
    {
        assetId: 'character.rie.neutral-glasses', castId: 'rie',
        path: '/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.webp',
        homes: ['lesson:foundation-00:mission-host', 'lesson:foundation-00:sentence-frame-host', 'lesson:foundation-00:repeat-request-host'],
    },
    {
        assetId: 'character.aakash.neutral-route-map-burgundy-hoodie-front-near-front-fullbody-v010', castId: 'aakash',
        path: '/academy/art/characters/aakash/aakash__neutral-route-map-burgundy-hoodie__front-near-front__fullbody__v010.webp',
        homes: ['lesson:foundation-00:mission-host', 'lesson:foundation-00:repeat-request-host'],
    },
    {
        assetId: 'character.sophie.neutral-front-near-front-halfbody-v004', castId: 'sophie',
        path: '/academy/art/characters/sophie/sophie__neutral__front-near-front__halfbody__v004.webp',
        homes: ['lesson:foundation-00:mission-host', 'lesson:foundation-00:sentence-frame-host'],
    },
    {
        assetId: 'character.mika.encouraging-listening-headphones-right-three-quarter-fullbody-v002', castId: 'mika',
        path: '/academy/art/characters/mika/mika__encouraging-listening-headphones__right-three-quarter__fullbody__v002.webp',
        homes: ['lesson:foundation-00:mission-host', 'story:cast:mika'],
    },
] as const;

export function existingCastPortraitHomes(assetId: string, castId: string, path: string): readonly string[] {
    return EXISTING_CAST_PORTRAIT_PLACEMENTS.find(placement => placement.assetId === assetId
        && placement.castId === castId && placement.path === path)?.homes ?? [];
}
