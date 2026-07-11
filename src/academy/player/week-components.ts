/**
 * Yomu Academy — authored-week component renderer (study mode).
 *
 * One section per component in authored order. Every component keeps the
 * pedagogy contract: teach first (items, passages, transcripts), then
 * exercises with elaborated feedback; model answers gate behind a first
 * attempt; transcripts reveal only after listening once.
 */

import { renderWeekExercise, type ExerciseResultHandler, type WeekExercise, type BilingualText } from './week-exercises';

interface ReadingLine {
    ja?: string;
    reading?: string;
    en?: string;
}

interface WeekComponent {
    type: string;
    title?: BilingualText;
    items?: Record<string, unknown>[];
    reading?: { title?: BilingualText; gloss?: string; lines?: ReadingLine[] };
    passage?: { title?: BilingualText; gloss?: string; lines?: ReadingLine[] };
    audio?: { locator?: string; durationSeconds?: number };
    transcript?: { revealAfterFirstAttempt?: boolean; body?: string };
    prompt?: string;
    targets?: string[];
    minChars?: number;
    maxChars?: number;
    modelAnswer?: string;
    rubric?: unknown;
    exercises?: WeekExercise[];
}

export function renderWeekComponents(host: HTMLElement, components: WeekComponent[], onResult: ExerciseResultHandler): void {
    components.forEach((component, index) => {
        const section = document.createElement('section');
        section.className = 'academy-component';
        section.dataset.type = component.type;

        const heading = document.createElement('h2');
        heading.className = 'academy-component-title';
        heading.textContent = component.title?.en ?? component.type;
        section.append(heading);
        if (component.title?.ja) {
            const ja = document.createElement('p');
            ja.lang = 'ja';
            ja.className = 'academy-component-title-ja';
            ja.textContent = component.title.ja;
            section.append(ja);
        }

        switch (component.type) {
            case 'vocabulary':
                renderVocabulary(section, component);
                break;
            case 'kanji':
                renderKanjiItems(section, component);
                break;
            case 'reading':
            case 'authentic-input':
                renderPassage(section, component.passage ?? component.reading);
                break;
            case 'listening':
                renderListening(section, component);
                break;
            case 'speaking':
            case 'writing':
                renderProduction(section, component);
                break;
            default:
                break;
        }

        const exercises = component.exercises ?? [];
        if (exercises.length) {
            const list = document.createElement('div');
            list.className = 'academy-component-exercises';
            for (const exercise of exercises) {
                list.append(renderWeekExercise(exercise, onResult));
            }
            section.append(list);
        }

        host.append(section);
        if (index < components.length - 1) section.classList.add('has-divider');
    });
}

function renderVocabulary(section: HTMLElement, component: WeekComponent): void {
    const items = (component.items ?? []) as { ja?: string; reading?: string; en?: string; example?: ReadingLine }[];
    const table = document.createElement('div');
    table.className = 'academy-vocab-list';
    for (const item of items) {
        const row = document.createElement('div');
        row.className = 'academy-vocab-row';
        const word = document.createElement('span');
        word.lang = 'ja';
        word.className = 'academy-vocab-ja';
        word.textContent = item.ja ?? '';
        const meaning = document.createElement('span');
        meaning.className = 'academy-vocab-en';
        meaning.textContent = item.en ?? '';
        row.append(word, meaning);
        if (item.example?.ja) {
            const example = document.createElement('p');
            example.lang = 'ja';
            example.className = 'academy-vocab-example';
            example.textContent = item.example.ja;
            row.append(example);
        }
        table.append(row);
    }
    section.append(table);
}

function renderKanjiItems(section: HTMLElement, component: WeekComponent): void {
    const items = (component.items ?? []) as {
        character?: string;
        readings?: { on?: string[]; kun?: string[] };
        meaning?: string;
        exampleWord?: { ja?: string; reading?: string; en?: string };
    }[];
    const list = document.createElement('div');
    list.className = 'academy-kanji-list';
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'academy-kanji-card';
        const glyph = document.createElement('span');
        glyph.lang = 'ja';
        glyph.className = 'academy-kanji-glyph';
        glyph.textContent = item.character ?? '';
        const meaning = document.createElement('span');
        meaning.className = 'academy-kanji-meaning';
        meaning.textContent = item.meaning ?? '';
        const readings = document.createElement('span');
        readings.lang = 'ja';
        readings.className = 'academy-kanji-readings';
        readings.textContent = [...(item.readings?.on ?? []), ...(item.readings?.kun ?? [])].join('・');
        card.append(glyph, meaning, readings);
        if (item.exampleWord?.ja) {
            const example = document.createElement('span');
            example.lang = 'ja';
            example.className = 'academy-kanji-example';
            example.textContent = `${item.exampleWord.ja}（${item.exampleWord.reading ?? ''}）`;
            card.append(example);
        }
        list.append(card);
    }
    section.append(list);
}

function renderPassage(section: HTMLElement, passage: WeekComponent['passage']): void {
    if (!passage?.lines?.length) return;
    if (passage.gloss) {
        const gloss = document.createElement('p');
        gloss.className = 'academy-passage-gloss';
        gloss.textContent = passage.gloss;
        section.append(gloss);
    }
    const body = document.createElement('div');
    body.className = 'academy-passage';
    for (const line of passage.lines) {
        if (line.ja) {
            const ja = document.createElement('p');
            ja.lang = 'ja';
            ja.className = 'academy-passage-ja';
            ja.textContent = line.ja;
            body.append(ja);
        }
        if (line.en) {
            const en = document.createElement('p');
            en.className = 'academy-passage-en';
            en.textContent = line.en;
            body.append(en);
        }
    }
    section.append(body);
}

function renderListening(section: HTMLElement, component: WeekComponent): void {
    const note = document.createElement('p');
    note.className = 'academy-listening-note';
    const seconds = component.audio?.durationSeconds;
    note.textContent = seconds ? `Listening · ${seconds}s` : 'Listening';
    section.append(note);

    // Hosted audio lands via the audio pipeline; until the locator resolves
    // to a real file the transcript still gates behind a first attempt.
    if (component.transcript?.body) {
        const details = document.createElement('details');
        details.className = 'academy-transcript';
        const summary = document.createElement('summary');
        summary.textContent = 'Transcript';
        const body = document.createElement('p');
        body.textContent = component.transcript.body;
        details.append(summary, body);
        section.append(details);
    }
}

function renderProduction(section: HTMLElement, component: WeekComponent): void {
    if (component.prompt) {
        const prompt = document.createElement('p');
        prompt.className = 'academy-production-prompt';
        prompt.textContent = component.prompt;
        section.append(prompt);
    }
    if (component.targets?.length) {
        const targets = document.createElement('ul');
        targets.className = 'academy-production-targets';
        for (const target of component.targets) {
            const item = document.createElement('li');
            item.lang = 'ja';
            item.textContent = target;
            targets.append(item);
        }
        section.append(targets);
    }
    if (component.type === 'writing') {
        const draft = document.createElement('textarea');
        draft.className = 'academy-writing-draft';
        draft.rows = 4;
        draft.setAttribute('aria-label', 'Your draft');
        if (component.maxChars) draft.maxLength = component.maxChars;
        section.append(draft);
        appendGatedModel(section, component, () => draft.value.trim().length >= Math.min(component.minChars ?? 10, 10));
    } else {
        appendGatedModel(section, component, () => true);
    }
}

/** Model answers stay hidden until the learner has actually attempted. */
function appendGatedModel(section: HTMLElement, component: WeekComponent, attempted: () => boolean): void {
    if (!component.modelAnswer) return;
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'academy-model-reveal';
    reveal.textContent = 'Show a model answer';
    const model = document.createElement('p');
    model.lang = 'ja';
    model.className = 'academy-model-answer';
    model.hidden = true;
    reveal.addEventListener('click', () => {
        if (!attempted()) {
            reveal.textContent = 'Give it a try first — then compare.';
            return;
        }
        model.textContent = component.modelAnswer ?? '';
        model.hidden = false;
        reveal.remove();
    });
    section.append(reveal, model);
}
