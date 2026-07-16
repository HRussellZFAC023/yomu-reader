import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_LESSON_CONTENT_REGISTRY,
    getLessonContentRegistration,
} from '../../src/academy/content/lesson-content-registry';

const LESSON_DIRECTORY = path.resolve('public/academy/content/lessons');

describe('public Academy lesson grounding gate', () => {
    it('registers every public lesson JSON exactly once', () => {
        const files = fs.readdirSync(LESSON_DIRECTORY).filter(file => file.endsWith('.json')).sort();
        const registered = ACADEMY_LESSON_CONTENT_REGISTRY.map(entry => entry.filename).sort();

        expect(new Set(registered).size).toBe(registered.length);
        expect(registered).toEqual(files);
        files.forEach(file => expect(getLessonContentRegistration(file).filename).toBe(file));
    });

    it('audits every complete lesson through the grounded-lesson seam', () => {
        const lessons = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'lesson');
        expect(lessons.length).toBeGreaterThan(0);

        for (const lesson of lessons) {
            const value = JSON.parse(fs.readFileSync(path.join(LESSON_DIRECTORY, lesson.filename), 'utf8'));
            const audit = lesson.audit(value);
            expect(audit.lessonId).toBe(lesson.lessonId);
            expect(['playable', 'review-blocked']).toContain(audit.status);
            expect(audit.status === 'playable' ? audit.blockerIds : []).toEqual([]);
            expect(audit.status === 'review-blocked' ? audit.blockerIds.length : 1).toBeGreaterThan(0);
        }
    });

    it('validates support shards without letting them claim complete-lesson status', () => {
        const shards = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'support-shard');
        expect(shards.length).toBeGreaterThan(0);

        for (const shard of shards) {
            const value = JSON.parse(fs.readFileSync(path.join(LESSON_DIRECTORY, shard.filename), 'utf8'));
            expect(shard.validate(value)).toBeTruthy();
            expect(shard.ownerLessonId).toMatch(/^lesson:/u);
            expect('audit' in shard).toBe(false);
        }
    });
});
