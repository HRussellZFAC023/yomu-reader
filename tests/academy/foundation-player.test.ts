import { describe, expect, it } from 'vitest';

import { lessonByRouteNumber } from '../../src/academy/foundation-course';
import {
    createFoundationPlayerState,
    gradeFoundationPractice,
    renderFoundationPlayer,
} from '../../src/academy/foundation-player';

describe('Foundation lesson player', () => {
    const lesson = lessonByRouteNumber(3);

    it('renders a Japanese-first scene with seven working lesson sections', () => {
        if (!lesson) throw new Error('Lesson 3 is missing.');
        const state = createFoundationPlayerState();
        const html = renderFoundationPlayer(lesson, state);

        expect(html).toContain('いっしょに食べませんか');
        expect(html).toContain('data-foundation-section="scene"');
        expect(html).toContain('data-foundation-section="reading"');
        expect(html).toContain('data-foundation-section="mission"');
        expect(html).not.toContain('Sounds good. Let us meet at the shop');
    });

    it('reveals translations only when requested', () => {
        if (!lesson) throw new Error('Lesson 3 is missing.');
        const state = createFoundationPlayerState();
        state.showMeaning = true;
        const html = renderFoundationPlayer(lesson, state);

        expect(html).toContain('Sounds good. Let us meet at the shop');
    });

    it('grades choice, text, and ordering items deterministically', () => {
        if (!lesson) throw new Error('Lesson 3 is missing.');
        const [choice, , , text, , order] = lesson.practice;

        expect(gradeFoundationPractice(choice, 'を').correct).toBe(true);
        expect(gradeFoundationPractice(choice, 'で').correct).toBe(false);
        expect(gradeFoundationPractice(text, ' ませんか。').correct).toBe(true);
        expect(gradeFoundationPractice(order, ['六時半に', '店で', '会いましょう']).correct).toBe(true);
        expect(gradeFoundationPractice(order, ['店で', '六時半に', '会いましょう']).correct).toBe(false);
    });

    it('shows one practice item at a time without embedding the answer', () => {
        if (!lesson) throw new Error('Lesson 3 is missing.');
        const state = createFoundationPlayerState();
        state.section = 'practice';
        const html = renderFoundationPlayer(lesson, state);

        expect(html).toContain('ラーメン＿食べます。');
        expect(html).not.toContain('ラーメン is what is eaten.');
    });
});
