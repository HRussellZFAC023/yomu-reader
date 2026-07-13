import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_CAST_SPECIALTIES,
    assertHealthyAuthoredCastUsage,
    auditAuthoredCastUsage,
    type AuthoredCastUnit,
} from '../../src/academy/domain/authored-cast';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero';

const LESSON_ZERO_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function lessonZeroPackage(): unknown {
    return JSON.parse(fs.readFileSync(LESSON_ZERO_PATH, 'utf8'));
}

describe('authored Academy cast guard', () => {
    it('keeps the current Lesson 0 route hosts varied and matched to documented learning homes', () => {
        expect(() => validateLessonZeroPackage(lessonZeroPackage())).not.toThrow();
        expect(ACADEMY_CAST_SPECIALTIES).toMatchObject({
            xingyu: expect.arrayContaining(['sound']),
            mika: expect.arrayContaining(['pronunciation']),
            sophie: expect.arrayContaining(['reading']),
            ruparna: expect.arrayContaining(['inference']),
            aakash: expect.arrayContaining(['directions']),
            sam: expect.arrayContaining(['invitations']),
        });
    });

    it('rejects an unknown id and a misspelled visible first name', () => {
        const issues = auditAuthoredCastUsage([
            { id: 'lesson:a', cast: [{ id: 'aakash', firstName: 'Akash' }] },
            { id: 'lesson:b', cast: [{ id: 'invented-classmate', firstName: 'Someone' }] },
        ]);
        expect(issues.map(issue => issue.code)).toEqual([
            'cast-name-mismatch',
            'unknown-cast-id',
        ]);
        expect(() => assertHealthyAuthoredCastUsage([
            { id: 'lesson:a', cast: [{ id: 'aakash', firstName: 'Akash' }] },
        ])).toThrow(/expected Aakash/u);

        const packageWithMisspelling = lessonZeroPackage() as {
            lesson: { inputScripts: Array<{ lines: Array<{ speakerId: string; japanese: string }> }> };
        };
        const aakash = packageWithMisspelling.lesson.inputScripts
            .flatMap(script => script.lines)
            .find(line => line.speakerId === 'aakash')!;
        aakash.japanese = aakash.japanese.replace('Aakash', 'Akash');
        expect(() => validateLessonZeroPackage(packageWithMisspelling))
            .toThrow(/canonical first name Aakash/u);
    });

    it('fails content that repeatedly assigns the same small pair', () => {
        const repeated: AuthoredCastUnit[] = ['a', 'b', 'c', 'd'].map(id => ({
            id: `lesson:${id}`,
            cast: [{ id: 'aakash' }, { id: 'sam' }],
        }));
        const codes = auditAuthoredCastUsage(repeated).map(issue => issue.code);
        expect(codes).toContain('cast-variety');
        expect(codes).toContain('cast-concentration');
        expect(() => assertHealthyAuthoredCastUsage(repeated)).toThrow(/distinct peers/u);
    });

    it('does not count a recurring teacher against classmate rotation', () => {
        const varied: AuthoredCastUnit[] = [
            ['aakash', 'sam'],
            ['sophie', 'ruparna'],
            ['xingyu', 'mika'],
        ].map((ids, index) => ({
            id: `lesson:${index}`,
            cast: [{ id: 'rie' }, ...ids.map(id => ({ id }))],
        }));
        expect(auditAuthoredCastUsage(varied)).toEqual([]);
    });
});
