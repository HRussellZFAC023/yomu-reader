import { createAdaptiveLearnerModel } from './adaptive-learner-model';
import type { LearnerModelPlugin } from './contracts';

export interface LearnerModelRegistry {
    readonly ids: readonly string[];
    resolve(id: string): LearnerModelPlugin;
}

export function createLearnerModelRegistry(plugins: readonly LearnerModelPlugin[]): LearnerModelRegistry {
    const entries = new Map<string, LearnerModelPlugin>();
    plugins.forEach(plugin => {
        if (!plugin.id.trim() || plugin.id !== plugin.id.trim()) {
            throw new TypeError('Learner-model plugin id must be stable non-empty text without surrounding whitespace.');
        }
        if (entries.has(plugin.id)) throw new Error(`Duplicate learner-model plugin: ${plugin.id}`);
        entries.set(plugin.id, plugin);
    });
    const ids = [...entries.keys()].sort();
    return {
        ids,
        resolve(id) {
            const plugin = entries.get(id);
            if (!plugin) throw new Error(`Unknown learner-model plugin: ${id}`);
            return plugin;
        },
    };
}

export const ACADEMY_LEARNER_MODELS = createLearnerModelRegistry([createAdaptiveLearnerModel()]);
