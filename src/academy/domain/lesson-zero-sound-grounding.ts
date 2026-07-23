import type {
    GroundedAnswerConcealmentEvidence,
    GroundedDefinitionRef,
} from './grounded-lesson';

export const LESSON_ZERO_SOUND_SURFACE_ID = 'surface:lesson-zero-sound-input';
export const LESSON_ZERO_SOUND_RENDERER_REVISION = 'lesson-zero-sound-screen.v1';
export const LESSON_ZERO_SOUND_RENDERER_SHA256 =
    '3fdf52cede21a60d19df8f6d2f6b9cdecbea40b62aae81f81f475b5b1f6e4aa7';

export function lessonZeroSoundRendererRef(): GroundedDefinitionRef {
    return {
        id: 'surface-renderer:lesson-zero-sound-input',
        registry: 'activity-plugin',
        revision: LESSON_ZERO_SOUND_RENDERER_REVISION,
        sha256: LESSON_ZERO_SOUND_RENDERER_SHA256,
    };
}

export function lessonZeroSoundAuditBinding(
    contentRevision: string,
): GroundedAnswerConcealmentEvidence['auditBinding'] {
    return {
        surfaceId: LESSON_ZERO_SOUND_SURFACE_ID,
        renderer: lessonZeroSoundRendererRef(),
        contentRevision,
    };
}

export function bindLessonZeroSoundPreCommitSurface(
    root: HTMLElement,
    contentRevision: string,
): void {
    const renderer = lessonZeroSoundRendererRef();
    root.dataset.groundedLessonId = 'lesson:foundation-00';
    root.dataset.groundedSubjectId = 'activity:lesson-zero-sound-input';
    root.dataset.groundedSurfaceId = LESSON_ZERO_SOUND_SURFACE_ID;
    root.dataset.groundedRendererId = renderer.id;
    root.dataset.groundedRendererRevision = renderer.revision;
    root.dataset.groundedRendererSha256 = renderer.sha256;
    root.dataset.groundedContentRevision = contentRevision;
    root.dataset.groundedCommitState = 'pre-commit';
}
