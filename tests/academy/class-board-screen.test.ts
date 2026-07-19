import { describe, expect, it, vi } from 'vitest';
import {
    parseAcademyClassLeaderboardView,
    type AcademyAccountView,
    type AcademyClassLeaderboardMetricId,
    type AcademyClassLeaderboardView,
} from '../../src/reader/srs/account-contract';
import { transitionAcademyRoute } from '../../src/academy/routing/route-history';
import { AcademySyncClient } from '../../src/academy/account/sync-client';
import { createLearnerRecord, createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';
import { renderClassBoardScreen } from '../../src/academy/ui/class-board-screen';
import { renderProfileSyncScreen } from '../../src/academy/ui/profile-sync-screen';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const NOW = Date.UTC(2026, 6, 19, 12);

describe('Academy Class Board client surface', () => {
    it('strictly parses only the class ranking projection', () => {
        const parsed = parseAcademyClassLeaderboardView({
            ...view('known-words', 420),
            rawEvents: [{ answer: 'secret' }],
            email: 'private@example.com',
        });

        expect(parsed.metric.id).toBe('known-words');
        expect(parsed.entries[0]).toMatchObject({ rank: 1, displayTag: 'Aakash#419213', value: 420 });
        expect(JSON.stringify(parsed)).not.toContain('secret');
        expect(JSON.stringify(parsed)).not.toContain('private@example.com');
        expect(() => parseAcademyClassLeaderboardView({
            ...view('streak', 4),
            freshness: { generatedAt: NOW, mode: 'live-stream', realTime: true },
        })).toThrow('freshness');
        expect(() => parseAcademyClassLeaderboardView({
            ...view('known-words', 420),
            metric: { id: 'known-words', meaning: 'Contradictory.', unit: 'days', window: 'current-streak', asOf: '2026-07-19' },
        })).toThrow('metric metadata');
        expect(() => parseAcademyClassLeaderboardView({
            ...view('streak', 4),
            metric: { id: 'streak', meaning: 'Bad calendar date.', unit: 'days', window: 'current-streak', asOf: '2026-02-31' },
        })).toThrow('metric.asOf');
    });

    it('loads and updates the board through the session-aware account client', async () => {
        const request = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
            const url = String(path);
            if (url === '/academy/api/profile') return json({
                profileId: PROFILE_ID, deviceId: DEVICE_ID, accountId: ACCOUNT_ID, keyVersion: 1, createdAt: 1,
            });
            if (url === '/academy/api/entitlement') return json({ entitlement: 'academy', status: 'active', redeemedAt: 1 });
            if (url === '/academy/api/account' && init?.method === 'PATCH') {
                const body = JSON.parse(String(init.body)) as { displayName: string; boardVisible: boolean; shareAvatar: boolean };
                return json(accountPayload(body.displayName, body.boardVisible, body.shareAvatar));
            }
            if (url === '/academy/api/account') return json(accountPayload('Aakash', true, true));
            if (url.startsWith('/academy/api/classes/ucl-2026/leaderboard?')) return json(view('known-words', 420));
            return json({ error: 'Unexpected route.' }, 404);
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        const board = await client.loadClassLeaderboard('ucl-2026', 'known-words', 1, 20);
        expect(board.entries[0]?.value).toBe(420);
        expect(request.mock.calls.map(([path]) => String(path))).toContain(
            '/academy/api/classes/ucl-2026/leaderboard?metric=known-words&page=1&limit=20',
        );

        const updated = await client.updateClassBoardProfile({
            displayName: 'Henry', boardVisible: false, shareAvatar: false,
        });
        expect(updated.identity.label).toBe('Henry#419213');
        const patch = request.mock.calls.find(([path, init]) => String(path) === '/academy/api/account' && init?.method === 'PATCH');
        expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
            displayName: 'Henry', boardVisible: false, shareAvatar: false,
        });
    });

    it('does not restore account state when a board-profile response arrives after sign-out', async () => {
        let finishPatch!: (response: Response) => void;
        const patchResponse = new Promise<Response>(resolve => { finishPatch = resolve; });
        const request = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
            const url = String(path);
            if (url === '/academy/api/profile') return json({
                profileId: PROFILE_ID, deviceId: DEVICE_ID, accountId: ACCOUNT_ID, keyVersion: 1, createdAt: 1,
            });
            if (url === '/academy/api/entitlement') return json({ entitlement: 'academy', status: 'active', redeemedAt: 1 });
            if (url === '/academy/api/account' && init?.method === 'PATCH') return patchResponse;
            if (url === '/academy/api/account') return json(accountPayload('Aakash', true, true));
            if (url === '/academy/api/logout') return json({ ok: true });
            return json({ error: 'Unexpected route.' }, 404);
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        const saving = client.updateClassBoardProfile({
            displayName: 'Henry', boardVisible: true, shareAvatar: true,
        });
        await client.signOut();
        expect(client.status.account).toBeNull();
        finishPatch(json(accountPayload('Henry', true, true)));

        await expect(saving).rejects.toThrow('session changed');
        expect(client.status.phase).toBe('signed-out');
        expect(client.status.account).toBeNull();
    });

    it('does not restore account state when a board-profile response arrives after deletion', async () => {
        let finishPatch!: (response: Response) => void;
        const patchResponse = new Promise<Response>(resolve => { finishPatch = resolve; });
        const request = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
            const url = String(path);
            if (url === '/academy/api/profile') return json({
                profileId: PROFILE_ID, deviceId: DEVICE_ID, accountId: ACCOUNT_ID, keyVersion: 1, createdAt: 1,
            });
            if (url === '/academy/api/entitlement') return json({ entitlement: 'academy', status: 'active', redeemedAt: 1 });
            if (url === '/academy/api/account' && init?.method === 'PATCH') return patchResponse;
            if (url === '/academy/api/account' && init?.method === 'DELETE') return json({ ok: true });
            if (url === '/academy/api/account') return json(accountPayload('Aakash', true, true));
            return json({ error: 'Unexpected route.' }, 404);
        });
        const client = new AcademySyncClient({ events: createMemoryLearnerEventRepository(), request });
        await client.connect();

        const saving = client.updateClassBoardProfile({
            displayName: 'Henry', boardVisible: true, shareAvatar: true,
        });
        await client.deleteRemoteData('account');
        expect(client.status.account).toBeNull();
        finishPatch(json(accountPayload('Henry', true, true)));

        await expect(saving).rejects.toThrow('session changed');
        expect(client.status.phase).toBe('local');
        expect(client.status.account).toBeNull();
        expect(client.hasLinkedAccount).toBe(false);
    });

    it('loads server-ranked metrics and switches without client-side scoring', async () => {
        const load = vi.fn(async (_classId: string, metric: AcademyClassLeaderboardMetricId) => (
            view(metric, metric === 'known-words' ? 420 : 4)
        ));
        const screen = renderClassBoardScreen({
            language: 'en',
            account: account(),
            onBack: vi.fn(),
            onLoad: load,
            onSaveProfile: vi.fn(async () => account()),
        });
        document.body.replaceChildren(screen);

        await vi.waitFor(() => expect(screen.querySelector('.academy-class-board-value')?.textContent).toBe('4 days'));
        expect(load).toHaveBeenLastCalledWith('ucl-2026', 'streak', 1);
        expect(screen.querySelector('tr[data-current-learner="true"]')?.textContent).toContain('Aakash#419213');
        expect(screen.textContent).toContain('Only names and totals learners chose to share');
        expect(screen.textContent).toContain('Answers, mistakes, word lists, and Google details are never shown');

        screen.querySelector<HTMLButtonElement>('[data-metric="known-words"]')?.click();
        await vi.waitFor(() => expect(screen.querySelector('.academy-class-board-value')?.textContent).toBe('420 words'));
        expect(load).toHaveBeenLastCalledWith('ucl-2026', 'known-words', 1);
        expect(screen.querySelector('[data-metric="known-words"]')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('saves explicit board consent and refreshes the snapshot', async () => {
        const saved = vi.fn(async update => ({
            ...account(),
            identity: { displayName: update.displayName, discriminator: '419213', label: `${update.displayName}#419213` },
            boardVisible: update.boardVisible,
            shareAvatar: update.shareAvatar,
        }));
        const load = vi.fn(async () => view('streak', 4));
        const screen = renderClassBoardScreen({
            language: 'en',
            account: account({ boardVisible: false }),
            onBack: vi.fn(),
            onLoad: load,
            onSaveProfile: saved,
        });
        document.body.replaceChildren(screen);
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));

        const details = screen.querySelector<HTMLDetailsElement>('.academy-class-board-profile')!;
        details.open = true;
        const name = details.querySelector<HTMLInputElement>('input[name="displayName"]')!;
        const listed = details.querySelector<HTMLInputElement>('input[name="boardVisible"]')!;
        const share = details.querySelector<HTMLInputElement>('input[name="shareAvatar"]')!;
        name.value = 'Henry';
        listed.checked = true;
        share.checked = true;
        details.querySelector('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(saved).toHaveBeenCalledWith({
            displayName: 'Henry', boardVisible: true, shareAvatar: true,
        }));
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    });

    it('opens from Profile & sync and returns through route history', () => {
        const open = vi.fn();
        const screen = renderProfileSyncScreen({
            language: 'en',
            status: {
                phase: 'ready',
                profile: { profileId: PROFILE_ID, deviceId: DEVICE_ID, accountId: ACCOUNT_ID, keyVersion: 1, createdAt: 1 },
                account: account(),
                entitlement: { entitlement: 'academy', status: 'active', redeemedAt: 1 },
                pending: 0,
                lastSyncAt: NOW,
                error: null,
            },
            onBack: vi.fn(),
            onConnect: vi.fn(async () => {}),
            onRetry: vi.fn(async () => {}),
            onGoogleLink: vi.fn(),
            onStartPairing: vi.fn(async () => ({
                pairingId: '55555555-5555-4555-8555-555555555555',
                code: '0234-5678-ABCD-EFGH-JKMN',
                expiresAt: NOW + 60_000,
            })),
            onClaimPairing: vi.fn(async () => {}),
            onExport: vi.fn(async () => {}),
            onSignOut: vi.fn(async () => {}),
            onDelete: vi.fn(async () => {}),
            onClassBoard: open,
        });
        [...screen.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Open Class Board')?.click();
        expect(open).toHaveBeenCalledTimes(1);

        const opened = transitionAcademyRoute(
            { route: 'profile-sync', routeHistory: [{ route: 'journal' }], presentationMode: 'story' },
            { kind: 'push', route: 'class-board' },
        );
        expect(transitionAcademyRoute(opened, { kind: 'back' })).toEqual({
            route: 'profile-sync', routeHistory: [{ route: 'journal' }], presentationMode: 'story',
        });
    });

    it('renders the account-backed route through WorldFlow', async () => {
        let current: HTMLElement | undefined;
        const screenHost = document.createElement('main');
        document.body.replaceChildren(screenHost);
        const shell = {
            screen: screenHost,
            replace(view: HTMLElement) { current = view; screenHost.replaceChildren(view); },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const loadClassLeaderboard = vi.fn(async () => view('streak', 4));
        const sync = {
            status: {
                phase: 'ready', profile: null, account: account(), entitlement: null,
                pending: 0, lastSyncAt: NOW, error: null,
            },
            loadClassLeaderboard,
            updateClassBoardProfile: vi.fn(async () => account()),
        };
        const back = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: {} as never,
            sync: sync as never,
        });

        expect(await flow.render('class-board', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'class-board',
                routeHistory: [{ route: 'profile-sync' }],
                presentationMode: 'story',
                updatedAt: 1,
            },
            projection: await createLearnerRecord().snapshot(),
            shell,
            go: vi.fn(async () => undefined),
            back,
        })).toBe(true);

        await vi.waitFor(() => expect(current?.querySelector('.academy-class-board-value')?.textContent).toBe('4 days'));
        current?.querySelector<HTMLButtonElement>('.academy-lesson-overview-back')?.click();
        expect(back).toHaveBeenCalledTimes(1);
        expect(loadClassLeaderboard).toHaveBeenCalledWith('ucl-2026', 'streak', 1, 20);
    });

    it('rehydrates a resumed Class Board without pushing a redirect loop', async () => {
        let hydrated: AcademyAccountView | null = null;
        const screenHost = document.createElement('main');
        const shell = {
            screen: screenHost,
            replace(view: HTMLElement) { screenHost.replaceChildren(view); },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const connect = vi.fn(async () => {
            hydrated = account();
            return {};
        });
        const sync = {
            get status() {
                return {
                    phase: hydrated ? 'ready' : 'offline', profile: null, account: hydrated, entitlement: null,
                    pending: 0, lastSyncAt: NOW, error: null,
                };
            },
            connect,
            loadClassLeaderboard: vi.fn(async () => view('streak', 4)),
            updateClassBoardProfile: vi.fn(async () => account()),
        };
        const flow = createWorldFlow({
            evidence: {} as never, pronunciation: {} as never, audio: {} as never, sync: sync as never,
        });

        await flow.render('class-board', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2, route: 'class-board', routeHistory: [{ route: 'profile-sync' }],
                presentationMode: 'story', updatedAt: 1,
            },
            projection: await createLearnerRecord().snapshot(),
            shell,
            go,
            back: vi.fn(async () => undefined),
        });

        await vi.waitFor(() => expect(screenHost.querySelector('[data-academy-route="class-board"]')).not.toBeNull());
        expect(connect).toHaveBeenCalledTimes(1);
        expect(go).not.toHaveBeenCalled();
    });
});

function account(overrides: Partial<AcademyAccountView> = {}): AcademyAccountView {
    return {
        accountId: ACCOUNT_ID,
        identity: { displayName: 'Aakash', discriminator: '419213', label: 'Aakash#419213' },
        nameChosen: true,
        avatarKey: 'quality-2',
        boardVisible: true,
        shareAvatar: true,
        classes: [{ classId: 'ucl-2026', name: 'UCL Japanese 2026', role: 'learner', boardHidden: false }],
        ...overrides,
    };
}

function accountPayload(displayName: string, boardVisible: boolean, shareAvatar: boolean) {
    return {
        accountId: ACCOUNT_ID,
        displayName,
        displayTag: `${displayName}#419213`,
        nameChosen: true,
        avatarKey: 'quality-2',
        boardVisible,
        shareAvatar,
        classes: [{ classId: 'ucl-2026', name: 'UCL Japanese 2026', role: 'learner', boardHidden: false }],
    };
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function view(metric: AcademyClassLeaderboardMetricId, value: number): AcademyClassLeaderboardView {
    const unit = metric === 'known-words' ? 'words' : metric === 'lesson-progress' ? 'lessons' : 'days';
    const window = metric === 'streak' ? 'current-streak' : metric === 'review-activity' ? 'rolling-7-utc-days' : 'all-time';
    const entry = {
        rank: 1,
        accountId: ACCOUNT_ID,
        displayTag: 'Aakash#419213',
        avatarKey: 'quality-2',
        role: 'learner' as const,
        value,
        updatedAt: NOW - 60_000,
    };
    return {
        classId: 'ucl-2026',
        metric: {
            id: metric,
            meaning: 'Server-owned metric meaning.',
            unit,
            window,
            ...(window === 'current-streak' ? { asOf: '2026-07-19' } : {}),
            ...(window === 'rolling-7-utc-days' ? { startsOn: '2026-07-13', endsOn: '2026-07-19' } : {}),
        },
        entries: [entry, {
            rank: 2,
            accountId: OTHER_ID,
            displayTag: 'Mira#120045',
            role: 'learner',
            value: Math.max(0, value - 1),
            updatedAt: NOW - 120_000,
        }],
        me: entry,
        pagination: { page: 1, limit: 20, visibleEntries: 2, pages: 1 },
        updatedAt: NOW - 60_000,
        freshness: { generatedAt: NOW, mode: 'server-snapshot', realTime: false },
    };
}
