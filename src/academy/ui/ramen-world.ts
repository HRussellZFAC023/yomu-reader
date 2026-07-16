import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { element } from './dom';

interface RamenWorldOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stampId: string;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onTicketMove?: () => void;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

/** Extra paper depth that makes the approved ramen plate read as an active service counter. */
export function renderRamenServiceScene(): HTMLElement {
    const scene = element('div', 'academy-ramen-service-scene');
    scene.dataset.ramenServiceScene = 'counter-window';
    scene.setAttribute('aria-hidden', 'true');
    ['ticket-rack', 'kitchen-pass', 'service-lamp'].forEach(id => {
        const mark = element('span', 'academy-ramen-service-mark');
        mark.dataset.ramenServiceMark = id;
        scene.append(mark);
    });
    return scene;
}

/** A diegetic source receipt: exact Moodle work is distinct from Minna/Genki support. */
export function renderRamenOrderTicket(language: AcademyLanguage, practice: WorldPractice): HTMLElement {
    const ticket = element('div', 'academy-ramen-order-ticket');
    ticket.dataset.ramenOrderTicket = practice.id;
    ticket.setAttribute('role', 'group');
    ticket.setAttribute('aria-label', language === 'ja' ? '食券' : 'Meal ticket');
    const header = element('div', 'academy-ramen-ticket-header');
    const label = element('p', 'academy-ramen-ticket-label');
    label.lang = 'ja';
    label.textContent = '食券';
    const seat = element('span', 'academy-ramen-ticket-seat');
    seat.textContent = 'COUNTER 01';
    header.append(label, seat);

    const order = element('p', 'academy-ramen-ticket-order');
    order.lang = 'ja';
    order.textContent = '何をいくつ注文しましたか。';
    const cue = element('p', 'academy-ramen-ticket-cue');
    cue.lang = 'ja';
    cue.textContent = practice.sceneLabel?.ja ?? 'CD A-43';
    const support = element('p', 'academy-ramen-ticket-support');
    support.textContent = language === 'ja'
        ? '聞き取りの品物と数を、注文票にそろえる。'
        : 'Tally the listening order on the ticket.';
    ticket.append(header, order, cue);
    if (language === 'en') ticket.append(support);

    if (practice.source) {
        const sources = element('p', 'academy-ramen-ticket-sources');
        sources.dataset.ramenSourcePrimary = practice.source.primary.sourceId;
        sources.dataset.ramenSourceSupport = practice.source.supports.map(source => source.corpus).join(' ');
        sources.textContent = [practice.source.primary, ...practice.source.supports]
            .map(source => source.label[language])
            .join(' · ');
        ticket.append(sources);
    }
    return ticket;
}

/** The ramen counter records a heard source order as quantities, not a guessed request sentence. */
export function renderRamenOrderGrid(options: RamenWorldOptions): HTMLElement {
    const plan = options.practice.manipulation;
    if (plan?.kind !== 'order-grid') {
        throw new TypeError(`Ramen practice ${options.practice.id} requires an order-grid plan.`);
    }

    const root = element('section', 'academy-world-practice academy-ramen-order-grid');
    root.dataset.worldPractice = options.practice.id;
    root.dataset.ramenPractice = 'tally-source-order';
    root.dataset.ramenOutcome = options.practice.id;
    root.dataset.ramenPhase = 'listen';
    root.dataset.jpdbReaderSurfaceIgnore = '';
    const promptId = `academy-ramen-prompt-${options.practice.id}`;
    const statusId = `academy-ramen-status-${options.practice.id}`;
    root.setAttribute('aria-labelledby', promptId);
    root.setAttribute('aria-describedby', statusId);

    const prompt = element('p', 'academy-world-practice-prompt');
    prompt.id = promptId;
    prompt.lang = 'ja';
    prompt.textContent = options.practice.prompt.ja;
    const support = element('p', 'academy-world-practice-support');
    support.hidden = options.language === 'ja';
    support.textContent = options.practice.prompt.en;
    const listen = element('button', 'academy-world-listen');
    listen.type = 'button';
    listen.dataset.worldListen = options.practice.id;
    listen.textContent = options.language === 'ja' ? '聞く' : 'Listen';
    const transcript = element('p', 'academy-world-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = options.practice.audioLine;
    const status = element('p', 'academy-world-practice-status');
    status.id = statusId;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const rows = element('div', 'academy-world-practice-options');
    rows.dataset.ramenTicketRows = options.practice.id;
    rows.setAttribute('aria-label', options.language === 'ja' ? '注文票の数' : 'Order ticket quantities');
    const selected = new Map<string, string>();
    const rowButtons = new Map<string, HTMLButtonElement[]>();
    plan.rows.forEach(row => {
        const group = element('fieldset', 'academy-world-practice-options academy-ramen-order-row');
        group.dataset.ramenOrderRow = row.id;
        const label = element('legend', 'academy-world-practice-prompt');
        label.lang = 'ja';
        label.textContent = row.item.ja;
        group.append(label);
        if (options.language === 'en') {
            const itemSupport = element('p', 'academy-world-practice-support');
            itemSupport.textContent = row.item.en;
            group.append(itemSupport);
        }
        const buttons = row.quantityChoices.map(choice => {
            const button = element('button', 'academy-world-practice-option');
            button.type = 'button';
            button.dataset.choiceId = choice.id;
            button.dataset.ramenOrderRow = row.id;
            button.setAttribute('aria-pressed', 'false');
            const japanese = element('span', 'academy-world-practice-choice-ja');
            japanese.lang = 'ja';
            japanese.textContent = choice.label.ja;
            button.append(japanese);
            if (options.language === 'en') {
                const choiceSupport = element('span', 'academy-world-practice-choice-support');
                choiceSupport.textContent = choice.label.en;
                button.append(choiceSupport);
            }
            button.addEventListener('click', () => {
                selected.set(row.id, choice.id);
                buttons.forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate === button)));
                options.onTicketMove?.();
                status.textContent = options.language === 'ja'
                    ? `${row.item.ja}の数を注文票に書いた。`
                    : `Recorded the quantity for ${row.item.en.toLocaleLowerCase()}.`;
            });
            group.append(button);
            return button;
        });
        rowButtons.set(row.id, buttons);
        rows.append(group);
    });

    const check = element('button', 'academy-world-activity-button');
    check.type = 'button';
    check.dataset.ramenCheck = options.practice.id;
    check.textContent = options.language === 'ja' ? '注文票を確かめる' : 'Check ticket';
    let complete = false;
    check.addEventListener('click', () => {
        if (complete) return;
        if (selected.size !== plan.rows.length) {
            status.textContent = options.language === 'ja'
                ? '注文票の品物を一つずつ確認してください。'
                : 'Check every item on the order ticket.';
            return;
        }
        const correct = plan.rows.every(row => selected.get(row.id) === row.correctQuantityId);
        if (!correct) {
            transcript.hidden = false;
            status.textContent = options.language === 'ja'
                ? 'もう一度聞いて、品物と数をそろえてください。'
                : 'Listen again and match each item with its quantity.';
            return;
        }
        complete = true;
        root.dataset.ramenPhase = 'complete';
        root.dataset.practiceComplete = 'true';
        transcript.hidden = false;
        check.disabled = true;
        rowButtons.forEach(buttons => buttons.forEach(button => { button.disabled = true; }));
        status.textContent = options.practice.success[options.language];
        const evaluation = completedWorldPracticeEvaluation(options.practice);
        if (evaluation) options.onPracticeComplete?.(options.practice.id, options.stampId, evaluation);
        else options.onPracticeComplete?.(options.practice.id, options.stampId);
    });

    let listening = false;
    listen.addEventListener('click', async () => {
        if (listening) return;
        listening = true;
        listen.disabled = true;
        listen.setAttribute('aria-busy', 'true');
        root.dataset.ramenPhase = 'tally';
        const played = await (options.onListen?.(options.practice.audioLine) ?? Promise.resolve(false)).catch(() => false);
        transcript.hidden = played;
        if (!complete) {
            status.textContent = played
                ? options.language === 'ja' ? '音声を再生しました。注文票の数をそろえましょう。' : 'Playing the order. Tally the quantities on the ticket.'
                : options.language === 'ja' ? '音声が使えないため、文字を表示しました。' : 'Audio is unavailable, so the transcript is shown.';
        }
        listening = false;
        listen.disabled = complete;
        listen.setAttribute('aria-busy', 'false');
    });

    root.append(prompt, support, listen, transcript, rows, check, status);
    return root;
}
