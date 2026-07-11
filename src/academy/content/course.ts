/**
 * Yomu Academy — course facade.
 *
 * One spine: the 73-week UCL class chronology (weeks/index.json). Each week
 * resolves to the best available content, in order of richness:
 *   1. an authored week JSON (scene + explanation + exercise components)
 *   2. a foundation lesson (routes 0–9) mapped onto early weeks
 *   3. a coming-soon stub that still shows mapping + sources
 * Views over data; nothing is duplicated, nothing crashes when absent.
 */

import { academyFoundationRoute, type FoundationLesson } from '../foundation-course';
import {
    loadWeeklyCourseRepository,
    type WeeklyCourseFetch,
    type WeeklyCourseRepository,
    type WeeklyCourseWeek,
} from '../weekly-course';
import type { SceneLine, SceneNode, SceneScript } from '../engine/script';

export interface CourseWeekView {
    order: number;
    id: string;
    title: { en: string; ja?: string };
    jlpt?: string;
    termLabel?: string;
    weekKind?: string;
    isCheckpoint?: boolean;
    availability: 'authored-week' | 'foundation-lesson' | 'coming-soon';
    week?: WeeklyCourseWeek;
    foundation?: FoundationLesson;
    mapping?: { ucl?: string; minna?: string | null };
}

export interface CourseView {
    weeks: CourseWeekView[];
    authoredCount: number;
    warnings: readonly string[];
}

/**
 * Foundation lessons are the richest early content; map them onto the weeks
 * whose alignment they carry. Route 0 (kana on-ramp) fronts orientation.
 */
const FOUNDATION_WEEK_ORDERS: Record<number, number> = {
    0: 0, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10,
};

const defaultFetch: WeeklyCourseFetch = async (path: string) => {
    const response = await fetch(path);
    return { ok: response.ok, status: response.status, json: () => response.json() };
};

export async function loadCourse(fetcher: WeeklyCourseFetch = defaultFetch): Promise<CourseView> {
    let repository: WeeklyCourseRepository | null = null;
    let warnings: readonly string[] = [];
    try {
        repository = await loadWeeklyCourseRepository(fetcher);
        warnings = repository.warnings;
    } catch (error) {
        warnings = [error instanceof Error ? error.message : 'week index unavailable'];
    }

    const foundationByOrder = new Map<number, FoundationLesson>();
    for (const lesson of academyFoundationRoute) {
        const order = FOUNDATION_WEEK_ORDERS[lesson.routeNumber];
        if (order !== undefined) foundationByOrder.set(order, lesson);
    }

    const weeks: CourseWeekView[] = [];
    let authoredCount = 0;
    for (const record of repository?.plannedWeeks ?? []) {
        const week = record.availability.state === 'present' ? record.availability.content : undefined;
        const foundation = foundationByOrder.get(record.order);
        const availability: CourseWeekView['availability'] = week
            ? 'authored-week'
            : foundation
                ? 'foundation-lesson'
                : 'coming-soon';
        if (week) authoredCount += 1;
        weeks.push({
            order: record.order,
            id: record.id,
            title: record.title,
            jlpt: record.jlpt,
            termLabel: record.termLabel,
            weekKind: record.weekKind,
            isCheckpoint: record.isCheckpoint,
            availability,
            week,
            foundation,
            mapping: record.mapping,
        });
    }

    // No index (offline before cache, or data missing): fall back to the
    // foundation route so the app still teaches.
    if (!weeks.length) {
        for (const lesson of academyFoundationRoute) {
            weeks.push({
                order: lesson.routeNumber,
                id: lesson.id,
                title: { en: lesson.title, ja: lesson.japaneseTitle },
                jlpt: lesson.level,
                availability: 'foundation-lesson',
                foundation: lesson,
            });
        }
    }

    return { weeks, authoredCount, warnings };
}

interface AuthoredSceneLine {
    speaker?: string;
    ja?: string;
    en?: string;
    note?: string;
}

interface AuthoredScene {
    cast?: string[];
    hook?: string;
    lines?: AuthoredSceneLine[];
}

/** Compile an authored week's opening scene into an engine script. */
export function weekSceneScript(week: WeeklyCourseWeek, plateId: string): SceneScript | null {
    const scene = week.scene as AuthoredScene | undefined;
    if (!scene?.lines?.length) return null;
    const cast = (scene.cast ?? []).slice(0, 2);
    const nodes: SceneNode[] = [
        {
            kind: 'stage',
            plate: plateId,
            sprites: cast.map((character, index) => ({ character, side: index === 0 ? ('left' as const) : ('right' as const) })),
        },
    ];
    if (scene.hook) nodes.push({ kind: 'line', en: scene.hook } satisfies SceneLine);
    for (const line of scene.lines) {
        nodes.push({ kind: 'line', speaker: line.speaker, ja: line.ja, en: line.en, note: line.note });
    }
    nodes.push({ kind: 'end' });
    return { id: `week-scene:${week.id}`, nodes };
}
