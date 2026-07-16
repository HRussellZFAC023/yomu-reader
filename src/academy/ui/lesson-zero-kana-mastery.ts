import {
    createKanaMasteryGate,
    createLessonZeroKanaMasteryModel,
    kanaMasteryPlugin,
    type KanaMasteryGate as LessonZeroKanaMasteryGate,
} from '../minigames/kana-mastery';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';

export function createLessonZeroKanaMasteryGate(options: Readonly<{
    language: 'en' | 'ja';
    onComplete(): void;
    onEvaluation?(evaluation: ActivityEvaluation): void | Promise<void>;
    random?: () => number;
}>): LessonZeroKanaMasteryGate {
    const model = createLessonZeroKanaMasteryModel();
    const runtime = createActivityRuntime([kanaMasteryPlugin]);
    return createKanaMasteryGate({
        language: options.language,
        model,
        random: options.random,
        onMastered(response) {
            return options.onEvaluation?.(runtime.evaluate(model, response));
        },
        onComplete: options.onComplete,
    });
}
