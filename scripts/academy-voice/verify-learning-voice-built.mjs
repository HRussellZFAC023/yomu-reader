#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const steps = [
    ['python3', ['scripts/academy-voice/render-learning-voice.py']],
    ['node', ['scripts/academy-voice/reconcile-learning-voice-evidence.mjs']],
    ['node', ['scripts/academy-voice/qa-learning-voice.mjs']],
    ['node', ['scripts/academy-voice/capture-learning-voice-local-expected.mjs']],
    ['node', ['scripts/academy-voice/lock-learning-voice.mjs']],
    ['node', ['scripts/academy-voice/learning-voice-local-browser-proof.mjs']],
    ['node', ['scripts/academy-voice/learning-voice-production-proof.mjs', '--dry-check']],
];

for (const [command, args] of steps) {
    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf8',
        stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Learning voice built-artifact verification passed without mutating committed evidence.');
