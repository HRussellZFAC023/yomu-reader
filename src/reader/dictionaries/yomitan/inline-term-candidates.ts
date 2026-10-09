import { lookupSpansStartingInRange } from '../../languages/lookup-spans';
import type { LearningTargetModule } from '../../languages/types';
import {
    isSearchableTargetSurface,
    targetTermMatchLookupCandidates,
    type TermMatchCandidates,
} from './term-match';

const MAX_SURFACE_CODE_POINTS = 18;

/**
 * Produces the surfaces worth querying for one inline lookup. Only start
 * positions are confined to a window; a surface may cross the end and remains
 * discoverable exactly once.
 */
export class InlineTermCandidateCollector {
    collect(
        target: LearningTargetModule,
        source: string,
        from: number,
        to: number,
    ): TermMatchCandidates {
        const candidates: TermMatchCandidates = new Map();
        // Japanese writes no word boundaries, so every start position inside
        // the window is a candidate and the dictionary arbitrates.
        const run = { text: source, start: 0, end: source.length };
        for (const span of lookupSpansStartingInRange(source, run, from, to, MAX_SURFACE_CODE_POINTS)) {
            if (!isSearchableTargetSurface(span.term, target)) continue;
            this.add(target, span.term, span.start, candidates);
        }
        return candidates;
    }

    private add(
        target: LearningTargetModule,
        surface: string,
        start: number,
        candidates: TermMatchCandidates,
    ): void {
        for (const { key, deinflected } of targetTermMatchLookupCandidates(target, surface)) {
            const positions = candidates.get(key) ?? [];
            positions.push({ start, end: start + surface.length, surface, deinflected });
            candidates.set(key, positions);
        }
    }
}
