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
        let accountRequests = 0;
        const calls: Array<{ path: string; init?: RequestInit }> = [];
        const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input);
            calls.push({ path, init });
            if (path === '/academy/api/account') {
                accountRequests++;
                return accountRequests === 1 ? response({}, 401) : response(account('Aakash'));
            }
            if (path === '/academy/api/session') return response({}, 401);
            if (path === '/academy/api/session/resume') return response({ ok: true });
            return response({}, 404);
        });
        const client = new HostedAcademyAccountClient({ request });

        await expect(client.ensureLoaded()).resolves.toMatchObject({
            phase: 'signed-in',
            displayName: 'Aakash',
        });

        expect(calls.map(call => call.path)).toEqual([
            '/academy/api/account',
            '/academy/api/session',
            '/academy/api/session/resume',
            '/academy/api/account',
        ]);
        expect(calls[0]?.init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
        expect(calls[2]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    });

    it('does not resume a healthy unlinked session or loop after a refused resume', async () => {
        const healthyCalls: string[] = [];
        const healthy = new HostedAcademyAccountClient({
            request: vi.fn(async input => {
                const path = String(input);
                healthyCalls.push(path);
                return response({}, path === '/academy/api/session' ? 200 : 401);
            }),
        });
        await healthy.ensureLoaded();
        expect(healthy.state.phase).toBe('signed-out');
        expect(healthyCalls).toEqual(['/academy/api/account', '/academy/api/session']);

        const refusedCalls: string[] = [];
        const refused = new HostedAcademyAccountClient({
            request: vi.fn(async input => {
                const path = String(input);
                refusedCalls.push(path);
                return response({}, 401);
            }),
        });
        await refused.ensureLoaded();
        await refused.ensureLoaded();
        expect(refused.state.phase).toBe('signed-out');
        expect(refusedCalls).toEqual([
            '/academy/api/account',
            '/academy/api/session',
            '/academy/api/session/resume',
        ]);
    });

    it('creates a reader session before Google navigation', async () => {
        const navigate = vi.fn();
        const request = vi.fn(async () => response({}, 201));
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

    it('posts logout and clears the visible account state', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => (
            String(input) === '/academy/api/account' ? response(account('Aakash')) : response({ ok: true })
        ));
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
            request: vi.fn(async () => response(account('Aakash'))),
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
            expect(control.dataset.jpdbReaderSurfaceIgnore).toBe('true');
            expect(control.querySelector('a')?.getAttribute('href')).toBe('/academy/?view=profile-sync');
        }

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
            client: new HostedAcademyAccountClient({ request: vi.fn(async () => response({}, 401)) }),
            document,
        });

        expect(() => controls.sync('en')).not.toThrow();
        const account = document.getElementById('yomu-hosted-account');
        expect(account?.nextElementSibling).toBe(group);

        controls.destroy();
    });

    it('renders both signed-out account actions in English and Japanese', async () => {
        hostedNavShell();
        const request = vi.fn(async (input: RequestInfo | URL) => (
            response({}, String(input) === '/academy/api/session' ? 200 : 401)
        ));
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
            if (path === '/academy/api/session') return response({}, 200);
            if (path === '/academy/api/auth/google/reader') return response({}, 201);
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
