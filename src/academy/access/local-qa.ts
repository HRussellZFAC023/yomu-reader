import type { AccessGateway, InviteSession } from './gateway';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function localQaAuthBypassEnabled(
    location: Pick<Location, 'hostname' | 'href'>,
    development: boolean,
): boolean {
    if (!development || !LOCAL_HOSTS.has(location.hostname)) return false;
    return new URL(location.href).searchParams.get('qa-auth') === 'bypass';
}

export function createLocalQaAccessGateway(now: () => number = Date.now): AccessGateway {
    return {
        async exchange(code: string): Promise<InviteSession> {
            if (!/^[A-Z0-9-]{4,64}$/.test(code.trim().toUpperCase())) {
                throw new Error('Use a four-character or longer local QA code.');
            }
            const openedAt = now();
            return {
                sessionId: `local-qa-${openedAt}`,
                expiresAt: openedAt + 24 * 60 * 60 * 1_000,
                offlineResumeUntil: openedAt + 7 * 24 * 60 * 60 * 1_000,
                accountRequired: true,
                source: 'local-qa',
            };
        },
    };
}
