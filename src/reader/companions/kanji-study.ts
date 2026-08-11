import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient } from '../kanji/origin';
import { buildRtkComponentSummaries, renderKanjiKeywordLine, renderRtkInfo } from '../popup/rtk-info';
import { installOriginGraphInteractions } from '../popup/origin-graph-interactions';
import { JpdbKanjiClient } from '../jpdb/jpdb-kanji';
import { KanjiVGClient } from '../kanji/vg';
import { ImmersionKitClient } from '../immersion/kit';
import { ImmersionPopoverController } from '../immersion/popover-controller';
import { registerYomuCompanion } from './registry';
import { renderJpdbKanjiInfo, renderJpdbKanjiMiningControls } from '../popup/jpdb-kanji-info';
import { renderKanjiOriginGraph } from '../popup/origin-graph';
import { renderKanjiOrigins } from '../popup/kanji-origin';
import { renderKanjiPractice } from '../popup/kanji-practice';
import { installKanjiPracticeDoodle } from '../kanji/practice-grader';
import { RtkClient } from '../kanji/rtk';
import {
    detectGrammarHints,
    listLocalGrammarRuleExamples,
    listLocalGrammarRules,
    preloadGrammarResources,
    preloadTargetSentenceTranslation,
    renderGrammarHints,
    resetGrammarRuleDataCacheForTests,
    setGrammarRuleKnown,
    setKnownGrammarVisible,
    translateTargetSentence,
} from '../study/tools-impl';
import { handleStudyGrammarAction, renderStudyToolResult } from '../study/render-impl';
import { openDeckPickerForCardAdd, setMiningControlsExpanded, toggleMiningControls } from '../study/mining-controls-impl';
import { updateKanjiMiningControlsMount } from '../kanji/mining-controls-impl';
import {
    contextLabel,
    createFallbackMiningContext,
    immersionContextFromElement,
    immersionContextFromExample,
    inferMiningSourceKind,
    loadMiningContext,
    normalizeMiningSentence,
    pageMiningContext,
    resolveMiningContext,
    saveMiningContext,
} from '../study/mining-context';
import { StudySourceController } from '../study/sources';
import {
    jitenKanjiOriginFactLabels,
    renderJitenKanjiInfo,
    renderJitenKanjiKeywordLine,
} from '../jiten/jiten-kanji-info-render';
import { filterJitenKanjiWords, loadMoreJitenKanjiWords } from '../jiten/jiten-kanji-words-actions';

registerYomuCompanion('kanjiStudy', {
    ImmersionKitClient,
    ImmersionPopoverController,
    KanjiOriginClient,
    KanjiVGClient,
    RtkClient,
    JpdbKanjiClient,
    renderKanjiOriginGraph,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiPractice,
    installKanjiPracticeDoodle,
    renderKanjiOrigins,
    buildRtkComponentSummaries,
    renderKanjiKeywordLine,
    renderRtkInfo,
    installOriginGraphInteractions,
    buildKanjiFacts,
    buildKanjiOriginGraph,
    resetGrammarRuleDataCacheForTests,
    listLocalGrammarRuleExamples,
    listLocalGrammarRules,
    detectGrammarHints,
    preloadGrammarResources,
    preloadTargetSentenceTranslation,
    setGrammarRuleKnown,
    setKnownGrammarVisible,
    translateTargetSentence,
    renderGrammarHints,
    renderStudyToolResult,
    handleStudyGrammarAction,
    toggleMiningControls,
    setMiningControlsExpanded,
    openDeckPickerForCardAdd,
    updateKanjiMiningControlsMount,
    normalizeMiningSentence,
    inferMiningSourceKind,
    createFallbackMiningContext,
    resolveMiningContext,
    saveMiningContext,
    loadMiningContext,
    immersionContextFromExample,
    immersionContextFromElement,
    pageMiningContext,
    contextLabel,
    StudySourceController,
    renderJitenKanjiInfo,
    renderJitenKanjiKeywordLine,
    jitenKanjiOriginFactLabels,
    filterJitenKanjiWords,
    loadMoreJitenKanjiWords,
});
