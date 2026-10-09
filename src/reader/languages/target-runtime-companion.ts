import { yomuLearningTargetRuntime } from '../companions/registry';
import type { LearningTargetModule } from './types';

// The Japanese Adapter (deinflector, grammar) lives in the settings companion,
// so the size-limited core reaches it through the registry.
function runtime() {
    const targetRuntime = yomuLearningTargetRuntime();
    if (!targetRuntime) throw new Error('Yomu learning-target runtime did not load.');
    return targetRuntime;
}

export function activeLearningTarget(): LearningTargetModule {
    return runtime().activeLearningTarget();
}

export function activeLearningTargetLanguage(): string {
    return runtime().activeLearningTargetLanguage();
}
