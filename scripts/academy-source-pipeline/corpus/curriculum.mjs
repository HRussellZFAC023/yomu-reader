import { readdirSync } from 'node:fs';
import path from 'node:path';
import { CORPUS_REVISION, CORPUS_SCHEMAS } from './paths.mjs';
import { readJson } from '../io.mjs';

const LESSON_FILE = /^\d{3}-l[12]-l\d{2}\.json$/u;

export function buildCurriculumCrosswalk(roots, rawManifest) {
    const moduleIndex = indexModules(rawManifest);
    const lessons = readdirSync(roots.lessonsRoot)
        .filter(name => LESSON_FILE.test(name))
        .sort()
        .map(fileName => readJson(path.join(roots.lessonsRoot, fileName)));
    const duplicateModules = duplicateModuleIds(lessons);
    const privateLessons = lessons.map((lesson, lessonIndex) => {
        const moduleId = lesson.sourceCoverage?.archiveModuleId ?? null;
        const rawMoodle = moduleIndex.get(moduleId);
        const classOrder = canonicalClassOrder(lesson);
        const moodle = rawMoodle && {
            ...rawMoodle,
            classOrder,
        };
        const minna = parseAnchor(lesson.mapping?.minna, 'minna');
        const genki = parseAnchor(lesson.mapping?.genki, 'genki');
        const gaps = [];
        if (!moodle) gaps.push('missing-moodle-chronology-anchor');
        if (!minna) gaps.push('missing-minna-prerequisite-anchor');
        if (!genki) gaps.push('missing-genki-prerequisite-anchor');
        if (duplicateModules.has(moduleId)) gaps.push('moodle-module-reused-by-distinct-lessons');
        return {
            lessonId: lesson.id,
            lessonOrder: lesson.order ?? lessonIndex + 2,
            progressionGroup: progressionGroupForLesson(lesson, moodle),
            sourceFile: fileNameForLesson(roots.lessonsRoot, lesson.id),
            moodle: moodle ? { ...moodle, sourceId: `moodle-module:${moduleId}` } : null,
            minna,
            genki,
            enrichmentPolicy: 'introduced-prerequisites-only',
            status: gaps.length === 0 ? 'anchored' : 'gap-declared',
            gaps,
        };
    });
    privateLessons.sort(compareCanonicalOrder);
    addSequenceGaps(privateLessons, 'minna');
    addSequenceGaps(privateLessons, 'genki');
    const privateCrosswalk = {
        schema: CORPUS_SCHEMAS.curriculum,
        revision: CORPUS_REVISION,
        precedence: ['moodle-raw', 'japanese-minna', 'japanese-genki'],
        lessons: privateLessons,
        summary: summarize(privateLessons),
    };
    return { privateCrosswalk, publicCrosswalk: toPublic(privateCrosswalk) };
}

function compareCanonicalOrder(left, right) {
    const leftClassOrder = left.moodle?.classOrder;
    const rightClassOrder = right.moodle?.classOrder;
    if (Number.isInteger(leftClassOrder) && Number.isInteger(rightClassOrder)) {
        return leftClassOrder - rightClassOrder;
    }
    if (Number.isInteger(leftClassOrder)) return -1;
    if (Number.isInteger(rightClassOrder)) return 1;
    return left.lessonOrder - right.lessonOrder || left.lessonId.localeCompare(right.lessonId, 'en');
}

function indexModules(manifest) {
    const index = new Map();
    let ordinal = 0;
    manifest.courses.forEach((course, courseIndex) => {
        course.sections.forEach((section, sectionIndex) => {
            section.modules.forEach((module, moduleIndex) => {
                ordinal += 1;
                if (module.id === undefined || module.id === null) return;
                index.set(module.id, {
                    courseId: course.id,
                    sectionId: section.id,
                    moduleId: module.id,
                    moduleType: module.type,
                    moduleTitle: module.title,
                    sourceOrdinal: ordinal,
                    coordinates: [courseIndex, sectionIndex, moduleIndex],
                });
            });
        });
    });
    return index;
}

function parseAnchor(value, kind) {
    if (typeof value !== 'string' || /no verified|original academy sequence/iu.test(value)) return null;
    if (kind === 'minna' && /katakana strand|kanji strand|term preview|food and quantity vocabulary/iu.test(value)) {
        return { sourceId: 'japanese-minna:strand', kind: 'strand', range: null, label: value };
    }
    const chapterNumbers = [];
    for (const match of value.matchAll(/(?:lessons?|chapters?)\s*([\d,\s\u2013-]+(?:and\s+\d+)?)/giu)) {
        chapterNumbers.push(...(match[1].match(/\d+/gu) ?? []).map(Number));
    }
    for (const match of value.matchAll(/\bL(\d+)(?:\s*[\u2013-]\s*(\d+))?/giu)) {
        chapterNumbers.push(Number(match[1]), Number(match[2] ?? match[1]));
    }
    if (chapterNumbers.length === 0) return null;
    const start = Math.min(...chapterNumbers);
    const end = Math.max(...chapterNumbers);
    return {
        sourceId: `japanese-${kind}:${start}-${end}`,
        kind: /preview|syllabus range/iu.test(value)
            ? 'preview'
            : /review|consolidation/iu.test(value) ? 'review' : 'chapter-range',
        range: [start, end],
        label: value,
    };
}

function duplicateModuleIds(lessons) {
    const counts = new Map();
    for (const lesson of lessons) {
        const id = lesson.sourceCoverage?.archiveModuleId;
        if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
}

function addSequenceGaps(lessons, anchorName) {
    const groups = splitProgressionGroups(lessons);
    for (const group of groups) {
        let previous = null;
        for (const lesson of group) {
            const anchor = lesson[anchorName];
            if (!anchor?.range || anchor.kind === 'preview' || anchor.kind === 'review') continue;
            const stage = anchor.range[1];
            if (previous !== null && stage < previous) {
                const gap = `${anchorName}-prerequisite-order-regression`;
                if (!lesson.gaps.includes(gap)) lesson.gaps.push(gap);
                lesson.status = 'gap-declared';
            }
            previous = Math.max(previous ?? stage, stage);
        }
    }
}

function splitProgressionGroups(lessons) {
    return [
        ...new Set(lessons.map(lesson => lesson.progressionGroup)),
    ].map(group => lessons.filter(lesson => lesson.progressionGroup === group));
}

function progressionGroupForLesson(lesson, moodle) {
    if (/^l1-/u.test(lesson.id)) return 'level-1';
    const sectionId = moodle?.sectionId ?? '';
    if (sectionId.includes('level-2-plus')) return 'level-2-plus';
    if (sectionId.includes('level-3-2')) return 'level-3-2';
    if (sectionId.includes('level-3-plus')) return 'level-3-plus';
    return `unclassified-${lesson.id}`;
}

function canonicalClassOrder(lesson) {
    const value = lesson.identity?.sourceOrdering?.canonicalClassOrder
        ?? lesson.mapping?.canonicalClassOrder
        ?? lesson.order;
    return Number.isInteger(value) ? value : null;
}

function fileNameForLesson(root, lessonId) {
    return readdirSync(root).find(name => LESSON_FILE.test(name) && name.endsWith(`${lessonId}.json`)) ?? null;
}

function summarize(lessons) {
    return {
        lessonCount: lessons.length,
        fullyAnchored: lessons.filter(lesson => lesson.status === 'anchored').length,
        withDeclaredGaps: lessons.filter(lesson => lesson.status === 'gap-declared').length,
        gapCounts: countValues(lessons.flatMap(lesson => lesson.gaps)),
    };
}

function countValues(values) {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function toPublic(value) {
    return {
        ...value,
        lessons: value.lessons.map(lesson => ({
            lessonId: lesson.lessonId,
            lessonOrder: lesson.lessonOrder,
            progressionGroup: lesson.progressionGroup,
            moodle: lesson.moodle && {
                sourceId: lesson.moodle.sourceId,
                moduleId: lesson.moodle.moduleId,
                sourceOrdinal: lesson.moodle.sourceOrdinal,
                classOrder: lesson.moodle.classOrder,
            },
            minna: publicAnchor(lesson.minna),
            genki: publicAnchor(lesson.genki),
            enrichmentPolicy: lesson.enrichmentPolicy,
            status: lesson.status,
            gaps: lesson.gaps,
        })),
    };
}

function publicAnchor(anchor) {
    return anchor && { sourceId: anchor.sourceId, kind: anchor.kind, range: anchor.range };
}
