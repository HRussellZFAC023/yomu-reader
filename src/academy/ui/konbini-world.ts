import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { element } from './dom';

interface KonbiniWorldOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stampId: string;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onCount?: () => void;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

/** A heard Lesson 7 price becomes a physical register count, one thousand-yen note at a time. */
export function renderKonbiniRegister(options: KonbiniWorldOptions): HTMLElement {
    const plan = options.practice.manipulation;
    if (plan?.kind !== 'cash-count') {
        throw new TypeError(`Konbini practice ${options.practice.id} requires a cash-count plan.`);
    }

    const root = element('section', 'academy-world-practice academy-konbini-register');
    root.dataset.worldPractice = options.practice.id;
    root.dataset.worldInteraction = plan.kind;
    root.dataset.konbiniTransaction = options.practice.id;
    root.dataset.konbiniPhase = 'listen';
    root.setAttribute('aria-label', options.language === 'ja' ? 'レジで値段を数える' : 'Count the price at the register');

    const receipt = element('div', 'academy-konbini-receipt');
    const registerLabel = element('p', 'academy-konbini-register-label');
    registerLabel.textContent = options.practice.sceneLabel?.[options.language]
        ?? (options.language === 'ja' ? 'レジ' : 'Register');
    const item = element('p', 'academy-konbini-item');
    item.lang = options.language === 'ja' ? 'ja' : 'en';
    item.textContent = plan.item[options.language];
    const prompt = element('p', 'academy-world-practice-prompt');
    prompt.textContent = options.practice.prompt[options.language];

    const transcript = element('p', 'academy-world-transcript academy-konbini-transcript');
    transcript.id = `academy-konbini-transcript-${options.practice.id}`;
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = options.practice.audioLine;

    const counter = element('div', 'academy-konbini-cash-counter');
    counter.setAttribute('role', 'group');
    counter.setAttribute('aria-label', options.language === 'ja' ? '千円札の枚数' : 'Number of ¥1,000 notes');
    const decrease = counterButton('-', options.language === 'ja' ? '千円札を一枚減らす' : 'Remove one ¥1,000 note');
    const amount = element('output', 'academy-konbini-amount');
    amount.setAttribute('aria-live', 'polite');
    const increase = counterButton('+', options.language === 'ja' ? '千円札を一枚増やす' : 'Add one ¥1,000 note');
    const noteRail = element('div', 'academy-konbini-note-rail');
    noteRail.setAttribute('aria-hidden', 'true');
    const notes = Array.from({ length: plan.maxCount }, (_, index) => {
        const note = element('span', 'academy-konbini-note');
        note.style.setProperty('--konbini-note-index', String(index));
        noteRail.append(note);
        return note;
    });
    counter.append(decrease, amount, increase, noteRail);

    const primary = element('button', 'academy-world-listen academy-konbini-primary-action');
    primary.type = 'button';
    primary.dataset.worldListen = options.practice.id;
    primary.setAttribute('aria-describedby', transcript.id);
    const status = element('p', 'academy-world-practice-status academy-konbini-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const request = element('p', 'academy-konbini-request');
    request.lang = 'ja';
    request.hidden = true;
    request.textContent = plan.completionLine?.ja ?? '';

    let count = 0;
    let listeningStarted = false;
    let complete = false;
    const setCounterEnabled = (enabled: boolean) => {
        decrease.disabled = !enabled || count === 0;
        increase.disabled = !enabled || count === plan.maxCount;
    };
    const updateCount = () => {
        const yen = count * plan.denominationYen;
        amount.value = String(yen);
        amount.textContent = `¥${yen.toLocaleString('en-US')}`;
        notes.forEach((note, index) => note.classList.toggle('is-counted', index < count));
        setCounterEnabled(listeningStarted && !complete);
    };
    const finish = () => {
        complete = true;
        root.dataset.konbiniPhase = 'complete';
        root.dataset.konbiniOutcome = 'pass';
        root.dataset.practiceComplete = 'true';
        primary.disabled = true;
        setCounterEnabled(false);
        request.hidden = !plan.completionLine;
        status.textContent = options.practice.success[options.language];
        const evaluation = completedWorldPracticeEvaluation(options.practice);
        if (evaluation) options.onPracticeComplete?.(options.practice.id, options.stampId, evaluation);
        else options.onPracticeComplete?.(options.practice.id, options.stampId);
    };

    decrease.addEventListener('click', () => {
        count = Math.max(0, count - 1);
        options.onCount?.();
        updateCount();
    });
    increase.addEventListener('click', () => {
        count = Math.min(plan.maxCount, count + 1);
        options.onCount?.();
        updateCount();
    });
    primary.addEventListener('click', () => {
        if (!listeningStarted) {
            listeningStarted = true;
            root.dataset.konbiniPhase = 'count';
            transcript.hidden = false;
            primary.textContent = options.language === 'ja' ? 'レジを確かめる' : 'Check register';
            updateCount();
            increase.focus();
            void (options.onListen?.(options.practice.audioLine) ?? Promise.resolve(false)).then(played => {
                if (complete || root.dataset.konbiniOutcome === 'repair') return;
                status.textContent = played
                    ? options.language === 'ja' ? '値段を再生しました。千円札を数えてください。' : 'Price playing. Count the ¥1,000 notes.'
                    : options.language === 'ja' ? '表示された値段を読み、千円札を数えてください。' : 'Read the shown price and count the ¥1,000 notes.';
            });
            return;
        }
        if (count === plan.correctCount) {
            finish();
            return;
        }
        root.dataset.konbiniOutcome = 'repair';
        status.textContent = options.language === 'ja'
            ? '値段をもう一度聞いて、千円札の枚数だけ直してください。'
            : 'Listen once more and adjust only the number of ¥1,000 notes.';
    });

    primary.textContent = options.language === 'ja' ? '値段を聞く' : 'Listen for price';
    setCounterEnabled(false);
    updateCount();
    receipt.append(registerLabel, item, prompt, transcript, counter, primary, request, status);
    root.append(receipt);
    return root;
}

function counterButton(symbol: '-' | '+', label: string): HTMLButtonElement {
    const button = element('button', 'academy-konbini-counter-button');
    button.type = 'button';
    button.textContent = symbol;
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
}
