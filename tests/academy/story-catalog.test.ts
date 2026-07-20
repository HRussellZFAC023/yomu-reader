import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    compileStoryPackage,
    loadStoryRuntime,
    resolveStoryLocationId,
    storyChapterCatalog,
    type StoryPackageSource,
} from '../../src/academy/content/story-runtime';
import { createStoryRunner, nearestStoryBand, type StoryLanguageBand } from '../../src/academy/content/story-runner';

const STORY_ROOT = path.resolve('src/academy/content/story-sources');
const OPENING_FILES = new Set(['opening-arrival-bridge.v2.json', 's1e01-the-blank-atlas.v2.json']);

function chapterSource(fileName: string): StoryPackageSource {
    return JSON.parse(fs.readFileSync(path.join(STORY_ROOT, fileName), 'utf8')) as StoryPackageSource;
}

function mutableChapter(fileName: string): StoryPackageSource & {
    scenes: {
        id: string;
        locationId: string;
        exit: { checkpoint: true; next: string | null };
        nodes: { id: string; kind: string; speakerId?: string }[];
    }[];
} {
    return chapterSource(fileName) as ReturnType<typeof mutableChapter>;
}

function firstLineBand(episodeId: string, band: StoryLanguageBand): string {
    const arc = loadStoryRuntime().playableArc(episodeId);
    expect(arc, episodeId).toBeDefined();
    const runner = createStoryRunner({ arc: arc!, band });
    let moment = runner.moment;
    let guard = 0;
    while (moment.kind !== 'line') {
        expect(moment.kind).not.toBe('complete');
        expect(++guard).toBeLessThan(50);
        moment = runner.advance();
    }
    return moment.line.band;
}

describe('Academy story chapter catalog', () => {
    it('registers and compiles every authored v2 chapter file in story-sources/', () => {
        const files = fs.readdirSync(STORY_ROOT)
            .filter(file => file.endsWith('.v2.json') && !OPENING_FILES.has(file));
        expect(files).toHaveLength(47);

        const catalogIds = new Set(storyChapterCatalog().map(entry => entry.id));
        const runtime = loadStoryRuntime();
        for (const file of files) {
            const id = file.replace(/\.v2\.json$/, '');
            expect(catalogIds.has(id), `${file} missing from the chapter catalog`).toBe(true);
            const arc = runtime.playableArc(id);
            expect(arc?.episodeId, file).toBe(id);
            expect(Object.isFrozen(arc)).toBe(true);
            expect(arc!.scenes.length).toBeGreaterThan(0);
        }
    });

    it('lists all 48 authored chapters with honest grounded flags', () => {
        const catalog = storyChapterCatalog();
        expect(catalog).toHaveLength(48);
        expect(new Set(catalog.map(entry => entry.id)).size).toBe(48);
        expect(catalog.every(entry => entry.playable)).toBe(true);
        expect(catalog.map(entry => entry.chapter)).toEqual(Array.from({ length: 48 }, (_, index) => index + 1));

        const byId = new Map(catalog.map(entry => [entry.id, entry]));
        expect(byId.get('s1e01-the-blank-atlas')).toMatchObject({
            season: 1, chapter: 1, title: 'The Blank Atlas', grounded: true,
        });
        // Authored chapters load, but their transfer activities are not yet
        // registered exercises; they must not claim to be grounded.
        expect(byId.get('s1e02-margin-map')).toMatchObject({
            season: 1, chapter: 2, title: 'Map in the Margins', grounded: false,
        });
        expect(byId.get('s1e14-two-answers')).toMatchObject({ season: 2, chapter: 14, grounded: false });
        // Seasons 3-4 now have full authored chapters, but their lesson packages
        // still need registering before the activity gates can claim grounding.
        expect(byId.get('s3e01-after-the-applause')).toMatchObject({
            season: 3, chapter: 25, grounded: false,
        });
        for (const id of [
            's4e02-map-of-claims',
            's4e04-three-true-versions',
            's4e05-left-unsaid',
            's4e06-open-question',
            's4e07-journey-not-everyone-takes',
            's4e08-last-revision',
        ]) {
            expect(byId.get(id), id).toMatchObject({ season: 4, grounded: true, playable: true });
            expect(loadStoryRuntime().playableArc(id)?.curriculum.activities.every(activity => activity.registered), id)
                .toBe(true);
        }
        expect(byId.get('s4e12-next-page')).toMatchObject({
            season: 4, chapter: 48, grounded: false,
        });
        expect(catalog.filter(entry => entry.id.startsWith('s3e'))).toHaveLength(12);
        expect(catalog.filter(entry => entry.id.startsWith('s4e'))).toHaveLength(12);
    });

    it('resolves playable arcs for s1e02 and s1e24 with compiled activity bindings', () => {
        const runtime = loadStoryRuntime();
        const margin = runtime.playableArc('s1e02-margin-map')!;
        expect(margin.firstSceneId).toBe('scene:margin-map:the-private-cipher');
        expect(margin.curriculum.activities).toHaveLength(1);
        expect(margin.curriculum.activities[0]).toMatchObject({
            lessonId: 'l1-l02',
            exerciseId: 'activity:s1e02-margin-map-plain-label',
            requiredEvidence: { kind: 'activity-passed', activityId: 'activity:s1e02-margin-map-plain-label' },
        });
        expect(margin.nextScene(margin.firstSceneId)?.id).toBe('scene:margin-map:readable-for-anyone');
        expect(margin.outcomes?.some(outcome => outcome.kind === 'bond' && outcome.castId === 'henry')).toBe(true);
        expect(margin.outcomes?.some(outcome => outcome.kind === 'curriculum-return')).toBe(true);

        const lanterns = runtime.playableArc('s1e24-lanterns-return')!;
        // Hooks authored under `packageId` normalize onto the binding's lessonId.
        expect(lanterns.curriculum.activities[0]?.lessonId).toBe('l2-l31');
        expect(runtime.playableArc('s1e01-the-blank-atlas')).toBe(runtime.openingArc);
        expect(runtime.playableArc('s3e06-two-schedules')?.curriculum.activities[0]).toMatchObject({
            lessonId: 'lesson:pending:s3e06-two-schedules',
            exerciseId: 'activity:s3e06-two-schedules-sort-claims',
            registered: false,
        });
    });

    it('selects the nearest available band for chapters authoring a band subset', () => {
        // s1e02 authors foundation..n1; s1e14 authors n5..n1 (no foundation).
        expect(firstLineBand('s1e02-margin-map', 'foundation')).toBe('foundation');
        expect(firstLineBand('s1e14-two-answers', 'foundation')).toBe('n5');
        expect(firstLineBand('s1e14-two-answers', 'n3')).toBe('n3');

        expect(nearestStoryBand(['n5', 'n4', 'n3', 'n2', 'n1'], 'foundation')).toBe('n5');
        expect(nearestStoryBand(['foundation', 'n5'], 'n2')).toBe('n5');
        expect(nearestStoryBand(['n3'], 'n5')).toBe('n3');
        expect(nearestStoryBand([], 'n3')).toBeUndefined();
    });

    it('maps authored location aliases onto the world registry and rejects unknown ones', () => {
        expect(resolveStoryLocationId('location:classroom')).toBe('classroom');
        expect(resolveStoryLocationId('location:language-lab')).toBe('lab');
        expect(resolveStoryLocationId('location:campus-entrance')).toBe('courtyard');
        expect(() => resolveStoryLocationId('location:moon-base')).toThrow(/Unknown story location alias/);

        const doctored = mutableChapter('s1e02-margin-map.v2.json');
        doctored.scenes[0]!.locationId = 'location:moon-base';
        expect(() => compileStoryPackage(doctored)).toThrow(/Unknown story location alias/);
    });

    it('rejects unsupported node kinds, duplicate ids, dangling graph references, and undeclared speakers', () => {
        const unsupported = mutableChapter('s1e02-margin-map.v2.json');
        (unsupported.scenes[0]!.nodes[0]! as { kind: string }).kind = 'message';
        expect(() => compileStoryPackage(unsupported)).toThrow(/unsupported kind message/);

        const duplicated = mutableChapter('s1e02-margin-map.v2.json');
        duplicated.scenes[1]!.id = duplicated.scenes[0]!.id;
        expect(() => compileStoryPackage(duplicated)).toThrow(/duplicate graph addresses/);

        const dangling = mutableChapter('s1e02-margin-map.v2.json');
        dangling.scenes[0]!.exit.next = 'scene:margin-map:missing';
        expect(() => compileStoryPackage(dangling)).toThrow(/points outside/);

        const undeclared = mutableChapter('s1e02-margin-map.v2.json');
        const line = undeclared.scenes[0]!.nodes.find(node => node.kind === 'line')!;
        (line as { speakerId?: string }).speakerId = 'nanako';
        expect(() => compileStoryPackage(undeclared)).toThrow(/not declared/);
    });

    it('keeps compiled chapters replay-safe and playable end to end', () => {
        const arc = loadStoryRuntime().playableArc('s1e02-margin-map')!;
        expect(arc.replay).toEqual({ canonicalWrites: false, chronologicalMemory: true });

        const runner = createStoryRunner({
            arc,
            band: 'foundation',
            activityOutcomes: { 'activity:s1e02-margin-map-plain-label': 'pass' },
        });
        let moment = runner.moment;
        let guard = 0;
        while (moment.kind !== 'complete') {
            expect(++guard).toBeLessThan(200);
            moment = moment.kind === 'choice'
                ? runner.choose(moment.options[0]!.id)
                : runner.advance();
        }
        expect(moment.completionEligible).toBe(true);
    });
});
