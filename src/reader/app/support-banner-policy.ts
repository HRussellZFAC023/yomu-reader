const SUPPORT_BANNER_DAY_MS = 24 * 60 * 60 * 1000;

export const SUPPORT_BANNER_FIRST_QUIET_VISITS = 3;
export const SUPPORT_BANNER_VISIT_INTERVAL = 6;
export const SUPPORT_BANNER_IMPRESSION_COOLDOWN_MS = 14 * SUPPORT_BANNER_DAY_MS;
export const SUPPORT_BANNER_DISMISS_MS = 30 * SUPPORT_BANNER_DAY_MS;

interface SupportBannerPolicyState {
    version: string;
    visits: number;
    nextEligibleVisit: number;
    hiddenUntil: number;
    dismissedUntil: number;
    lastShownAt: number;
}

export interface SupportBannerPolicyOptions {
    storageKey: string;
    version: string;
    now?: number;
    storage?: Storage | null;
    firstQuietVisits?: number;
    visitInterval?: number;
    impressionCooldownMs?: number;
    dismissMs?: number;
}

const supportBannerPageDecisions = new Map<string, boolean>();

export function shouldShowSupportBannerImpression(options: SupportBannerPolicyOptions): boolean {
    const storage = supportBannerPolicyStorage(options.storage);
    if (!storage) return false;

    const key = supportBannerPageDecisionKey(options);
    const existingDecision = supportBannerPageDecisions.get(key);
    if (existingDecision !== undefined) return existingDecision;

    const now = policyNow(options);
    const state = readSupportBannerPolicyState(storage, options.storageKey, options.version);
    if (state.dismissedUntil > now) {
        supportBannerPageDecisions.set(key, false);
        return false;
    }

    state.visits += 1;
    const firstEligibleVisit = Math.max(0, Math.floor(options.firstQuietVisits ?? SUPPORT_BANNER_FIRST_QUIET_VISITS)) + 1;
    state.nextEligibleVisit = Math.max(state.nextEligibleVisit, firstEligibleVisit);

    const shouldShow = state.visits >= state.nextEligibleVisit && state.hiddenUntil <= now;
    if (shouldShow) {
        state.lastShownAt = now;
        state.hiddenUntil = now + Math.max(0, options.impressionCooldownMs ?? SUPPORT_BANNER_IMPRESSION_COOLDOWN_MS);
        state.nextEligibleVisit = state.visits + Math.max(1, Math.floor(options.visitInterval ?? SUPPORT_BANNER_VISIT_INTERVAL));
    }

    if (!writeSupportBannerPolicyState(storage, options.storageKey, state)) {
        supportBannerPageDecisions.set(key, false);
        return false;
    }

    supportBannerPageDecisions.set(key, shouldShow);
    return shouldShow;
}

export function rememberSupportBannerDismissal(options: SupportBannerPolicyOptions): void {
    const storage = supportBannerPolicyStorage(options.storage);
    const key = supportBannerPageDecisionKey(options);
    supportBannerPageDecisions.set(key, false);
    if (!storage) return;

    const now = policyNow(options);
    const state = readSupportBannerPolicyState(storage, options.storageKey, options.version);
    const dismissMs = Math.max(0, options.dismissMs ?? SUPPORT_BANNER_DISMISS_MS);
    const visitInterval = Math.max(1, Math.floor(options.visitInterval ?? SUPPORT_BANNER_VISIT_INTERVAL));
    state.dismissedUntil = now + dismissMs;
    state.hiddenUntil = Math.max(state.hiddenUntil, state.dismissedUntil);
    state.nextEligibleVisit = Math.max(state.nextEligibleVisit, state.visits + visitInterval);
    writeSupportBannerPolicyState(storage, options.storageKey, state);
}

export function resetSupportBannerPolicyMemoryForTests(): void {
    supportBannerPageDecisions.clear();
}

function supportBannerPolicyStorage(storage: Storage | null | undefined): Storage | null {
    if (storage !== undefined) return storage;
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function supportBannerPageDecisionKey(options: SupportBannerPolicyOptions): string {
    return `${options.storageKey}\n${options.version}`;
}

function policyNow(options: SupportBannerPolicyOptions): number {
    return typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
}

function readSupportBannerPolicyState(storage: Storage, storageKey: string, version: string): SupportBannerPolicyState {
    try {
        const raw = storage.getItem(storageKey);
        if (!raw) return freshSupportBannerPolicyState(version);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || parsed.version !== version) return freshSupportBannerPolicyState(version);
        return {
            version,
            visits: nonNegativeInteger(parsed.visits),
            nextEligibleVisit: nonNegativeInteger(parsed.nextEligibleVisit),
            hiddenUntil: nonNegativeTimestamp(parsed.hiddenUntil),
            dismissedUntil: nonNegativeTimestamp(parsed.dismissedUntil),
            lastShownAt: nonNegativeTimestamp(parsed.lastShownAt),
        };
    } catch {
        return freshSupportBannerPolicyState(version);
    }
}

function writeSupportBannerPolicyState(storage: Storage, storageKey: string, state: SupportBannerPolicyState): boolean {
    try {
        storage.setItem(storageKey, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}

function freshSupportBannerPolicyState(version: string): SupportBannerPolicyState {
    return {
        version,
        visits: 0,
        nextEligibleVisit: 0,
        hiddenUntil: 0,
        dismissedUntil: 0,
        lastShownAt: 0,
    };
}

function nonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function nonNegativeTimestamp(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
