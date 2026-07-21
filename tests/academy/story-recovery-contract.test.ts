import { gradeStoryPractice, storyPractice } from '../../src/academy/content/n3-story-practice';
import { loadStoryRuntime } from '../../src/academy/content/story-runtime';
import { createStoryRunner } from '../../src/academy/content/story-runner';
import mapOfClaims from '../../src/academy/content/story-sources/s4e02-map-of-claims.v2.json';
import threeVersions from '../../src/academy/content/story-sources/s4e04-three-true-versions.v2.json';
import leftUnsaid from '../../src/academy/content/story-sources/s4e05-left-unsaid.v2.json';
import openQuestion from '../../src/academy/content/story-sources/s4e06-open-question.v2.json';
import journey from '../../src/academy/content/story-sources/s4e07-journey-not-everyone-takes.v2.json';
import lastRevision from '../../src/academy/content/story-sources/s4e08-last-revision.v2.json';

const RECOVERED = [
    ['s4e02-map-of-claims', 'activity:s4e02-map-of-claims-evidence-map'],
    ['s4e04-three-true-versions', 'activity:s4e04-three-true-versions-synthesis'],
    ['s4e05-left-unsaid', 'activity:s4e05-left-unsaid-trim-the-line'],
    ['s4e06-open-question', 'activity:s4e06-open-question-reframe-premise'],
    ['s4e07-journey-not-everyone-takes', 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures'],
    ['s4e08-last-revision', 'activity:s4e08-last-revision-vivid-without-restoring'],
] as const;

interface RecoveryChoiceNode {
    id: string;
    options?: readonly {
        id: string;
        japaneseByBand?: Readonly<Record<string, string>>;
    }[];
}

describe('Season 4 story recovery contracts', () => {
    it('runs every retained activity as an exact evidence gate', () => {
        const runtime = loadStoryRuntime();
        for (const [chapterId, activityId] of RECOVERED) {
            expect(storyPractice(activityId), activityId).toMatchObject({ chapterId, activityId });
            const arc = runtime.playableArc(chapterId)!;
            const binding = arc.curriculum.activities.find(candidate => candidate.exerciseId === activityId)!;
            const runner = createStoryRunner({
                arc,
                band: 'n1',
                cursor: {
                    version: 1,
                    arcId: arc.id,
                    sceneId: binding.sceneId,
                    nodeId: binding.nodeId,
                    choices: {},
                },
            });

            expect(runner.moment, activityId).toMatchObject({
                kind: 'activity',
                gate: 'missing',
                binding: { exerciseId: activityId, registered: true },
            });
            expect(() => runner.advance(), activityId).toThrow(/still requires evidence/);
            expect(runner.updateActivityOutcomes({ [activityId]: 'pass' }), activityId)
                .toMatchObject({ kind: 'activity', gate: 'passed' });
            expect(runner.advance(), activityId).not.toMatchObject({
                kind: 'activity',
                binding: { exerciseId: activityId },
            });
        }
    });

    it('keeps both map choices inside the former learner boundary', () => {
        const choice = (mapOfClaims.scenes as readonly { nodes: readonly RecoveryChoiceNode[] }[])
            .flatMap(scene => scene.nodes)
            .find(node => node.id === 'choice:map-of-claims:how-to-hold-the-declined');
        const text = JSON.stringify(choice);

        expect(choice?.options).toHaveLength(2);
        for (const option of choice?.options ?? []) {
            expect(JSON.stringify(option), option.id).toMatch(/話さない|回答を控えた/u);
        }
        expect(text).not.toContain('infer-at-low-confidence');
        expect(text).toContain('本人は回答を控えた');
        expect(text).not.toContain('どちらにも存在しない');
    });

    it('records S4E02 only after the learner assembles every evidence-map label', () => {
        const practice = storyPractice('activity:s4e02-map-of-claims-evidence-map')!;
        expect(practice).toMatchObject({ interaction: 'evidence-map', skill: 'writing', action: 'produce' });
        if (practice.interaction !== 'evidence-map') throw new Error('Expected evidence-map practice.');

        expect(gradeStoryPractice(practice, {
            interaction: 'evidence-map',
            rows: {
                'route-added': { source: 'letter', confidence: 'stated', hedge: 'according-letter' },
                'older-ink': { source: 'paper', confidence: 'observed', hedge: 'paper-shows' },
                'first-contributor': { source: 'letter', confidence: 'unknown', hedge: 'still-unknown' },
            },
        })).toBe('lapse');
        expect(gradeStoryPractice(practice, {
            interaction: 'evidence-map',
            rows: Object.fromEntries(practice.rows.map(row => [row.id, row.correct])),
        })).toBe('pass');
    });

    it('hands the overlay rehearsal into Nanako and the stage test into Alex', () => {
        const chapter40Exit = threeVersions.scenes.at(-1)?.nodes.at(-1);
        const chapter41Entry = leftUnsaid.scenes[0]?.nodes[0];
        const chapter42Exit = openQuestion.scenes.at(-1)?.nodes.at(-1);

        expect(chapter40Exit?.description).toContain("Nanako's name");
        expect(chapter41Entry?.description).toContain("yesterday's overlay test");
        expect(chapter42Exit?.description).toContain('AFTER THIS NIGHT');
        expect(chapter42Exit?.description).toContain("Alex's name");
    });

    it('puts Mira\'s three futures and restart invitation before genuine written output', () => {
        const scene = journey.scenes.find(candidate => candidate.id === 'scene:journey:non-comparative-futures')!;
        const checkpointIndex = scene.nodes.findIndex(node => node.id === 'checkpoint:journey:before-futures');
        const returnIndex = scene.nodes.findIndex(node => node.id === 'message:journey:mira-returns');
        const inviteIndex = scene.nodes.findIndex(node => node.id === 'message:journey:mira-invites-restart');
        const spoken = JSON.stringify(scene.nodes.slice(returnIndex, checkpointIndex));

        expect(returnIndex).toBeGreaterThanOrEqual(0);
        expect(scene.nodes[returnIndex]?.kind).toBe('line');
        expect(inviteIndex).toBeGreaterThan(returnIndex);
        expect(scene.nodes[inviteIndex]?.kind).toBe('line');
        expect(inviteIndex).toBeLessThan(checkpointIndex);
        expect(spoken).toContain('アレックスは来月から日本');
        expect(spoken).toContain('アーカシュの撮り旅');
        expect(spoken).toContain('私はこっちに残る');
        expect(spoken).toContain('しばらく勉強から離れてた人');
        expect(spoken).toContain('都合がつかなければ');
        expect(JSON.stringify(scene)).not.toMatch(/typing|時間が合う人/u);
        expect(scene.nodes.find(node => node.id === 'activity-node:journey:non-comparative-futures'))
            .toMatchObject({ hook: { componentType: 'writing' } });

        const practice = storyPractice('activity:s4e07-journey-not-everyone-takes-non-comparative-futures')!;
        expect(practice).toMatchObject({ interaction: 'written-response', skill: 'writing', action: 'produce' });
        if (practice.interaction !== 'written-response') throw new Error('Expected written response practice.');
        expect(gradeStoryPractice(practice, {
            interaction: 'written-response',
            fields: {
                alex: '来月から日本で働く。',
                aakash: 'いつか撮り旅に行くかもしれない。',
                mira: 'ここに残って、来週火曜からまた始める。',
            },
        })).toBe('pass');
        expect(gradeStoryPractice(practice, {
            interaction: 'written-response',
            fields: {
                alex: 'アレックスが一歩先だ。',
                aakash: 'いつか撮り旅に行く。',
                mira: '火曜から再開する。',
            },
        })).toBe('lapse');
    });

    it('gives Alex a concrete callback instead of repeating Mira\'s N2/N3 thesis', () => {
        const scenes = journey.scenes as unknown as readonly { readonly nodes: readonly { readonly id: string }[] }[];
        const line = scenes.flatMap(scene => scene.nodes)
            .find(node => node.id === 'line:journey:alex-just-my-turn');
        const variants = (line as { variants?: Record<string, { japanese: string }> } | undefined)?.variants;

        for (const band of ['n3', 'n2'] as const) {
            expect(variants?.[band]?.japanese).toContain('日付');
            expect(variants?.[band]?.japanese).toContain('勇気');
            expect(variants?.[band]?.japanese).toContain('カフェの投票');
            expect(variants?.[band]?.japanese).not.toMatch(/行くのも.*残るのも.*迷うのも/u);
        }
    });

    it('shows the exact caption before the edit and gives each final check a different job', () => {
        const scene = lastRevision.scenes.find(candidate => candidate.id === 'scene:last-revision:vivid-but-restores-nothing')!;
        const shownIndex = scene.nodes.findIndex(node => node.id === 'node:last-revision:over-vivid-clause');
        const activityIndex = scene.nodes.findIndex(node => node.id === 'activity-node:last-revision:revise-vivid-without-restoring');
        const shown = scene.nodes[shownIndex];
        const activity = scene.nodes[activityIndex];
        const closing = scene.nodes.slice(activityIndex + 1).map(node => node.id);

        expect(shownIndex).toBeLessThan(activityIndex);
        expect(shown?.description).toContain('この道は、戻らなかった人の願いを受け継ぎ、今夜も灯る。');
        expect((activity as { resumeContext?: string } | undefined)?.resumeContext).not.toMatch(/explain|defend/i);
        expect(JSON.stringify(scene)).not.toContain('余分な一拍');
        expect(closing).toEqual(expect.arrayContaining([
            'line:last-revision:stasi-precise-not-plain',
            'line:last-revision:ruparna-out-of-frame-stays',
            'line:last-revision:xingyu-it-holds',
        ]));
    });
});
