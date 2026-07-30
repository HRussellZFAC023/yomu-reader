import {
    activeLearningTarget,
    activeLearningTargetLanguage,
    adoptLearningTargetLanguage,
    normalizeLearningTargetLanguage,
    registeredLearningTargetModules,
} from '../languages/target-runtime';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('learningTargets', {
    activeLearningTarget,
    activeLearningTargetLanguage,
    adoptLearningTargetLanguage,
    normalizeLearningTargetLanguage,
    registeredLearningTargetModules,
});
