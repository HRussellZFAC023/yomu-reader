import { choiceActivityPlugin, type ChoiceActivityModel } from '../activities/choice';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, createActivityRuntime } from '../domain/activity-runtime';
import { createSourceLibrary, type QuestionAugmentation, type SourceLibrary, type SourceLibraryData } from '../domain/source-library';

export interface VerticalSliceContent {
    readonly sourceLibrary: SourceLibrary;
    readonly augmentation: QuestionAugmentation;
    readonly activity: ChoiceActivityModel;
}

export type LessonFork = 'sound' | 'text' | 'speaking';

const FORK_PROMPTS: Readonly<Record<LessonFork, { en: string; ja: string }>> = {
    sound: {
        en: 'Rie moved on quickly. Which reply asks her to say it one more time?',
        ja: 'りえ先生はすぐ次へ進みました。もう一度言ってもらうには、何と言いますか。',
    },
    text: {
        en: 'The instruction is already on the board. Which line asks Rie to repeat it?',
        ja: '指示はもう黒板にあります。りえ先生に繰り返してもらうには、何と言いますか。',
    },
    speaking: {
        en: 'You tried a reply aloud. Which written line matches what you need?',
        ja: '声に出して答えてみました。必要な返事と同じ文はどれですか。',
    },
};

export function openingForkActivityId(fork: LessonFork): string {
    return `activity:lesson-zero-first-repair:${fork}`;
}

/** One source question, three independently evidenced ways into it. */
export function createOpeningForkActivity(base: ChoiceActivityModel, fork: LessonFork): ChoiceActivityModel {
    return {
        ...structuredClone(base),
        id: openingForkActivityId(fork),
        prompt: FORK_PROMPTS[fork],
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    };
}

let defaultLoad: Promise<VerticalSliceContent> | null = null;

/** Keeps authored source data as separately cacheable public shards. */
export function loadVerticalSliceContent(fetcher: typeof fetch = fetch): Promise<VerticalSliceContent> {
    if (fetcher !== fetch) return load(fetcher);
    defaultLoad ??= load(fetcher).catch(error => {
        defaultLoad = null;
        throw error;
    });
    return defaultLoad;
}

async function load(fetcher: typeof fetch): Promise<VerticalSliceContent> {
    const [sourceData, augmentationData] = await Promise.all([
        fetchJson(fetcher, '/academy/content/vertical-slice/source-library.v1.json'),
        fetchJson(fetcher, '/academy/content/vertical-slice/augmentation.v1.json'),
    ]);
    const sourceLibrary = createSourceLibrary(sourceData as SourceLibraryData);
    const record = augmentationData as { augmentation: QuestionAugmentation; activity: ChoiceActivityModel };
    const augmentation = structuredClone(record.augmentation);
    const activity = structuredClone(record.activity);
    const issues = createActivityRuntime([choiceActivityPlugin]).validate(activity);
    if (issues.length) {
        throw new Error(`Vertical-slice source activity is invalid: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
    }
    if (augmentation.sourceQuestionId !== activity.sourceQuestionId) {
        throw new Error('Vertical-slice source and augmentation ids do not match.');
    }
    return { sourceLibrary, augmentation, activity };
}

async function fetchJson(fetcher: typeof fetch, url: string): Promise<unknown> {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Could not load Academy content shard: ${url} (${response.status})`);
    return response.json();
}
