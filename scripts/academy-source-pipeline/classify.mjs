import path from 'node:path';

const KIND_BY_EXTENSION = new Map([
    ['.pdf', 'document'],
    ['.doc', 'document'],
    ['.docx', 'document'],
    ['.ppt', 'document'],
    ['.pptx', 'document'],
    ['.mp3', 'audio'],
    ['.m4a', 'audio'],
    ['.wav', 'audio'],
    ['.mp4', 'video'],
    ['.png', 'image'],
    ['.jpg', 'image'],
    ['.jpeg', 'image'],
]);

/** Metadata-only classification. Never returns any part of the source name. */
export function classifyMemberName(name) {
    const extension = path.extname(name).toLowerCase();
    return {
        kind: KIND_BY_EXTENSION.get(extension) ?? 'other',
        extension: extension || '(none)',
    };
}

export function describePathShape(name) {
    const trimmed = name.endsWith('/') ? name.slice(0, -1) : name;
    return {
        depth: trimmed.split('/').length,
        characterSet: /^[\x20-\x7e]*$/.test(trimmed) ? 'ascii' : 'unicode',
        nameEncoding: 'utf8',
    };
}

const QUESTION_NUMBER_PATTERN = /^\s*(?:[0-9０-９]{1,2}[.)．）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/gmu;
const BLANK_PATTERN = /（\s*）|\(\s{2,}\)|＿{2,}|_{3,}/gu;
const IMAGE_DEPENDENCY_PATTERN = /絵|図|地図|写真|イラスト|見て/gu;
const LISTENING_PATTERN = /聞いて|きいて|listening|listen/giu;
// `答えて` is an instruction ("answer"), not an answer-key heading. Require
// a heading-like boundary around 答え/こたえ so it is not double-counted.
const ANSWER_KEY_PATTERN = /(?:^|[\s「【])(?:答え|こたえ)(?=$|[\s:：」】])|answer\s*key|解答/gimu;

/**
 * Machine question-signal census for one page of extracted PDF text. These are
 * candidates for human review, never verified question counts.
 */
export function collectQuestionSignals(pageText) {
    return {
        characterCount: pageText.length,
        numberedItemCount: countMatches(pageText, QUESTION_NUMBER_PATTERN),
        blankSlotCount: countMatches(pageText, BLANK_PATTERN),
        imageDependencyCueCount: countMatches(pageText, IMAGE_DEPENDENCY_PATTERN),
        listeningCueCount: countMatches(pageText, LISTENING_PATTERN),
        answerKeyCueCount: countMatches(pageText, ANSWER_KEY_PATTERN),
    };
}

/**
 * Image-dependency review state for one page. Any page carrying raster/image
 * objects stays review-required; it may never silently become text-only.
 */
export function resolveImageDependencyState({ imageObjectCount, signals }) {
    if (imageObjectCount > 0 && (signals.imageDependencyCueCount > 0 || signals.characterCount < 40)) {
        return 'image-dependent-review-required';
    }
    if (imageObjectCount > 0) return 'has-images-review-required';
    if (signals.imageDependencyCueCount > 0) return 'image-cue-without-objects-review-required';
    return 'text-only-candidate';
}

function countMatches(text, pattern) {
    pattern.lastIndex = 0;
    let count = 0;
    while (pattern.exec(text) !== null) count += 1;
    return count;
}
