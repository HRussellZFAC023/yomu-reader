// fallow-ignore-file code-duplication
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { createWanikaniSrsAdapter, wanikaniReviewInput } from '../../src/reader/srs/wanikani';
import { WanikaniClient, WanikaniApiError, fingerprintWanikaniToken } from '../../src/reader/wanikani/wanikani';
import { WanikaniLookupClient } from '../../src/reader/wanikani/wanikani-lookup';
import { renderWanikaniMarkup } from '../../src/reader/wanikani/wanikani-render';
import { renderWanikaniDefinitionMount, renderWanikaniSource } from '../../src/reader/wanikani/wanikani-source';
import type { JPDBCard } from '../../src/reader/app/types';
import type { ReaderHttpOptions } from '../../src/reader/network/http-options';
import type { YomuSrsReviewable } from '../../src/reader/srs/types';

const TOKEN = 'wk_live_secret_for_tests';
const USER = {
    object: 'user',
    data: {
        level: 8,
        subscription: { active: true, type: 'recurring', max_level_granted: 8, period_ends_at: null },
    },
};
const SUBJECT = {
    id: 440,
    object: 'vocabulary',
    data: {
        level: 5,
        slug: '日本',
        characters: '日本',
        document_url: 'https://www.wanikani.com/vocabulary/%E6%97%A5%E6%9C%AC',
        meanings: [{ meaning: 'Japan', primary: true, accepted_answer: true }],
        auxiliary_meanings: [
            { meaning: 'Nippon', type: 'whitelist' },
            { meaning: 'Japanese', type: 'blacklist' },
        ],
        readings: [
            { reading: 'にほん', primary: true, accepted_answer: true },
            { reading: 'にっぽん', primary: false, accepted_answer: false },
        ],
        meaning_mnemonic: '<kanji>Sun</kanji> origin & <script>alert(1)</script>',
        reading_mnemonic: '<reading>にほん</reading>',
        component_subject_ids: [1],
        amalgamation_subject_ids: [],
        visually_similar_subject_ids: [],
        context_sentences: [{ ja: '日本へ行く。', en: 'Go to Japan.' }],
        pronunciation_audios: [{
            url: 'https://files.wanikani.com/audio.mp3',
            content_type: 'audio/mpeg',
            metadata: { gender: 'female', source_id: 77, pronunciation: 'にほん', voice_actor_name: 'Kyoko', voice_description: 'Tokyo accent' },
        }, {
            url: 'https://files.wanikani.com/audio.ogg',
            content_type: 'audio/ogg',
            metadata: { gender: 'female', source_id: 77, pronunciation: 'にほん', voice_actor_name: 'Kyoko', voice_description: 'Tokyo accent' },
        }],
        hidden_at: null,
    },
};
const COMPONENT = {
    id: 1,
    object: 'radical',
    data: {
        level: 1,
        slug: 'sun',
        characters: '日',
        document_url: 'https://www.wanikani.com/radicals/sun',
        meanings: [{ meaning: 'Sun', primary: true, accepted_answer: true }],
        component_subject_ids: [],
        amalgamation_subject_ids: [],
        visually_similar_subject_ids: [],
        hidden_at: null,
    },
};
const ASSIGNMENT = {
    id: 99,
    object: 'assignment',
    data: {
        subject_id: 440,
        subject_type: 'vocabulary',
        srs_stage: 4,
        available_at: '2026-07-21T10:00:00.000Z',
        started_at: '2026-07-20T10:00:00.000Z',
        burned_at: null,
        unlocked_at: '2026-07-20T09:00:00.000Z',
    },
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('WaniKani API boundary', () => {
    it('verifies /user first, sends the required headers, and disables every proxy path', async () => {
        const calls: Array<{ url: string; options: Record<string, unknown> }> = [];
        const client = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async (url, options) => {
                calls.push({ url, options: options as unknown as Record<string, unknown> });
                if (url.endsWith('/user')) return USER;
                return { total_count: 1, pages: { next_url: null }, data: [SUBJECT] };
            },
        });

        await client.getSubjects({ slugs: ['日本'] });

        expect(calls.map(call => new URL(call.url).pathname)).toEqual(['/v2/user', '/v2/subjects']);
        const headers = calls[0]?.options.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(headers['Wanikani-Revision']).toBe('20170710');
        expect(calls[0]?.options).toMatchObject({
            allowDirectCrossOrigin: true,
            allowPublicProxies: false,
            allowConfiguredProxy: false,
            proxyUrl: '',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
        });
        expect(calls.every(call => !call.url.includes(TOKEN))).toBe(true);
    });

    it('floors unknown subscription types to level 3 and drops over-level subjects', async () => {
        const client = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async url => url.endsWith('/user')
                ? { data: { level: 60, subscription: { active: true, type: 'future-plan', max_level_granted: 60 } } }
                : { total_count: 2, pages: { next_url: null }, data: [
                    { ...SUBJECT, data: { ...SUBJECT.data, level: 3 } },
                    { ...SUBJECT, id: 441, data: { ...SUBJECT.data, level: 4, slug: '日本人', characters: '日本人' } },
                ] },
        });

        const subjects = await client.getSubjects();
        expect(subjects).toHaveLength(1);
    });

    it('follows official pages.next_url and rejects pagination outside api.wanikani.com/v2', async () => {
        let page = 0;
        const client = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async url => {
                if (url.endsWith('/user')) return USER;
                page += 1;
                return page === 1
                    ? { data: [SUBJECT], pages: { next_url: 'https://api.wanikani.com/v2/subjects?page=2' } }
                    : { data: [COMPONENT], pages: { next_url: null } };
            },
        });
        expect(await client.getSubjects()).toHaveLength(2);

        const unsafe = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async url => url.endsWith('/user') ? USER : { data: [], pages: { next_url: 'https://evil.example/steal' } },
        });
        await expect(unsafe.getSubjects()).rejects.toBeInstanceOf(WanikaniApiError);
    });

    it('partitions caches without exposing the token', () => {
        const fingerprint = fingerprintWanikaniToken(TOKEN);
        expect(fingerprint).not.toContain(TOKEN);
        expect(fingerprint).toMatch(/^[0-9a-f]{16}:\d+$/);
        expect(fingerprintWanikaniToken(`${TOKEN}2`)).not.toBe(fingerprint);
    });

    it('keeps every page on the account that started the collection and isolates the current cache', async () => {
        const accountAToken = 'wk_account_a_for_tests';
        const accountBToken = 'wk_account_b_for_tests';
        let token = accountAToken;
        const accountAFirstPage = deferred<unknown>();
        const assignmentCalls: Array<{ authorization: string; page: string }> = [];
        const accountRaceFixture = { accountAToken, accountAFirstPage, assignmentCalls };
        const client = new WanikaniClient({
            getToken: () => token,
            minRequestIntervalMs: 0,
            requestImpl: (url, options) => accountRaceResponse(url, options, accountRaceFixture),
        });

        const accountA = client.getAssignments();
        await vi.waitFor(() => expect(assignmentCalls).toHaveLength(1));

        token = accountBToken;
        await expect(client.getAssignments()).resolves.toEqual([{ id: 'b-1' }]);

        accountAFirstPage.resolve({
            data: [{ id: 'a-1' }],
            pages: { next_url: 'https://api.wanikani.com/v2/assignments?page=2' },
        });
        await expect(accountA).resolves.toEqual([{ id: 'a-1' }, { id: 'a-2' }]);

        expect(assignmentCalls).toEqual([
            { authorization: `Bearer ${accountAToken}`, page: '1' },
            { authorization: `Bearer ${accountBToken}`, page: '1' },
            { authorization: `Bearer ${accountAToken}`, page: '2' },
        ]);
        await expect(client.getAssignments()).resolves.toEqual([{ id: 'b-1' }]);
        expect(assignmentCalls).toHaveLength(3);
        const cacheKeys = [...(client as unknown as { responseCache: Map<string, unknown> }).responseCache.keys()];
        expect(cacheKeys.join('\n')).not.toContain(accountAToken);
        expect(cacheKeys.join('\n')).not.toContain(accountBToken);
    });

    it('does not let a stale user response replace the current account and clear invalidates it', async () => {
        const accountAToken = 'wk_user_a_for_tests';
        const accountBToken = 'wk_user_b_for_tests';
        let token = accountAToken;
        const accountAUser = deferred<unknown>();
        const userCalls: string[] = [];
        const client = new WanikaniClient({
            getToken: () => token,
            minRequestIntervalMs: 0,
            requestImpl: async (_url, options) => {
                const authorization = String((options?.headers as Record<string, string>).Authorization);
                userCalls.push(authorization);
                return authorization === `Bearer ${accountAToken}`
                    ? accountAUser.promise
                    : userForAccount(authorization);
            },
        });

        const staleAccountA = client.getUser();
        await vi.waitFor(() => expect(userCalls).toEqual([`Bearer ${accountAToken}`]));

        token = accountBToken;
        await expect(client.getUser()).resolves.toMatchObject({ id: accountBToken });
        accountAUser.resolve(userForAccount(`Bearer ${accountAToken}`));
        await expect(staleAccountA).resolves.toMatchObject({ id: accountAToken });

        await expect(client.getUser()).resolves.toMatchObject({ id: accountBToken });
        expect(userCalls).toEqual([`Bearer ${accountAToken}`, `Bearer ${accountBToken}`]);

        client.clear();
        await expect(client.getUser()).resolves.toMatchObject({ id: accountBToken });
        expect(userCalls).toEqual([
            `Bearer ${accountAToken}`,
            `Bearer ${accountBToken}`,
            `Bearer ${accountBToken}`,
        ]);
    });

    it('reports expired and under-scoped credentials without echoing the token', async () => {
        for (const [status, message] of [[401, /expired or was denied/i], [403, /lacks permission/i]] as const) {
            const client = new WanikaniClient({
                getToken: () => TOKEN,
                minRequestIntervalMs: 0,
                requestImpl: async () => {
                    throw Object.assign(new Error(`HTTP ${status}`), { status });
                },
            });
            await expect(client.getUser()).rejects.toThrow(message);
            await expect(client.getUser()).rejects.not.toThrow(TOKEN);
        }
    });

    it('invalidates assignment state after a review without discarding subject caches', async () => {
        let assignmentCalls = 0;
        let subjectCalls = 0;
        const client = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async (url) => {
                const path = new URL(url).pathname;
                if (path.endsWith('/user')) return USER;
                if (path.endsWith('/assignments')) {
                    assignmentCalls += 1;
                    return { data: [ASSIGNMENT], pages: { next_url: null } };
                }
                if (path.endsWith('/subjects')) {
                    subjectCalls += 1;
                    return { data: [SUBJECT], pages: { next_url: null } };
                }
                if (path.endsWith('/reviews')) return { data: {} };
                throw new Error(`Unexpected cache request: ${url}`);
            },
        });

        await client.getAssignments({ subjectIds: [440] });
        await client.getAssignments({ subjectIds: [440] });
        await client.getSubjects({ ids: [440] });
        await client.createReview({ assignment_id: 99, incorrect_meaning_answers: 0, incorrect_reading_answers: 0 });
        await client.getAssignments({ subjectIds: [440] });
        await client.getSubjects({ ids: [440] });

        expect(assignmentCalls).toBe(2);
        expect(subjectCalls).toBe(1);
    });
});

describe('WaniKani lookup and rendering', () => {
    it('hydrates account status, personal material, related subjects, and safe rich content', async () => {
        const client = routedClient();
        const lookup = await new WanikaniLookupClient(client).lookupCard(card());
        expect(lookup?.subject.characters).toBe('日本');
        expect(lookup?.assignment?.id).toBe(99);
        expect(lookup?.studyMaterial?.meaningSynonyms).toEqual(['Nippon']);
        expect(lookup?.components[0]?.characters).toBe('日');

        const html = renderWanikaniSource(lookup!, { ...DEFAULT_SETTINGS, wanikaniApiToken: TOKEN }, 'open');
        expect(html).toContain('Japan');
        expect(html).toContain('<strong>Also accepted:</strong> Nippon');
        expect(html).toContain('<strong>Not accepted:</strong> Japanese');
        expect(html).toContain('にっぽん <small>not accepted</small>');
        expect(html).toContain('Your synonyms');
        expect(html).toContain('data-action="wanikani-audio"');
        expect((html.match(/data-action="wanikani-audio"/g) ?? [])).toHaveLength(1);
        expect(html).toContain('data-audio-url="https://files.wanikani.com/audio.mp3"');
        expect(html).toContain('title="Tokyo accent"');
        expect(html).toContain('class="jpdb-reader-action-pill"');
        expect(html).not.toContain('class="jpdb-reader-icon-btn"');
        expect(html).toContain('data-source="wanikani"');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>');
        expect(html).toContain('rel="noopener noreferrer"');

        const unsafe = renderWanikaniSource({
            ...lookup!,
            subject: { ...lookup!.subject, documentUrl: 'javascript:alert(1)' },
            components: lookup!.components.map(component => ({ ...component, documentUrl: 'data:text/html,bad' })),
        }, { ...DEFAULT_SETTINGS, wanikaniApiToken: TOKEN }, 'open');
        expect(unsafe).not.toContain('javascript:');
        expect(unsafe).not.toContain('data:text/html');
    });

    it('renders a credential-gated definition mount in configured source order', () => {
        expect(renderWanikaniDefinitionMount(card(), { ...DEFAULT_SETTINGS, wanikaniApiToken: '' }, () => '')).toBe('');
        expect(renderWanikaniDefinitionMount(card(), { ...DEFAULT_SETTINGS, wanikaniApiToken: TOKEN }, () => 'open'))
            .toContain('data-wanikani-definition-mount');
    });

    it('prefers the kanji subject when a one-character vocabulary shares its spelling', async () => {
        const kanji = {
            ...SUBJECT,
            id: 441,
            object: 'kanji',
            data: {
                ...SUBJECT.data,
                characters: '日',
                slug: '日',
                document_url: 'https://www.wanikani.com/kanji/%E6%97%A5',
                readings: [{ reading: 'にち', type: 'onyomi', primary: true, accepted_answer: true }],
                pronunciation_audios: undefined,
                context_sentences: undefined,
                auxiliary_meanings: [],
            },
        };
        const vocabulary = {
            ...SUBJECT,
            id: 2441,
            data: { ...SUBJECT.data, characters: '日', slug: '日', readings: [{ reading: 'ひ', primary: true, accepted_answer: true }] },
        };
        const client = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async url => {
                const path = new URL(url).pathname;
                if (path.endsWith('/user')) return USER;
                if (path.endsWith('/subjects')) return { data: [vocabulary, kanji], pages: { next_url: null } };
                return { data: [], pages: { next_url: null } };
            },
        });

        expect((await new WanikaniLookupClient(client).lookupKanji('日'))?.subject.type).toBe('kanji');
    });

    it('escapes unrecognized HTML while preserving balanced WaniKani pseudo-tags', () => {
        const html = renderWanikaniMarkup('<meaning>A <reading>B</reading></meaning><img src=x>');
        expect(html).toContain('yomu-wanikani-tag-meaning');
        expect(html).toContain('yomu-wanikani-tag-reading');
        expect(html).toContain('&lt;img src=x&gt;');
        expect((html.match(/<span/g) ?? []).length).toBe((html.match(/<\/span>/g) ?? []).length);
    });
});

describe('WaniKani SRS adapter', () => {
    it('gets dashboard due counts without crawling every account assignment', async () => {
        const paths: string[] = [];
        const client = new WanikaniClient({
            getToken: () => TOKEN,
            minRequestIntervalMs: 0,
            requestImpl: async url => {
                const path = new URL(url).pathname;
                paths.push(path);
                if (path.endsWith('/user')) return USER;
                if (path.endsWith('/summary')) return { data: { reviews: [{ available_at: '2026-07-21T10:00:00.000Z', subject_ids: [440] }] } };
                throw new Error(`Unexpected stats request: ${url}`);
            },
        });

        expect((await createWanikaniSrsAdapter(client).stats()).reviewsDue).toBe(1);
        expect(paths).toEqual(['/v2/user', '/v2/summary']);
    });

    it('loads only due assignments and submits conservative meaning/reading counts', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
        const posts: unknown[] = [];
        const client = routedClient(posts);
        const adapter = createWanikaniSrsAdapter(client);
        const queue = await adapter.queue(10);
        expect(queue.cards).toHaveLength(1);
        expect(queue.cards[0]).toMatchObject({ providerId: 'wanikani', providerCardId: '99', state: ['due', 'learning'] });

        const reviewed = await adapter.review({ card: queue.cards[0]!, grade: 'hard' });
        expect(posts[0]).toEqual({ review: {
            assignment_id: 99,
            incorrect_meaning_answers: 1,
            incorrect_reading_answers: 1,
        } });
        expect(reviewed.card).toMatchObject({
            providerCardId: '99',
            state: ['learning'],
            srsLevel: 'guru',
            dueAt: Date.parse('2026-07-22T10:00:00.000Z'),
        });
    });

    it('never records a reading error for radicals and rejects non-due cards', async () => {
        const radical: YomuSrsReviewable = {
            providerId: 'wanikani', providerCardId: '1', providerReviewableId: '2', kind: 'unknown', expression: 'Sun', reading: '', meanings: [], state: ['due'], raw: { subject: { type: 'radical' } },
        };
        expect(wanikaniReviewInput(radical, 'again')).toEqual({ incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
        expect(wanikaniReviewInput({ ...radical, reading: 'stray', raw: {} }, 'again'))
            .toEqual({ incorrectMeaningAnswers: 1, incorrectReadingAnswers: 1 });
        const adapter = createWanikaniSrsAdapter(routedClient());
        await expect(adapter.review({ card: { ...radical, state: ['learning'] }, grade: 'good' })).rejects.toThrow(/currently due/i);
    });
});

function card(): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling: '日本',
        reading: 'にほん',
        frequencyRank: null,
        partOfSpeech: ['noun'],
        meanings: [{ glosses: ['Japan'], partOfSpeech: ['noun'] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: '日本【にほん】',
        source: 'wanikani',
    };
}

function routedClient(posts: unknown[] = []): WanikaniClient {
    return new WanikaniClient({
        getToken: () => TOKEN,
        minRequestIntervalMs: 0,
        // fallow-ignore-next-line complexity
        requestImpl: async (url, options) => {
            const path = new URL(url).pathname;
            if (path.endsWith('/user')) return USER;
            if (path.endsWith('/summary')) return { data: { reviews: [{ available_at: '2026-07-21T10:00:00.000Z', subject_ids: [440] }] } };
            if (path.endsWith('/assignments')) return { data: [ASSIGNMENT], pages: { next_url: null } };
            if (path.endsWith('/study_materials')) return { data: [{ id: 1, data: { meaning_note: 'Personal note', reading_note: 'Reading note', meaning_synonyms: ['Nippon'] } }], pages: { next_url: null } };
            if (path.endsWith('/review_statistics')) return { data: [{ id: 1, data: { meaning_correct: 8, meaning_incorrect: 2, reading_correct: 7, reading_incorrect: 3, percentage_correct: 75 } }], pages: { next_url: null } };
            if (path.endsWith('/reviews')) {
                posts.push(JSON.parse(String(options?.data)));
                return {
                    data: {
                        assignment_id: 99,
                        subject_id: 440,
                        starting_srs_stage: 4,
                        ending_srs_stage: 5,
                        incorrect_meaning_answers: 1,
                        incorrect_reading_answers: 1,
                    },
                    resources_updated: {
                        assignment: { ...ASSIGNMENT, data: { ...ASSIGNMENT.data, srs_stage: 5, available_at: '2026-07-22T10:00:00.000Z' } },
                    },
                };
            }
            if (path.endsWith('/subjects')) {
                const ids = new URL(url).searchParams.get('ids');
                return { data: ids === '1' ? [COMPONENT] : ids?.includes('440') ? [SUBJECT] : [SUBJECT], pages: { next_url: null } };
            }
            throw new Error(`Unexpected WaniKani test request: ${url}`);
        },
    });
}

interface AccountRaceFixture {
    accountAToken: string;
    accountAFirstPage: { promise: Promise<unknown> };
    assignmentCalls: Array<{ authorization: string; page: string }>;
}

async function accountRaceResponse(
    url: string,
    options: ReaderHttpOptions | undefined,
    fixture: AccountRaceFixture,
): Promise<unknown> {
    const parsed = new URL(url);
    const authorization = accountRaceAuthorization(options);
    if (parsed.pathname.endsWith('/user')) return userForAccount(authorization);
    return accountRaceAssignmentsResponse(url, parsed, authorization, fixture);
}

function accountRaceAuthorization(options: ReaderHttpOptions | undefined): string {
    const headers = options?.headers as Record<string, string> | undefined;
    return String(headers?.Authorization ?? '');
}

function accountRaceAssignmentsResponse(
    rawUrl: string,
    url: URL,
    authorization: string,
    fixture: AccountRaceFixture,
): unknown {
    assertAccountRaceAssignmentUrl(rawUrl, url);
    fixture.assignmentCalls.push({ authorization, page: accountRacePageNumber(url) });
    return accountRaceAssignmentPage(authorization, url, fixture);
}

function assertAccountRaceAssignmentUrl(rawUrl: string, url: URL): void {
    if (!url.pathname.endsWith('/assignments')) throw new Error(`Unexpected account-race request: ${rawUrl}`);
}

function accountRacePageNumber(url: URL): string {
    return url.searchParams.get('page') ?? '1';
}

function accountRaceAssignmentPage(
    authorization: string,
    url: URL,
    fixture: AccountRaceFixture,
): unknown {
    if (authorization !== `Bearer ${fixture.accountAToken}`) {
        return { data: [{ id: 'b-1' }], pages: { next_url: null } };
    }
    if (url.searchParams.has('page')) return { data: [{ id: 'a-2' }], pages: { next_url: null } };
    return fixture.accountAFirstPage.promise;
}

function userForAccount(authorization: string): unknown {
    const id = authorization.replace(/^Bearer /u, '');
    return {
        data: {
            id,
            level: 8,
            subscription: { active: true, type: 'recurring', max_level_granted: 8, period_ends_at: null },
        },
    };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
