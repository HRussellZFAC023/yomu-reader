/**
 * Yomu Academy — builds a playable visual-novel scene for any lesson.
 *
 * The hand-authored, per-word scenes live in story.ts / story-links.ts. This
 * turns a lesson's own opening dialogue into a default VnScene so that entering
 * any lesson plays as a visual-novel beat (typewriter, portraits, EN caption,
 * eye-icon reading reveal) instead of a static script. Presentation data only.
 */

import type { FoundationLesson } from './foundation-course';
import type { VnScene, VnLine } from './vn';
import type { RevealToken } from './learn';
import { castMemberById } from './cast';

/** Map a dialogue speaker label ("Rie-sensei", "Henry") to a cast id if one exists. */
function speakerToCastId(speaker: string): string {
    const key = speaker
        .toLowerCase()
        .replace(/[-\s]*sensei$/, '')
        .replace(/\s*さん$/, '')
        .trim();
    return castMemberById(key) ? key : speaker;
}

function toLine(speaker: string, japanese: string, meaning: string): VnLine {
    return { speaker: speakerToCastId(speaker), ja: [{ base: japanese } as RevealToken], en: meaning };
}

/** A VnScene assembled from the lesson's opening dialogue. */
export function sceneForLesson(lesson: FoundationLesson): VnScene {
    const lines: VnLine[] = lesson.opening.map(line => toLine(line.speaker, line.japanese, line.meaning));
    return {
        id: `lesson-scene-${lesson.routeNumber}`,
        title: lesson.scene,
        background: lesson.sceneImage,
        lines: lines.length ? lines : [toLine('Rie-sensei', 'はじめましょう。', "Let's begin.")],
    };
}
