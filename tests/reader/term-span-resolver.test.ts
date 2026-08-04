import { describe, expect, it } from 'vitest';

import { JAPANESE_LEARNING_TARGET } from '../../src/reader/languages/japanese';
import type { LanguageLookupCandidate } from '../../src/reader/languages/types';
import {
    TermSpanResolver,
    type TermSpanCandidateLookup,
    type TermSpanLookupCandidate,
    type TermSpanLookupTarget,
} from '../../src/reader/lookup/term-span-resolver';

interface DictionaryMatch {
    readonly headword: string;
    readonly start?: number;
    readonly end?: number;
}

const SURFACE_TARGET: TermSpanLookupTarget = {
    lookupCandidates(surface) {
        return [candidate(surface)];
    },
    compareLookupCandidates(a, b) {
        return a.depth - b.depth || a.term.localeCompare(b.term);
    },
};

function candidate(
    term: string,
    depth = 0,
    reasons: readonly string[] = [],
): LanguageLookupCandidate {
    return { term, rules: [], reasons, depth };
}

function confirmingLookup(
    confirm: (request: TermSpanLookupCandidate) => DictionaryMatch | null,
): TermSpanCandidateLookup<DictionaryMatch> {
    return {
        async lookup(requests) {
            const matches = new Map<TermSpanLookupCandidate, DictionaryMatch>();
            for (const request of requests) {
                const match = confirm(request);
                if (match) matches.set(request, match);
            }
            return matches;
        },
    };
}

describe('TermSpanResolver', () => {
    it('enumerates forward source prefixes longest-first', async () => {
        const observedSurfaces: string[] = [];
        const resolver = new TermSpanResolver({
            target: SURFACE_TARGET,
            lookup: confirmingLookup(request => {
                observedSurfaces.push(request.surface);
                return ['優しい言葉', '優しい'].includes(request.surface)
                    ? { headword: request.surface }
                    : null;
            }),
        });

        const resolved = await resolver.resolveAt({ text: '優しい言葉', start: 0 });

        expect(observedSurfaces).toEqual(['優しい言葉', '優しい言', '優しい', '優し', '優']);
        expect(resolved).toMatchObject({
            kind: 'confirmed',
            start: 0,
            end: 5,
            surface: '優しい言葉',
            lookupCandidate: { term: '優しい言葉' },
            match: { headword: '優しい言葉' },
        });
    });

    it('keeps the original inflected surface span when a lemma is confirmed', async () => {
        const resolver = new TermSpanResolver({
            target: JAPANESE_LEARNING_TARGET,
            lookup: confirmingLookup(request => request.surface === '食べました'
                && request.lookupCandidate.term === '食べる'
                ? { headword: '食べる' }
                : null),
        });

        const resolved = await resolver.resolveAt({ text: '食べました', start: 0 });

        expect(resolved).toMatchObject({
            start: 0,
            end: 5,
            surface: '食べました',
            lookupCandidate: { term: '食べる' },
            match: { headword: '食べる' },
        });
    });

    it('uses the same candidate enumeration and ranking for resolveAt and resolveAll', async () => {
        const lookup = confirmingLookup(request => ['書いた', '書く'].includes(request.lookupCandidate.term)
            ? { headword: request.lookupCandidate.term }
            : null);
        const target: TermSpanLookupTarget = {
            lookupCandidates(surface) {
                return surface === '書いた'
                    ? [candidate('書いた'), candidate('書く', 1, ['past'])]
                    : [candidate(surface)];
            },
            compareLookupCandidates: SURFACE_TARGET.compareLookupCandidates,
        };
        const resolver = new TermSpanResolver({ target, lookup });

        const at = await resolver.resolveAt({ text: '書いたニュース', start: 0, end: 3 });
        const all = await resolver.resolveAll({ text: '書いたニュース', start: 0, end: 3 });

        expect(all).toHaveLength(1);
        expect(all[0]).toEqual(at);
    });

    it('keeps repeated surfaces occurrence-distinct', async () => {
        const resolver = new TermSpanResolver({
            target: SURFACE_TARGET,
            lookup: confirmingLookup(request => request.surface === '猫'
                ? { headword: '猫' }
                : null),
        });

        const resolved = await resolver.resolveAll({ text: '猫と猫', start: 0 });

        expect(resolved).toEqual([
            {
                kind: 'confirmed',
                start: 0,
                end: 1,
                surface: '猫',
                lookupCandidate: candidate('猫'),
                match: { headword: '猫' },
            },
            {
                kind: 'confirmed',
                start: 2,
                end: 3,
                surface: '猫',
                lookupCandidate: candidate('猫'),
                match: { headword: '猫' },
            },
        ]);
    });

    it('ignores advisory offsets carried by a provider match', async () => {
        const resolver = new TermSpanResolver({
            target: SURFACE_TARGET,
            lookup: confirmingLookup(request => request.surface === '台風'
                ? { headword: '台風', start: 40, end: 99 }
                : null),
        });

        const resolved = await resolver.resolveAt({ text: '台風', start: 0 });

        expect(resolved).toMatchObject({
            start: 0,
            end: 2,
            surface: '台風',
            match: { headword: '台風', start: 40, end: 99 },
        });
    });

    it('is deterministic when asynchronous confirmations arrive in different orders', async () => {
        const preferred = candidate('優先', 1);
        const secondary = candidate('次点', 1);
        const target: TermSpanLookupTarget = {
            lookupCandidates(surface) {
                return surface === '候補' ? [secondary, preferred] : [candidate(surface)];
            },
            compareLookupCandidates(a, b) {
                if (a.term === preferred.term) return -1;
                if (b.term === preferred.term) return 1;
                return 0;
            },
        };
        const lookupInOrder = (reverse: boolean): TermSpanCandidateLookup<DictionaryMatch> => ({
            async lookup(requests) {
                await Promise.resolve();
                const matches = new Map<TermSpanLookupCandidate, DictionaryMatch>();
                const confirmed = requests.filter(request => request.surface === '候補');
                for (const request of reverse ? confirmed.reverse() : confirmed) {
                    matches.set(request, { headword: request.lookupCandidate.term });
                }
                return matches;
            },
        });

        const forward = await new TermSpanResolver({ target, lookup: lookupInOrder(false) })
            .resolveAt({ text: '候補', start: 0 });
        const reversed = await new TermSpanResolver({ target, lookup: lookupInOrder(true) })
            .resolveAt({ text: '候補', start: 0 });

        expect(forward?.lookupCandidate).toEqual(preferred);
        expect(reversed).toEqual(forward);
    });

    it('enumerates only complete Unicode code points', async () => {
        const observedSurfaces: string[] = [];
        const resolver = new TermSpanResolver({
            target: SURFACE_TARGET,
            lookup: confirmingLookup(request => {
                observedSurfaces.push(request.surface);
                return null;
            }),
        });

        await resolver.resolveAt({ text: '𠮷野', start: 0 });

        expect(observedSurfaces).toEqual(['𠮷野', '𠮷']);
        await expect(resolver.resolveAt({ text: '𠮷野', start: 1 }))
            .rejects.toThrow('valid UTF-16 code-point boundaries');
    });

    it('bounds fallback to gaps so it cannot overlap a confirmed span', async () => {
        const fallbackRequests: Array<{ start: number; end: number }> = [];
        const resolver = new TermSpanResolver<DictionaryMatch, string>({
            target: SURFACE_TARGET,
            lookup: confirmingLookup(request => request.surface === '言葉'
                ? { headword: '言葉' }
                : null),
            fallback: {
                spanAt(request) {
                    fallbackRequests.push({ start: request.start, end: request.end });
                    if (request.start !== 0) return null;
                    return { start: 0, end: request.end, value: 'segmented fallback' };
                },
            },
        });

        const resolved = await resolver.resolveAll({ text: '優しい言葉', start: 0 });

        expect(fallbackRequests[0]).toEqual({ start: 0, end: 3 });
        expect(resolved).toEqual([
            {
                kind: 'fallback',
                start: 0,
                end: 3,
                surface: '優しい',
                fallback: 'segmented fallback',
            },
            {
                kind: 'confirmed',
                start: 3,
                end: 5,
                surface: '言葉',
                lookupCandidate: candidate('言葉'),
                match: { headword: '言葉' },
            },
        ]);
    });

    it('discards a fallback response that reaches across a confirmed span', async () => {
        const resolver = new TermSpanResolver<DictionaryMatch, string>({
            target: SURFACE_TARGET,
            lookup: confirmingLookup(request => request.surface === '言葉'
                ? { headword: '言葉' }
                : null),
            fallback: {
                spanAt(request) {
                    return request.start === 0
                        ? { start: 0, end: 5, value: 'overlapping fallback' }
                        : null;
                },
            },
        });

        const resolved = await resolver.resolveAll({ text: '優しい言葉', start: 0 });

        expect(resolved).toEqual([
            {
                kind: 'confirmed',
                start: 3,
                end: 5,
                surface: '言葉',
                lookupCandidate: candidate('言葉'),
                match: { headword: '言葉' },
            },
        ]);
    });
});
