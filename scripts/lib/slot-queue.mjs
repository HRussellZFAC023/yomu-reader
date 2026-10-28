// Capacity may increase when another gate lane releases its reserved slots.
// Every task runs exactly once; rejected tasks remain visible to the caller.
export async function runSlotQueue(tasks, capacity, execute) {
    const pending = [...tasks];
    const results = [];
    let active = 0;
    await new Promise(resolve => {
        let timer;
        const pump = () => {
            const limit = Math.max(1, Math.floor(capacity()));
            while (pending.length && active < limit) {
                const task = pending.shift();
                active++;
                Promise.resolve().then(() => execute(task)).then(
                    value => results.push({ status: 'fulfilled', value }),
                    reason => results.push({ status: 'rejected', reason }),
                ).finally(() => { active--; pump(); });
            }
            if (!pending.length && !active) { clearInterval(timer); resolve(); }
        };
        timer = setInterval(pump, 50);
        pump();
    });
    return results;
}
