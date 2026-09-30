// v1.9.3 yomureader.com visitors with nothing installed (page localStorage only),
// each also followed by a later v1.9.3 userscript install.
//   e1  homepage: the demo runtime staged its Reader demo settings
//   e2  Academy lesson: the Academy runtime seeded its Reader defaults
//   e3  appearance: docs theme toggle to dark, PDF Reader language toggle to ja
//   e4  hosted Study used without installing: setup, key and choices saved
import { describe, it } from 'vitest';
import {
    installDeterministicClock,
    persistentWrites,
    writeScenario,
} from '../lib/corpus-output';
import {
    createRecordingStore,
    OriginWebStorage,
    storeSnapshot,
} from '../lib/realm-stubs';
import {
    HOSTED_ACADEMY_URL,
    HOSTED_HOME_URL,
    HOSTED_PDF_READER_URL,
    HOSTED_STUDY_URL,
    LEARNER_CHOICES,
    SITE_URL,
} from '../lib/learner-story';
import {
    academyLessonVisit,
    docsThemeToggle,
    homepageDemoStaging,
    pdfReaderLanguageToggle,
} from '../lib/v193-hosted-pages';
import {
    completeOnboarding,
    dialogSave,
    enterHostedStudyWithUserscript,
    enterHostedWithoutInstall,
    enterUserscriptSite,
    visibleAfterReload,
} from '../lib/v193-reader';

interface WebsiteVisit {
    readonly name: string;
    readonly story: string;
    readonly visit: (origins: OriginWebStorage) => Promise<void>;
}

async function visibleOnHostedPage(origins: OriginWebStorage, href: string): Promise<Record<string, unknown>> {
    installDeterministicClock();
    enterHostedWithoutInstall(origins, href);
    return visibleAfterReload();
}

/** The same visitor installs the v1.9.3 userscript and opens Study, then a site. */
async function laterUserscriptInstall(website: Record<string, Record<string, string>>): Promise<Record<string, unknown>> {
    const gm = createRecordingStore('gm');
    const origins = new OriginWebStorage(website);
    installDeterministicClock();
    enterHostedStudyWithUserscript(gm, origins);
    const hostedStudy = await visibleAfterReload();
    installDeterministicClock();
    enterUserscriptSite(gm, origins, SITE_URL);
    const site = await visibleAfterReload();
    return {
        story: 'The visitor later installs the v1.9.3 userscript, opens yomureader.com/study, then an ordinary site.',
        gm: storeSnapshot(gm),
        webStorage: origins.snapshot(),
        writes: persistentWrites(gm),
        expected: { [HOSTED_STUDY_URL]: hostedStudy, [SITE_URL]: site },
    };
}

const VISITS: readonly WebsiteVisit[] = [
    {
        name: 'e1-hosted-homepage-demo',
        story: 'A v1.9.3 homepage visitor scrolls far enough for the demo Reader to load, which stages its demo settings.',
        visit: async origins => {
            enterHostedWithoutInstall(origins, HOSTED_HOME_URL);
            await homepageDemoStaging();
        },
    },
    {
        name: 'e2-hosted-academy-seed',
        story: 'A v1.9.3 visitor opens an Academy lesson with no Reader installed; Academy seeds its Reader defaults.',
        visit: async origins => {
            enterHostedWithoutInstall(origins, HOSTED_ACADEMY_URL);
            await academyLessonVisit();
        },
    },
    {
        name: 'e3-hosted-appearance-toggles',
        story: 'A v1.9.3 visitor switches the site to dark with the docs header toggle, then the PDF Reader to Japanese.',
        visit: async origins => {
            enterHostedWithoutInstall(origins, HOSTED_HOME_URL);
            await docsThemeToggle('dark');
            enterHostedWithoutInstall(origins, HOSTED_PDF_READER_URL);
            pdfReaderLanguageToggle('ja');
        },
    },
    {
        name: 'e4-hosted-study-website-only',
        story: 'A v1.9.3 learner uses yomureader.com/study without installing: setup, JPDB key and choices saved on the site.',
        visit: async origins => {
            enterHostedWithoutInstall(origins, HOSTED_STUDY_URL);
            await completeOnboarding('ja');
            await dialogSave(LEARNER_CHOICES);
        },
    },
];

describe('v1.9.3 yomureader.com visitors', () => {
    it.each(VISITS)('$name', async ({ name, story, visit }) => {
        const origins = new OriginWebStorage();
        installDeterministicClock();
        await visit(origins);
        const expected = {
            [HOSTED_STUDY_URL]: await visibleOnHostedPage(origins, HOSTED_STUDY_URL),
            [HOSTED_HOME_URL]: await visibleOnHostedPage(origins, HOSTED_HOME_URL),
        };
        const website = origins.snapshot();
        writeScenario(name, {
            channel: 'hosted',
            story,
            webStorage: website,
            expected,
            afterUserscriptInstall: await laterUserscriptInstall(website),
        });
    });
});
