import legacySeasonSource from './story-sources/season-one-fiction.json';

const LANTERN_ATLAS_CANON_ID = 'story:lantern-atlas:v1';
const LANTERN_ATLAS_FINAL_CHAPTER_ID = 's4e12-next-page';

export interface LanternAtlasCanonChapter {
    readonly id: string;
    readonly ordinal: number;
    readonly season: 1 | 2 | 3 | 4;
    readonly title: string;
}

export interface LanternAtlasCanon {
    readonly id: typeof LANTERN_ATLAS_CANON_ID;
    readonly chapters: readonly LanternAtlasCanonChapter[];
    readonly finalChapterId: typeof LANTERN_ATLAS_FINAL_CHAPTER_ID;
    readonly postgameRule: 'practice-memories-and-authored-alumni-only';
    chapter(id: string | undefined): LanternAtlasCanonChapter | undefined;
}

interface LegacySeasonSource {
    readonly episodes: readonly Pick<LanternAtlasCanonChapter, 'id' | 'ordinal' | 'title'>[];
}

const SEASON_THREE_AND_FOUR: readonly [id: string, title: string][] = [
    ['s3e01-after-the-applause', 'After the Applause'],
    ['s3e02-caption-without-owner', 'A Caption Without an Owner'],
    ['s3e03-helpful-rewrite', 'The Helpful Rewrite'],
    ['s3e04-terms-of-invitation', 'Terms of Invitation'],
    ['s3e05-chair-not-reserved', 'The Chair Is Not Reserved'],
    ['s3e06-two-schedules', 'Two Schedules, One Promise'],
    ['s3e07-under-the-subtitle', 'Under the Subtitle'],
    ['s3e08-right-screen-wrong-draft', 'The Right Screen, the Wrong Draft'],
    ['s3e09-what-we-can-say', 'What We Can Say'],
    ['s3e10-empty-microphone', 'The Empty Microphone'],
    ['s3e11-names-in-the-margin', 'Names in the Margin'],
    ['s3e12-permission-page', 'The Permission Page'],
    ['s4e01-return-address', 'The Return Address'],
    ['s4e02-map-of-claims', 'A Map of Claims'],
    ['s4e03-polite-no', 'The Polite No'],
    ['s4e04-three-true-versions', 'Three True Versions'],
    ['s4e05-left-unsaid', 'What Was Left Unsaid'],
    ['s4e06-open-question', 'The Open Question'],
    ['s4e07-journey-not-everyone-takes', 'The Journey Not Everyone Takes'],
    ['s4e08-last-revision', 'The Last Revision'],
    ['s4e09-rehearsal-for-leaving', 'Rehearsal for Leaving'],
    ['s4e10-public-evening', 'The Public Japanese Evening'],
    ['s4e11-atlas-closes', 'The Atlas Closes'],
    ['s4e12-next-page', 'The Next Page'],
];

const legacyChapters = (legacySeasonSource as LegacySeasonSource).episodes.map(episode => Object.freeze({
    ...episode,
    season: (episode.ordinal <= 12 ? 1 : 2) as 1 | 2,
}));

const laterChapters = SEASON_THREE_AND_FOUR.map(([id, title], index) => Object.freeze({
    id,
    title,
    ordinal: index + 25,
    season: (index < 12 ? 3 : 4) as 3 | 4,
}));

const chapters = Object.freeze([...legacyChapters, ...laterChapters]);

validateCanon(chapters);

const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));

/**
 * Stable story identity for projections. This is intentionally a finite list:
 * replay can point at these chapters, but cannot append a chapter or alter one.
 */
export const LANTERN_ATLAS_CANON: LanternAtlasCanon = Object.freeze({
    id: LANTERN_ATLAS_CANON_ID,
    chapters,
    finalChapterId: LANTERN_ATLAS_FINAL_CHAPTER_ID,
    postgameRule: 'practice-memories-and-authored-alumni-only',
    chapter: (id: string | undefined) => id ? byId.get(id) : undefined,
});

function validateCanon(candidate: readonly LanternAtlasCanonChapter[]): void {
    if (candidate.length !== 48) throw new TypeError('The Lantern Atlas canon must contain exactly 48 chapters.');
    candidate.forEach((chapter, index) => {
        if (chapter.ordinal !== index + 1) throw new TypeError('The Lantern Atlas chapter order is not contiguous.');
        if (chapter.season !== Math.floor(index / 12) + 1) throw new TypeError('Each Lantern Atlas season must contain 12 chapters.');
    });
    if (candidate.at(-1)?.id !== LANTERN_ATLAS_FINAL_CHAPTER_ID) {
        throw new TypeError('Graduation must remain the one finite Lantern Atlas ending.');
    }
}
