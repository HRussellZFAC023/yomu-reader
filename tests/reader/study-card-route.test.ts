import { describe, expect, it } from 'vitest';
import {
    buildStudyCardHistoryUrl,
    planStudyCardHistoryUpdate,
    readStudyCardRoute,
    studyCardRouteSignature,
} from '../../src/reader/newtab/study-card-route';

describe('standalone Study card route', () => {
    it('parses portable links and legacy Academy card handoffs', () => {
        expect(readStudyCardRoute('https://yomureader.com/study/#card=7%3A1%3A%E8%AA%AD%E3%82%80%3A%E3%82%88%E3%82%80&w=%E8%AA%AD%E3%82%80&r=%E3%82%88%E3%82%80')).toEqual({
            kind: 'portable',
            key: '7:1:読む:よむ',
            spelling: '読む',
            reading: 'よむ',
        });
        expect(readStudyCardRoute('https://yomureader.com/study/?return=academy&card=%E6%9B%B8%E3%81%8F%00%E3%81%8B%E3%81%8F&context=lesson-0')).toEqual({
            kind: 'portable',
            key: '書く\u0000かく',
            spelling: '書く',
            reading: 'かく',
        });
    });

    it('accepts only controller-minted concealed tokens', () => {
        const route = readStudyCardRoute('https://yomureader.com/study/#review=study-card-12');
        expect(route).toEqual({ kind: 'concealed', token: 'study-card-12' });
        expect(studyCardRouteSignature(route)).toBe('concealed:study-card-12');
        expect(readStudyCardRoute('https://yomureader.com/study/#review=%E8%AA%AD%E3%82%80')).toBeNull();
        expect(readStudyCardRoute('https://yomureader.com/study/#review=study-card-1%26card%3Dsecret')).toBeNull();
    });

    it('removes answer-bearing query state from an unrevealed history entry', () => {
        const result = buildStudyCardHistoryUrl(
            'https://yomureader.com/study/?return=academy&context=lesson-0&card=%E8%AA%AD%E3%82%80%00%E3%82%88%E3%82%80&w=%E8%AA%AD%E3%82%80&r=%E3%82%88%E3%82%80&q=%E8%AA%AD%E3%82%80&meaning=read&source=jpdb%3A42&answer=read&redirect=https%3A%2F%2Fevil.example#card=jpdb%3A42%3A%E8%AA%AD%E3%82%80&w=%E8%AA%AD%E3%82%80&r=%E3%82%88%E3%82%80',
            { kind: 'concealed', token: 'study-card-3' },
        );

        expect(result).toBe('/study/?return=academy&context=lesson-0#review=study-card-3');
        expect(decodeURIComponent(result ?? '')).not.toMatch(/読む|よむ|read|jpdb|source|answer/u);
    });

    it('creates a portable link only for a revealed card and rejects invalid output', () => {
        expect(buildStudyCardHistoryUrl(
            'https://yomureader.com/study/?return=https%3A%2F%2Fevil.example&context=lesson-0&mode=word',
            { kind: 'portable', key: '7:1:読む:よむ', spelling: '読む', reading: 'よむ' },
        )).toBe('/study/?context=lesson-0&mode=word#card=7%3A1%3A%E8%AA%AD%E3%82%80%3A%E3%82%88%E3%82%80&w=%E8%AA%AD%E3%82%80&r=%E3%82%88%E3%82%80');
        expect(buildStudyCardHistoryUrl(
            'https://yomureader.com/study/',
            { kind: 'concealed', token: '読む' },
        )).toBeNull();
    });

    it('plans replace for conceal/reveal and push only when the selected card changes', () => {
        const concealed = { kind: 'concealed', token: 'study-card-1' } as const;
        const first = planStudyCardHistoryUpdate({
            href: 'https://yomureader.com/study/',
            route: concealed,
            selectionKey: 'card-a',
            previousSelectionKey: '',
            previousRouteSignature: '',
            handlingPopstate: false,
        });
        expect(first?.action).toBe('replace');
        expect(planStudyCardHistoryUpdate({
            href: 'https://yomureader.com/study/#review=study-card-1',
            route: { kind: 'portable', key: 'card-a', spelling: '読む', reading: 'よむ' },
            selectionKey: 'card-a',
            previousSelectionKey: 'card-a',
            previousRouteSignature: first?.routeSignature ?? '',
            handlingPopstate: false,
        })?.action).toBe('replace');
        expect(planStudyCardHistoryUpdate({
            href: 'https://yomureader.com/study/#card=card-a',
            route: { kind: 'concealed', token: 'study-card-2' },
            selectionKey: 'card-b',
            previousSelectionKey: 'card-a',
            previousRouteSignature: 'portable:card-a:読む:よむ',
            handlingPopstate: false,
        })?.action).toBe('push');
    });
});
