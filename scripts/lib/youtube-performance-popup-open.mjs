/**
 * Install a page-clock probe before lookup input is dispatched. The popup can
 * mount in the input turn and then trigger enough rendering work to delay the
 * profiler's next animation frame beyond its deadline; observing the mount
 * records what the learner saw instead of when Playwright next got a turn.
 *
 * This function is serialized into the page by Playwright, so it must remain
 * self-contained.
 */
export function installPopupOpenProbe() {
    const NativeMutationObserver = window.MutationObserver;
    let observer = null;

    window.__yomuProfileStartPopupOpenProbe = expected => {
        stopProbe();
        const probe = {
            startedAt: performance.now(),
            expected,
            seenAt: null,
            expectedAt: null,
            wrongAt: null,
            wrongText: '',
            text: '',
        };
        window.__yomuProfileHoverProbe = probe;
        observer = new NativeMutationObserver(sample);
        observer.observe(document, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
        });
        sample();
        return probe.startedAt;
    };

    window.__yomuProfileStopPopupOpenProbe = stopProbe;

    function stopProbe() {
        observer?.disconnect();
        observer = null;
    }

    function sample() {
        const probe = window.__yomuProfileHoverProbe;
        if (!probe) return;
        const popover = [...document.querySelectorAll('.jpdb-reader-popover')].find(isRenderedPopover) ?? null;
        if (!popover) return;
        const now = performance.now();
        const text = normalizedText(popover);
        const headwordText = normalizedText(popover.querySelector('[data-yomu-headword]'));
        recordFirstSeen(probe, now, text);
        recordWrongHeadword(probe, now, headwordText);
        recordExpectedHeadword(probe, now, headwordText, text);
    }

    function recordFirstSeen(probe, now, text) {
        if (probe.seenAt === null) {
            probe.seenAt = now;
            probe.text = text.slice(0, 120);
        }
    }

    function recordWrongHeadword(probe, now, headwordText) {
        if (!headwordText) return;
        if (headwordText.includes(probe.expected)) return;
        if (probe.wrongAt !== null) return;
        probe.wrongAt = now;
        probe.wrongText = headwordText.slice(0, 120);
    }

    function recordExpectedHeadword(probe, now, headwordText, text) {
        if (!headwordText.includes(probe.expected)) return;
        if (probe.expectedAt !== null) return;
        probe.expectedAt = now;
        probe.text = text.slice(0, 120);
        stopProbe();
    }

    function isRenderedPopover(popover) {
        const style = getComputedStyle(popover);
        return !popover.hidden
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && popover.getClientRects().length > 0;
    }

    function normalizedText(node) {
        return node?.textContent?.replace(/\s+/gu, '') ?? '';
    }
}
