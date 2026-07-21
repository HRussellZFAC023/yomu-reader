import {
    createSupportDonationService,
    SUPPORT_DONATION_URL,
} from '../../src/academy/access/support-donation';

describe('Academy support donation navigation', () => {
    it('opens the canonical live support checkout in an isolated new tab', () => {
        const openExternal = vi.fn();

        createSupportDonationService(openExternal).open();

        expect(openExternal).toHaveBeenCalledWith(
            SUPPORT_DONATION_URL,
            '_blank',
            'noopener,noreferrer',
        );
        expect(SUPPORT_DONATION_URL).toBe('https://support.yomureader.com/donate');
    });
});
