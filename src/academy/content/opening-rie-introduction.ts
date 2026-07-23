import chapterSource from './story-sources/s1e01-the-blank-atlas.v2.json';
import type { StoryPackageSource } from './story-runtime';

const CHAPTER_ID = 's1e01-the-blank-atlas';
const LINE_ID = 'line:blank-atlas:rie-konbanwa';
const BAND = 'foundation';

const chapter = chapterSource as unknown as StoryPackageSource;
const line = chapter?.scenes
    .flatMap(scene => scene.nodes)
    .find(node => node.id === LINE_ID && node.kind === 'line');
const variant = line?.variants?.[BAND];

if (chapter.id !== CHAPTER_ID || !line || !variant || line.speakerId !== 'rie') {
    throw new Error('The canonical Rie introduction line is missing from Chapter 1.');
}

/** The first meeting and its Journal replay share the authored Chapter 1 line. */
export const RIE_INTRODUCTION_LINE = Object.freeze({
    id: LINE_ID,
    speakerId: 'rie',
    band: BAND,
    japanese: variant.japanese,
    reading: variant.reading,
    english: variant.english,
});
