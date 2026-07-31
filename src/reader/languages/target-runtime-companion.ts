import { yomuLearningTargetRuntime } from '../companions/registry';
import type { LearningTargetModule } from './types';

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

export function adoptLearningTargetLanguage(value: unknown): LearningTargetModule {
    return runtime().adoptLearningTargetLanguage(value);
}

export function defaultLearningTargetModule(): LearningTargetModule {
    return runtime().defaultLearningTargetModule();
}

export function learningTargetModuleFor(language: unknown): LearningTargetModule | null {
    return runtime().learningTargetModuleFor(language);
}

export function normalizeLearningTargetLanguage(value: unknown): string {
    return runtime().normalizeLearningTargetLanguage(value);
}

export function registeredLearningTargetModules(): readonly LearningTargetModule[] {
    return runtime().registeredLearningTargetModules();
}
