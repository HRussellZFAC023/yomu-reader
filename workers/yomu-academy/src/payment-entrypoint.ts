import type { ExecutionContext, ScheduledController } from './cf';
import type { Env } from './env';
import { errorResponse } from './http';
import academy from './index';
import { handlePaymentRoute } from './payment-routes';
import { runScheduledLifecycleMaintenance } from './lifecycle';

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
    async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
        await runScheduledLifecycleMaintenance(env, clock);
    },
};
