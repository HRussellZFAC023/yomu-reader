import type { Clock, Env } from './env';
import { handleAdminPaymentCode, handlePaymentIngress } from './payment-ingress';

/** Keep payment ingress out of the legacy Academy fetch router's branch count. */
export async function handlePaymentRoute(
    route: string,
    request: Request,
    env: Env,
    clock: Clock,
): Promise<Response | null> {
    if (route === 'POST /academy/api/admin/payment-code') {
        return handleAdminPaymentCode(request, env, clock());
    }
    if (route === 'POST /academy/internal/payment-ingress') {
        return handlePaymentIngress(request, env, clock());
    }
    return null;
}
