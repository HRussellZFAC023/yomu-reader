import { JpdbKanjiClient } from '../jpdb/jpdb-kanji';
import { KanjiOriginClient } from '../kanji/origin';
import { KanjiVGClient } from '../kanji/vg';
import { renderKanjiOriginGraph } from '../popup/origin-graph';
import { RtkClient } from '../kanji/rtk';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('kanjiStudy', {
    KanjiOriginClient,
    KanjiVGClient,
    RtkClient,
    JpdbKanjiClient,
    renderKanjiOriginGraph,
});
