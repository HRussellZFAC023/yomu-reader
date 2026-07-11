// The course registry is the single canonical index of the whole three-year
// course, keyed by class chronology. It is a set of VIEWS over data that already
// exists — the authored foundation lessons, the encoded Minna 28–30 lessons, the
// digitised week corpus, and the worksheet packs — not a duplicated lesson tree.
//
// The chronology spine comes from the build-time week index
// (public/academy/content/weeks/index.json, emitted by
// scripts/academy-weeks/build-week-index.mjs). Every week is listed even before
// its JSON is authored, so units land as "coming soon" rather than vanishing.
// Foundation lessons, the encoded lessons, and worksheet packs are overlaid onto
// their chronological slots. Missing or malformed source files degrade to
// "coming soon" instead of crashing, because more week JSONs and packs arrive
// incrementally from parallel content sessions.

import { academyFoundationRoute, type FoundationLesson } from './foundation-course';
import { ACADEMY_LESSONS, type AcademyLesson } from './lessons-content';
import {
    worksheetPackToActivity,
    type WorksheetInventory,
    type WorksheetInventoryPack,
} from './worksheet-pack';

/* --------------------------------------------------------- week index shapes */

export interface WeekIndexEntry {
    order: number;
    id: string;
    file: string | null;
    weekKind: string;
    title: { en: string; ja?: string };
    academyYear: number;
    termId: string;
    termLabel: string;
    courseYear: string | null;
    weekNumberInTerm: number;
    minnaChapters: readonly number[];
    jlpt: string;
    isCheckpoint: boolean;
    prerequisiteWeekIds: readonly string[];
    mapping: { ucl: string; minna: string | null };
}

export interface WeekIndexSpineTerm {
    termId: string;
    termLabel: string;
    academyYear: number;
    courseYear: string;
    levelBand: string;
    minnaBook: string;
}

export interface WeekIndex {
    schema: string;
    spine: readonly WeekIndexSpineTerm[];
    summary: { weekCount: number; authored: number; checkpoints: readonly string[] };
    orderings: { chronology: readonly string[]; minna?: readonly string[] };
    weeks: readonly WeekIndexEntry[];
}

/* ------------------------------------------------------------ registry model */

export type CourseUnitSource =
    | 'foundation'
    | 'lessons-content'
    | 'digitised-activity'
    | 'week'
    | 'coming-soon';

export type CourseUnitStatus = 'playable' | 'browsable' | 'coming-soon';

export interface CourseUnit {
    id: string;
    order: number;
    weekKind: string;
    title: { en: string; ja?: string };
    academyYear: number;
    termId: string;
    termLabel: string;
    courseYear: string | null;
    weekNumberInTerm: number;
    minnaChapters: readonly number[];
    jlpt: string;
    isCheckpoint: boolean;
    mapping: { ucl: string; minna: string | null };
    source: CourseUnitSource;
    status: CourseUnitStatus;
    /** Set when this slot is served by an authored foundation lesson (0–8) or the digitised lesson (9). */
    foundationRouteNumber: number | null;
    /** Set when this slot is served by an encoded lessons-content lesson. */
    lessonsContentUnitId: string | null;
    /** Worksheet packs whose chapter lands in this slot, in inventory order. */
    worksheetPackIds: readonly string[];
    /** True when a week JSON is present on disk for this slot. */
    weekFileAvailable: boolean;
}

export interface CourseTermGroup {
    termId: string;
    termLabel: string;
    academyYear: number;
    courseYear: string | null;
    units: readonly CourseUnit[];
}

export interface CourseYearGroup {
    academyYear: number;
    label: string;
    terms: readonly CourseTermGroup[];
}

export interface CourseRegistry {
    units: readonly CourseUnit[];
    years: readonly CourseYearGroup[];
    counts: {
        total: number;
        playable: number;
        browsable: number;
        comingSoon: number;
        worksheetPacks: number;
        weeksAuthored: number;
    };
    /** Non-fatal problems (missing index, malformed pack) surfaced for the UI/logs. */
    warnings: readonly string[];
}

/* --------------------------------------------------- curated on-ramp mapping */

// The nine foundation lessons are a hand-built on-ramp that compresses several
// real class weeks each; this curated map anchors each to a representative
// chronological slot. Route 9 is the fully digitised activity lesson. Slots that
// do not exist in the week index simply leave the foundation lesson unattached —
// it is still exposed as its own playable unit.
const FOUNDATION_WEEK_SLOTS: Readonly<Record<number, string>> = {
    0: 'orientation',
    1: 'l1-l01',
    2: 'l1-l02',
    3: 'l1-l03',
    4: 'l1-l07',
    5: 'l2plus-l01',
    6: 'l3-2-l01',
    7: 'l3-2-l02',
    8: 'l3-2-l03',
    9: 'l3plus-l09',
};

const DIGITISED_ROUTE_NUMBER = 9;

/* --------------------------------------------------------------- composition */

export interface RegistryInput {
    weekIndex: WeekIndex | null;
    inventory: WorksheetInventory | null;
    foundationLessons?: readonly FoundationLesson[];
    lessonsContent?: readonly AcademyLesson[];
}

function fallbackSpine(foundation: readonly FoundationLesson[]): WeekIndexEntry[] {
    // With no week index we still present the authored on-ramp so the course is
    // never empty. Each foundation lesson becomes a minimal slot.
    return foundation.map((lesson, index) => ({
        order: index,
        id: FOUNDATION_WEEK_SLOTS[lesson.routeNumber] ?? `foundation-${lesson.routeNumber}`,
        file: null,
        weekKind: lesson.routeNumber === 0 ? 'orientation' : 'lesson',
        title: { en: lesson.title, ja: lesson.japaneseTitle },
        academyYear: 1,
        termId: 'l1',
        termLabel: 'Level 1',
        courseYear: null,
        weekNumberInTerm: lesson.routeNumber,
        minnaChapters: [],
        jlpt: lesson.level,
        isCheckpoint: false,
        prerequisiteWeekIds: [],
        mapping: { ucl: lesson.mapping.ucl, minna: lesson.mapping.minna },
    }));
}

function chapterOf(pack: WorksheetInventoryPack): number | null {
    const chapter = pack.curriculum?.chapter;
    return typeof chapter === 'number' ? chapter : null;
}

/** Compose a registry from already-loaded data. Pure and synchronous — the unit tests drive this directly. */
export function composeCourseRegistry(input: RegistryInput): CourseRegistry {
    const warnings: string[] = [];
    const foundation = input.foundationLessons ?? academyFoundationRoute;
    const lessons = input.lessonsContent ?? ACADEMY_LESSONS;

    let spine = input.weekIndex?.weeks;
    if (!spine || spine.length === 0) {
        warnings.push('Week index unavailable — showing the authored on-ramp only.');
        spine = fallbackSpine(foundation);
    }

    // Index foundation lessons by their curated slot.
    const foundationBySlot = new Map<string, FoundationLesson>();
    for (const lesson of foundation) {
        const slot = FOUNDATION_WEEK_SLOTS[lesson.routeNumber];
        if (slot) foundationBySlot.set(slot, lesson);
    }

    // Map worksheet packs to chronological slots by Minna chapter.
    const packsByChapter = new Map<number, WorksheetInventoryPack[]>();
    let worksheetPackCount = 0;
    for (const pack of input.inventory?.packs ?? []) {
        const chapter = chapterOf(pack);
        if (chapter == null) continue;
        worksheetPackCount += 1;
        const bucket = packsByChapter.get(chapter) ?? [];
        bucket.push(pack);
        packsByChapter.set(chapter, bucket);
    }
    // The first chronological week that covers a chapter owns that chapter's packs.
    const chapterOwner = new Map<number, string>();
    for (const week of spine) {
        for (const chapter of week.minnaChapters) {
            if (!chapterOwner.has(chapter)) chapterOwner.set(chapter, week.id);
        }
    }

    const units: CourseUnit[] = spine.map((week) => {
        const foundationLesson = foundationBySlot.get(week.id);
        const encoded = lessons.find((lesson) => week.minnaChapters.includes(lesson.chapter)
            && chapterOwner.get(lesson.chapter) === week.id);
        const packIds: string[] = [];
        for (const chapter of week.minnaChapters) {
            if (chapterOwner.get(chapter) !== week.id) continue;
            for (const pack of packsByChapter.get(chapter) ?? []) packIds.push(pack.packId);
        }

        let source: CourseUnitSource;
        let status: CourseUnitStatus;
        let foundationRouteNumber: number | null = null;
        let lessonsContentUnitId: string | null = null;

        if (foundationLesson) {
            foundationRouteNumber = foundationLesson.routeNumber;
            source = foundationLesson.routeNumber === DIGITISED_ROUTE_NUMBER ? 'digitised-activity' : 'foundation';
            status = 'playable';
        } else if (encoded) {
            lessonsContentUnitId = encoded.unitId;
            source = 'lessons-content';
            status = 'playable';
        } else if (week.file) {
            source = 'week';
            status = 'browsable';
        } else if (packIds.length > 0) {
            source = 'week';
            status = 'browsable';
        } else {
            source = 'coming-soon';
            status = 'coming-soon';
        }

        return {
            id: week.id,
            order: week.order,
            weekKind: week.weekKind,
            title: week.title,
            academyYear: week.academyYear,
            termId: week.termId,
            termLabel: week.termLabel,
            courseYear: week.courseYear,
            weekNumberInTerm: week.weekNumberInTerm,
            minnaChapters: week.minnaChapters,
            jlpt: week.jlpt,
            isCheckpoint: week.isCheckpoint,
            mapping: week.mapping,
            source,
            status,
            foundationRouteNumber,
            lessonsContentUnitId,
            worksheetPackIds: packIds,
            weekFileAvailable: Boolean(week.file),
        };
    });

    units.sort((a, b) => a.order - b.order);

    // Group into Year → term for the browser.
    const years: CourseYearGroup[] = [];
    for (const unit of units) {
        let year = years.find((entry) => entry.academyYear === unit.academyYear);
        if (!year) {
            year = { academyYear: unit.academyYear, label: yearLabel(unit.academyYear), terms: [] };
            years.push(year);
        }
        const terms = year.terms as CourseTermGroup[];
        let term = terms.find((entry) => entry.termId === unit.termId);
        if (!term) {
            term = { termId: unit.termId, termLabel: unit.termLabel, academyYear: unit.academyYear, courseYear: unit.courseYear, units: [] };
            terms.push(term);
        }
        (term.units as CourseUnit[]).push(unit);
    }
    years.sort((a, b) => a.academyYear - b.academyYear);

    return {
        units,
        years,
        counts: {
            total: units.length,
            playable: units.filter((unit) => unit.status === 'playable').length,
            browsable: units.filter((unit) => unit.status === 'browsable').length,
            comingSoon: units.filter((unit) => unit.status === 'coming-soon').length,
            worksheetPacks: worksheetPackCount,
            weeksAuthored: units.filter((unit) => unit.weekFileAvailable).length,
        },
        warnings,
    };
}

function yearLabel(academyYear: number): string {
    if (academyYear <= 0) return 'Getting started';
    return `Year ${academyYear}`;
}

/* ------------------------------------------------------------ runtime loader */

type FetchLike = (input: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

async function fetchJson<T>(fetchImpl: FetchLike, url: string, warnings: string[]): Promise<T | null> {
    try {
        const response = await fetchImpl(url);
        if (!response.ok) {
            warnings.push(`Could not load ${url} (status not ok).`);
            return null;
        }
        return (await response.json()) as T;
    } catch {
        warnings.push(`Could not load ${url}.`);
        return null;
    }
}

/**
 * Load the registry at runtime. Fetches the generated week index and worksheet
 * inventory relative to the Academy document base; any failure downgrades to the
 * authored on-ramp rather than throwing.
 */
export async function loadCourseRegistry(
    fetchImpl: FetchLike = ((url: string) => fetch(url)) as FetchLike,
    base = 'content/',
): Promise<CourseRegistry> {
    const warnings: string[] = [];
    const [weekIndex, inventory] = await Promise.all([
        fetchJson<WeekIndex>(fetchImpl, `${base}weeks/index.json`, warnings),
        fetchJson<WorksheetInventory>(fetchImpl, `${base}worksheet-packs/_inventory.json`, warnings),
    ]);
    const registry = composeCourseRegistry({ weekIndex, inventory });
    return { ...registry, warnings: [...warnings, ...registry.warnings] };
}

/**
 * Fetch and convert a single worksheet pack into a playable activity. Tolerates
 * a missing or malformed file (returns null) so a partially digitised corpus
 * never breaks the player.
 */
export async function loadWorksheetPackActivity(
    packId: string,
    slug: string,
    fetchImpl: FetchLike = ((url: string) => fetch(url)) as FetchLike,
    base = 'content/',
): Promise<ReturnType<typeof worksheetPackToActivity> | null> {
    const warnings: string[] = [];
    const pack = await fetchJson<Parameters<typeof worksheetPackToActivity>[0]>(
        fetchImpl,
        `${base}worksheet-packs/packs/${slug}.json`,
        warnings,
    );
    if (!pack) return null;
    try {
        return worksheetPackToActivity({ ...pack, packId, slug });
    } catch {
        return null;
    }
}
