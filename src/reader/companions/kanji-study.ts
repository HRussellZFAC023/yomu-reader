import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient } from '../kanji/origin';
import { buildRtkComponentSummaries, renderKanjiKeywordLine, renderRtkInfo } from '../popup/rtk-info';
import { installOriginGraphInteractions } from '../popup/origin-graph-interactions';
import { JpdbKanjiClient } from '../jpdb/jpdb-kanji';
import { KanjiVGClient } from '../kanji/vg';
import { registerYomuCompanion } from './registry';
import { renderJpdbKanjiInfo, renderJpdbKanjiMiningControls } from '../popup/jpdb-kanji-info';
import { renderKanjiOriginGraph } from '../popup/origin-graph';
import { renderKanjiOrigins } from '../popup/kanji-origin';
import { renderKanjiPractice } from '../popup/kanji-practice';
import { installKanjiPracticeDoodle } from '../kanji/practice-grader';
import { RtkClient } from '../kanji/rtk';

registerYomuCompanion('kanjiStudy', {
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
});
