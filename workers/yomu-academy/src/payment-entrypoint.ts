import type { ExecutionContext } from './cf';
import type { Env } from './env';
import { errorResponse } from './http';
import academy from './index';
import { handlePaymentRoute } from './payment-routes';

const clock = (): number => Date.now();

/** Thin ingress wrapper; the legacy Academy router remains unchanged. */
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const route = `${request.method} ${new URL(request.url).pathname}`;
        try {
            return await handlePaymentRoute(route, request, env, clock)
                ?? await academy.fetch(request, env, ctx);
        } catch (error) {
            return errorResponse(error);
        }
    },
};
