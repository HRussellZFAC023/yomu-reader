type SourceStateToggleHandler = (details: HTMLDetailsElement) => void;

export function installDictionarySourceTracking(popover: HTMLElement, remember: SourceStateToggleHandler): void {
    if (popover.dataset.jpdbReaderSourceTrackingInstalled === 'true') return;
    popover.dataset.jpdbReaderSourceTrackingInstalled = 'true';

    popover.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        const summary = target?.closest<HTMLElement>('summary.jpdb-reader-local-title');
        const details = summary?.parentElement instanceof HTMLDetailsElement ? summary.parentElement : null;
        if (!summary || !details || !popover.contains(summary) || !details.dataset.sourceStateKey) return;
        if (details.dataset.immersionEmpty !== 'true') return;
        event.preventDefault();
        event.stopPropagation();
    });
    popover.addEventListener('toggle', event => {
        const details = event.target instanceof HTMLDetailsElement ? event.target : null;
        if (!details?.dataset.sourceStateKey) return;
        if (details.dataset.immersionEmpty === 'true') {
            if (details.open) details.open = false;
            return;
        }
        remember(details);
    }, true);
}
