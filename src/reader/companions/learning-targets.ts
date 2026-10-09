import { activeLearningTarget, activeLearningTargetLanguage } from '../languages/target-runtime';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('learningTargets', {
    activeLearningTarget,
    activeLearningTargetLanguage,
});
