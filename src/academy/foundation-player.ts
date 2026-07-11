import type { FoundationLesson, PracticeItem } from './foundation-course';
import { revealSentenceMarkup, bindReveal } from './learn';
import { mnemonicFor } from './kanji-mnemonics';
import { fableForRoute } from './fables';

export type FoundationSection = 'scene' | 'words' | 'grammar' | 'practice' | 'kanji' | 'reading' | 'mission';

export interface FoundationFeedback {
    readonly correct: boolean;
    readonly title: string;
    readonly explanation: string;
}

export interface FoundationPlayerState {
    section: FoundationSection;
    practiceIndex: number;
    showMeaning: boolean;
    feedback: FoundationFeedback | null;
    completedPracticeIds: Set<string>;
    orderByPracticeId: Map<string, string[]>;
}

export interface FoundationPlayerActions {
    readonly render: () => void;
    readonly onComplete: () => void;
}

const sections: readonly { id: FoundationSection; ja: string; en: string }[] = [
    { id: 'scene', ja: '会話', en: 'Scene' },
    { id: 'words', ja: 'ことば', en: 'Words' },
    { id: 'grammar', ja: '文法', en: 'Grammar' },
    { id: 'practice', ja: '練習', en: 'Practice' },
    { id: 'kanji', ja: '漢字', en: 'Kanji' },
    { id: 'reading', ja: '物語', en: 'Story' },
    { id: 'mission', ja: 'ミッション', en: 'Mission' },
] as const;

export function createFoundationPlayerState(): FoundationPlayerState {
    return {
        section: 'scene',
        practiceIndex: 0,
        showMeaning: false,
        feedback: null,
        completedPracticeIds: new Set<string>(),
        orderByPracticeId: new Map<string, string[]>(),
    };
}

export function renderFoundationPlayer(lesson: FoundationLesson, state: FoundationPlayerState, selectedKanji = lesson.kanji[0]?.character ?? ''): string {
    return `<article class="foundation-player" data-foundation-player data-section="${state.section}">
        <header class="foundation-lesson-header">
            <div>
                <h1><span lang="ja">${escapeHtml(lesson.japaneseTitle)}</span><small>${escapeHtml(lesson.title)}</small></h1>
            </div>
            <div class="foundation-lesson-meta"><span>${lesson.minutes} min</span><span>${lesson.mapping.jlpt}</span></div>
        </header>
        <nav class="foundation-sections" aria-label="Lesson sections">
            ${sections.map(section => `<button type="button" data-foundation-section="${section.id}" aria-current="${state.section === section.id ? 'page' : 'false'}"><span lang="ja">${section.ja}</span><small>${section.en}</small></button>`).join('')}
        </nav>
        ${renderSection(lesson, state, selectedKanji)}
    </article>`;
}

export function bindFoundationPlayer(
    root: HTMLElement,
    lesson: FoundationLesson,
    state: FoundationPlayerState,
    actions: FoundationPlayerActions,
): void {
    bindReveal(root);
    root.querySelectorAll<HTMLElement>('[data-reading-q]').forEach(group => {
        const answer = Number(group.dataset.answer);
        const result = group.querySelector<HTMLElement>('[data-reading-result]');
        group.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach(input => {
            input.addEventListener('change', () => {
                if (!result) return;
                const correct = Number(input.value) === answer;
                result.hidden = false;
                result.dataset.result = correct ? 'correct' : 'incorrect';
                result.textContent = correct ? 'そうです！ Correct.' : 'もう一度読んでみましょう。 Read again and try once more.';
            });
        });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-foundation-section]').forEach(button => {
        button.addEventListener('click', () => {
            const section = button.dataset.foundationSection;
            if (!isFoundationSection(section)) return;
            state.section = section;
            state.feedback = null;
            actions.render();
        });
    });

    root.querySelector<HTMLButtonElement>('[data-toggle-meaning]')?.addEventListener('click', () => {
        state.showMeaning = !state.showMeaning;
        actions.render();
    });

    root.querySelector<HTMLButtonElement>('[data-practice-previous]')?.addEventListener('click', () => {
        state.practiceIndex = Math.max(0, state.practiceIndex - 1);
        state.feedback = null;
        actions.render();
    });
    root.querySelector<HTMLButtonElement>('[data-practice-next]')?.addEventListener('click', () => {
        state.practiceIndex = Math.min(lesson.practice.length - 1, state.practiceIndex + 1);
        state.feedback = null;
        actions.render();
    });

    root.querySelectorAll<HTMLButtonElement>('[data-foundation-order-move]').forEach(button => {
        button.addEventListener('click', () => {
            const item = button.closest<HTMLElement>('[data-foundation-order-item]');
            const list = item?.parentElement;
            if (!item || !list) return;
            if (button.dataset.foundationOrderMove === '-1' && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
            if (button.dataset.foundationOrderMove === '1' && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
        });
    });

    root.querySelector<HTMLFormElement>('[data-foundation-practice-form]')?.addEventListener('submit', event => {
        event.preventDefault();
        const item = lesson.practice[state.practiceIndex];
        const form = event.currentTarget as HTMLFormElement;
        const answer = readPracticeAnswer(item, form);
        const result = gradeFoundationPractice(item, answer);
        state.feedback = result;
        if (result.correct) state.completedPracticeIds.add(item.id);
        if (item.kind === 'order' && Array.isArray(answer)) state.orderByPracticeId.set(item.id, answer);
        actions.render();
    });

    root.querySelector<HTMLButtonElement>('[data-foundation-mission-check]')?.addEventListener('click', () => {
        const draft = root.querySelector<HTMLTextAreaElement>('[data-foundation-mission-draft]')?.value.trim() ?? '';
        const feedback = root.querySelector<HTMLElement>('[data-foundation-mission-feedback]');
        if (!feedback) return;
        const review = reviewMissionDraft(draft);
        feedback.hidden = false;
        feedback.dataset.result = review.pass ? 'review' : 'incorrect';
        feedback.innerHTML = `<strong>${escapeHtml(review.title)}</strong><p>${escapeHtml(review.body)}</p>`;
        if (review.pass) {
            const modelBody = root.querySelector<HTMLElement>('[data-foundation-model-body]');
            if (modelBody && modelBody.dataset.unlocked !== 'true') {
                modelBody.dataset.unlocked = 'true';
                modelBody.lang = 'ja';
                modelBody.textContent = lesson.finalTask.model;
            }
        }
    });

    root.querySelector<HTMLButtonElement>('[data-foundation-complete]')?.addEventListener('click', actions.onComplete);
}

export function reviewMissionDraft(draft: string): { pass: boolean; title: string; body: string } {
    const japanese = /[぀-ヿ一-鿿]/.test(draft);
    const sentences = (draft.match(/[。！？!?]/g) ?? []).length;
    if (!japanese) return { pass: false, title: 'もう少し書きましょう。', body: 'Write your draft in Japanese — kana and the kanji from this lesson.' };
    if (sentences < 2) return { pass: false, title: 'もう少し書きましょう。', body: 'Write at least two complete sentences, each ending with 。' };
    if (draft.length < 20) return { pass: false, title: 'もう少し書きましょう。', body: 'Add a little more detail — aim for two full sentences.' };
    return { pass: true, title: '下書きができました。', body: 'Read it aloud, then use the checks below and compare with the model.' };
}

export function gradeFoundationPractice(item: PracticeItem, answer: string | readonly string[]): FoundationFeedback {
    const expected = item.answer;
    const correct = typeof expected !== 'string'
        ? typeof answer !== 'string' && expected.length === answer.length && expected.every((value, index) => normalize(value) === normalize(answer[index] ?? ''))
        : typeof answer === 'string' && normalize(expected) === normalize(answer);

    return {
        correct,
        title: correct ? 'いいですね。' : 'もう一度。',
        explanation: item.explanation,
    };
}

function renderSection(lesson: FoundationLesson, state: FoundationPlayerState, selectedKanji: string): string {
    switch (state.section) {
        case 'scene':
            return renderScene(lesson, state);
        case 'words':
            return renderWords(lesson, state);
        case 'grammar':
            return renderGrammar(lesson, state);
        case 'practice':
            return renderPractice(lesson, state);
        case 'kanji':
            return renderKanji(lesson, state, selectedKanji);
        case 'reading':
            return renderReading(lesson);
        case 'mission':
            return renderMission(lesson);
    }
}

function renderReading(lesson: FoundationLesson): string {
    const fable = fableForRoute(lesson.routeNumber);
    return `<section class="foundation-reading" aria-labelledby="foundation-reading-title">
        <header><div><h2 id="foundation-reading-title"><span lang="ja">${escapeHtml(fable.title.ja)}</span><small>${escapeHtml(fable.title.en)}</small></h2><p>${escapeHtml(fable.summary.en)} Tap the eye for readings, the translate icon for meaning — or read it cold first.</p></div></header>
        <div class="foundation-reading-body">
            ${fable.sentences.map(sentence => `<p class="foundation-reading-line">${revealSentenceMarkup(sentence.tokens, { gloss: sentence.en })}</p>`).join('')}
        </div>
        <section class="foundation-reading-check" aria-labelledby="foundation-reading-check-title">
            <h3 id="foundation-reading-check-title">わかりましたか</h3>
            ${fable.comprehension.map((question, qi) => `<fieldset class="foundation-reading-q" data-reading-q data-answer="${question.answer}"><legend>${escapeHtml(question.q.en)}</legend>${question.choices.map((choice, ci) => `<label><input type="radio" name="foundation-reading-${qi}" value="${ci}"><span>${escapeHtml(choice)}</span></label>`).join('')}<p class="foundation-reading-result" data-reading-result hidden role="status"></p></fieldset>`).join('')}
        </section>
    </section>`;
}

function renderScene(lesson: FoundationLesson, state: FoundationPlayerState): string {
    return `<section class="foundation-scene" aria-labelledby="foundation-scene-title">
        <figure class="foundation-scene-art">
            <picture><source media="(max-width: 760px)" srcset="${escapeAttribute(mobileScenePath(lesson.sceneImage))}"><img src="${escapeAttribute(lesson.sceneImage)}" alt="${escapeAttribute(lesson.scene)}"></picture>
            <figcaption id="foundation-scene-title"><span lang="ja">${escapeHtml(lesson.opening[0]?.japanese ?? '')}</span><strong>${escapeHtml(lesson.scene)}</strong></figcaption>
            <button type="button" class="academy-button academy-button-primary foundation-play-scene" data-play-scene><i data-lucide="play"></i><span>シーンを見る</span></button>
        </figure>
        <div class="foundation-vn-script">
            <div class="foundation-vn-toolbar"><span>${lesson.cast.map(name => escapeHtml(name)).join(' · ')}</span><button type="button" data-toggle-meaning aria-pressed="${state.showMeaning}">${state.showMeaning ? '日本語だけ' : 'Meaning'}</button></div>
            ${lesson.opening.map(line => `<div class="foundation-vn-line"><strong>${escapeHtml(line.speaker)}</strong><p lang="ja">${escapeHtml(line.japanese)}</p>${state.showMeaning ? `<small>${escapeHtml(line.meaning)}</small>` : ''}</div>`).join('')}
        </div>
        <div class="foundation-objectives"><h2>このレッスンで</h2><ul>${lesson.objectives.map(objective => `<li>${escapeHtml(objective)}</li>`).join('')}</ul></div>
        <div class="foundation-mapping" aria-label="Course mappings"><span>Class: ${escapeHtml(lesson.mapping.ucl)}</span><span>Genki: ${escapeHtml(lesson.mapping.genki)}</span><span>Minna: ${escapeHtml(lesson.mapping.minna)}</span></div>
    </section>`;
}

function renderWords(lesson: FoundationLesson, state: FoundationPlayerState): string {
    return `<section class="foundation-study-section foundation-words" aria-labelledby="foundation-words-title">
        <header><div><h2 id="foundation-words-title">ことば</h2><p>Read the example first. Use the meaning only when the sentence is still unclear.</p></div><button type="button" data-toggle-meaning aria-pressed="${state.showMeaning}">${state.showMeaning ? 'Hide meanings' : 'Show meanings'}</button></header>
        <div class="foundation-word-list">${lesson.vocabulary.map(item => `<article>
            <div><strong lang="ja">${escapeHtml(item.japanese)}</strong><span lang="ja">${escapeHtml(item.reading)}</span>${state.showMeaning ? `<small>${escapeHtml(item.meaning)}</small>` : ''}</div>
            <p lang="ja">${escapeHtml(item.example)}</p>${state.showMeaning ? `<small>${escapeHtml(item.exampleMeaning)}</small>` : ''}
        </article>`).join('')}</div>
    </section>`;
}

function renderGrammar(lesson: FoundationLesson, state: FoundationPlayerState): string {
    return `<section class="foundation-study-section foundation-grammar" aria-labelledby="foundation-grammar-title">
        <header><div><h2 id="foundation-grammar-title">文法</h2><p>Meaning first, form second, then a sentence you could use tonight.</p></div><button type="button" data-toggle-meaning aria-pressed="${state.showMeaning}">${state.showMeaning ? '日本語を中心に' : 'Show translations'}</button></header>
        <div class="foundation-grammar-list">${lesson.grammar.map(point => `<article>
            <div class="foundation-grammar-pattern"><strong lang="ja">${escapeHtml(point.pattern)}</strong><span>${escapeHtml(point.meaning)}</span></div>
            <p>${escapeHtml(point.explanation)}</p>
            <div class="foundation-example-list">${point.examples.map(example => `<div><p lang="ja">${escapeHtml(example.japanese)}</p>${state.showMeaning ? `<small>${escapeHtml(example.meaning)}</small>` : ''}${example.note ? `<em>${escapeHtml(example.note)}</em>` : ''}</div>`).join('')}</div>
            <p class="foundation-watch"><strong>気をつけて:</strong> ${escapeHtml(point.watchFor)}</p>
        </article>`).join('')}</div>
    </section>`;
}

function renderPractice(lesson: FoundationLesson, state: FoundationPlayerState): string {
    const item = lesson.practice[state.practiceIndex];
    const completed = state.completedPracticeIds.size;
    return `<section class="foundation-practice" aria-labelledby="foundation-practice-title">
        <header><div><h2 id="foundation-practice-title">練習 ${state.practiceIndex + 1}</h2><p>${completed} / ${lesson.practice.length} checked</p></div><div class="foundation-practice-meter"><span style="--foundation-progress:${Math.round((completed / lesson.practice.length) * 100)}%"></span></div></header>
        <form data-foundation-practice-form>
            <p class="foundation-practice-prompt">${escapeHtml(item.prompt)}</p>
            ${item.japanese ? `<p class="foundation-practice-japanese" lang="ja">${escapeHtml(item.japanese)}</p>` : ''}
            ${renderPracticeInput(item, state)}
            ${state.feedback ? `<div class="foundation-answer-feedback" data-result="${state.feedback.correct ? 'correct' : 'incorrect'}" role="status"><strong>${escapeHtml(state.feedback.title)}</strong><p>${escapeHtml(state.feedback.explanation)}</p></div>` : ''}
            <div class="foundation-practice-actions">
                <button type="button" data-practice-previous ${state.practiceIndex === 0 ? 'disabled' : ''}>Back</button>
                <button type="submit">Check</button>
                <button type="button" data-practice-next ${state.practiceIndex === lesson.practice.length - 1 ? 'disabled' : ''}>Next</button>
            </div>
        </form>
    </section>`;
}

function renderPracticeInput(item: PracticeItem, state: FoundationPlayerState): string {
    if (item.kind === 'choice') {
        return `<fieldset class="foundation-practice-options"><legend class="sr-only">Choose one answer</legend>${item.options?.map(option => `<label><input type="radio" name="foundation-answer" value="${escapeAttribute(option)}" required><span lang="ja">${escapeHtml(option)}</span></label>`).join('') ?? ''}</fieldset>`;
    }
    if (item.kind === 'text') {
        return `<label class="foundation-practice-text"><span>答え</span><input name="foundation-answer" lang="ja" autocomplete="off" required></label>`;
    }
    const items = state.orderByPracticeId.get(item.id) ?? [...(item.options ?? [])];
    return `<ol class="foundation-order-list">${items.map(value => `<li data-foundation-order-item="${escapeAttribute(value)}"><span lang="ja">${escapeHtml(value)}</span><span><button type="button" data-foundation-order-move="-1" aria-label="Move ${escapeAttribute(value)} up">↑</button><button type="button" data-foundation-order-move="1" aria-label="Move ${escapeAttribute(value)} down">↓</button></span></li>`).join('')}</ol>`;
}

function renderKanji(lesson: FoundationLesson, state: FoundationPlayerState, selectedKanji: string): string {
    return `<section class="foundation-study-section foundation-kanji" aria-labelledby="foundation-kanji-title">
        <header><div><h2 id="foundation-kanji-title">漢字</h2><p>Learn the character inside a word from this lesson.</p></div><button type="button" data-toggle-meaning aria-pressed="${state.showMeaning}">${state.showMeaning ? 'Hide meanings' : 'Show meanings'}</button></header>
        <div class="foundation-kanji-mode">
            <section class="foundation-kanji-block" aria-labelledby="foundation-kanji-recognise"><h3 id="foundation-kanji-recognise">Recognise</h3>
                <div class="foundation-kanji-grid">${lesson.kanji.map(item => renderKanjiCard(item, item.character === selectedKanji, state.showMeaning)).join('')}</div>
            </section>
            <section class="foundation-kanji-block foundation-kanji-write academy-doodle-practice" aria-labelledby="foundation-kanji-write"><h3 id="foundation-kanji-write">Write</h3>
                <div class="academy-doodle-layout">
                    <div>
                        <div class="jpdb-reader-doodle-stage"><div class="jpdb-reader-doodle-ghost" aria-hidden="true"></div><canvas class="jpdb-reader-doodle-canvas" aria-label="Kanji writing canvas"></canvas></div>
                        <div class="academy-doodle-tools"><button class="academy-button" type="button" data-doodle-clear>Clear</button><button class="academy-button" type="button" data-doodle-trace aria-pressed="true">Trace</button><button class="academy-button" type="button" data-grade-doodle>Check</button></div>
                        <div class="academy-feedback" data-doodle-feedback hidden tabindex="-1" aria-live="polite"></div>
                    </div>
                    <div class="academy-kanji-selector" aria-label="Choose a kanji">${lesson.kanji.map(item => `<button type="button" data-kanji="${escapeAttribute(item.character)}" aria-pressed="${item.character === selectedKanji}" lang="ja">${escapeHtml(item.character)}</button>`).join('')}</div>
                </div>
            </section>
        </div>
    </section>`;
}

function renderKanjiCard(item: { character: string; reading: string; word: string; meaning: string }, selected: boolean, showMeaning: boolean): string {
    const m = mnemonicFor(item.character);
    const readings = m ? [m.onyomi, m.kunyomi].filter(Boolean).join(' ・ ') : '';
    return `<article class="foundation-kanji-card">
        <div class="foundation-kanji-card-head">
            <strong class="foundation-kanji-glyph" lang="ja">${escapeHtml(item.character)}</strong>
            <div class="foundation-kanji-id">
                <span class="foundation-kanji-keyword">${escapeHtml(m?.keyword ?? item.meaning)}</span>
                ${readings ? `<small class="foundation-kanji-readings" lang="ja">${escapeHtml(readings)}</small>` : ''}
            </div>
        </div>
        <p class="foundation-kanji-word"><span lang="ja">${escapeHtml(item.word)}</span> <small lang="ja">${escapeHtml(item.reading)}</small>${showMeaning ? ` <small class="foundation-kanji-gloss">${escapeHtml(item.meaning)}</small>` : ''}</p>
        ${m && m.components.length ? `<ul class="foundation-kanji-parts" aria-label="Made of">${m.components.map(c => `<li><span lang="ja">${escapeHtml(c.part)}</span><small>${escapeHtml(c.meaning)}</small></li>`).join('')}</ul>` : ''}
        ${m ? `<p class="foundation-kanji-mnemonic">${escapeHtml(m.mnemonic)}</p>` : ''}
        <button type="button" class="foundation-kanji-practise" data-kanji="${escapeAttribute(item.character)}" aria-pressed="${selected}">Practise <span aria-hidden="true">✍</span></button>
    </article>`;
}

function renderMission(lesson: FoundationLesson): string {
    return `<section class="foundation-mission" aria-labelledby="foundation-mission-title">
        <header><p lang="ja">さいごのミッション</p><h2 id="foundation-mission-title">${escapeHtml(lesson.finalTask.title)}</h2><p>${escapeHtml(lesson.finalTask.prompt)}</p></header>
        <label><span>日本語で書く</span><textarea data-foundation-mission-draft lang="ja" rows="7"></textarea></label>
        <button type="button" data-foundation-mission-check>Review my draft</button>
        <div class="foundation-answer-feedback" data-foundation-mission-feedback hidden role="status"></div>
        <div class="foundation-success-list"><h3>チェック</h3><ul>${lesson.finalTask.success.map(check => `<li><label><input type="checkbox"> ${escapeHtml(check)}</label></li>`).join('')}</ul></div>
        <details class="foundation-model" data-foundation-model><summary>モデルを見る</summary><p data-foundation-model-body>Review your draft first — the model opens after your first check.</p></details>
        ${lesson.reviewFrom.length ? `<div class="foundation-review-links"><h3>前のレッスンから</h3><ul>${lesson.reviewFrom.map(review => `<li>${escapeHtml(review)}</li>`).join('')}</ul></div>` : ''}
        <button class="foundation-complete" type="button" data-foundation-complete>Mark lesson complete</button>
    </section>`;
}

function readPracticeAnswer(item: PracticeItem, form: HTMLFormElement): string | readonly string[] {
    if (item.kind === 'order') {
        return Array.from(form.querySelectorAll<HTMLElement>('[data-foundation-order-item]')).map(element => element.dataset.foundationOrderItem ?? '');
    }
    const data = new FormData(form);
    const value = data.get('foundation-answer');
    return typeof value === 'string' ? value : '';
}

function isFoundationSection(value: string | undefined): value is FoundationSection {
    return sections.some(section => section.id === value);
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/[\s。、！？,.!?]/g, '').toLocaleLowerCase('ja');
}

function mobileScenePath(path: string): string {
    if (!path.endsWith('-wide.webp')) return path;
    return path.replace('-wide.webp', '-mobile.webp');
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function escapeAttribute(value: string): string {
    return escapeHtml(value).replaceAll('`', '&#96;');
}
