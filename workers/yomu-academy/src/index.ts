import type { ExecutionContext } from './cf';
import type { Env } from './env';
import { errorResponse, HttpError, jsonResponse } from './http';
import { handleAdminCreateInvite } from './invites';
import { handleMedia } from './media';
import { pruneRateWindows } from './rate-limit';
import { handleCreateRecoverySession, handleCreateSession, handleGetSession, handleLogout, handleResumeSession } from './sessions';
import { handleClaim, handleCreateCheckout, handleStripeWebhook } from './stripe';
import { handleGetAccount, handlePatchAccount } from './accounts';
import { handleAdminClass, handleAdminRole, handleClassRoute } from './classes';
import {
    googleCallbackFailureCategory,
    handleGoogleCallback,
    handleGoogleCallbackFailure,
    handleGoogleStart,
} from './oauth';
import { handleProgressSync } from './progress';
import { handleGetProfile, handleInitializeProfileKey } from './profiles';
import { handleClaimPairing, handleCompletePairing, handleCreatePairing, pruneExpiredPairings } from './pairings';
import { handleSyncPull, handleSyncPush } from './sync';
import {
    handleCreateLifecycleProofGrant,
    handleDeleteAccount,
    handleDeleteLifecycleProofAccount,
    handleDeleteProfile,
    handleVerifyLifecycleProofGrant,
    pruneLifecycleRecords,
} from './lifecycle';
import { handleAccountExport, handleProfileExport } from './exports';
import { handleGetEntitlement, handleRedeemEntitlement } from './entitlements';
import { handleAnswerCheck } from './answer-check';

const clock = (): number => Date.now();

/**
 * yomu-academy Worker: invite sessions, Google accounts, local-first sync,
 * donation checkout, and protected media. Public Academy assets stay outside
 * this Worker so the enrollment screen can load before authentication.
 */
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const { pathname } = new URL(request.url);
        try {
            if (pathname.startsWith('/academy/media/')) return await handleMedia(request, env, clock);
            if (pathname.startsWith('/academy/api/classes/')) return await handleClassRoute(request, env, clock);
            const pairing = /^\/academy\/api\/pairings\/([0-9a-f-]+)$/iu.exec(pathname);
            if (pairing && request.method === 'PUT') return await handleCompletePairing(request, env, clock, pairing[1]);
            const route = `${request.method} ${pathname}`;
            switch (route) {
                case 'POST /academy/api/session':
                    ctx.waitUntil(pruneRateWindows(env, clock).catch(() => undefined));
                    ctx.waitUntil(pruneLifecycleRecords(env, clock).catch(() => undefined));
                    return await handleCreateSession(request, env, clock);
                case 'GET /academy/api/session':
                    return await handleGetSession(request, env, clock);
                case 'POST /academy/api/session/resume':
                    return await handleResumeSession(request, env, clock);
                case 'POST /academy/api/logout':
                    return await handleLogout(request, env, clock);
                case 'POST /academy/api/admin/invites':
                    return await handleAdminCreateInvite(request, env, clock);
                case 'POST /academy/api/admin/classes':
                    return await handleAdminClass(request, env, clock);
                case 'POST /academy/api/admin/roles':
                    return await handleAdminRole(request, env);
                case 'POST /academy/api/admin/lifecycle-proof-grants':
                    return await handleCreateLifecycleProofGrant(request, env, clock);
                case 'POST /academy/api/checkout':
                    return await handleCreateCheckout(request, env, clock);
                case 'POST /academy/api/stripe/webhook':
                    return await handleStripeWebhook(request, env, clock);
                case 'GET /academy/api/claim':
                    return await handleClaim(request, env, clock);
                case 'GET /academy/api/auth/google/start':
                    return await handleGoogleStart(request, env, clock);
                case 'GET /academy/api/auth/google/callback':
                    try {
                        return await handleGoogleCallback(request, env, clock);
                    } catch (error) {
                        console.warn(`academy_google_callback_failed:${googleCallbackFailureCategory(error)}`);
                        return handleGoogleCallbackFailure();
                    }
                case 'POST /academy/api/auth/google/recovery':
                    return await handleCreateRecoverySession(request, env, clock);
                case 'GET /academy/api/account':
                    return await handleGetAccount(request, env, clock);
                case 'PATCH /academy/api/account':
                    return await handlePatchAccount(request, env, clock);
                case 'POST /academy/api/account/export':
                    return await handleAccountExport(request, env, clock);
                case 'DELETE /academy/api/account':
                    return await handleDeleteAccount(request, env, clock);
                case 'POST /academy/api/account/lifecycle-proof/verify':
                    return await handleVerifyLifecycleProofGrant(request, env, clock);
                case 'DELETE /academy/api/account/lifecycle-proof':
                    return await handleDeleteLifecycleProofAccount(request, env, clock);
                case 'GET /academy/api/entitlement':
                    return await handleGetEntitlement(request, env, clock);
                case 'POST /academy/api/entitlement/redeem':
                    return await handleRedeemEntitlement(request, env, clock);
                case 'GET /academy/api/profile':
                    return await handleGetProfile(request, env, clock);
                case 'POST /academy/api/profile/key':
                    return await handleInitializeProfileKey(request, env, clock);
                case 'POST /academy/api/profile/export':
                    return await handleProfileExport(request, env, clock);
                case 'DELETE /academy/api/profile':
                    return await handleDeleteProfile(request, env, clock);
                case 'POST /academy/api/pairings':
                    ctx.waitUntil(pruneExpiredPairings(env, clock).catch(() => undefined));
                    return await handleCreatePairing(request, env, clock);
                case 'POST /academy/api/pairings/claim':
                    ctx.waitUntil(pruneExpiredPairings(env, clock).catch(() => undefined));
                    return await handleClaimPairing(request, env, clock);
                case 'POST /academy/api/srs/push':
                    return await handleSyncPush(request, env, clock);
                case 'GET /academy/api/srs/pull':
                    return await handleSyncPull(request, env, clock);
                case 'POST /academy/api/progress/sync':
                    return await handleProgressSync(request, env, clock);
                case 'POST /academy/api/answer-check':
                    return await handleAnswerCheck(request, env, clock);
                case 'GET /academy/api/health':
                    return jsonResponse({
                        ok: true,
                        apiBase: `${env.ACADEMY_ORIGIN}/academy/api`,
                        workerVersionId: env.CF_VERSION_METADATA?.id ?? null,
                        artifactProof: 'cloudflare-version-modules-v1',
                    });
                default:
                    throw new HttpError(404, 'Not found.');
            }
        } catch (error) {
            return errorResponse(error);
        }
    },
};
