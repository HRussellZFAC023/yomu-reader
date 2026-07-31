import type { InterfaceLanguage } from '../app/types';
import {
    rememberSupportBannerDismissal,
    shouldShowSupportBannerImpression,
} from '../app/support-banner-policy';
import { newTabText } from './i18n';

export interface NewTabSupportStatus {
    goalMet?: boolean;
    donationGoalGbp?: number;
    donationsTodayGbp?: number;
    donationsThisMonthGbp?: number;
    estimatedMonthlyCostGbp?: number;
    donateUrl?: string;
    providers?: Array<{
        id?: string;
        label?: string;
        url?: string;
        enabled?: boolean;
    }>;
    display?: {
        currency?: string;
        amount?: number;
        goal?: number;
        amountText?: string;
        goalText?: string;
    };
    banner?: {
        enabled?: boolean;
        dismissVersion?: string;
        message?: string;
        costLabel?: string;
        goalLabel?: string;
        ctaLabel?: string;
        donateUrl?: string;
    };
}

const NEW_TAB_SUPPORT_BANNER_DISMISSED_KEY = 'yomu-newtab-support-banner-dismissed';

export function newTabSupportMeta(status: NewTabSupportStatus, language: InterfaceLanguage): string {
    const goalValue = status.display?.goal
        ?? status.donationGoalGbp
        ?? status.estimatedMonthlyCostGbp;
    const goalText = status.display?.goalText
        || (typeof goalValue === 'number' && Number.isFinite(goalValue)
            ? formatNewTabSupportCurrency(goalValue, status.display?.currency ?? 'GBP')
            : '');
    const amountText = status.display?.amountText
        || formatNewTabSupportCurrency(
            status.display?.amount
                ?? status.donationsThisMonthGbp
                ?? status.donationsTodayGbp
                ?? 0,
            status.display?.currency ?? 'GBP',
        );
    const cost = newTabText(language, 'supportBannerCost').replace('{amount}', goalText);
    const goal = newTabText(language, 'supportBannerGoal')
        .replace('{current}', amountText)
        .replace('{goal}', goalText);
    return `${cost} · ${goal}`;
}

export function newTabReadySupportProviders(
    status: NewTabSupportStatus,
): Array<NonNullable<NewTabSupportStatus['providers']>[number] & { url: string }> {
    return (status.providers ?? []).flatMap(provider => {
        if (!provider?.enabled) return [];
        const url = safeNewTabSupportUrl(provider.url);
        return url ? [{ ...provider, url }] : [];
    });
}

export function newTabSupportGoalAvailable(status: NewTabSupportStatus): boolean {
    if (typeof status.display?.goalText === 'string' && status.display.goalText.trim()) return true;
    if (typeof status.display?.goal === 'number' && Number.isFinite(status.display.goal)) return true;
    return [status.donationGoalGbp, status.estimatedMonthlyCostGbp]
        .some(value => typeof value === 'number' && Number.isFinite(value));
}

export function newTabSupportDismissVersion(status: NewTabSupportStatus): string {
    return status.banner?.dismissVersion || 'ultimate-audio-monthly-v1';
}

export function shouldShowNewTabSupportBannerImpression(version: string): boolean {
    return shouldShowSupportBannerImpression({
        storageKey: NEW_TAB_SUPPORT_BANNER_DISMISSED_KEY,
        version,
    });
}

export function rememberNewTabSupportBannerDismissal(version: string): void {
    rememberSupportBannerDismissal({
        storageKey: NEW_TAB_SUPPORT_BANNER_DISMISSED_KEY,
        version,
    });
}

function safeNewTabSupportUrl(candidate: string | undefined): string | null {
    if (!candidate) return null;
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function formatNewTabSupportCurrency(value: number, currency: string): string {
    const rounded = Math.round(value);
    try {
        return new Intl.NumberFormat(navigator.language || 'en-GB', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} ${currency}`;
    }
}
