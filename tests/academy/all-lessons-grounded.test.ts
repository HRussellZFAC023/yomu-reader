import { createHash } from 'node:crypto';
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

    it('validates every imported authored week from its exact committed bytes', async () => {
        const weeks = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'authored-week');
        expect(weeks).toHaveLength(59);

        for (const week of weeks) {
            const bytes = fs.readFileSync(path.join(LESSON_DIRECTORY, week.filename));
            const observedSha256 = createHash('sha256').update(bytes).digest('hex');
            expect(observedSha256, week.filename).toBe(week.expectedSha256);
            const { week: adapted } = await week.validate(Uint8Array.from(bytes).buffer);
            expect(adapted.id).toBe(week.packageId);
            expect(adapted.activities.length).toBeGreaterThan(0);
            expect(adapted.provenance.source.sha256).toBe(observedSha256);
        }
    });
});
