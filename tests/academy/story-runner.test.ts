import { loadStoryRuntime } from '../../src/academy/content/story-runtime';
import {
    createStoryRunner,
    parseStoryCursor,
    serializeStoryCursor,
    storySceneAttendeeIds,
    type StoryMoment,
} from '../../src/academy/content/story-runner';

const arc = loadStoryRuntime().openingArc;

describe('Academy story runner', () => {
    it('plays the authored graph from the Open Door through the close without scene jumping', () => {
        const outcomes = Object.fromEntries(arc.curriculum.activities.map(activity => [activity.exerciseId, 'pass' as const]));
        const runner = createStoryRunner({ arc, band: 'foundation', activityOutcomes: outcomes });
        const visitedScenes = new Set<string>();
        let moment: StoryMoment = runner.moment;
        let guard = 0;

        while (moment.kind !== 'complete') {
            if (++guard > 300) throw new Error('Opening arc did not complete.');
            visitedScenes.add(moment.scene.id);
            if (moment.kind === 'choice') {
                const selected = moment.node.id === 'choice:blank-atlas:mission'
                    ? 'option:blank-atlas:mission-text'
                    : moment.options[0]!.id;
                moment = runner.choose(selected);
            } else {
                moment = runner.advance();
            }
        }

        expect(moment.completionEligible).toBe(true);
        expect(moment.scene.id).toBe(arc.lastSceneId);
        expect(visitedScenes).toContain(arc.firstSceneId);
        expect(visitedScenes).toContain('scene:blank-atlas:mission-text');
        expect(visitedScenes).not.toContain('scene:blank-atlas:mission-sound');
        expect(visitedScenes).not.toContain('scene:blank-atlas:mission-speaking');
        expect(visitedScenes).toContain(arc.lastSceneId);
    });

    it('keeps exact activity truth and exposes no story-only continuation', () => {
        const runner = createStoryRunner({
            arc,
            band: 'foundation',
            cursor: {
                version: 1,
                arcId: arc.id,
                sceneId: 'scene:blank-atlas:arrival-greetings',
                nodeId: 'activity-node:blank-atlas:greet-rie',
                choices: {},
            },
        });

        expect(runner.moment).toMatchObject({
            kind: 'activity',
            gate: 'missing',
            binding: {
                lessonId: 'lesson:foundation-00',
                exerciseId: 'activity:lesson-zero-greet-rie',
            },
        });
        expect(() => runner.advance()).toThrow('still requires evidence');
        expect('continueStoryOnly' in runner).toBe(false);
        expect(runner.moment).toMatchObject({ kind: 'activity', gate: 'missing' });
    });

    it('uses placement as story-gate equivalence without changing chronology or lesson outcomes', () => {
        const runner = createStoryRunner({
            arc,
            band: 'n3',
            placementEquivalent: true,
        });

        expect(runner.moment.scene.id).toBe(arc.firstSceneId);
        advanceUntil(runner, moment => moment.kind === 'line');
        const line = runner.moment;
        expect(line.kind).toBe('line');
        if (line.kind === 'line') expect(line.line.band).toBe('n5');

        const activityRunner = createStoryRunner({
            arc,
            band: 'n3',
            placementEquivalent: true,
            cursor: {
                version: 1,
                arcId: arc.id,
                sceneId: 'scene:blank-atlas:arrival-greetings',
                nodeId: 'activity-node:blank-atlas:greet-rie',
                choices: {},
            },
        });
        expect(activityRunner.moment).toMatchObject({ kind: 'activity', gate: 'placement-equivalent' });
    });

    it('round-trips a compact cursor and ignores legacy story-only gate data', () => {
        const cursor = {
            version: 1 as const,
            arcId: arc.id,
            sceneId: 'scene:blank-atlas:transfer',
            nodeId: 'activity-node:blank-atlas:text-transfer',
            choices: {
                'choice:blank-atlas:mission': 'option:blank-atlas:mission-text',
            },
        };
        const serialized = serializeStoryCursor(cursor);
        const legacy = `story-run:v1:${encodeURIComponent(JSON.stringify({
            ...cursor,
            storyOnlyActivityIds: ['activity:lesson-zero-name-card-draft'],
        }))}`;

        expect(parseStoryCursor(serialized)).toEqual(cursor);
        expect(parseStoryCursor(legacy)).toEqual(cursor);
        expect(parseStoryCursor('s1e01-the-blank-atlas')).toBeUndefined();
        expect(createStoryRunner({ arc, band: 'n5', cursor }).moment).toMatchObject({
            kind: 'activity',
            binding: { exerciseId: 'activity:lesson-zero-text-transfer' },
        });
    });

    it('derives Journal attendees from only the visible authored route', () => {
        const text = arc.scene('scene:blank-atlas:mission-text')!;
        const transfer = arc.scene('scene:blank-atlas:transfer')!;
        const choices = { 'choice:blank-atlas:mission': 'option:blank-atlas:mission-text' };

        expect(storySceneAttendeeIds(text, choices)).toEqual(['sophie', 'ruparna']);
        expect(storySceneAttendeeIds(transfer, choices)).toEqual(['rie']);
        expect(storySceneAttendeeIds(arc.scene('scene:blank-atlas:mission-sound')!, choices))
            .toEqual(['xingyu', 'mika']);
    });
});

function advanceUntil(
    runner: ReturnType<typeof createStoryRunner>,
    predicate: (moment: StoryMoment) => boolean,
): void {
    let guard = 0;
    while (!predicate(runner.moment)) {
        if (++guard > 50) throw new Error('Story moment was not reached.');
        const moment = runner.moment;
        if (moment.kind === 'choice') runner.choose(moment.options[0]!.id);
        else runner.advance();
    }
}
