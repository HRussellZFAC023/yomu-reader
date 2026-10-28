import { N3_STORY_EPISODES, n3StoryArcForEpisode } from '../../src/academy/content/n3-story-batch';
import { createStoryRunner } from '../../src/academy/content/story-runner';

describe('authored N3 story batches', () => {
    it('keeps chapters 25-30 finite, original, and mapped to one registered practice each', () => {
        expect(N3_STORY_EPISODES.map(episode => [episode.ordinal, episode.id])).toEqual([
            [25, 's3e01-after-the-applause'],
            [26, 's3e02-caption-without-owner'],
            [27, 's3e03-helpful-rewrite'],
            [28, 's3e04-terms-of-invitation'],
            [29, 's3e05-chair-not-reserved'],
            [30, 's3e06-two-schedules'],
        ]);
        expect(N3_STORY_EPISODES.every(episode => episode.sourceSafety.fictionalComposite && !episode.sourceSafety.realEventClaim)).toBe(true);
        expect(N3_STORY_EPISODES.every(episode => episode.curriculum.stage === 'n3')).toBe(true);
    });

    it('requires exact evidence, exposes an N2 authored replay layer, and does not write canon in replay', () => {
        const arc = n3StoryArcForEpisode('s3e01-after-the-applause')!;
        const runner = createStoryRunner({ arc, band: 'n2' });
        runner.advance();
        runner.advance();
        runner.advance();

        expect(runner.moment).toMatchObject({
            kind: 'activity',
            gate: 'missing',
            binding: { exerciseId: 'activity:story-n3:after-applause-tone' },
        });
        expect(arc.replay).toEqual({ canonicalWrites: false, chronologicalMemory: true });
        expect(arc.scene(arc.firstSceneId)?.nodes.find(node => node.kind === 'line')?.variants?.n2?.japanese)
            .toContain('お返事でした');
    });

    it('continues placement-safe N3 scenes with explicit consent and conditional-commitment practices', () => {
        const invitation = n3StoryArcForEpisode('s3e04-terms-of-invitation')!;
        const schedule = n3StoryArcForEpisode('s3e06-two-schedules')!;

        expect(invitation.curriculum.activities[0]?.exerciseId).toBe('activity:story-n3:invitation-scope');
        expect(invitation.scene(invitation.firstSceneId)?.nodes.some(node => node.id === 'line:terms:repair')).toBe(true);
        expect(schedule.curriculum.activities[0]?.exerciseId).toBe('activity:story-n3:conditional-schedule');
        expect(schedule.replay).toEqual({ canonicalWrites: false, chronologicalMemory: true });
    });
});
