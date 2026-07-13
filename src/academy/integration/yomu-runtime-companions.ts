import type { ReaderRuntimeService } from '../../reader/app/runtime-health';

export interface AcademyReaderCompanion {
    readonly fileName: `greasyfork/${string}.user.js`;
    readonly services: readonly ReaderRuntimeService[];
}

// The hosted core is intentionally split for Greasy Fork readability. Academy
// therefore has to install the same companion services before evaluating the
// core; loading only settings produces a visually present but hollow Reader.
export const ACADEMY_READER_COMPANIONS = [
    {
        fileName: 'greasyfork/yomu-ui-copy.user.js',
        services: ['localization'],
    },
    {
        fileName: 'greasyfork/yomu-settings-surface.user.js',
        services: ['local-dictionary'],
    },
    {
        fileName: 'greasyfork/yomu-kanji-study.user.js',
        services: ['translation', 'grammar', 'mining'],
    },
    {
        fileName: 'greasyfork/yomu-anki.user.js',
        services: ['anki'],
    },
] as const satisfies readonly AcademyReaderCompanion[];

export function academyReaderCompanionFiles(): string[] {
    return ACADEMY_READER_COMPANIONS.map(companion => companion.fileName);
}

export function academyReaderCompanionServices(): ReaderRuntimeService[] {
    return [...new Set(ACADEMY_READER_COMPANIONS.flatMap(companion => companion.services))];
}
