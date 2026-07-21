import { describe, expect, it } from 'vitest';
import { NewTabController } from '../../src/reader/newtab/controller';

interface SupportBannerInternals {
    dependencies: { getSettings(): { interfaceLanguage: 'ja' } };
    renderSupportBanner(banner: HTMLElement, status: unknown): void;
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

        expect(banner.textContent).toContain('よむのUltimate Audioは寄付で運用されています');
        expect(banner.textContent).toContain('寄付目標：月¥2193');
        expect(banner.textContent).toContain('今月：¥0 / ¥2193');
        expect(banner.textContent).toContain('寄付');
        expect(banner.textContent).not.toContain('Remote English message');
        expect(banner.textContent).not.toContain('Donation goal');
    });
});
