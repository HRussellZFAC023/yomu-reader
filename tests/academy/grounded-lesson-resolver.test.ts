import fs from 'node:fs';
import path from 'node:path';
import { createGroundedLessonResolver } from '../../src/academy/content/grounded-lesson-resolver';

const LESSON_ZERO = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

describe('grounded lesson resolver', () => {
    it('re-audits the shipped bytes through the complete lesson registry', async () => {
        const requests: string[] = [];
        const resolver = createGroundedLessonResolver((async input => {
            requests.push(String(input));
            return new Response(fs.readFileSync(LESSON_ZERO), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch);

        const lesson = await resolver.resolve('lesson:foundation-00');
        expect(lesson).toMatchObject({ lessonId: 'lesson:foundation-00', status: 'review-blocked' });
        expect(requests).toEqual(['/academy/content/lessons/lesson-zero.v1.json']);
        await resolver.resolve('lesson:foundation-00');
        expect(requests).toHaveLength(1);
    });

    it('rejects an unregistered caller-named lesson before fetching content', async () => {
        const fetcher = vi.fn(async () => new Response('{}'));
        const resolver = createGroundedLessonResolver(fetcher as typeof fetch);

        await expect(resolver.resolve('lesson:forged')).rejects.toThrow(/unregistered complete academy lesson/i);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects changed bytes even when the JSON still looks structurally valid', async () => {
        const value = JSON.parse(fs.readFileSync(LESSON_ZERO, 'utf8')) as Record<string, unknown>;
        const resolver = createGroundedLessonResolver((async () => new Response(JSON.stringify(value), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch);

        await expect(resolver.resolve('lesson:foundation-00')).rejects.toThrow(/registered bytes/i);
    });
});
