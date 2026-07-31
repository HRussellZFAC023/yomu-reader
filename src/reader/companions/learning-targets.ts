import {
    activeLearningTarget,
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
    adoptLearningTargetLanguage,
    defaultLearningTargetModule,
    learningTargetModuleFor,
    normalizeLearningTargetLanguage,
    registeredLearningTargetModules,
} from '../languages/target-runtime';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('learningTargets', {
    activeLearningTarget,
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
    adoptLearningTargetLanguage,
    defaultLearningTargetModule,
    learningTargetModuleFor,
    normalizeLearningTargetLanguage,
    registeredLearningTargetModules,
});
