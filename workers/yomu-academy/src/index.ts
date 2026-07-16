import type { ExecutionContext } from './cf';
import type { Env } from './env';
import { errorResponse, HttpError, jsonResponse } from './http';
import { handleAdminCreateInvite } from './invites';
import { handleMedia } from './media';
import { pruneRateWindows } from './rate-limit';
import { handleCreateSession, handleGetSession, handleLogout } from './sessions';
import { handleClaim, handleCreateCheckout, handleStripeWebhook } from './stripe';
import { handleGetAccount, handlePatchAccount } from './accounts';
import { handleAdminClass, handleAdminRole, handleClassRoute } from './classes';
import { handleGoogleCallback, handleGoogleStart } from './oauth';
import { handleProgressSync } from './progress';

const clock = (): number => Date.now();

/**
 * yomu-academy Worker: invite sessions, donation checkout, and protected
 * media. Only /academy/api/* and /academy/media/* are routed here, so public
 * Academy app assets keep loading before login.
 */
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const { pathname } = new URL(request.url);
        try {
            if (pathname.startsWith('/academy/media/')) return await handleMedia(request, env, clock);
            if (pathname.startsWith('/academy/api/classes/')) return await handleClassRoute(request, env, clock);
            const route = `${request.method} ${pathname}`;
            switch (route) {
                case 'POST /academy/api/session':
                    ctx.waitUntil(pruneRateWindows(env, clock).catch(() => undefined));
                    return await handleCreateSession(request, env, clock);
                case 'GET /academy/api/session':
                    return await handleGetSession(request, env, clock);
                case 'POST /academy/api/logout':
                    return await handleLogout(request, env, clock);
                case 'POST /academy/api/admin/invites':
                    return await handleAdminCreateInvite(request, env, clock);
                case 'POST /academy/api/admin/classes':
                    return await handleAdminClass(request, env, clock);
                case 'POST /academy/api/admin/roles':
                    return await handleAdminRole(request, env);
                case 'POST /academy/api/checkout':
                    return await handleCreateCheckout(request, env, clock);
                case 'POST /academy/api/stripe/webhook':
                    return await handleStripeWebhook(request, env, clock);
                case 'GET /academy/api/claim':
                    return await handleClaim(request, env, clock);
                case 'GET /academy/api/auth/google/start':
                    return await handleGoogleStart(request, env, clock);
                case 'GET /academy/api/auth/google/callback':
                    return await handleGoogleCallback(request, env, clock);
                case 'GET /academy/api/account':
                    return await handleGetAccount(request, env, clock);
                case 'PATCH /academy/api/account':
                    return await handlePatchAccount(request, env, clock);
                case 'POST /academy/api/progress/sync':
                    return await handleProgressSync(request, env, clock);
                case 'GET /academy/api/health':
                    return jsonResponse({ ok: true });
                default:
                    throw new HttpError(404, 'Not found.');
            }
        } catch (error) {
            return errorResponse(error);
        }
    },
};
