/**
 * Splits Long Tasks API entries at a boundary on the page clock.
 *
 * One entry is one event-loop task, and a classic script runs the microtasks it
 * queued inside the task that evaluated it. So when a reader boots on a page
 * whose body already exists, the bundle's one-time parse/compile/evaluate and
 * the reader's async initialization share one entry. Clipping at the moment
 * evaluation ended keeps every millisecond after it (initialization, scanning,
 * annotation) in `after`, and leaves only the evaluation itself in `before`.
 */
export function splitLongTasksAt(tasks, boundary) {
    const before = [];
    const after = [];
    for (const { startTime, duration } of tasks) {
        const end = startTime + duration;
        if (startTime < boundary) before.push({ startTime, duration: Math.min(end, boundary) - startTime });
        if (end > boundary) {
            const start = Math.max(startTime, boundary);
            after.push({ startTime: start, duration: end - start });
        }
    }
    return { before, after };
}
