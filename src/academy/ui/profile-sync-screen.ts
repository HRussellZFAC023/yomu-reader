import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { AcademyPairingTicket } from '../../reader/srs/account-contract';
import { requestAcademyAccountAction } from '../account/actions';
import type { AcademyReaderDeviceView, AcademySyncPhase, AcademySyncStatus } from '../account/sync-client';
import { backButton, element, screenFrame } from './dom';

export interface ProfileSyncScreenOptions {
    readonly language: AcademyLanguage;
    readonly status: AcademySyncStatus;
    readonly onBack: () => void;
    readonly onConnect: () => Promise<void>;
    readonly onRetry: () => Promise<void>;
    readonly onGoogleLink: () => void;
    readonly onStartPairing: () => Promise<AcademyPairingTicket>;
    readonly onClaimPairing: (code: string) => Promise<void>;
    readonly onExport: () => Promise<void>;
    readonly onSignOut: () => Promise<void>;
    readonly onDelete: (scope: 'profile' | 'account') => Promise<void>;
    readonly onListReaderDevices?: () => Promise<AcademyReaderDeviceView[]>;
    readonly onRevokeReaderDevice?: (deviceId: string) => Promise<void>;
    readonly onClassBoard?: () => void;
    /** Present only when this screen is completing first access onboarding. */
    readonly onContinue?: () => void;
}

export function renderProfileSyncScreen(options: ProfileSyncScreenOptions): HTMLElement {
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-profile-sync-screen',
        plate: 'library',
        title: 'journalTitle',
    });
    screen.dataset.academyRoute = 'profile-sync';
    screen.dataset.syncPhase = options.status.phase;
    screen.lang = options.language;

    const back = backButton(options.language);
    back.addEventListener('click', options.onBack);
    const heading = element('h2', 'academy-profile-sync-heading');
    heading.textContent = localize(options.language, 'Profile & sync', 'プロフィールと同期');
    const note = element('p', 'academy-profile-sync-note');
    note.textContent = options.status.profile
        ? localize(options.language, 'Learning events are encrypted on this device before sync.', '学習記録は、この端末で暗号化してから同期されます。')
        : localize(options.language, 'Your learning remains on this device until you turn on sync.', '同期を始めるまで、学習記録はこの端末だけに保存されます。');

    const status = element('div', 'academy-profile-sync-status');
    status.setAttribute('role', options.status.error ? 'alert' : 'status');
    status.setAttribute('aria-live', options.status.error ? 'assertive' : 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.dataset.phase = options.status.phase;
    const statusTitle = element('strong', 'academy-profile-sync-status-title');
    statusTitle.textContent = phaseTitle(options.status.phase, options.language);
    const statusDetail = element('span', 'academy-profile-sync-status-detail');
    statusDetail.textContent = statusText(options.status, options.language);
    status.append(statusTitle, statusDetail);

    content.prepend(back);
    content.append(heading, note, status);
    if (options.status.account) content.append(accountSummary(options.status, options.language));
    if (shouldShowRedeem(options.status)) content.append(redeemForm(options.language));

    const actions = element('div', 'academy-profile-sync-actions');
    appendPrimaryAction(actions, options);
    appendSessionActions(actions, screen, options);
    content.append(actions);

    if (shouldShowPairClaim(options.status)) content.append(pairClaim(options));
    if (options.status.account && options.onListReaderDevices && options.onRevokeReaderDevice) {
        content.append(readerDeviceSection(options as ProfileSyncScreenOptions & Required<Pick<ProfileSyncScreenOptions,
            'onListReaderDevices' | 'onRevokeReaderDevice'>>));
    }
    return screen;
}

function readerDeviceSection(options: ProfileSyncScreenOptions & Required<Pick<ProfileSyncScreenOptions,
    'onListReaderDevices' | 'onRevokeReaderDevice'>>): HTMLElement {
    const section = element('section', 'academy-code-section academy-reader-device-section');
    const heading = element('h3', 'academy-code-heading');
    heading.textContent = localize(options.language, 'Reader devices', 'Reader 端末');
    const status = element('p', 'academy-code-help');
    status.textContent = localize(options.language, 'Loading connected Reader devices…', '接続済みの Reader 端末を読み込んでいます…');
    const list = element('div', 'academy-profile-sync-actions academy-reader-device-list');
    section.append(heading, status, list);
    const refresh = async (): Promise<void> => {
        try {
            const devices = await options.onListReaderDevices();
            list.replaceChildren();
            const active = devices.filter(device => device.revokedAt === null);
            status.textContent = active.length
                ? localize(options.language, `${active.length} connected Reader device(s).`, `接続中の Reader 端末：${active.length}台`)
                : localize(options.language, 'No connected Reader devices.', '接続中の Reader 端末はありません。');
            active.forEach(device => {
                const button = actionButton(
                    localize(options.language, `Disconnect ${shortDeviceId(device.deviceId)}`, `${shortDeviceId(device.deviceId)} を解除`),
                    async control => {
                        const confirmed = window.confirm(localize(
                            options.language,
                            'Disconnect this Reader device? It will need a new one-time code to sync again.',
                            'この Reader 端末の接続を解除しますか？再同期には新しいワンタイムコードが必要です。',
                        ));
                        if (!confirmed) return;
                        await options.onRevokeReaderDevice(device.deviceId);
                        control.remove();
                        await refresh();
                    },
                );
                button.title = new Date(device.lastSeenAt).toLocaleString(options.language);
                list.append(button);
            });
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
            status.setAttribute('role', 'alert');
        }
    };
    void refresh();
    return section;
}

function shortDeviceId(deviceId: string): string {
    return deviceId.slice(0, 8);
}

function canContinueToAcademy(status: AcademySyncStatus): boolean {
    // A Reader account may manage devices here, but only the Worker's exact
    // grant-or-active-paid projection can reopen bundled/offline curriculum.
    return status.account?.academyAccess === true && (status.phase === 'ready' || status.phase === 'offline');
}

function appendPrimaryAction(actions: HTMLElement, options: ProfileSyncScreenOptions): void {
    const { phase, profile } = options.status;
    if (options.onContinue && canContinueToAcademy(options.status)) {
        actions.append(actionButton(
            localize(options.language, 'Continue to Academy', 'Academy を続ける'),
            async () => options.onContinue?.(),
            'academy-button academy-button-primary',
        ));
        return;
    }
    if (phase === 'sign-in') {
        actions.append(actionButton(localize(options.language, 'Sign in with Google', 'Google でサインイン'), async () => options.onGoogleLink(), 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'signed-out') {
        actions.append(actionButton(localize(options.language, 'Recover account', 'アカウントを復旧'), button => (
            requestAcademyAccountAction(button, { kind: 'recovery' })
        ), 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'recovery') {
        actions.append(actionButton(localize(options.language, 'Continue to Google', 'Google に進む'), async () => options.onGoogleLink(), 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'claimed') {
        actions.append(actionButton(localize(options.language, 'Turn on encrypted sync', '暗号化同期を始める'), async () => options.onConnect(), 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'conflict' && shouldShowRedeem(options.status)) {
        actions.append(actionButton(localize(options.language, 'Try another code', '別のコードを試す'), async button => {
            button.closest('.academy-profile-sync-screen')
                ?.querySelector<HTMLInputElement>('input[name="academyCode"]')
                ?.focus();
        }, 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'pending') {
        actions.append(actionButton(localize(options.language, 'Check activation status', '有効化の状態を確認'), async () => options.onRetry(), 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'retry' || phase === 'error' || phase === 'conflict') {
        actions.append(actionButton(localize(options.language, 'Try again', 'もう一度試す'), async () => options.onRetry(), 'academy-button academy-button-primary'));
        return;
    }
    if (phase === 'pair') {
        actions.append(actionButton(localize(options.language, 'Start as first device', '最初の端末として始める'), button => {
            const confirmed = window.confirm(localize(
                options.language,
                'Continue only if this account has never synced on another device. Otherwise, use a pairing code.',
                'このアカウントが他の端末で同期されたことがない場合のみ続けてください。それ以外の場合はペアリングコードを使ってください。',
            ));
            return confirmed
                ? requestAcademyAccountAction(button, { kind: 'initialize-profile' })
                : Promise.resolve();
        }));
        return;
    }
    actions.append(actionButton(
        profile ? localize(options.language, 'Sync now', '今すぐ同期') : localize(options.language, 'Turn on encrypted sync', '暗号化同期を始める'),
        async () => profile ? options.onRetry() : options.onConnect(),
        'academy-button academy-button-primary',
    ));
    if (!profile) {
        actions.append(actionButton(localize(options.language, 'Recover account', 'アカウントを復旧'), button => (
            requestAcademyAccountAction(button, { kind: 'recovery' })
        )));
    }
}

function appendSessionActions(actions: HTMLElement, screen: HTMLElement, options: ProfileSyncScreenOptions): void {
    const { phase, profile, account } = options.status;
    if (phase === 'sign-in' || phase === 'conflict') {
        actions.append(actionButton(localize(options.language, 'Recover another account', '別のアカウントを復旧'), button => (
            requestAcademyAccountAction(button, { kind: 'recovery' })
        )));
    }
    if (profile && !account && phase === 'ready') {
        actions.append(actionButton(localize(options.language, 'Link Google account', 'Google アカウントをリンク'), async () => options.onGoogleLink()));
    }
    if (profile && phase !== 'pair' && phase !== 'sign-in' && phase !== 'signed-out' && phase !== 'pending') {
        const pairDevice = actionButton(localize(options.language, 'Pair another device', '別の端末をペアリング'), async button => {
            const ticket = await options.onStartPairing();
            showPairingTicket(screen, options.language, ticket, button);
        });
        pairDevice.setAttribute('aria-expanded', 'false');
        actions.append(pairDevice);
        actions.append(actionButton(localize(options.language, 'Export encrypted data', '暗号化データを書き出す'), async () => options.onExport()));
    }
    if ((profile || account) && phase !== 'sign-in' && phase !== 'signed-out') {
        if (account?.classes.length && options.onClassBoard) {
            actions.append(actionButton(
                localize(options.language, 'Open Class Board', 'クラスボードを開く'),
                async () => options.onClassBoard?.(),
            ));
        }
        if (account) actions.append(actionButton(localize(options.language, 'Sign out', 'サインアウト'), async () => options.onSignOut()));
        if (profile) actions.append(deleteButton(options, 'profile'));
        if (account) actions.append(deleteButton(options, 'account'));
    }
}

function accountSummary(status: AcademySyncStatus, language: AcademyLanguage): HTMLElement {
    const summary = element('dl', 'academy-account-summary');
    const nameLabel = element('dt');
    nameLabel.textContent = localize(language, 'Account', 'アカウント');
    const name = element('dd');
    name.textContent = status.account?.identity.label ?? '';
    const accessLabel = element('dt');
    accessLabel.textContent = localize(language, 'Academy access', 'Academy アクセス');
    const access = element('dd');
    access.textContent = status.entitlement?.entitlement === 'academy'
        ? localize(language, 'Active', '有効')
        : localize(language, 'No paid code', '有料コードなし');
    summary.append(nameLabel, name, accessLabel, access);
    return summary;
}

function shouldShowRedeem(status: AcademySyncStatus): boolean {
    return Boolean(status.account) && status.entitlement?.entitlement !== 'academy';
}

function redeemForm(language: AcademyLanguage): HTMLElement {
    const section = element('section', 'academy-code-section academy-redeem-section');
    const heading = element('h3', 'academy-code-heading');
    heading.id = 'academy-paid-code-heading';
    heading.textContent = localize(language, 'Activate a paid code', '有料コードを有効にする');
    section.setAttribute('aria-labelledby', heading.id);
    const help = element('p', 'academy-code-help');
    help.id = 'academy-paid-code-help';
    help.textContent = localize(
        language,
        'Paid codes must be linked to Google. A paid code can be activated once, and a Google account can hold one paid code. Class invitations also require signing in with Google.',
        '有料コードは Google とリンクする必要があります。有料コードを有効にできるのは一度だけで、Google アカウントに登録できる有料コードは1つです。クラスの招待コードも Google サインインが必要です。',
    );
    const form = element('form', 'academy-code-form');
    const label = element('label', 'academy-code-label');
    label.htmlFor = 'academy-paid-code';
    label.textContent = localize(language, 'Paid Academy code', '有料 Academy コード');
    const input = element('input', 'academy-input');
    input.id = 'academy-paid-code';
    input.name = 'academyCode';
    input.autocomplete = 'one-time-code';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.maxLength = 128;
    input.required = true;
    input.placeholder = localize(language, 'Enter paid code', '有料コードを入力');
    input.setAttribute('aria-describedby', help.id);
    const submit = actionButton(localize(language, 'Activate', '有効にする'), button => (
        requestAcademyAccountAction(button, { kind: 'redeem', code: input.value })
    ), 'academy-button academy-button-secondary');
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (input.reportValidity()) submit.click();
    });
    label.append(input);
    form.append(label, submit);
    section.append(heading, help, form);
    return section;
}

function shouldShowPairClaim(status: AcademySyncStatus): boolean {
    return status.phase === 'pair' || (status.phase === 'local' && !status.profile);
}

function pairClaim(options: ProfileSyncScreenOptions): HTMLElement {
    const section = element('details', 'academy-code-section academy-pairing-claim-section');
    section.open = options.status.phase === 'pair';
    const heading = element('summary', 'academy-code-heading');
    heading.textContent = options.status.phase === 'pair'
        ? localize(options.language, 'Pair this device to continue', '続けるにはこの端末をペアリング')
        : localize(options.language, 'Pair this device', 'この端末をペアリング');
    const form = element('form', 'academy-code-form');
    const help = element('p', 'academy-code-help');
    help.id = 'academy-pairing-code-help';
    help.textContent = localize(
        options.language,
        'On a device that already has your history, choose Pair another device. Then enter its one-time code here.',
        '履歴がある端末で「別の端末をペアリング」を選び、表示されたワンタイムコードをここに入力してください。',
    );
    const label = element('label', 'academy-code-label');
    label.htmlFor = 'academy-pairing-code';
    label.textContent = localize(options.language, 'One-time pairing code', 'ペアリング用ワンタイムコード');
    const input = element('input', 'academy-input academy-pairing-input');
    input.id = 'academy-pairing-code';
    input.name = 'pairingCode';
    input.autocomplete = 'one-time-code';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.maxLength = 24;
    input.required = true;
    input.placeholder = localize(options.language, 'Enter one-time code', 'ワンタイムコードを入力');
    input.setAttribute('aria-describedby', help.id);
    const claim = actionButton(localize(options.language, 'Connect this device', 'この端末を接続'), async () => options.onClaimPairing(input.value));
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (input.reportValidity()) claim.click();
    });
    label.append(input);
    form.append(label, claim);
    section.append(heading, help, form);
    if (section.open) queueMicrotask(() => input.focus());
    return section;
}

function deleteButton(options: ProfileSyncScreenOptions, scope: 'profile' | 'account'): HTMLButtonElement {
    return actionButton(localize(
        options.language,
        scope === 'account' ? 'Delete account' : 'Delete cloud learning data',
        scope === 'account' ? 'アカウントを削除' : 'クラウド学習データを削除',
    ), async button => {
        const confirmation = window.confirm(localize(
            options.language,
            scope === 'account'
                ? 'Delete your Academy identity, encrypted profile, imported progress and snapshots, study days, and profile-bound sessions? A 90-day deletion receipt and minimal entitlement/payment audit records stay to prevent code reuse and support payment review. This cannot be undone.'
                : 'Delete the encrypted profile, imported progress and snapshots, study days, and profile-bound sessions? Your Academy identity stays. A 90-day deletion receipt also stays temporarily. This cannot be undone.',
            scope === 'account'
                ? 'Academy の本人情報、暗号化プロフィール、取り込んだ進捗とスナップショット、学習日、プロフィールに紐づくセッションを削除しますか。コードの再利用防止と支払い確認のため、削除証明は90日間、最小限の利用権・支払い監査記録は保持されます。この操作は取り消せません。'
                : '暗号化プロフィール、取り込んだ進捗とスナップショット、学習日、プロフィールに紐づくセッションを削除しますか。Academy の本人情報は残り、削除証明は90日間だけ保持されます。この操作は取り消せません。',
        ));
        if (!confirmation) return;
        button.disabled = true;
        try { await options.onDelete(scope); } finally { button.disabled = false; }
    }, 'academy-button academy-button-danger');
}

function showPairingTicket(screen: HTMLElement, language: AcademyLanguage, ticket: AcademyPairingTicket, trigger: HTMLButtonElement): void {
    screen.querySelector('.academy-pairing-ticket')?.remove();
    const section = element('section', 'academy-code-section academy-pairing-ticket');
    section.id = 'academy-pairing-ticket';
    section.setAttribute('aria-label', localize(language, 'Pair another device', '別の端末をペアリング'));
    const heading = element('h3', 'academy-code-heading');
    heading.textContent = localize(language, 'One-time pairing code', 'ペアリング用ワンタイムコード');
    const code = element('output', 'academy-pairing-code');
    code.textContent = ticket.code;
    code.tabIndex = 0;
    const expiry = element('p', 'academy-pairing-expiry');
    expiry.textContent = `${localize(language, 'Expires', '有効期限')}: ${new Date(ticket.expiresAt).toLocaleTimeString()}`;
    const copy = actionButton(localize(language, 'Copy code', 'コードをコピー'), async () => {
        await navigator.clipboard.writeText(ticket.code);
    });
    section.append(heading, code, expiry, copy);
    screen.querySelector('.academy-profile-sync-actions')?.after(section);
    code.focus();
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', section.id);
}

function actionButton(
    text: string,
    action: (button: HTMLButtonElement) => Promise<void>,
    className = 'academy-button academy-button-secondary',
): HTMLButtonElement {
    const button = element('button', className);
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', () => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        void action(button).catch(error => {
            const status = button.closest('.academy-profile-sync-screen')?.querySelector<HTMLElement>('.academy-profile-sync-status');
            if (!status) return;
            status.setAttribute('role', 'alert');
            status.setAttribute('aria-live', 'assertive');
            status.dataset.phase = 'error';
            const title = status.querySelector<HTMLElement>('.academy-profile-sync-status-title');
            const detail = status.querySelector<HTMLElement>('.academy-profile-sync-status-detail');
            const language = button.closest<HTMLElement>('.academy-profile-sync-screen')?.lang === 'ja' ? 'ja' : 'en';
            if (title) title.textContent = phaseTitle('error', language);
            if (detail) detail.textContent = error instanceof Error
                ? error.message
                : localize(language, 'This action could not finish. Try again.', '操作を完了できませんでした。もう一度試してください。');
        }).finally(() => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });
    });
    return button;
}

function phaseTitle(phase: AcademySyncPhase, language: AcademyLanguage): string {
    const titles: Record<AcademySyncPhase, readonly [string, string]> = {
        local: ['Local only', 'ローカルのみ'],
        'sign-in': ['Google sign-in required', 'Google サインインが必要'],
        recovery: ['Starting recovery', '復旧を開始中'],
        'signed-out': ['Signed out', 'サインアウト済み'],
        pending: ['Activation pending', '有効化を待っています'],
        claimed: ['Purchase activated', '購入を有効化しました'],
        pair: ['Pairing required', 'ペアリングが必要'],
        conflict: ['Account conflict', 'アカウントの競合'],
        syncing: ['Syncing', '同期中'],
        ready: ['Synced', '同期済み'],
        offline: ['Offline', 'オフライン'],
        retry: ['Sync interrupted', '同期が中断されました'],
        error: ['Action needed', '操作が必要'],
    };
    return localize(language, titles[phase][0], titles[phase][1]);
}

function statusText(status: AcademySyncStatus, language: AcademyLanguage): string {
    if (status.error) return status.error;
    if (status.phase === 'local') return status.profile
        ? localize(language, 'Encrypted history is ready on this device.', 'この端末に暗号化された履歴があります。')
        : localize(language, 'No server profile has been created.', 'サーバープロフィールは作成されていません。');
    if (status.phase === 'sign-in') return localize(language, 'Sign in with Google to continue. Every Academy invitation, including class invitations, is linked to a Google account.', 'Google にサインインして続けてください。クラスの招待コードを含め、すべての Academy 招待は Google アカウントとリンクされます。');
    if (status.phase === 'recovery') return localize(language, 'Opening Google sign-in for account recovery.', 'アカウント復旧のため Google サインインを開いています。');
    if (status.phase === 'signed-out') return localize(language, 'Your encryption key remains on this device for account recovery.', 'アカウント復旧のため、暗号鍵はこの端末に保持されています。');
    if (status.phase === 'pending') return localize(language, 'Enter the paid code below. If payment just completed, activation may take a moment.', '下に有料コードを入力してください。支払い直後は、有効化まで少し時間がかかることがあります。');
    if (status.phase === 'claimed') return localize(language, 'This paid code is now linked to this Google account. Neither can be used for another activation.', 'この有料コードは Google アカウントにリンクされました。コードもアカウントも別の有効化には使用できません。');
    if (status.phase === 'pair') return localize(language, 'Use a one-time code from a device that already has your encrypted history.', '暗号化された履歴がある端末のワンタイムコードを使ってください。');
    if (status.phase === 'conflict') return localize(language, 'A code and account can each be linked only once.', 'コードとアカウントは、それぞれ一度だけリンクできます。');
    if (status.phase === 'offline') return localize(language, `${status.pending} encrypted event${status.pending === 1 ? '' : 's'} waiting.`, `暗号化された記録 ${status.pending} 件が待機中です。`);
    if (status.phase === 'syncing') return localize(language, 'Encrypting and exchanging events.', '記録を暗号化して同期しています。');
    if (status.phase === 'retry') return localize(language, 'Local learning is safe. Retry when the connection is stable.', '端末の学習記録は安全です。接続が安定したら再試行してください。');
    if (status.phase === 'error') return localize(language, 'Review the account state and try again.', 'アカウントの状態を確認して、もう一度試してください。');
    const time = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : null;
    return time ? `${localize(language, 'Last sync', '最終同期')}: ${time}` : localize(language, 'Encrypted history is up to date.', '暗号化された履歴は最新です。');
}

function localize(language: AcademyLanguage, en: string, ja: string): string {
    return language === 'ja' ? ja : en;
}
