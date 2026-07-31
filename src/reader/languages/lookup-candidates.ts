import type { LanguageLookupCandidate, LanguageTag } from './types';
import { genericLookupTextVariants } from './lookup-normalization';

export interface LookupRewrite {
    prefix?: string;
    suffix?: string;
    replacementPrefix?: string;
    replacementSuffix?: string;
    blockedStemSuffix?: string;
    minStemLength: number;
    reason: string;
}

const LOOKUP_CANDIDATE_LIMIT = 12;

/**
 * Cheap, language-neutral candidate expansion. Language facts stay in data;
 * this engine only applies their bounded prefix/suffix rewrites.
 */
export function boundedLookupCandidates(
    text: string,
    language: LanguageTag,
    normalizeText: (text: string) => string,
    rewrites: readonly LookupRewrite[],
): readonly LanguageLookupCandidate[] {
    const surface = normalizeText(text);
    if (!surface) return [];

    const candidates: LanguageLookupCandidate[] = [];
    const seen = new Set<string>();
    const add = (term: string, depth: number, reasons: readonly string[]) => {
        if (!term || seen.has(term) || candidates.length >= LOOKUP_CANDIDATE_LIMIT) return;
        seen.add(term);
        candidates.push({ term, rules: [], reasons, depth });
    };

    add(surface, 0, []);
    const folded = localeLowerCase(surface, language);
    const foldedDepth = folded === surface ? 0 : 1;
    add(folded, 1, ['case fold']);
    for (const legacySurface of genericLookupTextVariants(text).slice(1)) {
        add(legacySurface, 1, ['source-form fallback']);
        const legacyFolded = localeLowerCase(legacySurface, language);
        add(legacyFolded, 2, ['source-form fallback', 'case fold']);
    }

    for (const rewrite of rewrites) {
        if (candidates.length >= LOOKUP_CANDIDATE_LIMIT) break;
        const rewritten = applyLookupRewrite(folded, rewrite);
        if (rewritten) {
            add(
                rewritten,
                foldedDepth + 1,
                foldedDepth ? ['case fold', rewrite.reason] : [rewrite.reason],
            );
        }
    }
    return candidates;
}

function localeLowerCase(text: string, language: LanguageTag): string {
    try {
        return text.toLocaleLowerCase(language);
    } catch {
        return text.toLowerCase();
    }
}

function applyLookupRewrite(term: string, rewrite: LookupRewrite): string | null {
    const prefix = rewrite.prefix ?? '';
    const suffix = rewrite.suffix ?? '';
    if (prefix && !term.startsWith(prefix)) return null;
    if (suffix && !term.endsWith(suffix)) return null;
    if (term.length < prefix.length + suffix.length) return null;

    const stem = term.slice(prefix.length, suffix ? -suffix.length : undefined);
    if (rewrite.blockedStemSuffix && stem.endsWith(rewrite.blockedStemSuffix)) return null;
    if ([...stem].length < rewrite.minStemLength) return null;
    return `${rewrite.replacementPrefix ?? ''}${stem}${rewrite.replacementSuffix ?? ''}`;
}
