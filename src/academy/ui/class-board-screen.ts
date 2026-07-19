import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type {
    AcademyAccountClass,
    AcademyAccountView,
    AcademyClassLeaderboardEntry,
    AcademyClassLeaderboardMetricId,
    AcademyClassLeaderboardView,
} from '../../reader/srs/account-contract';
import { ACADEMY_ASSETS, type ProtagonistPortraitId } from '../assets';
import type { AcademyClassBoardProfileUpdate } from '../account/sync-client';
import { backButton, element, screenFrame } from './dom';

const METRICS: readonly {
    readonly id: AcademyClassLeaderboardMetricId;
    readonly en: string;
    readonly ja: string;
}[] = [
    { id: 'streak', en: 'Study rhythm', ja: '学習リズム' },
    { id: 'review-activity', en: 'Recent study', ja: '最近の学習' },
    { id: 'known-words', en: 'Known words', ja: '習得した単語' },
    { id: 'lesson-progress', en: 'Lessons', ja: 'レッスン' },
];

export interface ClassBoardScreenOptions {
    readonly language: AcademyLanguage;
    readonly account: AcademyAccountView;
    readonly onBack: () => void;
    readonly onLoad: (
        classId: string,
        metric: AcademyClassLeaderboardMetricId,
        page: number,
    ) => Promise<AcademyClassLeaderboardView>;
    readonly onSaveProfile: (update: AcademyClassBoardProfileUpdate) => Promise<AcademyAccountView>;
}

export function renderClassBoardScreen(options: ClassBoardScreenOptions): HTMLElement {
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-class-board-screen',
        plate: 'library',
        title: 'classBoardTitle',
    });
    screen.dataset.academyRoute = 'class-board';
    screen.lang = options.language;

    const back = backButton(options.language);
    back.addEventListener('click', options.onBack);
    const intro = element('p', 'academy-class-board-intro');
    intro.textContent = localize(
        options.language,
        'A private class snapshot. Only names and totals learners chose to share appear here.',
        'クラス内だけのスナップショットです。本人が共有を選んだ名前と合計だけが表示されます。',
    );
    const body = element('div', 'academy-class-board-body');
    content.prepend(back);
    content.append(intro, body);

    let account = options.account;
    let selectedClassId = account.classes[0]?.classId ?? '';
    let selectedMetric: AcademyClassLeaderboardMetricId = 'streak';
    let selectedPage = 1;
    let requestVersion = 0;

    const render = (): void => {
        body.replaceChildren();
        body.append(profilePreferences(account, options, async updated => {
            account = updated;
            render();
            await loadBoard();
        }));
        if (account.classes.length === 0) {
            const empty = element('p', 'academy-class-board-empty');
            empty.textContent = localize(
                options.language,
                'No class is linked to this account yet.',
                'このアカウントには、まだクラスが登録されていません。',
            );
            body.append(empty);
            return;
        }

        if (!account.classes.some(item => item.classId === selectedClassId)) {
            selectedClassId = account.classes[0]?.classId ?? '';
        }
        body.append(boardControls(account.classes, selectedClassId, selectedMetric, options.language, {
            onClass: classId => {
                selectedClassId = classId;
                selectedPage = 1;
                void loadBoard();
            },
            onMetric: metric => {
                selectedMetric = metric;
                selectedPage = 1;
                void loadBoard();
            },
        }));
        const result = element('section', 'academy-class-board-results');
        result.setAttribute('aria-live', 'polite');
        result.setAttribute('aria-busy', 'true');
        const loading = element('p', 'academy-class-board-loading');
        loading.textContent = localize(options.language, 'Loading class snapshot…', 'クラスのスナップショットを読み込んでいます…');
        result.append(loading);
        body.append(result);
    };

    const loadBoard = async (): Promise<void> => {
        if (!selectedClassId) return;
        const version = ++requestVersion;
        const result = body.querySelector<HTMLElement>('.academy-class-board-results');
        if (!result) return;
        result.setAttribute('aria-busy', 'true');
        result.replaceChildren(statusLine(options.language, 'loading'));
        try {
            const view = await options.onLoad(selectedClassId, selectedMetric, selectedPage);
            if (version !== requestVersion || !result.isConnected) return;
            result.removeAttribute('aria-busy');
            result.replaceChildren(boardResult(view, account, options.language, page => {
                selectedPage = page;
                void loadBoard();
            }));
        } catch (error) {
            if (version !== requestVersion || !result.isConnected) return;
            result.removeAttribute('aria-busy');
            result.replaceChildren(boardError(error, options.language, () => void loadBoard()));
        }
    };

    render();
    void loadBoard();
    return screen;
}

function profilePreferences(
    account: AcademyAccountView,
    options: ClassBoardScreenOptions,
    onSaved: (account: AcademyAccountView) => Promise<void>,
): HTMLElement {
    const section = element('details', 'academy-class-board-profile');
    section.open = !account.nameChosen;
    const summary = element('summary', 'academy-class-board-profile-summary');
    summary.textContent = localize(options.language, 'Board profile', 'ボードのプロフィール');
    const form = element('form', 'academy-class-board-profile-form');
    const nameLabel = element('label', 'academy-class-board-field');
    const nameText = element('span');
    nameText.textContent = localize(options.language, 'Display name', '表示名');
    const name = element('input', 'academy-input');
    name.name = 'displayName';
    name.value = account.identity.displayName;
    name.maxLength = 32;
    name.required = true;
    name.autocomplete = 'name';
    nameLabel.append(nameText, name);

    const listed = checkbox(
        'boardVisible',
        localize(options.language, 'Appear on the Class Board', 'クラスボードに表示する'),
        account.boardVisible,
    );
    const share = checkbox(
        'shareAvatar',
        localize(options.language, 'Show my chosen story portrait', '選んだ物語のポートレートを表示する'),
        account.shareAvatar,
    );
    const shareInput = share.querySelector<HTMLInputElement>('input')!;
    shareInput.disabled = account.avatarKey === null;
    const visibilityInput = listed.querySelector<HTMLInputElement>('input')!;
    visibilityInput.addEventListener('change', () => {
        if (!visibilityInput.checked) shareInput.checked = false;
    });

    const note = element('p', 'academy-class-board-profile-note');
    note.textContent = account.classes.some(item => item.boardHidden)
        ? localize(options.language, 'Your class has hidden your listing. Your own preference is still saved.', 'クラス側で表示が非公開になっています。自分の設定は保存されます。')
        : localize(options.language, 'Answers, mistakes, word lists, and Google details are never shown.', '解答、間違い、単語リスト、Google の情報は表示されません。');
    const status = element('p', 'academy-class-board-profile-status');
    status.setAttribute('aria-live', 'polite');
    const save = element('button', 'academy-button academy-button-secondary');
    save.type = 'submit';
    save.textContent = localize(options.language, 'Save board profile', 'ボードのプロフィールを保存');
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        save.disabled = true;
        save.setAttribute('aria-busy', 'true');
        status.removeAttribute('role');
        status.textContent = localize(options.language, 'Saving…', '保存しています…');
        void options.onSaveProfile({
            displayName: name.value,
            boardVisible: visibilityInput.checked,
            shareAvatar: shareInput.checked && !shareInput.disabled,
        }).then(async updated => {
            status.textContent = localize(options.language, 'Saved.', '保存しました。');
            await onSaved(updated);
        }).catch(error => {
            status.setAttribute('role', 'alert');
            status.textContent = error instanceof Error
                ? error.message
                : localize(options.language, 'The profile could not be saved.', 'プロフィールを保存できませんでした。');
        }).finally(() => {
            save.disabled = false;
            save.removeAttribute('aria-busy');
        });
    });
    form.append(nameLabel, listed, share, note, save, status);
    section.append(summary, form);
    return section;
}

function boardControls(
    classes: readonly AcademyAccountClass[],
    selectedClassId: string,
    selectedMetric: AcademyClassLeaderboardMetricId,
    language: AcademyLanguage,
    callbacks: {
        readonly onClass: (classId: string) => void;
        readonly onMetric: (metric: AcademyClassLeaderboardMetricId) => void;
    },
): HTMLElement {
    const controls = element('div', 'academy-class-board-controls');
    const classLabel = element('label', 'academy-class-board-class');
    const classText = element('span');
    classText.textContent = localize(language, 'Class', 'クラス');
    const select = element('select', 'academy-input academy-class-board-class-select');
    classes.forEach(item => {
        const option = element('option');
        option.value = item.classId;
        option.textContent = item.name;
        option.selected = item.classId === selectedClassId;
        select.append(option);
    });
    select.addEventListener('change', () => callbacks.onClass(select.value));
    classLabel.append(classText, select);

    const tabs = element('div', 'academy-class-board-metrics');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', localize(language, 'Class Board measure', 'クラスボードの項目'));
    METRICS.forEach(metric => {
        const button = element('button', 'academy-class-board-metric');
        button.type = 'button';
        button.dataset.metric = metric.id;
        button.setAttribute('aria-pressed', String(metric.id === selectedMetric));
        button.textContent = localize(language, metric.en, metric.ja);
        button.addEventListener('click', () => {
            tabs.querySelectorAll<HTMLButtonElement>('.academy-class-board-metric').forEach(candidate => {
                candidate.setAttribute('aria-pressed', String(candidate === button));
            });
            callbacks.onMetric(metric.id);
        });
        tabs.append(button);
    });
    controls.append(classLabel, tabs);
    return controls;
}

function boardResult(
    view: AcademyClassLeaderboardView,
    account: AcademyAccountView,
    language: AcademyLanguage,
    onPage: (page: number) => void,
): HTMLElement {
    const fragment = element('div', 'academy-class-board-result');
    const context = element('div', 'academy-class-board-context');
    const meaning = element('p', 'academy-class-board-meaning');
    meaning.textContent = localizeMetricMeaning(view.metric.id, language);
    const freshness = element('p', 'academy-class-board-freshness');
    freshness.textContent = localize(
        language,
        `Snapshot ${relativeTime(view.freshness.generatedAt, Date.now(), 'en')}`,
        `スナップショット: ${relativeTime(view.freshness.generatedAt, Date.now(), 'ja')}`,
    );
    context.append(meaning, freshness);
    fragment.append(context);

    if (view.entries.length === 0) {
        const empty = element('p', 'academy-class-board-empty');
        empty.textContent = localize(language, 'No one has shared this total yet.', 'この合計を共有している人はまだいません。');
        fragment.append(empty);
    } else {
        fragment.append(boardTable(view.entries, account, view.metric.id, language));
    }

    const visibleHasMe = view.entries.some(entry => entry.accountId === account.accountId);
    if (view.me && !visibleHasMe) {
        const own = element('div', 'academy-class-board-me');
        const label = element('span');
        label.textContent = localize(language, 'Your place', 'あなたの位置');
        const value = element('strong');
        value.textContent = `#${view.me.rank} · ${formatValue(view.me.value, view.metric.id, language)}`;
        own.append(label, value);
        fragment.append(own);
    } else if (!view.me && !account.boardVisible) {
        const privateNote = element('p', 'academy-class-board-private-note');
        privateNote.textContent = localize(
            language,
            'Your totals stay private until you choose to appear above.',
            '上の設定で表示を選ぶまで、あなたの合計は非公開です。',
        );
        fragment.append(privateNote);
    }

    if (view.pagination.pages > 1) {
        const pagination = element('nav', 'academy-class-board-pagination');
        pagination.setAttribute('aria-label', localize(language, 'Class Board pages', 'クラスボードのページ'));
        const previous = pageButton('←', localize(language, 'Previous page', '前のページ'), () => onPage(view.pagination.page - 1));
        const page = element('span');
        page.textContent = `${view.pagination.page} / ${view.pagination.pages}`;
        const next = pageButton('→', localize(language, 'Next page', '次のページ'), () => onPage(view.pagination.page + 1));
        previous.disabled = view.pagination.page <= 1;
        next.disabled = view.pagination.page >= view.pagination.pages;
        pagination.append(previous, page, next);
        fragment.append(pagination);
    }
    return fragment;
}

function boardTable(
    entries: readonly AcademyClassLeaderboardEntry[],
    account: AcademyAccountView,
    metric: AcademyClassLeaderboardMetricId,
    language: AcademyLanguage,
): HTMLTableElement {
    const table = element('table', 'academy-class-board-table');
    const caption = element('caption', 'academy-sr-only');
    caption.textContent = localize(language, 'Class Board positions', 'クラスボードの順位');
    const head = element('thead');
    const headRow = element('tr');
    [localize(language, 'Place', '順位'), localize(language, 'Classmate', 'クラスメイト'), localize(language, 'Total', '合計')]
        .forEach(text => {
            const cell = element('th');
            cell.scope = 'col';
            cell.textContent = text;
            headRow.append(cell);
        });
    head.append(headRow);
    const body = element('tbody');
    entries.forEach(entry => {
        const row = element('tr');
        if (entry.accountId === account.accountId) row.dataset.currentLearner = 'true';
        const rank = element('td');
        rank.dataset.label = localize(language, 'Place', '順位');
        rank.textContent = `#${entry.rank}`;
        rank.setAttribute('aria-label', `${rank.dataset.label}: ${rank.textContent}`);
        const learner = element('td', 'academy-class-board-learner');
        learner.dataset.label = localize(language, 'Classmate', 'クラスメイト');
        if (entry.avatarKey) learner.append(avatar(entry.avatarKey, entry.displayTag));
        const tag = element('span');
        tag.textContent = entry.displayTag;
        learner.append(tag);
        if (entry.role === 'sensei') {
            const role = element('small');
            role.textContent = localize(language, 'Sensei', '先生');
            learner.append(role);
        }
        learner.setAttribute('aria-label', entry.role === 'sensei'
            ? `${learner.dataset.label}: ${entry.displayTag}, ${localize(language, 'Sensei', '先生')}`
            : `${learner.dataset.label}: ${entry.displayTag}`);
        const value = element('td', 'academy-class-board-value');
        value.dataset.label = localize(language, 'Total', '合計');
        value.textContent = formatValue(entry.value, metric, language);
        value.setAttribute('aria-label', `${value.dataset.label}: ${value.textContent}`);
        row.append(rank, learner, value);
        body.append(row);
    });
    table.append(caption, head, body);
    return table;
}

function avatar(key: string, label: string): HTMLImageElement {
    const image = element('img', 'academy-class-board-avatar');
    image.src = ACADEMY_ASSETS.portraits[key as ProtagonistPortraitId];
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.title = label;
    return image;
}

function boardError(error: unknown, language: AcademyLanguage, retry: () => void): HTMLElement {
    const box = element('div', 'academy-class-board-error');
    box.setAttribute('role', 'alert');
    const message = element('p');
    message.textContent = error instanceof Error
        ? error.message
        : localize(language, 'The class snapshot could not be loaded.', 'クラスのスナップショットを読み込めませんでした。');
    const button = element('button', 'academy-button academy-button-secondary');
    button.type = 'button';
    button.textContent = localize(language, 'Try again', 'もう一度試す');
    button.addEventListener('click', retry);
    box.append(message, button);
    return box;
}

function statusLine(language: AcademyLanguage, state: 'loading'): HTMLElement {
    const status = element('p', 'academy-class-board-loading');
    status.textContent = state === 'loading'
        ? localize(language, 'Loading class snapshot…', 'クラスのスナップショットを読み込んでいます…')
        : '';
    return status;
}

function checkbox(name: string, text: string, checked: boolean): HTMLLabelElement {
    const label = element('label', 'academy-class-board-check');
    const input = element('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    const caption = element('span');
    caption.textContent = text;
    label.append(input, caption);
    return label;
}

function pageButton(text: string, label: string, action: () => void): HTMLButtonElement {
    const button = element('button', 'academy-class-board-page-button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', action);
    return button;
}

function formatValue(value: number, metric: AcademyClassLeaderboardMetricId, language: AcademyLanguage): string {
    const formatted = new Intl.NumberFormat(language === 'ja' ? 'ja-JP' : 'en-GB').format(value);
    if (metric === 'known-words') return localize(language, `${formatted} words`, `${formatted}語`);
    if (metric === 'lesson-progress') return localize(language, `${formatted} lessons`, `${formatted}レッスン`);
    return localize(language, `${formatted} days`, `${formatted}日`);
}

function localizeMetricMeaning(metric: AcademyClassLeaderboardMetricId, language: AcademyLanguage): string {
    const copy: Record<AcademyClassLeaderboardMetricId, readonly [string, string]> = {
        streak: ['Current run of qualifying study days.', '現在続いている学習日の記録です。'],
        'review-activity': ['Study days recorded in the last seven days.', '直近7日間に記録された学習日です。'],
        'known-words': ['Words independently demonstrated in Yomu SRS.', 'Yomu SRSで自力で使えると確認された単語です。'],
        'lesson-progress': ['Academy lessons completed.', '完了したAcademyレッスンです。'],
    };
    return localize(language, copy[metric][0], copy[metric][1]);
}

function relativeTime(at: number, now: number, language: AcademyLanguage): string {
    const minutes = Math.max(0, Math.round((now - at) / 60_000));
    if (minutes < 1) return localize(language, 'just now', 'たった今');
    if (minutes < 60) return localize(language, `${minutes} min ago`, `${minutes}分前`);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return localize(language, `${hours} hr ago`, `${hours}時間前`);
    const days = Math.round(hours / 24);
    return localize(language, `${days} days ago`, `${days}日前`);
}

function localize(language: AcademyLanguage, en: string, ja: string): string {
    return language === 'ja' ? ja : en;
}
