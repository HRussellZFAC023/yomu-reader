// What screen readers hear while OCR reads images.
//
// An OCR Status Indicator is a small mark with no text, so a page scanning ten
// images does not narrate ten "Scanning..." / "Text ready" pairs. Indicators
// report here instead: one polite live region says that scanning started, then
// the outcome once a run of scans settles, and never the same message twice running.

// Scanning waits a beat: a cached result then never announces a scan at all, and a
// region created for this message is in the accessibility tree before its text lands.
const SCANNING_DELAY_MS = 150;
// An outcome waits for the next queued image to start, so a run of scans ends in one outcome.
const OUTCOME_DELAY_MS = 600;

export class OcrStatusAnnouncer {
    private region: HTMLElement | undefined;
    private spoken = '';
    private timer = 0;

    /** Say `message` once; an outcome (anything but scanning) is held until scans stop starting. */
    announce(message: string, outcome: boolean): void {
        this.region ??= createRegion();
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.speak(message), outcome ? OUTCOME_DELAY_MS : SCANNING_DELAY_MS);
    }

    remove(): void {
        window.clearTimeout(this.timer);
        this.region?.remove();
        this.region = undefined;
        this.spoken = '';
    }

    private speak(message: string): void {
        if (!this.region || message === this.spoken) return;
        this.spoken = message;
        this.region.textContent = message;
    }
}

function createRegion(): HTMLElement {
    const region = document.createElement('div');
    region.className = 'jpdb-reader-sr-only jpdb-ocr-status-announcer';
    region.dataset.jpdbReaderRoot = 'true';
    region.dataset.jpdbReaderSurfaceIgnore = 'true';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
    return region;
}
