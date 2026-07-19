import s1e02 from './story-sources/s1e02-margin-map.v2.json';
import s1e03 from './story-sources/s1e03-route-zero.v2.json';
import s1e04 from './story-sources/s1e04-welcome-frequency.v2.json';
import s1e05 from './story-sources/s1e05-final-boss-kana.v2.json';
import s1e06 from './story-sources/s1e06-invitation-chain.v2.json';
import s1e07 from './story-sources/s1e07-no-spoilers.v2.json';
import s1e08 from './story-sources/s1e08-menu-without-pictures.v2.json';
import s1e09 from './story-sources/s1e09-the-story-in-two-tenses.v2.json';
import s1e10 from './story-sources/s1e10-instructions-for-a-cloud.v2.json';
import s1e11 from './story-sources/s1e11-storm-route-variant.v2.json';
import s1e12 from './story-sources/s1e12-the-vanishing-course.v2.json';
import s1e13 from './story-sources/s1e13-dinner-by-if.v2.json';
import s1e14 from './story-sources/s1e14-two-answers.v2.json';
import s1e15 from './story-sources/s1e15-chorus-with-a-hole.v2.json';
import s1e16 from './story-sources/s1e16-the-night-the-map-went-dark.v2.json';
import s1e17 from './story-sources/s1e17-catwalk-clue.v2.json';
import s1e18 from './story-sources/s1e18-the-memory-card-museum.v2.json';
import s1e19 from './story-sources/s1e19-seventy-percent-door.v2.json';
import s1e20 from './story-sources/s1e20-map-from-memory.v2.json';
import s1e21 from './story-sources/s1e21-questions-in-the-dark.v2.json';
import s1e22 from './story-sources/s1e22-blank-space.v2.json';
import s1e23 from './story-sources/s1e23-farewell-rehearsal.v2.json';
import s1e24 from './story-sources/s1e24-lanterns-return.v2.json';
import s3e01 from './story-sources/s3e01-after-the-applause.v2.json';
import s3e02 from './story-sources/s3e02-caption-without-owner.v2.json';
import s3e03 from './story-sources/s3e03-helpful-rewrite.v2.json';
import s3e04 from './story-sources/s3e04-terms-of-invitation.v2.json';
import s3e05 from './story-sources/s3e05-chair-not-reserved.v2.json';
import s3e06 from './story-sources/s3e06-two-schedules.v2.json';
import s3e07 from './story-sources/s3e07-under-the-subtitle.v2.json';
import s3e08 from './story-sources/s3e08-right-screen-wrong-draft.v2.json';
import s3e09 from './story-sources/s3e09-what-we-can-say.v2.json';
import s3e10 from './story-sources/s3e10-empty-microphone.v2.json';
import s3e11 from './story-sources/s3e11-names-in-the-margin.v2.json';
import s3e12 from './story-sources/s3e12-permission-page.v2.json';
import s4e01 from './story-sources/s4e01-return-address.v2.json';
import s4e02 from './story-sources/s4e02-map-of-claims.v2.json';
import s4e03 from './story-sources/s4e03-polite-no.v2.json';
import s4e04 from './story-sources/s4e04-three-true-versions.v2.json';
import s4e05 from './story-sources/s4e05-left-unsaid.v2.json';
import s4e06 from './story-sources/s4e06-open-question.v2.json';
import s4e07 from './story-sources/s4e07-journey-not-everyone-takes.v2.json';
import s4e08 from './story-sources/s4e08-last-revision.v2.json';
import s4e09 from './story-sources/s4e09-rehearsal-for-leaving.v2.json';
import s4e10 from './story-sources/s4e10-public-evening.v2.json';
import s4e11 from './story-sources/s4e11-atlas-closes.v2.json';
import s4e12 from './story-sources/s4e12-next-page.v2.json';
import type { StoryPackageSource } from './story-runtime';

/**
 * Every authored story-package.v2 chapter that compiles through the generic
 * loader in story-runtime.ts. The arrival bridge and s1e01 stay on the
 * dedicated opening-arc compile and must not be listed here. A v2 entry here
 * supersedes the programmatic N3 batch for the same episode id.
 */
export const AUTHORED_STORY_CHAPTER_SOURCES = [
    s1e02, s1e03, s1e04, s1e05, s1e06, s1e07, s1e08, s1e09, s1e10, s1e11, s1e12,
    s1e13, s1e14, s1e15, s1e16, s1e17, s1e18, s1e19, s1e20, s1e21, s1e22, s1e23,
    s1e24,
    s3e01, s3e02, s3e03, s3e04, s3e05, s3e06, s3e07, s3e08, s3e09, s3e10, s3e11,
    s3e12,
    s4e01, s4e02, s4e03, s4e04, s4e05, s4e06, s4e07, s4e08, s4e09, s4e10, s4e11,
    s4e12,
] as unknown as readonly StoryPackageSource[];
