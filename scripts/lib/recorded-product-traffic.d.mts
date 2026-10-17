export type ProductTrafficVerdict = 'answered' | 'scan-order-gap' | 'other-build-outage';
export function productTrafficVerdict(
    subject: { recorded?: { product: string } | null; gmNetwork: string; productLabel?: string },
    report: { served: Record<string, number>; dropped: number },
): ProductTrafficVerdict;
