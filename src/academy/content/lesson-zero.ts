import { createSourceLibrary, type SourceLibrary } from '../domain/source-library';
import type { GroundedLessonContract } from '../domain/grounded-lesson';
import { LESSON_ZERO_CONTENT_URL, type LessonZeroDefinition } from './lesson-zero-schema';
import { validateLessonZeroGrounding } from './lesson-zero-grounding';
import { validateLessonZeroPackage } from './lesson-zero-validator';
import { LESSON_ZERO_CONTENT_SHA256 } from './lesson-zero-pedagogy-definitions';
import { sha256Hex } from '../web-crypto';

export {
    LESSON_ZERO_CANONICAL_CHARACTER_IDS,
    LESSON_ZERO_CONTENT_URL,
    LESSON_ZERO_RESPONSE_MODES,
} from './lesson-zero-schema';
export type {
    AssessedSupportContract,
    LessonZeroActivity,
    LessonZeroAudioAsset,
    LessonZeroCharacterId,
    LessonZeroDefinition,
    LessonZeroInputScript,
    LessonZeroMission,
    LessonZeroPackageData,
    LessonZeroReleaseBlocker,
    LessonZeroResponseMode,
    LessonZeroSection,
} from './lesson-zero-schema';
export { validateLessonZeroPackage } from './lesson-zero-validator';

export interface LessonZeroContent {
    readonly sourceLibrary: SourceLibrary;
    readonly lesson: LessonZeroDefinition;
    readonly grounding: GroundedLessonContract;
}

let defaultLoad: Promise<LessonZeroContent> | null = null;

/** Load and validate the complete authored Lesson 0 shard. */
export function loadLessonZeroContent(fetcher: typeof fetch = fetch): Promise<LessonZeroContent> {
    if (fetcher !== fetch) return load(fetcher);
    defaultLoad ??= load(fetcher).catch(error => {
        defaultLoad = null;
        throw error;
    });
    return defaultLoad;
}

async function load(fetcher: typeof fetch): Promise<LessonZeroContent> {
    const response = await fetcher(LESSON_ZERO_CONTENT_URL);
    if (!response.ok) {
        throw new Error(`Could not load complete Lesson 0: ${LESSON_ZERO_CONTENT_URL} (${response.status})`);
    }
    const bytes = await response.arrayBuffer();
    if (await sha256Hex(bytes) !== LESSON_ZERO_CONTENT_SHA256) {
        throw new TypeError('Lesson 0 does not match its registered bytes.');
    }
    const data = validateLessonZeroPackage(JSON.parse(new TextDecoder().decode(bytes)));
    return {
        sourceLibrary: createSourceLibrary(data.sourceLibrary),
        lesson: structuredClone(data.lesson),
        grounding: validateLessonZeroGrounding(data),
    };
}
