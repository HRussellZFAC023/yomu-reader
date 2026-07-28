import type { Clock, Env } from './env';
import {
    handlePaymentDeliveryClaim,
    handlePaymentDeliveryComplete,
    handlePendingPaymentDeliveries,
} from './payment-delivery';
import { handleAdminPaymentCode, handlePaymentClaim, handlePaymentIngress } from './payment-ingress';

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
    if (route === 'POST /academy/internal/payment-claim') {
        return handlePaymentClaim(request, env, clock());
    }
    if (route === 'POST /academy/internal/payment-delivery-claim') {
        return handlePaymentDeliveryClaim(request, env, clock());
    }
    if (route === 'POST /academy/internal/payment-delivery-complete') {
        return handlePaymentDeliveryComplete(request, env, clock());
    }
    if (route === 'POST /academy/internal/payment-delivery-pending') {
        return handlePendingPaymentDeliveries(request, env, clock());
    }
    return null;
}
