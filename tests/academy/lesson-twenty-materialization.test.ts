import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonTwentyFrequencyLensBeat } from '../../src/academy/content/lesson-twenty-frequency-lens';
import { loadLessonActivityChapter, loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { getAuthoredWeekRegistration, loadAuthoredWeekPackage, type LoadedAuthoredWeekPackage } from '../../src/academy/content/lesson-content-registry';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { committedAuthoredWeekFetcher, validateCommittedAuthoredWeek } from './helpers/authored-week-package';

const registration = getAuthoredWeekRegistration('l1-l20');
const writing = { lookup: async () => null };
let loaded: LoadedAuthoredWeekPackage;
beforeAll(async () => { loaded = await validateCommittedAuthoredWeek(registration); });
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('Lesson 20 validated package materialization', () => {
    it('reuses a validated package without a second fetch', async () => {
        const fetcher = vi.fn(async () => { throw new Error('Unexpected fetch'); });
        vi.stubGlobal('fetch', fetcher);
        const chapter = await loadLessonActivityChapter('l1-l20', writing, loaded);
        expect(chapter?.beats[0]).toEqual(createLessonTwentyFrequencyLensBeat(loaded));
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('preserves standalone loading through the registered byte validator', async () => {
        const fetcher = vi.fn(committedAuthoredWeekFetcher(registration));
        vi.stubGlobal('fetch', fetcher);
        const chapter = await loadLessonActivityChapter('l1-l20', writing);
        expect(chapter?.beats[0]).toEqual(createLessonTwentyFrequencyLensBeat(loaded));
        expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/academy/content/lessons/021-l1-l20.json']);
    });

    it('rejects changed bytes despite an advertised matching hash', async () => {
        const bytes = readFileSync(path.resolve('public/academy/content/lessons', registration.filename));
        const fetcher = (async () => new Response(Buffer.concat([bytes, Buffer.from(' ')]), {
            headers: { 'x-content-sha256': registration.expectedSha256 },
        })) as typeof fetch;
        await expect(loadAuthoredWeekPackage('l1-l20', fetcher)).rejects.toThrow('does not match its registered bytes');
    });

    it('rejects another validated package and a mismatched source revision', async () => {
        const wrong = await validateCommittedAuthoredWeek(getAuthoredWeekRegistration('l1-l19'));
        expect(() => createLessonTwentyFrequencyLensBeat(wrong)).toThrow('requires its validated authored package');
        const wrongHash = { ...loaded, week: { ...loaded.week, provenance: { ...loaded.week.provenance, source: { ...loaded.week.provenance.source, sha256: '0'.repeat(64) } } } };
        expect(() => createLessonTwentyFrequencyLensBeat(wrongHash)).toThrow('requires its validated authored package');
    });

    it.each(['identity', 'module', 'worksheet', 'audio-45', 'audio-039', 'minna', 'genki'])('retains the exact %s provenance assertion', mutation => {
        const value = structuredClone(loaded.value) as {
            id: string; identity: { moduleId: number };
            sourceCoverage: { members: { title: string; payloadSha256: string }[] };
            provenance: { sourceMappings: { sourceId: string }[] };
        };
        if (mutation === 'identity') value.id = 'l1-l19';
        else if (mutation === 'module') value.identity.moduleId = 0;
        else if (mutation === 'minna' || mutation === 'genki') {
            value.provenance.sourceMappings = value.provenance.sourceMappings.filter(row => !row.sourceId.startsWith(mutation === 'minna' ? 'minna-i:' : 'japanese-genki-interactive:'));
        } else {
            const title = { worksheet: 'Chapter 11-3 time period how many times how long', 'audio-45': '45 A-45', 'audio-039': 'minna shokyu 1 039' }[mutation]!;
            value.sourceCoverage.members.find(member => member.title === title)!.payloadSha256 = '0'.repeat(64);
        }
        expect(() => createLessonTwentyFrequencyLensBeat({ ...loaded, value })).toThrow();
    });

    it('keeps optional extension failure separate from the validated core lesson', async () => {
        const wrong = { ...loaded, value: { id: 'wrong' } };
        await expect(loadLessonActivityChapter('l1-l20', writing, wrong)).rejects.toThrow();
        expect(await loadReachableLessonActivityChapter('l1-l20', writing, wrong)).toBeNull();
        const screen = createAuthoredWeekScreen({ language: 'en', week: loaded.week });
        document.body.append(screen.element);
        expect(screen.element.dataset.academyScreen).toBe('authored-week');
        expect(screen.element.querySelector('[data-chapter-id]')).toBeNull();
        screen.dispose();
    });

    it('fails a required standalone load but lets the optional wrapper decline an unavailable package', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
        await expect(loadLessonActivityChapter('l1-l20', writing)).rejects.toThrow('503');
        expect(await loadReachableLessonActivityChapter('l1-l20', writing)).toBeNull();
    });
});
