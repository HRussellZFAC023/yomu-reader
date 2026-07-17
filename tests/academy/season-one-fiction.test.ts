import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';

const STORY_PATH = path.resolve('src/academy/content/story-sources/season-one-fiction.json');

interface Episode {
    id: string;
    ordinal: number;
    curriculum: {stage: string; milestone: string};
    title: string;
    location: {id: string; label: string};
    storyBeat: string;
    emotionalTurn: string;
    comedyBeat?: string;
    curriculumHooks: string[];
    minigame: {id: string; mechanic: string; prompt: string; success: string};
    cast: string[];
    unlocks: string[];
    replayVariants: Array<{id: string; label: string; changes: string}>;
    riskBeat?: {subjectId: string; status: string; disclaimer: string; agency: string};
    eventArt: {id: string; brief: string; safety: string};
    sourceSafety: {fictionalComposite: boolean; realEventClaim: boolean; note: string};
}

interface SeasonOne {
    schema: string;
    version: number;
    title: string;
    welcomeDisclaimer: {
        heading: string;
        message: string;
        sourceBoundary: string;
        likenessBoundary: string;
    };
    scope: {
        canonicalEpisodeCount: number;
        sequenceStart: string;
        sequenceEnd: string;
        groupingPolicy: string;
        finiteStoryRule: string;
    };
    popCultureSafety: {mode: string; allowed: string[]; forbidden: string[]};
    relationshipThreads: Array<{id: string; cast: string[]; episodeIds: string[]; arc: string}>;
    episodes: Episode[];
    endlessCalendar: {
        id: string;
        startsAfterEpisodeId: string;
        canonicalStoryProgression: boolean;
        purpose: string;
        cycle: {
            lengthDays: number;
            repeat: string;
            deterministicSeedFields: string[];
            weekAccents: string[];
        };
        reviewWindowsDays: number[];
        dayTemplates: Array<{
            id: string;
            dayOfCycle: number;
            mode: string;
            episodeSelection: string;
            mechanicRemix: string;
        }>;
        dayTemplateRule: string;
        variantDimensions: string[];
        castRotation: {
            roster: string;
            algorithm: string;
            maximumGapDays: number;
            felixRule: string;
        };
        longRangeRemix: {everyCycles: number; effect: string; yearlyContinuity: string};
        continuityRules: string[];
    };
}

function loadStory(): SeasonOne {
    return JSON.parse(fs.readFileSync(STORY_PATH, 'utf8')) as SeasonOne;
}

function expectUnique(values: string[], label: string): void {
    expect(new Set(values).size, label + ' must be unique').toBe(values.length);
}

function narrativeText(story: SeasonOne): string {
    return story.episodes.flatMap(episode => [
        episode.title,
        episode.location.label,
        episode.storyBeat,
        episode.emotionalTurn,
        episode.comedyBeat ?? '',
        ...episode.curriculumHooks,
        episode.minigame.prompt,
        episode.minigame.success,
        ...episode.replayVariants.flatMap(variant => [variant.label, variant.changes]),
        episode.riskBeat?.agency ?? '',
        episode.eventArt.brief,
        episode.eventArt.safety,
        episode.sourceSafety.note,
    ]).join('\n');
}

describe('Season One fiction spine', () => {
    it('has a complete 24-episode schema from Lesson 0 through the N4 finale', () => {
        const story = loadStory();
        expect(story.schema).toBe('yomu-academy.season-one-fiction.v1');
        expect(story.version).toBe(1);
        expect(story.title.length).toBeGreaterThan(0);
        expect(story.scope).toMatchObject({
            canonicalEpisodeCount: 24,
            sequenceStart: 'Lesson 0',
            sequenceEnd: 'N4 finale',
        });
        expect(story.episodes).toHaveLength(24);
        expect(story.episodes.map(episode => episode.ordinal)).toEqual(
            Array.from({length: 24}, (_, index) => index + 1),
        );

        const supportedStages = ['lesson-0', 'foundation', 'n5', 'n4'];
        const stageIndexes = story.episodes.map(episode => supportedStages.indexOf(episode.curriculum.stage));
        expect(stageIndexes.every(index => index >= 0)).toBe(true);
        expect(stageIndexes).toEqual([...stageIndexes].sort((left, right) => left - right));
        expect(new Set(story.episodes.map(episode => episode.curriculum.stage))).toEqual(
            new Set(supportedStages),
        );
        expect(story.episodes.at(-1)).toMatchObject({
            id: 's1e24-lanterns-return',
            ordinal: 24,
            curriculum: {stage: 'n4'},
        });

        for (const episode of story.episodes) {
            expect(episode.curriculum.milestone.length).toBeGreaterThan(10);
            expect(episode.location.id).toMatch(/^[a-z0-9-]+$/);
            expect(episode.location.label.length).toBeGreaterThan(3);
            expect(episode.storyBeat.length).toBeGreaterThan(60);
            expect(episode.emotionalTurn.length).toBeGreaterThan(50);
            expect(episode.curriculumHooks.length).toBeGreaterThanOrEqual(4);
            expect(episode.minigame).toMatchObject({
                id: expect.stringMatching(/^game:/),
                mechanic: expect.any(String),
                prompt: expect.any(String),
                success: expect.any(String),
            });
            expect(episode.cast.length).toBeGreaterThanOrEqual(3);
            expect(episode.unlocks).toHaveLength(1);
            expect(episode.replayVariants.length).toBeGreaterThanOrEqual(2);
            expect(episode.eventArt).toMatchObject({
                id: expect.stringMatching(/^art:/),
                brief: expect.any(String),
                safety: expect.any(String),
            });
            expect(episode.sourceSafety).toEqual(expect.objectContaining({
                fictionalComposite: true,
                realEventClaim: false,
            }));
        }
    });

    it('uses unique content ids and no academic-period grouping', () => {
        const story = loadStory();
        expectUnique(story.episodes.map(episode => episode.id), 'episode ids');
        expectUnique(story.episodes.map(episode => episode.minigame.id), 'minigame ids');
        expectUnique(story.episodes.map(episode => episode.eventArt.id), 'event-art ids');
        expectUnique(
            story.episodes.flatMap(episode => episode.replayVariants.map(variant => variant.id)),
            'replay variant ids',
        );
        expectUnique(story.relationshipThreads.map(thread => thread.id), 'relationship thread ids');
        expect(JSON.stringify({scope: story.scope, episodes: story.episodes}))
            .not.toMatch(/\b(?:term|semester)\b/i);
    });

    it('covers and uniquely unlocks every live canonical non-textbook cast member', () => {
        const story = loadStory();
        const expectedCast = ACADEMY_CAST
            .filter(member => member.category !== 'textbook-legend' && !['tom2', 'steve'].includes(member.id))
            .map(member => member.id)
            .sort();
        const expectedSet = new Set<string>(expectedCast);
        const appearances = story.episodes.flatMap(episode => episode.cast);
        const unlocks = story.episodes.flatMap(episode => episode.unlocks);

        expect(expectedCast).toHaveLength(24);
        expect([...new Set(appearances)].sort()).toEqual(expectedCast);
        expect([...unlocks].sort()).toEqual(expectedCast);
        expectUnique(unlocks, 'character unlocks');

        for (const episode of story.episodes) {
            expectUnique(episode.cast, episode.id + ' cast');
            expectUnique(episode.unlocks, episode.id + ' unlocks');
            expect(episode.cast.every(id => expectedSet.has(id))).toBe(true);
            expect(episode.unlocks.every(id => expectedSet.has(id))).toBe(true);
            expect(episode.cast).toEqual(expect.arrayContaining(episode.unlocks));
        }
    });

    it('keeps the welcome and all authored events explicitly AI-fictional', () => {
        const story = loadStory();
        const disclaimer = story.welcomeDisclaimer.message.toLowerCase();
        expect(disclaimer).toContain('ai-authored fiction');
        expect(disclaimer).toContain('invented composite');
        expect(disclaimer).toContain('not biography');
        expect(disclaimer).toContain('not a claim');
        expect(disclaimer).toContain('happened in real life');
        expect(story.welcomeDisclaimer.sourceBoundary.toLowerCase()).toContain('every scene');
        expect(story.welcomeDisclaimer.likenessBoundary.toLowerCase()).toContain('likeness gate');
        expect(story.episodes.every(episode => episode.sourceSafety.fictionalComposite)).toBe(true);
        expect(story.episodes.some(episode => episode.sourceSafety.realEventClaim)).toBe(false);
    });

    it('gives Alex and Jenny fictional risk variants with agency and no factual claim', () => {
        const story = loadStory();
        for (const subjectId of ['alex', 'jenny']) {
            const episode = story.episodes.find(candidate => candidate.riskBeat?.subjectId === subjectId);
            expect(episode, subjectId + ' risk beat').toBeDefined();
            expect(episode?.cast).toContain(subjectId);
            expect(episode?.riskBeat).toEqual(expect.objectContaining({
                subjectId,
                status: 'fictional-variant',
            }));
            expect(episode?.riskBeat?.disclaimer.toLowerCase())
                .toContain('wholly invented fictional variant');
            expect(episode?.riskBeat?.disclaimer.toLowerCase())
                .toContain('does not describe or claim a real event');
            expect(episode?.riskBeat?.agency.length).toBeGreaterThan(50);
        }
    });

    it('gives Felix an unlock, recurring relationship, cat comedy, curriculum, and safe art', () => {
        const story = loadStory();
        const felixEpisodes = story.episodes.filter(episode => episode.cast.includes('felix'));
        const unlockEpisode = story.episodes.find(episode => episode.unlocks.includes('felix'));
        const thread = story.relationshipThreads.find(candidate => candidate.cast.includes('felix'));

        expect(felixEpisodes.length).toBeGreaterThanOrEqual(4);
        expect(unlockEpisode?.comedyBeat?.toLowerCase()).toContain('cat');
        expect(unlockEpisode?.curriculumHooks.map(hook => hook.toLowerCase())).toContain('animal counters');
        const felix = ACADEMY_CAST.find(member => member.id === 'felix');
        expect(felix?.visualBrief).toBe(
            'White; glasses; longer curly dark-blond to light-brown hair; likes cats.',
        );
        expect(felix?.visualEvidence).toBe('candidate-needs-owner');
        expect(unlockEpisode?.eventArt.brief.toLowerCase())
            .toContain('white classmate with glasses and longer curly dark-blond to light-brown hair');
        expect(unlockEpisode?.eventArt.safety.toLowerCase()).toContain('no approved visual evidence');
        expect(unlockEpisode?.eventArt.safety.toLowerCase()).toContain('non-portrait placeholder');
        expect(unlockEpisode?.eventArt.safety.toLowerCase()).toContain('never use a pre-existing unmatched face');
        expect(thread?.cast).toEqual(expect.arrayContaining(['felix', 'mika', 'peter']));
        expect(thread?.episodeIds.length).toBeGreaterThanOrEqual(4);
        expect(thread?.episodeIds.every(id => felixEpisodes.some(episode => episode.id === id))).toBe(true);
        expect(story.endlessCalendar.castRotation.felixRule.toLowerCase()).toContain('cat comedy');
    });

    it('uses original-only interests and excludes private or affirmative real-event claims', () => {
        const story = loadStory();
        expect(story.popCultureSafety.mode).toBe('original-in-world-only');
        expect(story.popCultureSafety.forbidden.join(' ')).toMatch(/copyrighted character imitation/i);
        expect(story.popCultureSafety.forbidden.join(' ')).toMatch(/plot recreation/i);
        expect(story.popCultureSafety.forbidden.join(' ')).toMatch(/artist style imitation/i);

        const text = narrativeText(story);
        for (const pattern of [
            /based on (?:a |the )?true stor(?:y|ies)/i,
            /(?:this|that|it) (?:really|actually) happened/i,
            /recreates? (?:a |an |the )?real/i,
            /documents? (?:a |an |the )?real/i,
            /as happened (?:to|with|in)/i,
        ]) expect(text).not.toMatch(pattern);
        expect(text).not.toMatch(/\bhttps?:\/\//i);
        expect(text).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
        expect(text).not.toMatch(/(?:\+?\d[\s().-]*){8,}/);
        expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
        expect(text).not.toMatch(/\b(?:address|salary|diagnosis|employer|account handle)\b/i);
    });

    it('defines deterministic unbounded review without new canonical plot', () => {
        const story = loadStory();
        const calendar = story.endlessCalendar;
        expect(calendar.startsAfterEpisodeId).toBe(story.episodes.at(-1)?.id);
        expect(calendar.canonicalStoryProgression).toBe(false);
        expect(calendar.cycle).toEqual(expect.objectContaining({
            lengthDays: 28,
            repeat: 'unbounded',
        }));
        expect(calendar.cycle.deterministicSeedFields.length).toBeGreaterThanOrEqual(4);
        expect(calendar.cycle.weekAccents).toHaveLength(4);
        expect(calendar.reviewWindowsDays).toEqual([1, 3, 7, 14, 28, 84, 168, 364]);
        expect(calendar.dayTemplates).toHaveLength(7);
        expectUnique(calendar.dayTemplates.map(template => template.id), 'calendar template ids');
        expect(calendar.dayTemplates.map(template => template.dayOfCycle)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(calendar.variantDimensions.length).toBeGreaterThanOrEqual(8);
        expect(calendar.castRotation.maximumGapDays).toBeLessThanOrEqual(56);
        expect(calendar.longRangeRemix.everyCycles).toBeGreaterThan(1);
        expect(calendar.longRangeRemix.effect).toContain('no new canonical outcome');
        expect(calendar.continuityRules).toEqual(expect.arrayContaining([
            'The atlas remains complete after the finale.',
            'Calendar scenes are practice remixes, not canonical sequels.',
        ]));
    });
});
