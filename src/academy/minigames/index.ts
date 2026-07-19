import { kanjiWritingActivityPlugin } from '../activities/kanji-writing';
import { choiceActivityPlugin } from '../activities/choice';
import { reportedMessageWorkshopPlugin } from '../content/lesson-l2-l27-reported-message-workshop';
import { followTheModelWorkshopPlugin } from '../content/lesson-l2-l28-follow-the-model-workshop';
import { considerateRecommendationPlugin } from '../content/lesson-l2-l35-considerate-recommendation';
import { youniGoalWorkshopPlugin } from '../content/lesson-l2-l36-youni-goal-workshop';
import { younarimasuChangeWorkshopPlugin } from '../content/lesson-l2-l36-younarimasu-change-workshop';
import { advancedImmersionPlugin } from '../content/advanced-immersion/plugin';
import { n1OpeningSequencePlugin } from '../content/n1-opening-sequence/plugin';
import { n1SoundDiscriminationPlugin } from '../content/n1-sound-discrimination/plugin';
import { n1ContrastInferencePlugin } from '../content/n1-contrast-inference/plugin';
import { n2ApartmentMovingPlugin } from '../content/n2-apartment-moving/plugin';
import { n2ExtensiveReadingPlugin } from '../content/n2-extensive-reading/plugin';
import { n2HomeLifeReaderPlugin } from '../content/n2-home-life-reader/plugin';
import { n2MovingCouponPlugin } from '../content/n2-moving-coupon/plugin';
import { n2MovingPriorityListeningPlugin } from '../content/n2-moving-priority-listening/plugin';
import { n2PolicyScopePlugin } from '../content/n2-policy-scope/plugin';
import { n2PpoiImpressionPlugin } from '../content/n2-ppoi-impression/plugin';
import { n3N4SleepBridgePlugin } from '../content/n3-n4-sleep-bridge/plugin';
import { n3PetHousingPlugin } from '../content/n3-pet-housing/plugin';
import { n3SourceOpeningPlugin } from '../content/n3-source-opening/plugin';
import { createActivityRuntime, type ActivityPlugin, type ActivityRuntime } from '../domain/activity-runtime';
import { adjectiveDescriptionWorkbookPlugin } from './adjective-description-workbook';
import { bankListeningClozePlugin } from './bank-listening-cloze';
import {
    dragSortPlugin,
    sequencePlugin,
    soundCheckPlugin,
    storyReaderPlugin,
    typedResponsePlugin,
} from './activity-kit';
import { classActivitySimulatorPlugin } from './class-activity-simulator';
import { clauseRailPlugin } from './clause-rail';
import { commuteComparisonLogPlugin } from './commute-comparison-log';
import { confirmationSignalPlugin } from './confirmation-signal';
import { completionRepairPlugin } from './completion-repair';
import { conversationListeningCheckPlugin } from './conversation-listening-check';
import { dailyRoutineWorkbookPlugin } from './daily-routine-workbook';
import { diaryListeningClozePlugin } from './diary-listening-cloze';
import { existenceLocationWorkbookPlugin } from './existence-location-workbook';
import { fridgeInventoryWorkbookPlugin } from './fridge-inventory-workbook';
import { frequencyLensPlugin } from './frequency-lens';
import { favorDirectionListeningPlugin } from './favor-direction-listening';
import { mealSurveyListeningPlugin } from './meal-survey-listening';
import { greetingWorksheetPlugin } from './greeting-worksheet';
import { kanaSoundMapPlugin } from './kana-sound-map';
import { kanaMasteryPlugin } from './kana-mastery';
import { katakanaColumnSortPlugin } from './katakana-column-sort';
import { katakanaFinalRowShelfPlugin } from './katakana-final-row-shelf';
import { katakanaRowSwitchboardPlugin } from './katakana-row-switchboard';
import { moodleListeningChoicePlugin } from './moodle-listening-choice';
import { experiencePostcardListeningPlugin } from './experience-postcard-listening';
import { holidayItineraryTapePlugin } from './holiday-itinerary-tape';
import { listeningHingePlugin } from './listening-hinge';
import { opinionTransformationPlugin } from './opinion-transformation';
import { occasionRoutePlugin } from './occasion-route';
import { nagaraWorkshopPlugin } from './nagara-workshop';
import { reasonChainPlugin } from './reason-chain';
import { stateInspectionPlugin } from './state-inspection';
import { particleSignalMixerPlugin } from './particle-signal-mixer';
import { tokiThresholdPlugin } from './toki-threshold';
import { plainStyleMatrixPlugin } from './plain-style-matrix';
import { moodleListeningGridPlugin } from './moodle-listening-grid';
import { minnaTrueFalseListeningPlugin } from './minna-true-false-listening';
import { katakanaShapeRelayPlugin } from './katakana-shape-relay';
import { katakanaTwoRowAudioRoutePlugin } from './katakana-two-row-audio-route';
import { museumLocationWorkbookPlugin } from './museum-location-workbook';
import { n2EventInformationPlugin } from './n2-event-information';
import { objectDistanceBoardPlugin } from './object-distance-board';
import { phraseKarutaPlugin } from './phrase-karuta';
import { pictureVocabularyBoardPlugin } from './picture-vocabulary-board';
import { placeOwnerWorkbookPlugin } from './place-and-owner-workbook';
import { possessionPhraseBuilderPlugin } from './possession-phrase-builder';
import { preferenceWorkbookPlugin } from './preference-workbook';
import { profileBoardPlugin } from './profile-board';
import { profileQuestionMatchPlugin } from './profile-question-match';
import { reasonWorkbookPlugin } from './reason-workbook';
import { sentenceBuilderPlugin } from './sentence-builder';
import { shopCounterPlugin } from './shop-counter';
import { skillUnderstandingWorkbookPlugin } from './skill-understanding-workbook';
import { sourceVocabularySheetPlugin } from './source-vocabulary-sheet';
import { timeWorkbookPlugin } from './time-workbook';
import { weeklyPlanWorkbookPlugin } from './weekly-plan-workbook';

export const ACADEMY_ACTIVITY_PLUGINS: readonly ActivityPlugin[] = Object.freeze([
    choiceActivityPlugin,
    advancedImmersionPlugin,
    n1OpeningSequencePlugin,
    n1SoundDiscriminationPlugin,
    n1ContrastInferencePlugin,
    n2ExtensiveReadingPlugin,
    n2ApartmentMovingPlugin,
    n2PpoiImpressionPlugin,
    n2MovingCouponPlugin,
    n2HomeLifeReaderPlugin,
    n2MovingPriorityListeningPlugin,
    n2PolicyScopePlugin,
    n3SourceOpeningPlugin,
    n3N4SleepBridgePlugin,
    n3PetHousingPlugin,
    adjectiveDescriptionWorkbookPlugin,
    bankListeningClozePlugin,
    typedResponsePlugin,
    soundCheckPlugin,
    dragSortPlugin,
    sequencePlugin,
    storyReaderPlugin,
    classActivitySimulatorPlugin,
    clauseRailPlugin,
    commuteComparisonLogPlugin,
    confirmationSignalPlugin,
    completionRepairPlugin,
    conversationListeningCheckPlugin,
    dailyRoutineWorkbookPlugin,
    diaryListeningClozePlugin,
    existenceLocationWorkbookPlugin,
    fridgeInventoryWorkbookPlugin,
    frequencyLensPlugin,
    favorDirectionListeningPlugin,
    mealSurveyListeningPlugin,
    greetingWorksheetPlugin,
    kanjiWritingActivityPlugin,
    kanaSoundMapPlugin,
    kanaMasteryPlugin,
    katakanaColumnSortPlugin,
    katakanaFinalRowShelfPlugin,
    katakanaRowSwitchboardPlugin,
    katakanaShapeRelayPlugin,
    katakanaTwoRowAudioRoutePlugin,
    moodleListeningChoicePlugin,
    experiencePostcardListeningPlugin,
    holidayItineraryTapePlugin,
    listeningHingePlugin,
    opinionTransformationPlugin,
    occasionRoutePlugin,
    nagaraWorkshopPlugin,
    reasonChainPlugin,
    reportedMessageWorkshopPlugin,
    followTheModelWorkshopPlugin,
    considerateRecommendationPlugin,
    youniGoalWorkshopPlugin,
    younarimasuChangeWorkshopPlugin,
    stateInspectionPlugin,
    particleSignalMixerPlugin,
    tokiThresholdPlugin,
    plainStyleMatrixPlugin,
    moodleListeningGridPlugin,
    minnaTrueFalseListeningPlugin,
    museumLocationWorkbookPlugin,
    n2EventInformationPlugin,
    objectDistanceBoardPlugin,
    phraseKarutaPlugin,
    pictureVocabularyBoardPlugin,
    placeOwnerWorkbookPlugin,
    possessionPhraseBuilderPlugin,
    preferenceWorkbookPlugin,
    profileBoardPlugin,
    profileQuestionMatchPlugin,
    reasonWorkbookPlugin,
    sentenceBuilderPlugin,
    shopCounterPlugin,
    skillUnderstandingWorkbookPlugin,
    sourceVocabularySheetPlugin,
    timeWorkbookPlugin,
    weeklyPlanWorkbookPlugin,
]);

export function createAcademyActivityRuntime(): ActivityRuntime {
    return createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS);
}

export * from './activity-kit';
export * from './adjective-description-workbook';
export * from './bank-listening-cloze';
export * from './class-activity-simulator';
export * from './clause-rail';
export * from './commute-comparison-log';
export * from './confirmation-signal';
export * from './completion-repair';
export * from './conversation-listening-check';
export * from './daily-routine-workbook';
export * from './diary-listening-cloze';
export * from './existence-location-workbook';
export * from './fridge-inventory-workbook';
export * from './frequency-lens';
export * from './favor-direction-listening';
export * from './meal-survey-listening';
export * from './greeting-worksheet';
export * from './kana-sound-map';
export * from './kana-mastery';
export * from './katakana-column-sort';
export * from './katakana-final-row-shelf';
export * from './katakana-row-switchboard';
export * from './katakana-shape-relay';
export * from './katakana-two-row-audio-route';
export * from './moodle-listening-choice';
export * from './experience-postcard-listening';
export * from './holiday-itinerary-tape';
export * from './listening-hinge';
export * from './opinion-transformation';
export * from './occasion-route';
export * from './nagara-workshop';
export * from './reason-chain';
export * from './state-inspection';
export * from './particle-signal-mixer';
export * from './toki-threshold';
export * from './plain-style-matrix';
export * from './moodle-listening-grid';
export * from './minna-true-false-listening';
export * from './museum-location-workbook';
export * from './n2-event-information';
export * from './object-distance-board';
export * from './phrase-karuta';
export * from './picture-vocabulary-board';
export * from './place-and-owner-workbook';
export * from './possession-phrase-builder';
export * from './preference-workbook';
export * from './profile-board';
export * from './profile-question-match';
export * from './reason-workbook';
export * from './time-workbook';
export * from './weekly-plan-workbook';
export * from './sentence-builder';
export * from './shop-counter';
export * from './skill-understanding-workbook';
export * from './source-vocabulary-sheet';
