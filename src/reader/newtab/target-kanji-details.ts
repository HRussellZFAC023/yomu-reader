import type { YomitanKanjiEntry } from '../dictionaries/yomitan';
import type { JitenKanjiInfo } from '../dictionaries/jiten';
import type { JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { KanjiSourceInfo } from '../kanji/origin';
import type { RtkInfo } from '../kanji/rtk';
import type { KanjiVGInfo } from '../kanji/vg';

export interface KanjiLookupDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    jitenInfo: Promise<JitenKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
    kanjiVGInfo: Promise<KanjiVGInfo | null>;
    kanjiSourceInfo: Promise<KanjiSourceInfo | null>;
}

export function emptyKanjiLookupDetailPromises(): KanjiLookupDetailPromises {
    return {
        jpdbInfo: Promise.resolve(null),
        jitenInfo: Promise.resolve(null),
        kanjiEntries: Promise.resolve([]),
        rtkInfo: Promise.resolve(null),
        kanjiVGInfo: Promise.resolve(null),
        kanjiSourceInfo: Promise.resolve(null),
    };
}
