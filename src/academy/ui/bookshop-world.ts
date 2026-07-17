import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { WorldPractice } from '../domain/world-locations';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { createMegaPackReaderBeat } from '../content/mega-pack-reader';
import type { StoryReaderModel } from '../minigames/activity-kit';
import { choiceToken, element } from './dom';

interface BookshopWorldOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stampId: string;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

interface CatalogueEntry {
    readonly id: string;
    readonly title: string;
    readonly support: string;
    readonly searches: readonly string[];
}

const CATALOGUE: readonly CatalogueEntry[] = [
    { id: 'dictionary', title: '辞書', support: 'Dictionary', searches: ['じしょ', '辞書', 'dictionary'] },
    { id: 'small-change', title: 'こまかい おかね', support: 'Small change', searches: ['こまかい おかね', 'small change', 'change'] },
    { id: 'novel', title: '小説', support: 'Novel', searches: ['しょうせつ', '小説', 'novel'] },
    { id: 'map', title: '地図', support: 'Map', searches: ['ちず', '地図', 'map'] },
];

const BOOKSHOP_READER = createMegaPackReaderBeat();

function bookshopReaderModel(): StoryReaderModel {
    if (BOOKSHOP_READER.activity.kind !== 'academy-story-reader') {
        throw new TypeError('The bookshop reader must remain an Academy story reader.');
    }
    return BOOKSHOP_READER.activity as StoryReaderModel;
}

function targetEntryId(practice: WorldPractice): CatalogueEntry['id'] {
    return practice.id === 'bookshop-small-change-available' ? 'small-change' : 'dictionary';
}

/**
 * A browseable catalogue anchors the availability pattern in the kind of
 * question it answers: locating a title before asking whether it is stocked.
 */
export function renderBookshopCatalogue(options: BookshopWorldOptions): HTMLElement {
    const catalogue = element('section', 'academy-bookshop-catalogue');
    catalogue.dataset.bookshopCatalogue = options.practice.id;
    catalogue.dataset.bookshopPhase = 'browse';
    catalogue.dataset.bookshopOutcome = targetEntryId(options.practice);
    catalogue.setAttribute('aria-label', options.language === 'ja' ? '書店の目録を探す' : 'Search the bookshop catalogue');

    const heading = element('p', 'academy-bookshop-catalogue-heading');
    heading.lang = 'ja';
    heading.textContent = '目録を探す';
    const support = element('p', 'academy-bookshop-catalogue-support');
    support.textContent = options.language === 'ja'
        ? '棚札を探してから、ありますかとたずねる。'
        : 'Find a shelf label, then ask whether the book is available.';

    const searchLabel = element('label', 'academy-bookshop-search-label');
    searchLabel.htmlFor = `academy-bookshop-search-${options.practice.id}`;
    searchLabel.textContent = options.language === 'ja' ? '目録を検索' : 'Search the catalogue';
    const search = document.createElement('input');
    search.className = 'academy-bookshop-search-input';
    search.id = searchLabel.htmlFor;
    search.type = 'search';
    search.autocomplete = 'off';
    search.enterKeyHint = 'search';
    search.placeholder = options.language === 'ja' ? 'じしょ / 辞書' : 'dictionary / 辞書';
    search.setAttribute('aria-describedby', `academy-bookshop-search-status-${options.practice.id}`);

    const results = element('div', 'academy-bookshop-catalogue-results');
    const status = element('p', 'academy-bookshop-search-status');
    status.id = `academy-bookshop-search-status-${options.practice.id}`;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const question = bookshopQuestion(options);
    question.hidden = true;
    let selected = false;
    const target = targetEntryId(options.practice);
    const entries = CATALOGUE.map(entry => {
        const result = element('button', 'academy-bookshop-catalogue-result');
        result.type = 'button';
        result.dataset.catalogueEntry = entry.id;
        result.setAttribute('aria-pressed', 'false');
        const title = element('span', 'academy-bookshop-catalogue-title');
        title.lang = 'ja';
        title.textContent = entry.title;
        const entrySupport = element('span', 'academy-bookshop-catalogue-entry-support');
        entrySupport.textContent = entry.support;
        result.append(title, entrySupport);
        result.addEventListener('click', () => {
            if (selected) return;
            if (entry.id !== target) {
                status.textContent = options.language === 'ja'
                    ? `メモは「${CATALOGUE.find(candidate => candidate.id === target)?.title ?? ''}」です。もう一度、目録を見てみましょう。`
                    : `The note says ${CATALOGUE.find(candidate => candidate.id === target)?.support.toLocaleLowerCase() ?? ''}. Check the catalogue again.`;
                search.focus();
                return;
            }
            selected = true;
            catalogue.dataset.bookshopPhase = 'ask';
            entries.forEach(button => {
                button.disabled = true;
                button.setAttribute('aria-pressed', String(button === result));
            });
            status.textContent = options.language === 'ja'
                ? `${entry.title}の札を見つけた。Sophie-sanにたずねよう。`
                : `You found the ${entry.support.toLocaleLowerCase()} card. Ask Sophie-san.`;
            question.hidden = false;
            question.querySelector<HTMLButtonElement>('[data-bookshop-listen]')?.focus();
        });
        results.append(result);
        return result;
    });

    const syncResults = () => {
        const query = search.value.trim().toLocaleLowerCase();
        let count = 0;
        entries.forEach((button, index) => {
            const matches = !query || CATALOGUE[index]!.searches.some(term => term.toLocaleLowerCase().includes(query));
            button.hidden = !matches;
            if (matches) count += 1;
        });
        if (!selected) {
            status.textContent = query
                ? count
                    ? options.language === 'ja' ? `${count}件の棚札が見つかりました。` : `${count} shelf label${count === 1 ? '' : 's'} found.`
                    : options.language === 'ja' ? '見つかりません。別の言い方で検索してみましょう。' : 'No shelf label found. Try another wording.'
                : options.language === 'ja' ? '棚札を選ぶか、語を入力して検索する。' : 'Choose a shelf label or search by word.';
        }
    };
    search.addEventListener('input', syncResults);
    syncResults();

    catalogue.append(heading, support, searchLabel, search, results, status, question);
    return catalogue;
}

function bookshopQuestion(options: BookshopWorldOptions): HTMLElement {
    const question = element('section', 'academy-bookshop-question');
    question.dataset.bookshopQuestion = options.practice.id;
    question.setAttribute('aria-label', options.language === 'ja' ? '店員にたずねる' : 'Ask the bookseller');
    const prompt = element('p', 'academy-bookshop-question-prompt');
    prompt.lang = 'ja';
    prompt.textContent = options.practice.audioLine;
    const listen = element('button', 'academy-bookshop-listen');
    listen.type = 'button';
    listen.dataset.bookshopListen = options.practice.id;
    listen.textContent = options.language === 'ja' ? '聞く' : 'Listen';
    const transcript = element('p', 'academy-bookshop-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = options.practice.audioLine;
    const feedback = element('p', 'academy-bookshop-question-status');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const answers = element('div', 'academy-bookshop-answers');
    answers.setAttribute('aria-label', options.language === 'ja' ? '返事を選ぶ' : 'Choose the reply');
    let complete = false;
    const readingSample = bookshopReadingSample(options);
    readingSample.hidden = true;

    options.practice.choices.forEach((choice, index) => {
        const answer = element('button', 'academy-bookshop-answer');
        answer.type = 'button';
        answer.dataset.choiceId = choiceToken(index);
        const japanese = element('span', 'academy-bookshop-answer-ja');
        japanese.lang = 'ja';
        japanese.textContent = choice.label.ja;
        answer.append(japanese);
        if (options.language === 'en') {
            const support = element('span', 'academy-bookshop-answer-support');
            support.textContent = choice.label.en;
            answer.append(support);
        }
        answer.addEventListener('click', () => {
            transcript.hidden = false;
            if (complete) return;
            if (choice.id !== options.practice.correctChoiceId) {
                feedback.textContent = options.language === 'ja'
                    ? '棚札と質問をもう一度確かめてみましょう。'
                    : 'Check the shelf label and question once more.';
                return;
            }
            complete = true;
            question.dataset.practiceComplete = 'true';
            feedback.textContent = options.practice.success[options.language];
            answers.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
            readingSample.hidden = false;
            const evaluation = completedWorldPracticeEvaluation(options.practice);
            if (evaluation) options.onPracticeComplete?.(options.practice.id, options.stampId, evaluation);
            else options.onPracticeComplete?.(options.practice.id, options.stampId);
            readingSample.querySelector<HTMLButtonElement>('button')?.focus();
        });
        answers.append(answer);
    });
    listen.addEventListener('click', () => {
        transcript.hidden = false;
        void (options.onListen?.(options.practice.audioLine) ?? Promise.resolve(false)).then(played => {
            feedback.textContent = played
                ? options.language === 'ja' ? '音声を再生しました。返事を選びましょう。' : 'Playing the question. Choose the reply.'
                : options.language === 'ja' ? '音声を再生できません。文字を読んで続けましょう。' : 'Speech is unavailable. Read the question and continue.';
        });
    });
    question.append(prompt, listen, transcript, answers, feedback, readingSample);
    return question;
}

/** A compact, optional sample page from the permitted Japanese-folder reader. */
function bookshopReadingSample(options: BookshopWorldOptions): HTMLElement {
    const model = bookshopReaderModel();
    const returning = options.practice.id === 'bookshop-small-change-available';
    const section = model.payload.sections[returning ? 1 : 0]!;
    const question = model.payload.questions[returning ? 1 : 0]!;
    const sample = element('section', 'academy-bookshop-reading-sample');
    sample.dataset.bookshopReading = BOOKSHOP_READER.sourceSegmentId;
    sample.dataset.sourceId = BOOKSHOP_READER.provenance.sourceId;
    sample.dataset.sourcePages = BOOKSHOP_READER.provenance.locus.pdfPages.join('-');

    const tape = element('p', 'academy-bookshop-reading-tape');
    tape.textContent = options.language === 'ja' ? '試し読み・ももたろう' : 'Sample page · Momotarou';
    const passage = element('p', 'academy-bookshop-reading-passage');
    passage.lang = 'ja';
    passage.textContent = section.paragraphs[returning ? 0 : 1] ?? section.paragraphs[0] ?? '';
    const prompt = element('p', 'academy-bookshop-reading-prompt');
    prompt.textContent = question.prompt[options.language];
    const choices = element('div', 'academy-bookshop-reading-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', question.prompt[options.language]);
    const status = element('p', 'academy-bookshop-reading-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    for (const option of question.options) {
        const button = element('button', 'academy-bookshop-reading-choice');
        button.type = 'button';
        button.dataset.readingChoice = option.id;
        button.lang = 'ja';
        button.textContent = option.label;
        button.addEventListener('click', () => {
            if (option.id !== question.correctOptionId) {
                status.textContent = model.payload.feedback.lapse.repairPrompt[options.language];
                return;
            }
            sample.dataset.readingComplete = 'true';
            status.textContent = model.payload.feedback.pass.explanation[options.language];
            choices.querySelectorAll<HTMLButtonElement>('button').forEach(choice => { choice.disabled = true; });
        });
        choices.append(button);
    }
    sample.append(tape, passage, prompt, choices, status);
    return sample;
}
