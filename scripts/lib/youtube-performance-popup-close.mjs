/**
 * Install the popup-close clock inside the page before the driver dispatches
 * Escape. Keeping the clock, DOM observer, and deadline in one realm prevents a
 * congested renderer from losing a successful close to Playwright's wall timer.
 *
 * This function is serialized by Playwright, so it must remain self-contained.
 */
export function installPopupCloseProbe(deadlineMs) {
    const renderedPopovers = () =>
        [...document.querySelectorAll('.jpdb-reader-popover')].filter(popover => {
            const style = getComputedStyle(popover);
            return !popover.hidden && style.display !== 'none' && style.visibility !== 'hidden' && popover.getClientRects().length > 0;
        });
    const state = {
        attempted: renderedPopovers().length > 0,
        armedAt: performance.now(),
        escapeAt: null,
        removedAt: null,
        settledAt: null,
        deadlineMs,
        visibleAtSettle: null,
        longTasks: [],
    };
    let settle;
    let settled = false;
    let deadlineTimer = 0;
    let settleTimer = 0;
    let domObserver = null;
    let longTaskObserver = null;
    const completion = new Promise(resolve => {
        settle = resolve;
    });

    const recordLongTasks = entries => {
        for (const entry of entries) {
            state.longTasks.push({
                startTime: Math.round(entry.startTime * 10) / 10,
                duration: Math.round(entry.duration * 10) / 10,
            });
        }
    };
    const snapshot = () => ({
        ...state,
        latencyMs:
            typeof state.escapeAt === 'number' && typeof state.removedAt === 'number'
                ? Math.round((state.removedAt - state.escapeAt) * 10) / 10
                : null,
        longTasks: [...state.longTasks],
    });
    const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(deadlineTimer);
        window.clearTimeout(settleTimer);
        document.removeEventListener('keydown', onKeydown, true);
        domObserver?.disconnect();
        if (longTaskObserver) {
            recordLongTasks(longTaskObserver.takeRecords());
            longTaskObserver.disconnect();
        }
        state.settledAt = performance.now();
        state.visibleAtSettle = renderedPopovers().length;
        settle(snapshot());
    };
    const recordRemoval = () => {
        if (state.escapeAt === null || renderedPopovers().length > 0) return false;
        if (state.removedAt === null) state.removedAt = performance.now();
        // Let the PerformanceObserver deliver the task containing dismissal.
        if (!settleTimer) settleTimer = window.setTimeout(finish, 0);
        return true;
    };
    function onKeydown(event) {
        if (event.key !== 'Escape' || state.escapeAt !== null) return;
        state.escapeAt = performance.now();
        deadlineTimer = window.setTimeout(() => {
            if (!recordRemoval()) finish();
        }, deadlineMs);
    }

    window.__yomuProfilePopupCloseProbe = { completion, snapshot };
    if (!state.attempted) {
        finish();
        return snapshot();
    }
    document.addEventListener('keydown', onKeydown, true);
    domObserver = new MutationObserver(recordRemoval);
    domObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'style'],
        childList: true,
        subtree: true,
    });
    if (
        typeof PerformanceObserver === 'function' &&
        Array.isArray(PerformanceObserver.supportedEntryTypes) &&
        PerformanceObserver.supportedEntryTypes.includes('longtask')
    ) {
        longTaskObserver = new PerformanceObserver(list => recordLongTasks(list.getEntries()));
        longTaskObserver.observe({ entryTypes: ['longtask'] });
    }
    return snapshot();
}

export function popupCloseFailure(observation, deadlineMs) {
    if (!observation?.attempted) return null;
    if (typeof observation.escapeAt !== 'number') return 'Escape did not reach the page close probe.';
    if (typeof observation.removedAt !== 'number') {
        return `Popup remained visible after the ${deadlineMs}ms page-clock deadline.`;
    }
    if (observation.removedAt - observation.escapeAt > deadlineMs) {
        return `Popup removal took ${observation.latencyMs}ms, exceeding the ${deadlineMs}ms page-clock deadline.`;
    }
    return null;
}
