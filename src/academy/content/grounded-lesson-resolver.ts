import { validateGroundedLesson, type GroundedLessonContract } from '../domain/grounded-lesson';
import { sha256Hex as sha256 } from '../web-crypto';
import { getCompleteLessonRegistration } from './lesson-content-registry';

const LESSON_CONTENT_ROOT = '/academy/content/lessons/';

export interface GroundedLessonResolver {
    resolve(lessonId: string): Promise<GroundedLessonContract>;
}

/**
 * Resolve learner-write authority from the complete lesson registry and the
 * shipped bytes. Callers can name a lesson; they cannot supply its verdict.
 */
export function createGroundedLessonResolver(fetcher: typeof fetch = fetch): GroundedLessonResolver {
    const pending = new Map<string, Promise<GroundedLessonContract>>();
    return {
        resolve(lessonId) {
            const existing = pending.get(lessonId);
            if (existing) return existing;
            const load = resolveRegisteredLesson(lessonId, fetcher).catch(error => {
                pending.delete(lessonId);
                throw error;
            });
            pending.set(lessonId, load);
            return load;
        },
    };
}

async function resolveRegisteredLesson(
    lessonId: string,
    fetcher: typeof fetch,
): Promise<GroundedLessonContract> {
    const registration = getCompleteLessonRegistration(lessonId);
    const response = await fetcher(`${LESSON_CONTENT_ROOT}${registration.filename}`);
    if (!response.ok) throw new Error(`Could not resolve grounded lesson ${lessonId} (${response.status}).`);
    const bytes = await response.arrayBuffer();
    const digest = await sha256(bytes);
    if (digest !== registration.expectedSha256) {
        throw new TypeError(`Grounded lesson ${lessonId} does not match its registered bytes.`);
    }
    const lesson = validateGroundedLesson(registration.audit(JSON.parse(new TextDecoder().decode(bytes))));
    if (lesson.lessonId !== lessonId || registration.lessonId !== lessonId) {
        throw new TypeError(`Grounded lesson resolver returned another lesson for ${lessonId}.`);
    }
    if (lesson.contentRevision !== registration.expectedContentRevision) {
        throw new TypeError(`Grounded lesson ${lessonId} does not match its registered revision.`);
    }
    return lesson;
}
