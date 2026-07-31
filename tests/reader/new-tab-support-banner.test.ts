import { describe, expect, it } from 'vitest';
import { NewTabController } from '../../src/reader/newtab/controller';

interface SupportBannerInternals {
    dependencies: { getSettings(): { interfaceLanguage: 'ja' } };
    renderSupportBanner(banner: HTMLElement, status: unknown): void;
    shouldShowSupportBanner(status: unknown): boolean;
}

describe('new-tab support banner localization', () => {
    it('uses the Yomu UI language and structured currency values instead of remote English copy', () => {
        const controller = Object.create(NewTabController.prototype) as SupportBannerInternals;
        controller.dependencies = { getSettings: () => ({ interfaceLanguage: 'ja' }) };
        const banner = document.createElement('aside');

        controller.renderSupportBanner(banner, {
            donationGoalGbp: 10.2,
            donationsThisMonthGbp: 0,
            display: { amountText: '¥0', goalText: '¥2193' },
            providers: [{
                id: 'stripe',
                label: 'Card (Stripe)',
                url: 'https://support.yomureader.com/donate',
                enabled: true,
            }],
            banner: {
                enabled: true,
                dismissVersion: 'localized-test',
                message: 'Remote English message',
                costLabel: 'Donation goal: £10.20/month',
                goalLabel: 'This month: £0 / £10.20',
                ctaLabel: 'Donate',
                donateUrl: 'https://support.yomureader.com/donate',
            },
        });

        expect(banner.textContent).toContain('今月のご支援で、単語・シャドーイング向けの高速音声を運営します');
        expect(banner.textContent).toContain('月の運営費：¥2193');
        expect(banner.textContent).toContain('今月のご支援：¥0 / ¥2193');
        expect(banner.textContent).toContain('内訳');
        expect(banner.textContent).toContain('寄付');
        expect(banner.querySelector<HTMLAnchorElement>('.jpdb-reader-newtab-support-breakdown')?.href)
            .toBe('https://yomureader.com/support#monthly-running-costs');
        expect(banner.querySelector<HTMLAnchorElement>('[data-support-provider="stripe"]')?.href).toBe(
            'https://support.yomureader.com/donate',
        );
        expect(banner.textContent).not.toContain('Remote English message');
        expect(banner.textContent).not.toContain('Donation goal');
    });

    it('keeps the banner hidden when the Worker reports no ready provider', () => {
        const controller = Object.create(NewTabController.prototype) as SupportBannerInternals;
        controller.dependencies = { getSettings: () => ({ interfaceLanguage: 'ja' }) };

        expect(controller.shouldShowSupportBanner({
            banner: {
                enabled: true,
                donateUrl: 'https://support.yomureader.com/donate',
            },
            providers: [],
        })).toBe(false);
    });

    it('keeps the banner hidden when a provider exists but the Worker omits its goal', () => {
        const controller = Object.create(NewTabController.prototype) as SupportBannerInternals;
        controller.dependencies = { getSettings: () => ({ interfaceLanguage: 'ja' }) };

        expect(controller.shouldShowSupportBanner({
            banner: { enabled: true },
            providers: [{
                id: 'stripe',
                url: 'https://support.yomureader.com/donate',
                enabled: true,
            }],
        })).toBe(false);
    });
});
