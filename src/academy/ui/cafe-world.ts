import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice, WorldStamp } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { choiceToken, element } from './dom';

export interface CafeOrderOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stamp: WorldStamp;
    readonly onListen?: (line: string, bindingId?: string) => Promise<boolean>;
    readonly onComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

/** Cafe owns one staged action: hear the order, then resolve its price or quantity. */
export function renderCafeOrder(options: CafeOrderOptions): HTMLElement {
    const mode = options.practice.id === 'cafe-coffee-counter' ? 'quantity' : 'price';
    const root = element('div', 'academy-cafe-order');
    root.dataset.worldPractice = options.practice.id;
    root.dataset.cafeOrderMode = mode;
    root.dataset.cafeOrderState = 'ready';

    const heading = element('div', 'academy-cafe-order-heading');
    const sequence = element('p', 'academy-cafe-order-sequence');
    sequence.textContent = mode === 'price' ? 'ORDER 01 / 値段' : 'REPLAY 02 / 数';
    const title = element('h2', 'academy-cafe-order-title');
    title.id = `academy-cafe-order-${mode}`;
    title.lang = 'ja';
    title.textContent = options.practice.prompt.ja;
    const support = element('p', 'academy-cafe-order-support');
    support.textContent = options.practice.prompt[options.language];
    heading.append(sequence, title);
    if (options.language === 'en') heading.append(support);

    const menu = element('div', 'academy-cafe-menu-line');
    menu.setAttribute('aria-label', options.language === 'ja' ? 'コーヒーの注文票' : 'Coffee order slip');
    const item = element('span', 'academy-cafe-menu-item');
    item.lang = 'ja';
    item.textContent = 'コーヒー';
    const mark = element('span', 'academy-cafe-menu-mark');
    mark.dataset.cafeOrderMark = mode;
    mark.textContent = mode === 'price' ? '¥ ?' : '× ?';
    menu.append(item, mark);

    const transcript = element('p', 'academy-cafe-order-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = `「${options.practice.audioLine}」`;

    const status = element('p', 'academy-cafe-order-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = mode === 'price'
        ? options.language === 'ja' ? '値段を聞き取る。' : 'Listen for the price.'
        : options.language === 'ja' ? '飲み物と数を聞き取る。' : 'Listen for the drink and quantity.';

    const listen = element('button', 'academy-cafe-order-listen');
    listen.type = 'button';
    listen.dataset.cafePrimaryAction = 'listen';
    listen.textContent = options.language === 'ja' ? '注文を聞く' : 'Hear the order';
    listen.setAttribute('aria-label', options.language === 'ja' ? '注文を聞く' : 'Hear the order');

    const choices = element('div', 'academy-cafe-order-options');
    choices.hidden = true;
    choices.tabIndex = -1;
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', title.id);
    const orderScene = cafeOrderScene(options);
    let complete = false;
    let listening = false;
    let heardOnce = false;
    options.practice.choices.forEach((choice, index) => {
        const answer = element('button', 'academy-cafe-order-option');
        answer.type = 'button';
        answer.dataset.choiceId = choiceToken(index);
        const japanese = element('span', 'academy-cafe-order-option-ja academy-assessed-japanese');
        japanese.setAttribute('data-jpdb-reader-surface-ignore', '');
        japanese.lang = 'ja';
        japanese.textContent = choice.label.ja;
        answer.append(japanese);
        if (options.language === 'en') {
            const translation = element('span', 'academy-cafe-order-option-en');
            translation.textContent = choice.label.en;
            answer.append(translation);
        }
        answer.addEventListener('click', () => {
            if (complete) return;
            transcript.hidden = false;
            if (choice.id !== options.practice.correctChoiceId) {
                root.dataset.cafeOrderState = 'retry';
                status.textContent = options.language === 'ja'
                    ? 'もう一度、値段と数に注意して聞いてください。'
                    : 'Listen again for the price and quantity.';
                listen.focus();
                return;
            }
            complete = true;
            root.dataset.cafeOrderState = 'complete';
            root.dataset.practiceComplete = 'true';
            mark.textContent = choice.label.ja;
            status.textContent = options.practice.success[options.language];
            listen.disabled = true;
            choices.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
            orderScene.unlock();
            options.onComplete?.(
                options.practice.id,
                options.stamp.id,
                completedWorldPracticeEvaluation(options.practice),
            );
        });
        choices.append(answer);
    });

    listen.addEventListener('click', async () => {
        if (complete || listening) return;
        listening = true;
        listen.disabled = true;
        listen.setAttribute('aria-busy', 'true');
        root.dataset.cafeOrderState = 'choosing';
        transcript.hidden = false;
        choices.hidden = false;
        if (!heardOnce) choices.focus();
        let played = false;
        try {
            played = await (options.onListen?.(
                options.practice.audioLine,
                `world-practice:${options.practice.id}`,
            ) ?? Promise.resolve(false));
        } catch {
            played = false;
        } finally {
            listening = false;
            if (root.closest<HTMLElement>('.academy-world-screen')?.dataset.academyDisposed === 'true') return;
            heardOnce = true;
            listen.removeAttribute('aria-busy');
            listen.textContent = options.language === 'ja' ? 'もう一度聞く' : 'Replay order';
            listen.setAttribute('aria-label', options.language === 'ja' ? '注文をもう一度聞く' : 'Replay the order');
            if (!complete) listen.disabled = false;
            if (root.dataset.cafeOrderState !== 'choosing') return;
            status.textContent = played
                ? options.language === 'ja' ? '聞こえた内容を注文票に合わせる。' : 'Match what you heard to the order slip.'
                : options.language === 'ja' ? '音声が使えません。表示された台詞で続けてください。' : 'Audio is unavailable. Continue with the shown line.';
        }
    });

    root.append(heading, menu, transcript, status, listen, choices, orderScene.element);
    return root;
}

function cafeOrderScene(options: CafeOrderOptions): { element: HTMLElement; unlock(): void } {
    const { art, itemAssetId } = options.stamp;
    if (!art || itemAssetId !== 'item.cafe-order-scene') {
        throw new TypeError('Cafe order practice requires the registered inspectable order scene.');
    }

    const receipt = element('figure', 'academy-cafe-receipt academy-cafe-order-prop');
    receipt.dataset.worldStamp = options.stamp.id;
    receipt.dataset.rewardProp = options.stamp.prop;
    receipt.dataset.itemAssetId = itemAssetId;
    receipt.dataset.itemPresentation = 'inspectable-source-prop';

    const caption = element('figcaption', 'academy-cafe-order-prop-caption');
    caption.id = `academy-cafe-order-prop-${options.practice.id}`;
    const trigger = element('button', 'academy-cafe-order-prop-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-describedby', caption.id);

    const dialog = document.createElement('dialog');
    dialog.className = 'academy-cafe-order-prop-dialog';
    dialog.dataset.cafeOrderInspector = itemAssetId;
    dialog.setAttribute('aria-labelledby', caption.id);
    dialog.setAttribute('aria-modal', 'true');
    const close = element('button', 'academy-cafe-order-prop-close');
    close.type = 'button';
    close.setAttribute('aria-label', options.language === 'ja' ? '注文風景を閉じる' : 'Close order scene');
    close.textContent = '×';
    dialog.append(close);

    const image = (thumbnail: boolean): HTMLImageElement => {
        const artImage = document.createElement('img');
        artImage.src = art;
        artImage.alt = thumbnail ? '' : options.language === 'ja'
            ? '雨のカフェで、二つのふた付き料理から注文を確かめている場面。'
            : 'A rainy cafe table where a server presents two covered dishes for the order to be checked.';
        artImage.decoding = 'async';
        artImage.loading = thumbnail ? 'eager' : 'lazy';
        return artImage;
    };

    const setUnlocked = () => {
        receipt.dataset.itemState = 'claimed';
        trigger.disabled = false;
        trigger.setAttribute('aria-label', options.language === 'ja' ? 'カフェの注文風景を拡大表示' : 'Inspect cafe order scene');
        if (!trigger.querySelector('img')) trigger.replaceChildren(image(true));
        caption.textContent = options.language === 'ja' ? 'RECEIPT / 注文風景を見る' : 'RECEIPT / INSPECT ORDER';
    };

    if (options.stamp.claimed) setUnlocked();
    else {
        receipt.dataset.itemState = 'pending';
        trigger.disabled = true;
        trigger.setAttribute('aria-label', options.language === 'ja' ? '注文を終えると注文風景を見られます' : 'Complete the order to inspect the scene');
        trigger.textContent = 'RECEIPT';
        caption.textContent = options.language === 'ja' ? '注文を終えると開きます' : 'Complete the order to unlock';
    }

    trigger.addEventListener('click', () => {
        if (!dialog.querySelector('img')) dialog.append(image(false));
        try {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        } catch {
            dialog.setAttribute('open', '');
        }
    });
    const closeInspector = () => {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
        trigger.focus({ preventScroll: true });
    };
    close.addEventListener('click', closeInspector);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeInspector(); });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeInspector();
    });

    receipt.append(trigger, caption, dialog);
    return { element: receipt, unlock: setUnlocked };
}
