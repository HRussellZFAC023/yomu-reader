import { lookupSpansStartingInRange } from '../../languages/lookup-spans';
import type { LanguageTextSegment, LearningTargetModule } from '../../languages/types';
import {
    isSearchableTargetSurface,
    targetTermMatchLookupCandidates,
    type TermMatchCandidates,
} from './term-match';

const MAX_SURFACE_CODE_POINTS = 18;

/**
 * Produces the target-owned surfaces worth querying for one inline lookup.
 *
 * A collector belongs to one dictionary store so segmentation is reused across
 * its fixed-size lookup windows. Only start positions are confined to a window;
 * a surface may cross the end and remains discoverable exactly once.
 */
export class InlineTermCandidateCollector {
    private segmentedText = '';
    private segmentedTarget?: LearningTargetModule;
    private segments: readonly LanguageTextSegment[] = [];
    private runText = '';
    private runTarget?: LearningTargetModule;
    private runs: readonly LanguageTextSegment[] = [];

    collect(
        target: LearningTargetModule,
        source: string,
        from: number,
        to: number,
    ): TermMatchCandidates {
        const candidates: TermMatchCandidates = new Map();
        if (target.lookupStartsAtSegmentBoundary) {
            for (const segment of this.segmentedSource(source, target)) {
                if (segment.start < from || segment.start >= to) continue;
                this.add(target, segment.text, segment.start, candidates);
            }
            return candidates;
        }
        if (target.lookupSubsegments) {
            for (const segment of this.segmentedSource(source, target)) {
                if (segment.start < from || segment.start >= to) continue;
                for (const surface of target.lookupSubsegments(segment.text, MAX_SURFACE_CODE_POINTS)) {
                    if (!isSearchableTargetSurface(surface, target)) continue;
                    this.add(target, surface, segment.start, candidates);
                }
            }
            return candidates;
        }
        for (const segment of this.lookupRuns(source, target)) {
            if (segment.end <= from || segment.start >= to) continue;
            for (const span of lookupSpansStartingInRange(
                source,
                segment,
                from,
                to,
                MAX_SURFACE_CODE_POINTS,
            )) {
                if (!isSearchableTargetSurface(span.term, target)) continue;
                this.add(target, span.term, span.start, candidates);
            }
        }
        return candidates;
    }

    private segmentedSource(source: string, target: LearningTargetModule): readonly LanguageTextSegment[] {
        if (this.segmentedText !== source || this.segmentedTarget !== target) {
            this.segments = target.segment(source);
            this.segmentedText = source;
            this.segmentedTarget = target;
        }
        return this.segments;
    }

    private lookupRuns(source: string, target: LearningTargetModule): readonly LanguageTextSegment[] {
        if (this.runText !== source || this.runTarget !== target) {
            this.runs = target.lookupRunSegments?.(source) ?? [{
                text: source,
                start: 0,
                end: source.length,
            }];
            this.runText = source;
            this.runTarget = target;
        }
        return this.runs;
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
