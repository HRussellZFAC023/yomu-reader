import {
    createStoryArcSession,
    loadStoryRuntime,
    openingArcModeForEntry,
    STORY_OPENING_ARC_ID,
    STORY_REVIEW_CALENDAR_SECTION,
} from '../../src/academy/content/story-runtime';

const LESSON_ZERO_ACTIVITY_IDS = [
    'activity:lesson-zero-greet-rie',
    'activity:lesson-zero-vowel-listen',
    'activity:lesson-zero-vowel-doodle',
    'activity:lesson-zero-follow-instructions',
    'activity:lesson-zero-reconstruct-repair',
    'activity:lesson-zero-desk-language',
    'activity:lesson-zero-build-sentence-frames',
    'activity:lesson-zero-name-card-draft',
    'activity:lesson-zero-sound-input',
    'activity:lesson-zero-text-input',
    'activity:lesson-zero-speaking-input',
    'activity:lesson-zero-read-name-cards',
    'activity:lesson-zero-write-name-card',
    'activity:lesson-zero-sound-transfer',
    'activity:lesson-zero-text-transfer',
    'activity:lesson-zero-speaking-transfer',
    'activity:lesson-zero-written-transfer',
    'activity:lesson-zero-close-room',
].sort();

describe('Academy story runtime', () => {
    it('keeps all canonical episode IDs, order, and authored activity hooks beside the opening arc', () => {
        const story = loadStoryRuntime();

        expect(story.episodes).toHaveLength(48);
        expect(story.episodes.at(-1)?.id).toBe('s4e12-next-page');
        expect(story.episode('s1e01-the-blank-atlas')?.title).toBe('The Blank Atlas');
        expect(story.openingArc).toMatchObject({
            id: STORY_OPENING_ARC_ID,
            episodeId: 's1e01-the-blank-atlas',
            unlocks: ['rie'],
            continuity: [{ castId: 'rie', beat: 'recognition', legacyRelationshipChapter: 1 }],
            replay: { canonicalWrites: false, chronologicalMemory: true },
        });
        expect(story.castMembers(['rie', 'aakash'])).toEqual([
            { id: 'rie', name: 'Rie' },
            { id: 'aakash', name: 'Aakash' },
        ]);
        expect(story.scope.finiteStoryRule).toContain('48 canonical chapters');
        expect(story.playableArc('s3e01-after-the-applause')?.curriculum.activities[0]?.exerciseId)
            .toBe('activity:s3e01-after-the-applause-three-readings');
        expect(story.playableArc('s3e06-two-schedules')?.curriculum.activities[0]?.exerciseId)
            .toBe('activity:s3e06-two-schedules-sort-claims');
    });

    it('compiles the Open Door and Blank Atlas packages into one immutable scene graph', () => {
        const arc = loadStoryRuntime().openingArc;

        expect(arc.packages.map(storyPackage => storyPackage.id)).toEqual([
            'bridge:opening-arrival',
            's1e01-the-blank-atlas',
        ]);
        expect(arc.scenes).toHaveLength(14);
        expect(arc.firstSceneId).toBe('scene:opening-arrival:gate');
        expect(arc.lastSceneId).toBe('scene:blank-atlas:close');
        expect(arc.nextScene('scene:opening-arrival:fiction-notice')?.id)
            .toBe('scene:blank-atlas:arrival-greetings');
        expect(Object.isFrozen(arc)).toBe(true);
        expect(Object.isFrozen(arc.scenes[0].nodes)).toBe(true);
    });

    it('opens Chapter 1 without replaying the one-time arrival', () => {
        const story = loadStoryRuntime();
        const chapter = story.playableArc('s1e01-the-blank-atlas')!;

        expect(chapter.id).toBe('arc:s1e01-the-blank-atlas');
        expect(chapter.firstSceneId).toBe('scene:blank-atlas:arrival-greetings');
        expect(chapter.lastSceneId).toBe('scene:blank-atlas:close');
        expect(chapter.scenes).toHaveLength(11);
        expect(chapter.scenes.some(scene => scene.id.startsWith('scene:opening-arrival:'))).toBe(false);
    });

    it('keeps all exact Lesson 0 handoffs in registered section order', () => {
        const curriculum = loadStoryRuntime().openingArc.curriculum;

        expect(curriculum.lessonId).toBe('lesson:foundation-00');
        expect(curriculum.sectionSequence).toEqual([
            'arrival-greetings',
            'sound-script-map',
            'classroom-survival',
            'sentence-frames',
            'useful-vocabulary',
            'multi-speaker-input',
            'reading-writing',
            'transfer',
            'close',
        ]);
        expect(curriculum.activities.map(activity => activity.exerciseId).sort())
            .toEqual(LESSON_ZERO_ACTIVITY_IDS);
        expect(curriculum.activities.every(activity =>
            activity.requiredEvidence.activityId === activity.exerciseId
            && activity.requiredEvidence.kind === 'activity-passed')).toBe(true);
    });

    it('keeps the three mission choices distinct and reconverges after the selected scene', () => {
        const arc = loadStoryRuntime().openingArc;
        const choiceId = 'choice:blank-atlas:mission';

        expect(arc.nextScene('scene:blank-atlas:useful-vocabulary')).toBeUndefined();
        expect(arc.nextScene('scene:blank-atlas:useful-vocabulary', {
            [choiceId]: 'option:blank-atlas:mission-sound',
        })?.id).toBe('scene:blank-atlas:mission-sound');
        expect(arc.nextScene('scene:blank-atlas:useful-vocabulary', {
            [choiceId]: 'option:blank-atlas:mission-text',
        })?.id).toBe('scene:blank-atlas:mission-text');
        expect(arc.nextScene('scene:blank-atlas:useful-vocabulary', {
            [choiceId]: 'option:blank-atlas:mission-speaking',
        })?.id).toBe('scene:blank-atlas:mission-speaking');
        expect(arc.nextScene('scene:blank-atlas:mission-sound')?.id)
            .toBe('scene:blank-atlas:reading-writing');
        expect(arc.nextScene('scene:blank-atlas:mission-text')?.id)
            .toBe('scene:blank-atlas:reading-writing');
        expect(arc.nextScene('scene:blank-atlas:mission-speaking')?.id)
            .toBe('scene:blank-atlas:reading-writing');
    });

    it('keeps support classmates name-only without turning them into Chapter 1 unlocks', () => {
        const arc = loadStoryRuntime().openingArc;

        expect(arc.nameOnlyCast).toEqual(expect.arrayContaining([
            'aakash', 'mika', 'ruparna', 'sam', 'sophie', 'xingyu',
        ]));
        expect(arc.nameOnlyCast).not.toContain('rie');
        expect(arc.unlocks).toEqual(['rie']);
    });

    it('plays one visible node at a time and keeps choices transient to the session', () => {
        const session = createStoryArcSession(loadStoryRuntime().openingArc);

        expect(session.frame).toMatchObject({
            scene: { id: 'scene:opening-arrival:gate' },
            node: { id: 'node:opening-arrival:gate-lantern', kind: 'stage' },
            complete: false,
        });
        session.advance();
        expect(session.frame.node).toMatchObject({ id: 'node:opening-arrival:gate-note', kind: 'narration' });
        session.advance();
        expect(session.frame.node).toMatchObject({ id: 'choice:opening-arrival:at-gate', kind: 'choice' });
        session.choose('choice:opening-arrival:at-gate', 'option:opening-arrival:check-door');
        expect(session.frame.choices).toEqual({
            'choice:opening-arrival:at-gate': 'option:opening-arrival:check-door',
        });
        expect(session.frame.node).toMatchObject({ id: 'node:opening-arrival:door-opens' });
    });

    it('makes placement entries chronological replay while foundation and N5 start canonically', () => {
        expect(openingArcModeForEntry({ curriculumEntry: { route: 'lesson-zero' }, completedEncounterIds: [] }))
            .toBe('canonical');
        expect(openingArcModeForEntry({ curriculumEntry: { route: 'placement-mock', band: 'n5' }, completedEncounterIds: [] }))
            .toBe('canonical');
        expect(openingArcModeForEntry({ curriculumEntry: { route: 'placement-mock', band: 'n3' }, completedEncounterIds: [] }))
            .toBe('chronological-replay');
        expect(openingArcModeForEntry({ curriculumEntry: { route: 'lesson-zero' }, completedEncounterIds: ['story:s1e01-the-blank-atlas'] }))
            .toBe('chronological-replay');
        expect(openingArcModeForEntry({
            curriculumEntry: { route: 'lesson-zero' },
            completedEncounterIds: ['story:s1e01-the-blank-atlas:scene:blank-atlas:welcome'],
        })).toBe('chronological-replay');
    });

    it('exposes seven unbounded non-canonical review templates after the finale', () => {
        const calendar = loadStoryRuntime().reviewCalendar;

        expect(calendar.id).toBe(STORY_REVIEW_CALENDAR_SECTION);
        expect(calendar.startsAfterEpisodeId).toBe('s4e12-next-page');
        expect(calendar.canonicalStoryProgression).toBe(false);
        expect(calendar.cycle.repeat).toBe('unbounded');
        expect(calendar.dayTemplates).toHaveLength(7);
    });
});
