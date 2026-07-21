export const SUPPORT_DONATION_URL = 'https://support.yomureader.com/donate';

type OpenExternal = (url: string, target: string, features: string) => unknown;

export interface SupportDonationService {
    open(): void;
}

/**
 * Checkout belongs to the support service. Keeping this navigation synchronous
 * with the learner's click avoids popup blockers while noopener/noreferrer
 * isolates Academy from the new tab.
 */
export function createSupportDonationService(
    openExternal: OpenExternal = (url, target, features) => window.open(url, target, features),
): SupportDonationService {
    return {
        open() {
            void openExternal(SUPPORT_DONATION_URL, '_blank', 'noopener,noreferrer');
        },
    };
}
