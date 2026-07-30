import type { ExecutionContext } from './cf';
import type { Env } from './env';
import { errorResponse, HttpError, jsonResponse } from './http';
import { serviceRevision } from '../../shared/service-revision';
import { handleAdminCreateInvite } from './invites';
import { handleMedia } from './media';
import { pruneRateWindows } from './rate-limit';
import {
    handleCreateReaderAccountSession,
    handleCreateRecoverySession,
    handleCreateSession,
    handleGetSession,
    handleGetSessionStatus,
    handleLogout,
    handleResumeSession,
} from './sessions';
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
import {
    handleClaimPairing,
    handleClaimReaderDevicePairing,
    handleCompletePairing,
    handleCompleteReaderDevicePairing,
    handleCreatePairing,
    handleCreateReaderDevicePairing,
    pruneExpiredPairings,
} from './pairings';
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
import { handleAccountRevokeReaderDevice, handleGetDeviceStatus, handleListReaderDevices, handleRevokeDevice } from './device-auth';
import { handlePullReaderSrsEvents, handlePushReaderSrsEvents } from './reader-srs-sync';

const clock = (): number => Date.now();

/**
 * yomu-academy Worker: invite sessions, Google accounts, local-first sync,
 * paid-access redemption, and protected media. Public Academy assets stay outside
 * this Worker so the enrollment screen can load before authentication.
 */
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const { pathname } = new URL(request.url);
        const deviceApi = pathname === '/academy/api/device'
            || pathname.startsWith('/academy/api/device/');
        try {
            if (deviceApi && request.method === 'OPTIONS') return deviceCorsResponse(new Response(null, { status: 204 }));
            if (pathname.startsWith('/academy/media/')) return await handleMedia(request, env, clock);
            if (pathname.startsWith('/academy/api/classes/')) return await handleClassRoute(request, env, clock);
            const pairing = /^\/academy\/api\/pairings\/([0-9a-f-]+)$/iu.exec(pathname);
            if (pairing && request.method === 'PUT') return await handleCompletePairing(request, env, clock, pairing[1]);
            const readerPairing = /^\/academy\/api\/device\/pairings\/([0-9a-f-]+)$/iu.exec(pathname);
            if (readerPairing && request.method === 'PUT') {
                return deviceCorsResponse(await handleCompleteReaderDevicePairing(request, env, clock, readerPairing[1]));
            }
            const readerDevice = /^\/academy\/api\/account\/devices\/([0-9a-f-]+)$/iu.exec(pathname);
            if (readerDevice && request.method === 'DELETE') {
                return await handleAccountRevokeReaderDevice(request, env, clock(), readerDevice[1]);
            }
            // HEAD is a GET without a body, so it must reach the GET handler:
            // the switch below matches on literals like 'GET /academy/api/health'
            // and its default throws 404, which made every readable route in
            // this Worker answer HEAD with 404 while GET returned 200. Uptime
            // monitors, link checkers and prefetch all use HEAD, so the academy
            // API reported itself down to any of them while perfectly healthy.
            // The other Workers already fold HEAD into their read-method sets.
            const method = request.method === 'HEAD' ? 'GET' : request.method;
            const route = `${method} ${pathname}`;
            switch (route) {
                case 'POST /academy/api/session':
                    ctx.waitUntil(pruneRateWindows(env, clock).catch(() => undefined));
                    ctx.waitUntil(pruneLifecycleRecords(env, clock).catch(() => undefined));
                    return await handleCreateSession(request, env, clock);
                case 'GET /academy/api/session':
                    return await handleGetSession(request, env, clock);
                case 'GET /academy/api/session/status':
                    return await handleGetSessionStatus(request, env, clock);
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
                case 'POST /academy/api/auth/google/reader':
                    return await handleCreateReaderAccountSession(request, env, clock);
                case 'GET /academy/api/account':
                    return await handleGetAccount(request, env, clock);
                case 'PATCH /academy/api/account':
                    return await handlePatchAccount(request, env, clock);
                case 'GET /academy/api/account/devices':
                    return await handleListReaderDevices(request, env, clock());
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
                case 'POST /academy/api/device/pairings/claim':
                    ctx.waitUntil(pruneExpiredPairings(env, clock).catch(() => undefined));
                    return deviceCorsResponse(await handleClaimReaderDevicePairing(request, env, clock));
                case 'POST /academy/api/device/pairings':
                    ctx.waitUntil(pruneExpiredPairings(env, clock).catch(() => undefined));
                    return deviceCorsResponse(await handleCreateReaderDevicePairing(request, env, clock));
                case 'GET /academy/api/device/status':
                    return deviceCorsResponse(await handleGetDeviceStatus(request, env, clock()));
                case 'DELETE /academy/api/device':
                    return deviceCorsResponse(await handleRevokeDevice(request, env, clock()));
                case 'GET /academy/api/device/srs/pull':
                    return deviceCorsResponse(await handlePullReaderSrsEvents(request, env, clock));
                case 'POST /academy/api/device/srs/push':
                    return deviceCorsResponse(await handlePushReaderSrsEvents(request, env, clock));
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
                        service: 'yomu-academy',
                        status: 'ok',
                        apiBase: `${env.ACADEMY_ORIGIN}/academy/api`,
                        revision: serviceRevision(env),
                        // Kept for the deploy-proof tooling that already reads it.
                        workerVersionId: env.CF_VERSION_METADATA?.id ?? null,
                        artifactProof: 'cloudflare-version-modules-v1',
                    });
                default:
                    throw new HttpError(404, 'Not found.');
            }
        } catch (error) {
            const response = errorResponse(error);
            return deviceApi ? deviceCorsResponse(response) : response;
        }
    },
};

function deviceCorsResponse(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('access-control-allow-headers', 'authorization, content-type');
    headers.set('access-control-allow-methods', 'GET, PUT, POST, DELETE, OPTIONS');
    headers.set('access-control-max-age', '600');
    headers.set('cross-origin-resource-policy', 'cross-origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
