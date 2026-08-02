import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    HostedAcademyAccountClient,
    HostedAcademyAccountControls,
} from '../../docs/.vitepress/theme/academy-account';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('hosted Academy account client', () => {
    it('stays quietly signed out on local VitePress previews', async () => {
        const request = vi.spyOn(globalThis, 'fetch');
        const client = new HostedAcademyAccountClient();

        await expect(client.ensureLoaded()).resolves.toMatchObject({ phase: 'signed-out' });
        expect(request).not.toHaveBeenCalled();
    });

    it('resumes an expired session once before retrying account status', async () => {
        let statusRequests = 0;
        const calls: Array<{ path: string; init?: RequestInit }> = [];
        const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input);
            calls.push({ path, init });
            if (path === '/academy/api/session/status') {
                statusRequests++;
                return response({ state: statusRequests === 1 ? 'resumable' : 'linked' });
            }
            if (path === '/academy/api/session/resume') return response({ ok: true });
            if (path === '/academy/api/account') return response(account('Aakash'));
            return response({}, 404);
        });
        const client = new HostedAcademyAccountClient({ request });

        await expect(client.ensureLoaded()).resolves.toMatchObject({
            phase: 'signed-in',
            displayName: 'Aakash',
        });

        expect(calls.map(call => call.path)).toEqual([
            '/academy/api/session/status',
            '/academy/api/session/resume',
            '/academy/api/session/status',
            '/academy/api/account',
        ]);
        expect(calls[0]?.init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
        expect(calls[1]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    });

    it('keeps signed-out and active-unlinked visitors quiet without protected requests or resume attempts', async () => {
        const anonymousRequest = vi.fn(async () => response({ state: 'signed-out' }));
        const anonymous = new HostedAcademyAccountClient({ request: anonymousRequest });
        await expect(anonymous.ensureLoaded()).resolves.toMatchObject({ phase: 'signed-out' });
        expect(anonymousRequest).toHaveBeenCalledOnce();
        expect(anonymousRequest).toHaveBeenCalledWith(
            '/academy/api/session/status',
            expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
        );

        const healthyCalls: string[] = [];
        const healthy = new HostedAcademyAccountClient({
            request: vi.fn(async input => {
                const path = String(input);
                healthyCalls.push(path);
                return response({ state: 'active-unlinked' });
            }),
        });
        await healthy.ensureLoaded();
        expect(healthy.state.phase).toBe('signed-out');
        expect(healthyCalls).toEqual(['/academy/api/session/status']);
    });

    it('creates a reader session before Google navigation', async () => {
        const navigate = vi.fn();
        const request = vi.fn(async () => response({ state: 'active-unlinked' }, 201));
        const client = new HostedAcademyAccountClient({ request, navigate });

        await client.beginReaderAuth();

        expect(request).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledWith('/academy/api/auth/google/reader', expect.objectContaining({
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        }));
        expect(navigate).toHaveBeenCalledWith('/academy/api/auth/google/start');
    });

    it('delegates invite-session preservation to the atomic Reader auth request', async () => {
        const navigate = vi.fn();
        const request = vi.fn(async () => response({ state: 'active-unlinked' }));
        const client = new HostedAcademyAccountClient({ request, navigate });

        await client.beginReaderAuth();

        expect(request).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledWith(
            '/academy/api/auth/google/reader',
            expect.objectContaining({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }),
        );
        expect(navigate).toHaveBeenCalledWith('/academy/api/auth/google/start');
    });

    it('refreshes a linked account at click time instead of starting Google again', async () => {
        const navigate = vi.fn();
        const calls: string[] = [];
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            calls.push(path);
            if (path === '/academy/api/auth/google/reader') return response({ state: 'linked' });
            if (path === '/academy/api/session/status') return response({ state: 'linked' });
            if (path === '/academy/api/account') return response(account('Aakash'));
            return response({}, 404);
        });
        const client = new HostedAcademyAccountClient({ request, navigate });

        await client.beginReaderAuth();

        expect(navigate).not.toHaveBeenCalled();
        expect(client.state).toMatchObject({ phase: 'signed-in', displayName: 'Aakash' });
        expect(calls).toEqual([
            '/academy/api/auth/google/reader',
            '/academy/api/session/status',
            '/academy/api/account',
        ]);
    });

    it('accepts a concurrent tab winning session rotation after this tab receives 401', async () => {
        let statusRequests = 0;
        const calls: string[] = [];
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            calls.push(path);
            if (path === '/academy/api/session/status') {
                statusRequests++;
                return response({ state: statusRequests === 1 ? 'resumable' : 'linked' });
            }
            if (path === '/academy/api/session/resume') return response({}, 401);
            if (path === '/academy/api/account') return response(account('Aakash'));
            return response({}, 404);
        });
        const client = new HostedAcademyAccountClient({ request });

        await expect(client.ensureLoaded()).resolves.toMatchObject({
            phase: 'signed-in',
            displayName: 'Aakash',
        });
        expect(calls).toEqual([
            '/academy/api/session/status',
            '/academy/api/session/resume',
            '/academy/api/session/status',
            '/academy/api/account',
        ]);
    });

    it('bounds an account-read expiry race to one status re-resolution', async () => {
        let statusRequests = 0;
        const calls: string[] = [];
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            calls.push(path);
            if (path === '/academy/api/session/status') {
                statusRequests++;
                return response({ state: statusRequests === 1 ? 'linked' : 'signed-out' });
            }
            if (path === '/academy/api/account') return response({}, 401);
            return response({}, 404);
        });
        const client = new HostedAcademyAccountClient({ request });

        await expect(client.ensureLoaded()).resolves.toMatchObject({ phase: 'signed-out' });
        expect(calls).toEqual([
            '/academy/api/session/status',
            '/academy/api/account',
            '/academy/api/session/status',
        ]);
    });

    it('treats a malformed status contract as unavailable, not signed out', async () => {
        const client = new HostedAcademyAccountClient({
            request: vi.fn(async () => response({ state: 'mystery' })),
        });

        await expect(client.ensureLoaded()).resolves.toMatchObject({
            phase: 'error',
            error: true,
        });
    });

    it('surfaces a same-origin resume rejection instead of treating it as a rotation race', async () => {
        const calls: string[] = [];
        const client = new HostedAcademyAccountClient({
            request: vi.fn(async (input: RequestInfo | URL) => {
                const path = String(input);
                calls.push(path);
                return path === '/academy/api/session/status'
                    ? response({ state: 'resumable' })
                    : response({}, 403);
            }),
        });

        await expect(client.ensureLoaded()).resolves.toMatchObject({ phase: 'error', error: true });
        expect(calls).toEqual(['/academy/api/session/status', '/academy/api/session/resume']);
    });

    it('stops after a Reader ensure conflict instead of retrying into session creation', async () => {
        const navigate = vi.fn();
        const calls: string[] = [];
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            calls.push(path);
            return path === '/academy/api/session/status'
                ? response({ state: 'signed-out' })
                : response({}, 409);
        });
        const client = new HostedAcademyAccountClient({ request, navigate });

        await client.ensureLoaded();
        await client.beginReaderAuth();

        expect(calls).toEqual([
            '/academy/api/session/status',
            '/academy/api/auth/google/reader',
        ]);
        expect(navigate).not.toHaveBeenCalled();
        expect(client.state).toMatchObject({ phase: 'signed-out', busy: false, error: true });
    });

    it('posts logout and clears the visible account state', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            if (path === '/academy/api/session/status') {
                return response({ state: 'linked' });
            }
            return path === '/academy/api/account' ? response(account('Aakash')) : response({ ok: true });
        });
        const client = new HostedAcademyAccountClient({ request });
        await client.ensureLoaded();

        await client.signOut();

        expect(request).toHaveBeenLastCalledWith('/academy/api/logout', expect.objectContaining({
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
        }));
        expect(client.state).toMatchObject({ phase: 'signed-out', displayName: null, busy: false });
    });
});

describe('hosted Academy account controls', () => {
    it('mounts desktop and mobile controls idempotently without exposing the discriminator', async () => {
        hostedNavShell();
        const client = new HostedAcademyAccountClient({
            request: vi.fn(async input => String(input) === '/academy/api/session/status'
                ? response({ state: 'linked' })
                : response(account('Aakash'))),
        });
        const controls = new HostedAcademyAccountControls({ client, document });

        controls.sync('en');
        controls.sync('en');
        await client.ensureLoaded();

        const accountControls = document.querySelectorAll<HTMLElement>('[data-yomu-hosted-account]');
        expect(accountControls).toHaveLength(2);
        expect(document.querySelectorAll('#yomu-hosted-account')).toHaveLength(1);
        expect(document.querySelectorAll('#yomu-hosted-mobile-account')).toHaveLength(1);
        for (const control of accountControls) {
            expect(control.textContent).toContain('Signed in as Aakash');
            expect(control.textContent).not.toContain('#400');
            expect(control.textContent).not.toContain('419213');
            expect(control.dataset.yomuLocalize).toBe('off');
            // The account control is ordinary page text to the READER — the
            // owner wants every surface annotated, and the surface-ignore stamp
            // here left サインイン / アカウントを作成 as the only bare text in the header.
            expect(control.dataset.jpdbReaderSurfaceIgnore).toBeUndefined();
            expect(control.querySelector('a')?.getAttribute('href')).toBe('/academy/?view=profile-sync');
        }

        controls.destroy();
    });

    // The owner's screenshot: an account pill reading "Learner", a dropdown saying
    // "Signed in as Learner", and Profile & sync landing on a 404. Three defects in
    // one flow, pinned together.
    it('escapes the VitePress router so Profile & sync reaches the real Academy shell', async () => {
        hostedNavShell();
        const client = new HostedAcademyAccountClient({
            request: vi.fn(async input => String(input) === '/academy/api/session/status'
                ? response({ state: 'linked' })
                : response(account('Aakash'))),
        });
        const controls = new HostedAcademyAccountControls({ client, document });
        controls.sync('en');
        await client.ensureLoaded();

        const link = document.querySelector<HTMLAnchorElement>('#yomu-hosted-account a')!;
        // The Academy shell lives in docs/public/, outside the VitePress page map.
        // Without a target attribute VitePress intercepts the click and renders its
        // stock 404 client-side — the server is never asked, so a WORKING page
        // appeared broken. The router skips any anchor that carries a target.
        expect(link.getAttribute('target')).toBe('_self');
        controls.destroy();
    });

    it('never greets an account by the placeholder name it did not choose', async () => {
        hostedNavShell();
        // Accounts are created as 'Learner' with nameChosen false — the Google name
        // is deliberately never stored. Greeting someone as Learner reads as a bug,
        // and the dropdown gave no hint that a name could be chosen at all.
        const unnamed = { ...account('Learner'), nameChosen: false };
        const client = new HostedAcademyAccountClient({
            request: vi.fn(async input => String(input) === '/academy/api/session/status'
                ? response({ state: 'linked' })
                : response(unnamed)),
        });
        const controls = new HostedAcademyAccountControls({ client, document });
        controls.sync('en');
        await client.ensureLoaded();

        const control = document.querySelector<HTMLElement>('#yomu-hosted-account')!;
        expect(control.textContent).not.toContain('Signed in as Learner');
        expect(control.textContent).toContain('Signed in');
        // The pill falls back to the neutral label, and the profile link becomes
        // the next step instead of a destination.
        expect(control.querySelector('.yomu-hosted-account-summary-text')?.textContent).toBe('Account');
        expect(control.querySelector('a')?.textContent).toBe('Choose your name');
        controls.destroy();
    });

    it('mounts before the direct navbar group when Appearance is nested', () => {
        hostedNavShell();
        const target = document.querySelector<HTMLElement>('.VPNavBar .content-body')!;
        const appearance = target.querySelector<HTMLElement>('.VPNavBarAppearance')!;
        const group = document.createElement('div');
        group.className = 'VPNavBarExtra';
        group.append(appearance);
        target.append(group);
        const controls = new HostedAcademyAccountControls({
            client: new HostedAcademyAccountClient({
                request: vi.fn(async () => response({ state: 'signed-out' })),
            }),
            document,
        });

        expect(() => controls.sync('en')).not.toThrow();
        const account = document.getElementById('yomu-hosted-account');
        expect(account?.nextElementSibling).toBe(group);

        controls.destroy();
    });

    it('renders both signed-out account actions in English and Japanese', async () => {
        hostedNavShell();
        const request = vi.fn(async () => response({ state: 'signed-out' }));
        const client = new HostedAcademyAccountClient({ request });
        const controls = new HostedAcademyAccountControls({ client, document });
        controls.sync('en');
        await client.ensureLoaded();

        const desktop = document.getElementById('yomu-hosted-account');
        expect(desktop?.textContent).toContain('Signed out');
        expect(desktop?.textContent).toContain('Sign in');
        expect(desktop?.textContent).toContain('Create account');

        controls.sync('ja');
        expect(desktop?.textContent).toContain('サインインしていません');
        expect(desktop?.textContent).toContain('サインイン');
        expect(desktop?.textContent).toContain('アカウントを作成');

        controls.destroy();
    });

    it.each(['Sign in', 'Create account'])('wires the %s action to Reader auth', async label => {
        hostedNavShell();
        const navigate = vi.fn();
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            if (path === '/academy/api/session/status') return response({ state: 'signed-out' });
            if (path === '/academy/api/auth/google/reader') return response({ state: 'active-unlinked' }, 201);
            return response({}, 401);
        });
        const client = new HostedAcademyAccountClient({ request, navigate });
        const controls = new HostedAcademyAccountControls({ client, document });
        controls.sync('en');
        await client.ensureLoaded();

        const button = [...document.querySelectorAll<HTMLButtonElement>('#yomu-hosted-account button')]
            .find(candidate => candidate.textContent === label);
        expect(button).toBeDefined();
        button?.click();
        await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/academy/api/auth/google/start'));

        expect(request).toHaveBeenCalledWith('/academy/api/auth/google/reader', expect.objectContaining({
            method: 'POST',
            body: '{}',
        }));
        controls.destroy();
    });
});

function hostedNavShell(): void {
    document.body.innerHTML = `
        <header class="VPNav">
            <div class="VPNavBar">
                <div class="content-body">
                    <div id="yomu-hud-language-toggle"></div>
                    <div class="VPNavBarAppearance"></div>
                </div>
            </div>
        </header>
        <div id="NavScreenGroup-more"><div class="item">Existing item</div></div>
    `;
}

function account(displayName: string): Record<string, unknown> {
    return {
        accountId: ACCOUNT_ID,
        displayName,
        displayTag: `${displayName}#419213`,
        nameChosen: true,
        avatarKey: 'quality-2',
        boardVisible: true,
        shareAvatar: false,
        academyAccess: false,
        classes: [],
        email: 'private@example.invalid',
        googleName: 'Private Google Name',
        googlePhoto: 'https://example.invalid/private',
    };
}

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}
