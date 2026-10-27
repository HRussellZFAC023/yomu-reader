import { execFileSync } from 'node:child_process';
import { availableParallelism, freemem, totalmem } from 'node:os';

const MB = 1024 ** 2;
export function reclaimableMacMemory(text) {
    const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
    if (!pageSize) return 0;
    return ['free', 'inactive', 'speculative'].reduce((bytes, kind) =>
        bytes + Number(new RegExp(`Pages ${kind}:\\s+(\\d+)`).exec(text)?.[1] ?? 0) * pageSize, 0);
}

export function workerBudget({ cores = availableParallelism(), available, total = totalmem() } = {}) {
    if (available === undefined) {
        available = freemem();
        if (process.platform === 'darwin') {
            try { available = reclaimableMacMemory(execFileSync('/usr/bin/vm_stat', { encoding: 'utf8', timeout: 2000 })); } catch { /* use freemem */ }
        }
    }
    // Inactive file-backed pages are reclaimable; loadavg on macOS counts I/O
    // and compressor waits and is not a measure of available CPU cores.
    const memoryWorkers = Math.floor(Math.max(0, Math.min(available, total * 0.75) - 1024 * MB) / (768 * MB));
    return Math.max(1, Math.min(cores, memoryWorkers));
}
