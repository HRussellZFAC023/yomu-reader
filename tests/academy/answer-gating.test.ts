import { describe, expect, it } from 'vitest';

import { academyContentGraph } from '../../src/academy/content';
import { lessonByRouteNumber } from '../../src/academy/foundation-course';
import {
    createFoundationPlayerState,
    renderFoundationPlayer,
    reviewMissionDraft,
} from '../../src/academy/foundation-player';

describe('Answer-key gating', () => {
    it('keeps graded listening answers out of pre-attempt teaching copy', () => {
        const listening = academyContentGraph.activities.filter(activity => activity.kind === 'listening');
        expect(listening.length).toBeGreaterThan(0);
        for (const activity of listening) {
            const correctLabels = activity.responses.flatMap(response =>
                'options' in response && 'correctOptionIds' in response
                    ? response.options
                        .filter(option => (response.correctOptionIds as readonly string[]).includes(option.id))
                        .map(option => option.label.en.toLowerCase())
                    : []);
            const teachingCopy = activity.focusVariantIds
                .map(id => academyContentGraph.conceptVariants.find(variant => variant.id === id))
                .flatMap(variant => (variant ? [variant.example.en] : []))
                .join(' ')
                .toLowerCase();
            for (const label of correctLabels) {
                const revealing = label
                    .split(/[^a-z]+/)
                    .filter(word => word.length > 4)
                    .filter(word => teachingCopy.includes(word));
                expect(revealing, `${activity.id} teaching copy restates graded answer "${label}"`).toEqual([]);
            }
        }
    });

    it('does not serialize the foundation mission model answer before the first draft check', () => {
        const lesson = lessonByRouteNumber(3);
        if (!lesson) throw new Error('Lesson 3 is missing.');
        const state = createFoundationPlayerState();
        state.section = 'mission';
        const html = renderFoundationPlayer(lesson, state);
        expect(html).toContain('data-foundation-model-body');
        expect(html).not.toContain(lesson.finalTask.model);
    });

    it('requires Japanese sentences, not just length, before unlocking the mission model', () => {
        expect(reviewMissionDraft('this is long enough but not japanese at all').pass).toBe(false);
        expect(reviewMissionDraft('にほんご').pass).toBe(false);
        expect(reviewMissionDraft('しゅうまつは映画を見ます。それから、友だちとばんごはんを食べます。').pass).toBe(true);
    });
});
