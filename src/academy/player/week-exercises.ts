/**
 * Yomu Academy — authored-week exercise player.
 *
 * Renders the week-JSON exercise kinds (choice, multi-choice, match, order,
 * cloze, exact) interactively with deterministic grading and elaborated
 * feedback: the authored explanation after any attempt, plus the matching
 * wrongAnswerExplanations entry when a known wrong answer is given.
 */

export interface BilingualText {
    en?: string;
    ja?: string;
}

interface WrongAnswerExplanation {
    trigger: string;
    message: string;
}

export interface WeekExercise {
    id: string;
    kind: 'choice' | 'multi-choice' | 'match' | 'order' | 'cloze' | 'exact';
    prompt?: BilingualText;
    japanese?: string;
    explanation?: string;
    reviewTag?: string;
    autoGraded?: boolean;
    options?: { id: string; label: BilingualText; correct?: boolean }[];
    pairs?: { id: string; left: BilingualText; right: BilingualText }[];
    correctOrder?: string[];
    blanks?: { id: string; answer: { primary: string; alternatives?: string[] } }[];
    answer?: { primary: string; alternatives?: string[] };
    wrongAnswerExplanations?: WrongAnswerExplanation[];
}

export interface ExerciseResult {
    exerciseId: string;
    reviewTag?: string;
    correct: boolean;
}

export type ExerciseResultHandler = (result: ExerciseResult) => void;

/** Normalise Japanese answers: NFKC, strip all whitespace and trailing 。 */
export function normaliseAnswer(raw: string): string {
    return raw.normalize('NFKC').replace(/[\s　]+/g, '').replace(/。$/, '');
}

export function answerMatches(raw: string, answer: { primary: string; alternatives?: string[] }): boolean {
    const given = normaliseAnswer(raw);
    if (!given) return false;
    return [answer.primary, ...(answer.alternatives ?? [])].some(candidate => normaliseAnswer(candidate) === given);
}

function wrongAnswerMessage(raw: string, explanations: WrongAnswerExplanation[] | undefined): string | null {
    if (!explanations?.length) return null;
    const given = normaliseAnswer(raw);
    const hit = explanations.find(entry => normaliseAnswer(entry.trigger) === given || given.includes(normaliseAnswer(entry.trigger)));
    return hit?.message ?? null;
}

export function renderWeekExercise(exercise: WeekExercise, onResult: ExerciseResultHandler): HTMLElement {
    const root = element('section', 'academy-exercise');
    root.dataset.kind = exercise.kind;
    if (exercise.prompt?.ja) {
        const ja = element('p', 'academy-exercise-prompt-ja');
        ja.lang = 'ja';
        ja.textContent = exercise.prompt.ja;
        root.append(ja);
    }
    if (exercise.prompt?.en) {
        const en = element('p', 'academy-exercise-prompt-en');
        en.textContent = exercise.prompt.en;
        root.append(en);
    }

    const feedback = element('div', 'academy-exercise-feedback');
    feedback.hidden = true;

    const report = (correct: boolean, extraMessage?: string | null) => {
        feedback.hidden = false;
        feedback.dataset.result = correct ? 'correct' : 'incorrect';
        feedback.replaceChildren();
        const verdict = element('p', 'academy-exercise-verdict');
        verdict.textContent = correct ? 'そのとおり！' : 'もうすこし。';
        feedback.append(verdict);
        if (extraMessage) {
            const why = element('p', 'academy-exercise-why');
            why.textContent = extraMessage;
            feedback.append(why);
        }
        if (exercise.explanation) {
            const explanation = element('p', 'academy-exercise-explanation');
            explanation.textContent = exercise.explanation;
            feedback.append(explanation);
        }
        onResult({ exerciseId: exercise.id, reviewTag: exercise.reviewTag, correct });
    };

    switch (exercise.kind) {
        case 'choice':
            renderChoice(root, exercise, report, false);
            break;
        case 'multi-choice':
            renderChoice(root, exercise, report, true);
            break;
        case 'match':
            renderMatch(root, exercise, report);
            break;
        case 'order':
            renderOrder(root, exercise, report);
            break;
        case 'cloze':
            renderCloze(root, exercise, report);
            break;
        case 'exact':
            renderExact(root, exercise, report);
            break;
    }

    root.append(feedback);
    return root;
}

function renderChoice(
    root: HTMLElement,
    exercise: WeekExercise,
    report: (correct: boolean, why?: string | null) => void,
    multi: boolean,
): void {
    if (exercise.japanese) root.append(japaneseLine(exercise.japanese));
    const options = exercise.options ?? [];
    const list = element('div', 'academy-exercise-options');
    list.setAttribute('role', 'group');
    const picked = new Set<string>();
    const buttons: HTMLButtonElement[] = [];

    const finish = () => {
        const correctIds = new Set(options.filter(option => option.correct).map(option => option.id));
        const correct = picked.size === correctIds.size && [...picked].every(id => correctIds.has(id));
        for (const button of buttons) {
            const id = button.dataset.optionId ?? '';
            button.disabled = true;
            if (correctIds.has(id)) button.dataset.state = 'correct';
            else if (picked.has(id)) button.dataset.state = 'wrong';
        }
        const wrongPick = options.find(option => picked.has(option.id) && !option.correct);
        const why = wrongPick ? wrongAnswerMessage(wrongPick.label.ja ?? wrongPick.label.en ?? '', exercise.wrongAnswerExplanations) : null;
        report(correct, why);
    };

    for (const option of options) {
        const button = element('button', 'academy-exercise-option');
        button.type = 'button';
        button.dataset.optionId = option.id;
        if (option.label.ja) {
            const ja = element('span', 'academy-exercise-option-ja');
            ja.lang = 'ja';
            ja.textContent = option.label.ja;
            button.append(ja);
        }
        if (option.label.en) {
            const en = element('span', 'academy-exercise-option-en');
            en.textContent = option.label.en;
            button.append(en);
        }
        button.addEventListener('click', () => {
            if (multi) {
                if (picked.has(option.id)) {
                    picked.delete(option.id);
                    button.classList.remove('is-picked');
                } else {
                    picked.add(option.id);
                    button.classList.add('is-picked');
                }
            } else {
                picked.add(option.id);
                finish();
            }
        });
        buttons.push(button);
        list.append(button);
    }
    root.append(list);
    if (multi) {
        const check = checkButton(() => finish());
        root.append(check);
    }
}

function renderMatch(root: HTMLElement, exercise: WeekExercise, report: (correct: boolean, why?: string | null) => void): void {
    const pairs = exercise.pairs ?? [];
    const board = element('div', 'academy-exercise-match');
    const leftColumn = element('div', 'academy-match-column');
    const rightColumn = element('div', 'academy-match-column');
    const rightOrder = shuffle(pairs.map(pair => pair.id));
    let activeLeft: HTMLButtonElement | null = null;
    const matches = new Map<string, string>();
    const leftButtons = new Map<string, HTMLButtonElement>();
    const rightButtons = new Map<string, HTMLButtonElement>();

    const maybeFinish = () => {
        if (matches.size !== pairs.length) return;
        const correct = [...matches.entries()].every(([leftId, rightId]) => leftId === rightId);
        for (const [leftId, rightId] of matches.entries()) {
            const ok = leftId === rightId;
            leftButtons.get(leftId)!.dataset.state = ok ? 'correct' : 'wrong';
            rightButtons.get(rightId)!.dataset.state = ok ? 'correct' : 'wrong';
        }
        report(correct);
    };

    for (const pair of pairs) {
        const left = element('button', 'academy-match-item');
        left.type = 'button';
        if (pair.left.ja) {
            left.lang = 'ja';
            left.textContent = pair.left.ja;
        } else {
            left.textContent = pair.left.en ?? '';
        }
        left.addEventListener('click', () => {
            if (matches.has(pair.id)) return;
            activeLeft?.classList.remove('is-active');
            activeLeft = left;
            left.classList.add('is-active');
        });
        leftButtons.set(pair.id, left);
        leftColumn.append(left);
    }
    for (const rightId of rightOrder) {
        const pair = pairs.find(candidate => candidate.id === rightId)!;
        const right = element('button', 'academy-match-item');
        right.type = 'button';
        if (pair.right.ja) {
            right.lang = 'ja';
            right.textContent = pair.right.ja;
        } else {
            right.textContent = pair.right.en ?? '';
        }
        right.addEventListener('click', () => {
            if (!activeLeft || [...matches.values()].includes(pair.id)) return;
            const leftId = [...leftButtons.entries()].find(([, button]) => button === activeLeft)?.[0];
            if (!leftId) return;
            matches.set(leftId, pair.id);
            activeLeft.classList.remove('is-active');
            activeLeft.classList.add('is-matched');
            right.classList.add('is-matched');
            activeLeft = null;
            maybeFinish();
        });
        rightButtons.set(pair.id, right);
        rightColumn.append(right);
    }
    board.append(leftColumn, rightColumn);
    root.append(board);
}

function renderOrder(root: HTMLElement, exercise: WeekExercise, report: (correct: boolean, why?: string | null) => void): void {
    const options = exercise.options ?? [];
    const pool = element('div', 'academy-exercise-options academy-order-pool');
    const sequence = element('div', 'academy-order-sequence');
    sequence.setAttribute('aria-label', 'Your order');
    const chosen: string[] = [];

    const reset = element('button', 'academy-exercise-reset');
    reset.type = 'button';
    reset.textContent = 'Start over';
    reset.addEventListener('click', () => {
        chosen.length = 0;
        sequence.replaceChildren();
        pool.querySelectorAll('button').forEach(button => { button.disabled = false; });
    });

    for (const option of options) {
        const button = element('button', 'academy-exercise-option');
        button.type = 'button';
        if (option.label.ja) {
            button.lang = 'ja';
            button.textContent = option.label.ja;
        } else {
            button.textContent = option.label.en ?? '';
        }
        button.addEventListener('click', () => {
            button.disabled = true;
            chosen.push(option.id);
            const chip = element('span', 'academy-order-chip');
            chip.textContent = button.textContent ?? '';
            if (option.label.ja) chip.lang = 'ja';
            sequence.append(chip);
            if (chosen.length === options.length) {
                const target = exercise.correctOrder ?? [];
                const correct = chosen.length === target.length && chosen.every((id, index) => id === target[index]);
                report(correct);
            }
        });
        pool.append(button);
    }
    root.append(sequence, pool, reset);
}

function renderCloze(root: HTMLElement, exercise: WeekExercise, report: (correct: boolean, why?: string | null) => void): void {
    const blanks = exercise.blanks ?? [];
    const line = element('p', 'academy-exercise-cloze');
    line.lang = 'ja';
    const parts = (exercise.japanese ?? '').split('＿');
    const inputs: HTMLInputElement[] = [];
    parts.forEach((part, index) => {
        line.append(document.createTextNode(part));
        if (index < parts.length - 1) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'academy-cloze-input';
            input.autocomplete = 'off';
            input.setAttribute('aria-label', `Blank ${index + 1}`);
            inputs.push(input);
            line.append(input);
        }
    });
    root.append(line);
    root.append(checkButton(() => {
        let allCorrect = true;
        let why: string | null = null;
        inputs.forEach((input, index) => {
            const blank = blanks[index];
            if (!blank) return;
            const ok = answerMatches(input.value, blank.answer);
            input.dataset.state = ok ? 'correct' : 'wrong';
            if (!ok) {
                allCorrect = false;
                why = why ?? wrongAnswerMessage(input.value, exercise.wrongAnswerExplanations);
            }
        });
        report(allCorrect, why);
    }));
}

function renderExact(root: HTMLElement, exercise: WeekExercise, report: (correct: boolean, why?: string | null) => void): void {
    if (exercise.japanese) root.append(japaneseLine(exercise.japanese));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'academy-exact-input';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your answer');
    root.append(input);
    root.append(checkButton(() => {
        const ok = exercise.answer ? answerMatches(input.value, exercise.answer) : false;
        input.dataset.state = ok ? 'correct' : 'wrong';
        report(ok, ok ? null : wrongAnswerMessage(input.value, exercise.wrongAnswerExplanations));
    }));
}

function japaneseLine(text: string): HTMLElement {
    const line = element('p', 'academy-exercise-ja');
    line.lang = 'ja';
    line.textContent = text;
    return line;
}

function checkButton(onCheck: () => void): HTMLButtonElement {
    const button = element('button', 'academy-exercise-check');
    button.type = 'button';
    button.textContent = 'Check';
    button.addEventListener('click', () => {
        button.disabled = true;
        onCheck();
    });
    return button;
}

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}
