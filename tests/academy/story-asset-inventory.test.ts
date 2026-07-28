import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';

interface StoryAssetInventory {
    readonly summary: Readonly<{
        chapters: number;
        scenes: number;
        generationQueue: number;
    }>;
    readonly chapters: readonly Readonly<{
        chapter: number;
        id: string;
        sourceFile: string;
        scenes: readonly Readonly<{
            sceneId: string;
            locationId: string;
            cast: readonly Readonly<{ id: string }>[];
            background: Readonly<{ status: string }>;
            openingImage: Readonly<{ status: string; runtimeHome: string }>;
            exitImage: Readonly<{ status: string; runtimeHome: string }> | null;
            propCues: readonly Readonly<{
                cueId: string;
                nodeId: string;
                status: string;
                runtimeHome: string;
                runtimeRenderer: string | null;
            }>[];
        }>[];
    }>[];
    readonly generationQueue: readonly Readonly<{
        chapter: number;
        chapterId: string;
        sceneId: string;
        cueId: string | null;
        kind: string;
        runtimeHome: string;
        status: string;
    }>[];
}

describe('Academy story art inventory', () => {
    const inventory = JSON.parse(
        fs.readFileSync(path.resolve('docs/academy/art/STORY-ASSET-INVENTORY.json'), 'utf8'),
    ) as StoryAssetInventory;

    it('covers every authored chapter and scene exactly once', () => {
        expect(inventory.summary.chapters).toBe(48);
        expect(inventory.chapters.map(chapter => chapter.chapter)).toEqual(
            Array.from({ length: 48 }, (_, index) => index + 1),
        );

        const sourceSceneIds = inventory.chapters.flatMap(chapter => {
            const source = JSON.parse(fs.readFileSync(path.resolve(chapter.sourceFile), 'utf8')) as {
                readonly id: string;
                readonly scenes: readonly Readonly<{ id: string }>[];
            };
            expect(source.id).toBe(chapter.id);
            expect(chapter.scenes.map(scene => scene.sceneId)).toEqual(source.scenes.map(scene => scene.id));
            return source.scenes.map(scene => scene.id);
        });
        expect(inventory.summary.scenes).toBe(sourceSceneIds.length);
        expect(new Set(sourceSceneIds).size).toBe(sourceSceneIds.length);
    });

    it('binds every planned image, prop, and performance to a real runtime scene', () => {
        const castIds = new Set<string>(ACADEMY_CAST.map(member => member.id));
        const sceneIds = new Set(inventory.chapters.flatMap(chapter => chapter.scenes.map(scene => scene.sceneId)));

        for (const chapter of inventory.chapters) {
            for (const scene of chapter.scenes) {
                expect(scene.locationId).toMatch(/^location:/u);
                expect(scene.openingImage.runtimeHome).toBe(scene.sceneId);
                if (scene.exitImage) expect(scene.exitImage.runtimeHome).toBe(scene.sceneId);
                scene.propCues.forEach(cue => expect(cue.runtimeHome).toBe(scene.sceneId));
                scene.cast.forEach(member => expect(castIds.has(member.id), member.id).toBe(true));
            }
        }

        expect(inventory.generationQueue).toHaveLength(inventory.summary.generationQueue);
        for (const item of inventory.generationQueue) {
            expect(item.chapter).toBeGreaterThanOrEqual(1);
            expect(item.chapter).toBeLessThanOrEqual(48);
            expect(sceneIds.has(item.sceneId), item.sceneId).toBe(true);
            expect(item.runtimeHome).toBe(item.sceneId);
            expect(item.status).toBe('queued');
        }
    });

    it('has no duplicate production request keys', () => {
        const keys = inventory.generationQueue.map(item =>
            [item.chapterId, item.sceneId, item.kind, item.cueId ?? 'scene'].join('|'),
        );
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('treats implemented Day 1 living-paper states as runtime props, not missing art', () => {
        const dayOne = inventory.chapters.find(chapter => chapter.id === 's1e01-the-blank-atlas');
        expect(dayOne).toBeDefined();

        const propCues = dayOne?.scenes.flatMap(scene => scene.propCues) ?? [];
        expect(propCues).not.toHaveLength(0);
        expect(propCues.every(cue => cue.status === 'runtime-prop')).toBe(true);
        expect(propCues.every(cue => Boolean(cue.runtimeRenderer))).toBe(true);

        const queuedPropNodes = new Set(
            inventory.generationQueue
                .filter(item => item.chapterId === 's1e01-the-blank-atlas' && item.kind === 'prop-or-overlay')
                .map(item => item.cueId),
        );
        propCues.forEach(cue => expect(queuedPropNodes.has(cue.cueId)).toBe(false));
    });

    it('keeps every Day 1 scene image bound and out of the generation queue', () => {
        const dayOne = inventory.chapters.find(chapter => chapter.id === 's1e01-the-blank-atlas');
        expect(dayOne).toBeDefined();
        expect(dayOne?.scenes).toHaveLength(11);
        expect(dayOne?.scenes.every(scene => scene.background.status === 'bound')).toBe(true);
        expect(dayOne?.scenes.every(scene => scene.openingImage.status === 'bound')).toBe(true);
        expect(dayOne?.scenes.every(scene => scene.exitImage?.status === 'bound')).toBe(true);
        expect(inventory.generationQueue.some(item => item.chapterId === 's1e01-the-blank-atlas')).toBe(false);
    });

    it('treats promoted middle-stage art as a bound story prop', () => {
        const marginMap = inventory.chapters.find(chapter => chapter.id === 's1e02-margin-map');
        const repair = marginMap?.scenes
            .flatMap(scene => scene.propCues)
            .find(cue => cue.nodeId === 'node:margin-map:relabel-repair');

        expect(repair).toMatchObject({
            status: 'bound',
            runtimeRenderer: 'story-art-manifest',
        });
        expect(inventory.generationQueue.some(item =>
            item.chapterId === 's1e02-margin-map'
            && item.cueId === 'cue:plain-label-and-reason-return',
        )).toBe(false);
    });
});
