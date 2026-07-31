import {
    activeLearningTarget,
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
    activeLearningTargetLanguage,
    adoptLearningTargetLanguage,
    defaultLearningTargetModule,
    learningTargetModuleFor,
    normalizeLearningTargetLanguage,
    registeredLearningTargetModules,
});
