import { createActivityRuntime, type ValidationIssue } from '../../domain/activity-runtime';
import { createN2OpeningPlugin } from '../n2-opening-kit';
import { N2_MOVING_COUPON_PROVENANCE } from './source';
import { N2_MOVING_COUPON_ACTIVITY_KIND, N2_MOVING_COUPON_PACKAGE_ID, type N2MovingCouponModel } from './types';

const contract = Object.freeze({
    kind: N2_MOVING_COUPON_ACTIVITY_KIND,
    packageId: N2_MOVING_COUPON_PACKAGE_ID,
    order: 3 as const,
    sourceDelivery: 'reference-only' as const,
    validateProvenance(model: N2MovingCouponModel): readonly ValidationIssue[] {
        return JSON.stringify(model.provenance) === JSON.stringify(N2_MOVING_COUPON_PROVENANCE)
            ? [] : [{ path: 'provenance', message: 'The exact Sou Matome N2 reading locus is required.' }];
    },
});
export const n2MovingCouponPlugin = createN2OpeningPlugin<N2MovingCouponModel>(contract);
export const validateN2MovingCoupon = n2MovingCouponPlugin.validate;
export function createN2MovingCouponRuntime() { return createActivityRuntime([n2MovingCouponPlugin]); }
