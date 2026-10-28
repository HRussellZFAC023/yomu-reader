import v8 from 'node:v8';
import { createForksRpcOptions, runBaseTests, runVitestWorker, unwrapSerializableConfig } from 'vitest/workers';

// A new worker state and environment for every file. Vitest's module cache is
// retained only inside a reviewed Node/Academy job with isolate set to false.
export async function run(task) {
    const bytes = Buffer.from(task.configBytes, 'base64');
    for (const [index, file] of task.files.entries()) {
        await runVitestWorker({ ...task, config: v8.deserialize(bytes), files: [file], workerId: task.workerIds[index] });
    }
}
export default {
    getRpcOptions: () => createForksRpcOptions(v8),
    async runTests(state) {
        const exit = process.exit;
        state.ctx.config = unwrapSerializableConfig(state.ctx.config);
        try { await runBaseTests(state); } finally { process.exit = exit; }
    },
};
