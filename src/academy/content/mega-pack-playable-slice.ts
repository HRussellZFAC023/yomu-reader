import type { LocalizedText } from '../domain/source-library';
import { createMegaPackMaterialsBeats } from './mega-pack-materials';
import type { MegaPackActivityBeat, MegaPackPlayableChapterId } from './mega-pack-provenance';
import { createMegaPackReaderBeat } from './mega-pack-reader';
import { createMegaPackWritingSystemBeats } from './mega-pack-writing-system';

export const MEGA_PACK_PLAYABLE_SLICE_ID = 'mega-pack-foundations-slice-01';

export interface MegaPackPlayableChapter {
    readonly id: MegaPackPlayableChapterId;
    readonly title: LocalizedText;
    readonly beats: readonly MegaPackActivityBeat[];
}

export interface MegaPackPlayableSlice {
    readonly id: typeof MEGA_PACK_PLAYABLE_SLICE_ID;
    readonly chapters: readonly MegaPackPlayableChapter[];
    readonly beats: readonly MegaPackActivityBeat[];
}

export function createMegaPackPlayableSlice(): MegaPackPlayableSlice {
    const chapters: readonly MegaPackPlayableChapter[] = Object.freeze([
        chapter('mega-kana-01', { ja: 'ひらがなを取り出す', en: 'Retrieve hiragana' }, createMegaPackWritingSystemBeats()),
        chapter('mega-reader-01', { ja: '「ももたろう」を読む', en: 'Read Momotarou' }, [createMegaPackReaderBeat()]),
        chapter('mega-materials-01', { ja: '助詞を使える知識にする', en: 'Make particles usable' }, createMegaPackMaterialsBeats()),
    ]);
    return Object.freeze({
        id: MEGA_PACK_PLAYABLE_SLICE_ID,
        chapters,
        beats: Object.freeze(chapters.flatMap(item => item.beats)),
    });
}

function chapter(
    id: MegaPackPlayableChapterId,
    title: LocalizedText,
    beats: readonly MegaPackActivityBeat[],
): MegaPackPlayableChapter {
    if (!beats.length || beats.some(beat => beat.mapping.chapterId !== id)) {
        throw new TypeError(`Mega Pack chapter ${id} has an invalid beat mapping.`);
    }
    return Object.freeze({ id, title: Object.freeze(title), beats: Object.freeze([...beats]) });
}
