// How far to trust what the product painted on a replayed load, from how the
// recorded product traffic answered its GM requests (docs/dev/recorded-pages.md,
// Limits of a replay).
//
//   'answered'            the replay answered the product; judge what it painted
//   'scan-order-gap'      the build the traffic was recorded from took a scan
//                         order the recording does not hold: load it again
//   'other-build-outage'  another build asked mostly for answers the recording
//                         does not hold: its readings measure an outage

// More dropped answers than this is a gap, not a rare request left out.
const PRODUCT_TRAFFIC_DROP_LIMIT = 2;

/**
 * recorded: the manifest's productTraffic (or undefined); productLabel: the
 * replayed build's label; report: { served, dropped } from the run.
 */
export function productTrafficVerdict(subject, { served, dropped }) {
    if (!droppedReplayAnswers(subject, dropped)) return 'answered';
    if (subject.productLabel === subject.recorded.product) return 'scan-order-gap';
    return mostlyDropped(served, dropped) ? 'other-build-outage' : 'answered';
}

function droppedReplayAnswers({ recorded, gmNetwork }, dropped) {
    return [gmNetwork === 'replay', Boolean(recorded), dropped > PRODUCT_TRAFFIC_DROP_LIMIT].every(Boolean);
}

function mostlyDropped(served, dropped) {
    const asked = Object.values(served).reduce((sum, count) => sum + count, 0);
    return dropped * 2 > asked;
}
