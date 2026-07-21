import {
    extractBaseText,
    extractReadingText,
    uniqueLookupValues,
    type JpdbPageExample,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from '../jpdb/jpdb-page-targets';
import { cleanText, JAPANESE_RE } from '../jpdb/jpdb-text';

const READER_OWNED_SELECTOR = '[data-jpdb-reader-root], [data-yomu-jpdb-addon]';
const REVIEW_HEADER_SELECTOR = '#js-rev-header h1[id^="rev-id-"]';
const QUIZ_ROOT_SELECTOR = '#js-quiz';
const QUIZ_QUESTION_SELECTOR = '#js-tour-quiz-question, .bp-quiz-question, [id^="study-question-"]';
const QUIZ_ANSWER_RUBY_SELECTOR = '#js-tour-quiz-question button ruby, .bp-quiz-question button ruby, [id^="study-question-"] button ruby';
const QUIZ_ANSWER_SELECTOR = '#js-tour-quiz-answer';
const BUNPRO_LOCALE_PREFIX = /^\/(?:en|es|fr|id|ja)(?=\/|$)/;

export function isBunproHost(): boolean {
    return location.hostname === 'bunpro.jp' || location.hostname.endsWith('.bunpro.jp');
}

export function isBunproEnhanceablePage(): boolean {
    const pathname = bunproPathname();
    return pathname === '/learn'
        || pathname.startsWith('/learn/')
        || pathname === '/reviews'
        || pathname.startsWith('/vocabs/')
        || pathname.startsWith('/grammar_points/');
}

export function currentBunproTermTarget(): JpdbTermTarget | null {
    if (!isBunproHost() || !isBunproEnhanceablePage() || isBunproQuizAnswerHidden()) return null;
    const headword = bunproHeadword();
    const anchor = bunproAddonAnchor();
    if (!headword || !anchor) return null;
    return {
        term: headword.term,
        reading: headword.reading,
        queries: uniqueLookupValues([headword.term, headword.reading]),
        examples: bunproPageExamples(),
        anchor,
    };
}

export function currentBunproLocalDictionaryTargets(): LocalDictionaryTarget[] {
    const target = currentBunproTermTarget();
    if (!target) return [];
    return [{
        term: target.term,
        reading: target.reading,
        alternates: uniqueLookupValues(target.queries),
        compounds: [],
        examples: target.examples,
        anchor: target.anchor,
    }];
}

// Bunpro keeps the same /learn or /reviews URL while moving through a quiz.
// No target may exist on the question side: definitions, examples, furigana,
// and pitch would reveal the answer. The stable quiz controls distinguish the
// prompt from Bunpro's post-attempt answer console without relying on copy.
export function isBunproQuizAnswerHidden(): boolean {
    if (!isBunproHost() || !isBunproEnhanceablePage()) return false;
    const quiz = document.querySelector<HTMLElement>(QUIZ_ROOT_SELECTOR);
    if (!quiz) return false;
    // "Show Info" in the lesson quiz mounts the native rev-header without
    // necessarily removing the answered input. That is Bunpro's explicit
    // reveal state and is safe to enhance.
    if (document.querySelector(REVIEW_HEADER_SELECTOR)) return false;
    const manualInput = quiz.querySelector<HTMLInputElement>('#js-manual-input');
    if (manualInput) return !manualInput.readOnly;
    if (quiz.querySelector('.InputFlashcardReveal, .InputFlashcardSubmit')) return true;
    return !quiz.querySelector(QUIZ_ANSWER_SELECTOR);
}

export function isBunproReviewFrontPrompt(element: HTMLElement): boolean {
    if (!isBunproHost() || !element.closest(QUIZ_QUESTION_SELECTOR)) return false;
    if (element.closest(QUIZ_ANSWER_SELECTOR)) return false;
    return isBunproQuizAnswerHidden();
}

function bunproPathname(): string {
    const stripped = location.pathname.replace(BUNPRO_LOCALE_PREFIX, '');
    return stripped || '/';
}

function bunproHeadword(): { term: string; reading: string } | null {
    const heading = ownedElement(document.querySelector<HTMLElement>(REVIEW_HEADER_SELECTOR));
    const headword = heading?.querySelector<HTMLElement>('ruby, [lang="ja"]') ?? heading;
    const domTerm = headword ? cleanText(extractBaseText(headword)) : '';
    const domReading = headword ? cleanText(extractReadingText(headword)) : '';
    if (domTerm && isCompactJapaneseTerm(domTerm)) {
        return {
            term: domTerm,
            reading: domReading || domTerm,
        };
    }
    const quizHeadword = bunproRevealedQuizHeadword();
    if (quizHeadword) return quizHeadword;
    const pathTerm = bunproVocabularyPathTerm();
    return pathTerm ? { term: pathTerm, reading: pathTerm } : null;
}

function bunproRevealedQuizHeadword(): { term: string; reading: string } | null {
    const quiz = document.querySelector<HTMLElement>(QUIZ_ROOT_SELECTOR);
    const input = quiz?.querySelector<HTMLInputElement>('#js-manual-input');
    if (!quiz || !input?.readOnly) return null;
    const reading = cleanText(input.value);
    if (!isCompactJapaneseTerm(reading)) return null;

    // In Bunpro's accepted-answer state the cloze becomes a button containing
    // a ruby stem (e.g. 磨/みが), while the input holds the dictionary reading
    // (みがく). Reattach the unmatched kana suffix to recover 磨く. If a quiz
    // shape has no ruby stem, the accepted kana is still a valid lookup query.
    const answerRuby = quiz.querySelector<HTMLElement>(QUIZ_ANSWER_RUBY_SELECTOR);
    const base = answerRuby ? cleanText(extractBaseText(answerRuby)) : '';
    const stemReading = answerRuby ? cleanText(extractReadingText(answerRuby)) : '';
    const suffix = stemReading && reading.startsWith(stemReading) ? reading.slice(stemReading.length) : '';
    const term = base && stemReading && suffix ? `${base}${suffix}` : reading;
    return isCompactJapaneseTerm(term) ? { term, reading } : null;
}

function bunproVocabularyPathTerm(): string {
    const parts = bunproPathname().split('/').filter(Boolean);
    if (parts[0] !== 'vocabs' || !parts[1]) return '';
    try {
        const term = cleanText(decodeURIComponent(parts[1]));
        return isCompactJapaneseTerm(term) ? term : '';
    } catch {
        return '';
    }
}

function bunproAddonAnchor(): HTMLElement | null {
    const answer = ownedElement(document.querySelector<HTMLElement>(QUIZ_ANSWER_SELECTOR));
    if (answer) return lastOwnedChild(answer) ?? answer;

    const header = ownedElement(document.querySelector<HTMLElement>('#js-rev-header'));
    if (header) {
        for (const selector of ['#examples', '#about', '#dictionary-definition']) {
            const sectionHeader = ownedElement(document.querySelector<HTMLElement>(selector));
            const section = sectionHeader?.closest<HTMLElement>('section');
            if (section) return section;
        }
        return header;
    }
    if (!isBunproQuizAnswerHidden()) {
        return ownedElement(document.querySelector<HTMLElement>('#js-tour-quiz-question'));
    }
    return null;
}

function bunproPageExamples(): JpdbPageExample[] {
    const root = document.querySelector<HTMLElement>(QUIZ_QUESTION_SELECTOR)
        ?? document.querySelector<HTMLElement>('#examples')?.closest<HTMLElement>('section')
        ?? document;
    const seen = new Set<string>();
    const examples: JpdbPageExample[] = [];
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('[lang="ja"], .bp-quiz-question'))) {
        if (element.closest(READER_OWNED_SELECTOR)) continue;
        const sentence = cleanText(extractBaseText(element));
        if (!sentence || sentence.length > 180 || !JAPANESE_RE.test(sentence) || seen.has(sentence)) continue;
        seen.add(sentence);
        examples.push({ sentence, translation: '' });
        if (examples.length >= 8) break;
    }
    return examples;
}

function isCompactJapaneseTerm(value: string): boolean {
    return value.length <= 40 && JAPANESE_RE.test(value) && !/[。！？!?]/.test(value);
}

function lastOwnedChild(element: HTMLElement): HTMLElement | null {
    return Array.from(element.children)
        .reverse()
        .find((child): child is HTMLElement => child instanceof HTMLElement && !child.closest(READER_OWNED_SELECTOR))
        ?? null;
}

function ownedElement<T extends HTMLElement>(element: T | null): T | null {
    return element && !element.closest(READER_OWNED_SELECTOR) ? element : null;
}
