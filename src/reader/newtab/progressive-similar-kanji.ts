import type { JpdbKanjiInfo } from '../jpdb-kanji';
import type { YomitanTermEntry } from '../yomitan';

type SimilarKanjiProgress = {
    jpdbLoaded: boolean;
    localLoaded: boolean;
    jpdbVocabulary: JpdbKanjiInfo['vocabulary'];
    localEntries: YomitanTermEntry[];
};

type ProgressiveSimilarKanjiOptions = {
    section: HTMLDetailsElement;
    canLoad: () => boolean;
    jpdbInfoPromise: Promise<JpdbKanjiInfo | null>;
    loadLocalEntries?: () => Promise<YomitanTermEntry[]>;
    onProgress: (progress: SimilarKanjiProgress) => void;
};

export function installProgressiveSimilarKanjiLoader(options: ProgressiveSimilarKanjiOptions): void {
    let started = false;
    const progress: SimilarKanjiProgress = {
        jpdbLoaded: false,
        localLoaded: !options.loadLocalEntries,
        jpdbVocabulary: [],
        localEntries: [],
    };

    const publish = () => {
        options.onProgress(progress);
    };

    const load = () => {
        if (!options.section.open || started || !options.canLoad()) return;
        started = true;
        publish();

        void options.jpdbInfoPromise.then(info => {
            progress.jpdbVocabulary = info?.vocabulary ?? [];
            progress.jpdbLoaded = true;
            publish();
        }).catch(() => {
            progress.jpdbLoaded = true;
            publish();
        });

        if (!options.loadLocalEntries) return;
        void options.loadLocalEntries().then(entries => {
            progress.localEntries = entries;
            progress.localLoaded = true;
            publish();
        }).catch(() => {
            progress.localLoaded = true;
            publish();
        });
    };

    options.section.addEventListener('toggle', load);
    load();
}
