import { createN2MovingCouponPackage } from './package';
import { validateN2MovingCoupon } from './plugin';
import type { N2MovingCouponPackage } from './types';
const packageRecord = createN2MovingCouponPackage();
const issues = validateN2MovingCoupon(packageRecord.activity);
if (issues.length) throw new TypeError(`Invalid N2 moving-coupon package: ${issues.map(issue => issue.path).join(', ')}`);
export const N2_MOVING_COUPON_PACKAGES: readonly N2MovingCouponPackage[] = Object.freeze([packageRecord]);
export function resolveN2MovingCouponPackage(id: string): N2MovingCouponPackage {
    const found = N2_MOVING_COUPON_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 moving-coupon package: ${id}`);
    return found;
}
