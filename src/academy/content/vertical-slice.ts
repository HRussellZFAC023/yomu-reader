import { choiceActivityPlugin, type ChoiceActivityModel } from '../activities/choice';
import { createActivityRuntime } from '../domain/activity-runtime';
import { createSourceLibrary, type QuestionAugmentation, type SourceLibrary, type SourceLibraryData } from '../domain/source-library';

export interface VerticalSliceContent {
    readonly sourceLibrary: SourceLibrary;
    readonly augmentation: QuestionAugmentation;
    readonly activity: ChoiceActivityModel;
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
