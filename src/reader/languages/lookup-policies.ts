import type { LearnerLanguageId } from '../locales';
import type { LookupRewrite } from './lookup-candidates';

const KOREAN_SEGMENT_SUFFIXES = [
    '에게서',
    '이라고',
    '으로',
    '에서',
    '에게',
    '한테',
    '까지',
    '부터',
    '처럼',
    '보다',
    '에는',
    '라고',
    '하고',
    '은',
    '는',
    '이',
    '가',
    '을',
    '를',
    '의',
    '에',
    '와',
    '과',
    '로',
    '도',
    '만',
] as const;

/**
 * Small interim transforms, kept as per-target data so they can be replaced by
 * complete licensed morphology modules without changing the lookup engine.
 */
const REWRITES: Partial<Record<LearnerLanguageId, readonly LookupRewrite[]>> = {
    es: [
        { suffix: 'ces', replacementSuffix: 'z', minStemLength: 2, reason: 'plural suffix' },
        { suffix: 'es', minStemLength: 3, reason: 'plural suffix' },
        { suffix: 's', minStemLength: 3, reason: 'plural suffix' },
        { suffix: 'aron', replacementSuffix: 'ar', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'ando', replacementSuffix: 'ar', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'ó', replacementSuffix: 'ar', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'ieron', replacementSuffix: 'er', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'ieron', replacementSuffix: 'ir', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'iendo', replacementSuffix: 'er', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'iendo', replacementSuffix: 'ir', minStemLength: 2, reason: 'verb suffix' },
    ],
    de: [
        { prefix: 'ge', suffix: 't', replacementSuffix: 'en', minStemLength: 3, reason: 'participle affixes' },
        { suffix: 'ten', replacementSuffix: 'en', minStemLength: 3, reason: 'verb suffix' },
        { suffix: 'te', replacementSuffix: 'en', minStemLength: 3, reason: 'verb suffix' },
        { suffix: 'ern', minStemLength: 3, reason: 'inflection suffix' },
        { suffix: 'en', minStemLength: 3, reason: 'inflection suffix' },
        { suffix: 'er', minStemLength: 3, reason: 'inflection suffix' },
        { suffix: 'es', minStemLength: 3, reason: 'inflection suffix' },
        { suffix: 'e', minStemLength: 3, reason: 'inflection suffix' },
        { suffix: 'n', minStemLength: 3, reason: 'inflection suffix' },
        { suffix: 's', minStemLength: 3, reason: 'inflection suffix' },
    ],
    ru: [
        { suffix: 'ами', replacementSuffix: 'а', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ями', replacementSuffix: 'я', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ого', replacementSuffix: 'ый', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ого', replacementSuffix: 'ий', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ую', replacementSuffix: 'ый', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ая', replacementSuffix: 'ый', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ом', replacementSuffix: 'о', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'у', replacementSuffix: 'а', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ы', replacementSuffix: 'а', minStemLength: 2, reason: 'case suffix' },
        { suffix: 'ила', replacementSuffix: 'ить', minStemLength: 2, reason: 'verb suffix' },
        { suffix: 'ала', replacementSuffix: 'ать', minStemLength: 2, reason: 'verb suffix' },
    ],
    ar: [
        { prefix: 'وال', minStemLength: 2, reason: 'conjunction and article prefixes' },
        { prefix: 'بال', minStemLength: 2, reason: 'preposition and article prefixes' },
        { prefix: 'لل', minStemLength: 2, reason: 'preposition and article prefixes' },
        { prefix: 'و', minStemLength: 3, reason: 'conjunction prefix' },
        { prefix: 'ب', minStemLength: 3, reason: 'preposition prefix' },
        { prefix: 'ل', minStemLength: 3, reason: 'preposition prefix' },
        { prefix: 'ال', minStemLength: 3, reason: 'article prefix' },
        { suffix: 'تها', replacementSuffix: 'ة', minStemLength: 2, reason: 'pronoun suffix' },
        { suffix: 'ها', blockedStemSuffix: 'ت', minStemLength: 3, reason: 'pronoun suffix' },
        { suffix: 'هم', minStemLength: 3, reason: 'pronoun suffix' },
        { suffix: 'ون', minStemLength: 3, reason: 'plural suffix' },
        { suffix: 'ين', minStemLength: 3, reason: 'plural suffix' },
    ],
};

export function lookupRewritesForTarget(target: LearnerLanguageId): readonly LookupRewrite[] {
    return REWRITES[target] ?? [];
}

/**
 * Korean lemmas begin at the written eojeol boundary, so only prefixes proven
 * by this small particle table are defensible. The Korean target exposes this
 * bounded strategy through its module contract; shared lookup code does not
 * branch on the language tag.
 */
export function koreanLookupSubsegments(
    segment: string,
    maxLength: number,
): readonly string[] {
    const candidates = new Set<string>();
    if (segment.length <= maxLength) candidates.add(segment);
    for (const suffix of KOREAN_SEGMENT_SUFFIXES) {
        if (!segment.endsWith(suffix)) continue;
        const stem = segment.slice(0, -suffix.length);
        if (stem && stem.length <= maxLength) candidates.add(stem);
    }
    return [...candidates];
}
