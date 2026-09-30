import type { AcademyCastMember } from './cast-registry';

export type DefaultCastPortraitUse = 'world:person' | 'class:week-cast' | 'lesson-overview:roster'
    | `story:${string}` | `lesson:${string}`;

export interface DefaultCastPortraitAsset {
    readonly castId: string;
    readonly path: string;
    readonly status: string;
    readonly presentation: string;
    readonly homes: readonly string[];
}

/**
 * Defaults are delivery choices, never permission grants or review previews.
 * `people` is the likeness-cleared cast only; anyone absent resolves to nothing.
 */
export function createDefaultCastPortraitResolver(
    people: readonly Pick<AcademyCastMember, 'id' | 'eligibility'>[],
    assets: readonly DefaultCastPortraitAsset[],
    neutrals: Readonly<Partial<Record<string, string>>>,
    overrides: Readonly<Partial<Record<string, string>>>,
): (id: string, use: DefaultCastPortraitUse) => string | undefined {
    const peopleById = new Map(people.map(person => [person.id, person]));
    const assetsByPath = new Map<string, DefaultCastPortraitAsset[]>();
    for (const asset of assets) {
        const matches = assetsByPath.get(asset.path) ?? [];
        matches.push(asset);
        assetsByPath.set(asset.path, matches);
    }
    return (id, use) => {
        const person = peopleById.get(id);
        if (!person?.eligibility.story || !person.eligibility.likenessRuntime) return undefined;
        const lessonUse = use === 'class:week-cast' || use === 'lesson-overview:roster' || use.startsWith('lesson:');
        if (lessonUse && !person.eligibility.lessons) return undefined;
        for (const path of [overrides[id], neutrals[id]]) {
            if (!path) continue;
            const records = assetsByPath.get(path);
            if (records?.length !== 1) continue;
            const asset = records[0]!;
            if (asset.castId === id && asset.status === 'approved' && asset.presentation === 'approved-runtime'
                && asset.homes.includes(use)) return path;
        }
        return undefined;
    };
}
