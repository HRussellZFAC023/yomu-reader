import type { ReviewSeed } from '../domain/activity-runtime';
import type { ReviewRating } from '../domain/learner-record';

export interface Disposable {
    /** Resolves after terminal playback; cancellation leaves it pending. */
    readonly completion?: Promise<void>;
    dispose(): void;
}

export interface AnnotationContext {
    readonly support: 'full' | 'furigana' | 'inspect-only' | 'mastered';
    readonly sceneId?: string;
    readonly activityId?: string;
}

export interface AnnotationService {
    annotate(root: HTMLElement, context: AnnotationContext): Promise<Disposable>;
}

export interface DictionaryService {
    attach(root: HTMLElement, context: { readonly sourceId?: string }): Promise<Disposable>;
}

export interface PitchService {
    lookup(term: string, reading?: string): Promise<readonly string[]>;
}

export interface GrammarKnowledgeService {
    knowledge(conceptId: string): Promise<'unknown' | 'learning' | 'known' | 'mastered'>;
}

export interface ReviewQueueItem {
    readonly id: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meaning?: string;
    readonly dueAt: number;
    readonly provenance: Readonly<Record<string, string>>;
}

/** A selected Academy syllabus row, before Yomu assigns its schedule. */
export interface ReviewSyllabusItem {
    readonly id: string;
    readonly expression: string;
    readonly reading?: string;
}

/** Due cards remain scheduler-owned; this only reports whether a syllabus is already shared with Yomu. */
export type ReviewSyllabusState = 'new' | 'cleared' | 'empty';

export interface ReviewQueueService {
    due(limit: number): Promise<readonly ReviewQueueItem[]>;
    syllabusState?(items: readonly ReviewSyllabusItem[]): Promise<ReviewSyllabusState>;
    ingest(seeds: readonly ReviewSeed[]): Promise<void>;
    rate(itemId: string, rating: ReviewRating): Promise<void>;
}

export interface KanjiWritingModel {
    readonly character: string;
    readonly svg: string;
    readonly strokeCount: number;
    readonly strokeShapes: readonly (readonly { readonly x: number; readonly y: number }[])[];
    readonly source: {
        readonly name: string;
        readonly url: string;
        readonly licence: string;
        readonly revision: string;
    };
}

export interface KanjiWritingService {
    lookup(character: string): Promise<KanjiWritingModel | null>;
}

export interface PronunciationService {
    play(term: string, reading?: string, signal?: AbortSignal): Promise<Disposable>;
}

export interface ImmersionExample {
    readonly id: string;
    readonly japanese: string;
    readonly translation?: string;
    readonly sourceTitle?: string;
    readonly sourceUrl?: string;
    readonly audioUrl?: string;
}

export interface ImmersionExampleService {
    search(conceptId: string, limit: number): Promise<readonly ImmersionExample[]>;
}

export interface MiningRequest {
    readonly expression?: string;
    readonly sentence: string;
    readonly sourceTitle: string;
    readonly sourceUrl?: string;
    readonly sceneId?: string;
    readonly speakerId?: string;
    readonly conceptIds: readonly string[];
}

export interface MiningService {
    enqueue(request: MiningRequest): Promise<void>;
}

export interface YomuBridge {
    readonly annotations: AnnotationService;
    readonly dictionary: DictionaryService;
    readonly pitch: PitchService;
    readonly grammar: GrammarKnowledgeService;
    readonly review: ReviewQueueService;
    readonly kanjiWriting: KanjiWritingService;
    readonly pronunciation: PronunciationService;
    readonly immersion: ImmersionExampleService;
    readonly mining: MiningService;
}
