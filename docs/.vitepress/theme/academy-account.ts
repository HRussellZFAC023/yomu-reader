import { parseAcademyAccountView } from '../../../src/reader/srs/account-contract';

export type HostedAcademyAccountLanguage = 'en' | 'ja';
export type HostedAcademyAccountPhase = 'loading' | 'signed-out' | 'signed-in' | 'error';

export interface HostedAcademyAccountState {
    readonly phase: HostedAcademyAccountPhase;
    readonly displayName: string | null;
    readonly busy: boolean;
    readonly error: boolean;
}

type HostedAcademyAccountListener = (state: HostedAcademyAccountState) => void;
type HostedAcademyAccountRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface HostedAcademyAccountClientOptions {
    readonly request?: HostedAcademyAccountRequest;
    readonly navigate?: (url: string) => void;
}

interface HostedAcademyAccountControlsOptions {
    readonly client?: HostedAcademyAccountClient;
    readonly document?: Document;
}

const ACCOUNT_PATH = '/academy/api/account';
const SESSION_PATH = '/academy/api/session';
const SESSION_RESUME_PATH = '/academy/api/session/resume';
const READER_AUTH_PATH = '/academy/api/auth/google/reader';
const GOOGLE_START_PATH = '/academy/api/auth/google/start';
const LOGOUT_PATH = '/academy/api/logout';
const PROFILE_SYNC_PATH = '/academy/?view=profile-sync';
const DESKTOP_ACCOUNT_ID = 'yomu-hosted-account';
const MOBILE_ACCOUNT_ID = 'yomu-hosted-mobile-account';

const COPY = {
    en: {
        account: 'Account',
        loading: 'Checking account…',
        signedOut: 'Signed out',
        signedIn: 'Signed in',
        signedInAs: (displayName: string) => `Signed in as ${displayName}`,
        unavailable: 'Account status unavailable',
        signIn: 'Sign in',
        createAccount: 'Create account',
        profileSync: 'Profile & sync',
        signOut: 'Sign out',
    },
    ja: {
        account: 'アカウント',
        loading: 'アカウントを確認中…',
        signedOut: 'サインインしていません',
        signedIn: 'サインイン済み',
        signedInAs: (displayName: string) => `${displayName} としてサインイン済み`,
        unavailable: 'アカウント状態を確認できません',
        signIn: 'サインイン',
        createAccount: 'アカウントを作成',
        profileSync: 'プロフィールと同期',
        signOut: 'サインアウト',
    },
} as const;

const INITIAL_STATE: HostedAcademyAccountState = {
    phase: 'loading',
    displayName: null,
    busy: false,
    error: false,
};

/**
 * Minimal same-origin account facade for the static docs shell. It deliberately
 * exposes only the learner-chosen display name; Class Board discriminators and
 * Google identity data never enter the hosted navigation UI.
 */
export class HostedAcademyAccountClient {
    private readonly request: HostedAcademyAccountRequest;
    private readonly navigate: (url: string) => void;
    private readonly listeners = new Set<HostedAcademyAccountListener>();
    private currentState = INITIAL_STATE;
    private loadPromise: Promise<HostedAcademyAccountState> | null = null;
    private loaded = false;
    private sessionResumeRefused = false;

    constructor(options: HostedAcademyAccountClientOptions = {}) {
        this.request = options.request ?? ((input, init) => fetch(input, init));
        this.navigate = options.navigate ?? (url => window.location.assign(url));
    }

    get state(): HostedAcademyAccountState {
        return this.currentState;
    }

    subscribe(listener: HostedAcademyAccountListener): () => void {
        this.listeners.add(listener);
        listener(this.currentState);
        return () => this.listeners.delete(listener);
    }

    ensureLoaded(): Promise<HostedAcademyAccountState> {
        if (this.loaded) return Promise.resolve(this.currentState);
        if (this.loadPromise) return this.loadPromise;
        this.loadPromise = this.loadAccountStatus().finally(() => {
            this.loaded = true;
            this.loadPromise = null;
        });
        return this.loadPromise;
    }

    async beginReaderAuth(): Promise<void> {
        this.setState({ ...this.currentState, busy: true, error: false });
        try {
            const response = await this.request(READER_AUTH_PATH, mutationInit(true));
            if (!response.ok) throw new Error('Reader account authorization failed.');
            this.sessionResumeRefused = false;
            this.navigate(GOOGLE_START_PATH);
        } catch {
            this.setState({ ...this.currentState, busy: false, error: true });
        }
    }

    async signOut(): Promise<void> {
        this.setState({ ...this.currentState, busy: true, error: false });
        try {
            const response = await this.request(LOGOUT_PATH, mutationInit(false));
            if (!response.ok) throw new Error('Reader account sign-out failed.');
            this.sessionResumeRefused = true;
            this.setState({ phase: 'signed-out', displayName: null, busy: false, error: false });
        } catch {
            this.setState({ ...this.currentState, busy: false, error: true });
        }
    }

    private async loadAccountStatus(): Promise<HostedAcademyAccountState> {
        this.setState(INITIAL_STATE);
        try {
            let response = await this.accountRequest();
            if (response.status === 401 && !this.sessionResumeRefused) {
                response = await this.retryAfterSessionResume(response);
            }
            if (response.status === 401) {
                return this.setState({ phase: 'signed-out', displayName: null, busy: false, error: false });
            }
            if (!response.ok) throw new Error('Reader account status failed.');
            const account = parseAcademyAccountView(await response.json());
            this.sessionResumeRefused = false;
            return this.setState({
                phase: 'signed-in',
                displayName: account.identity.displayName,
                busy: false,
                error: false,
            });
        } catch {
            return this.setState({ phase: 'error', displayName: null, busy: false, error: true });
        }
    }

    private accountRequest(): Promise<Response> {
        return this.request(ACCOUNT_PATH, readInit());
    }

    private async retryAfterSessionResume(original: Response): Promise<Response> {
        const session = await this.request(SESSION_PATH, readInit());
        // A healthy session may intentionally have no linked account yet.
        if (session.ok || session.status !== 401) return original;
        const resumed = await this.request(SESSION_RESUME_PATH, mutationInit(false));
        if (!resumed.ok) {
            if (resumed.status === 401 || resumed.status === 403) this.sessionResumeRefused = true;
            return original;
        }
        this.sessionResumeRefused = false;
        return this.accountRequest();
    }

    private setState(state: HostedAcademyAccountState): HostedAcademyAccountState {
        this.currentState = state;
        this.listeners.forEach(listener => listener(state));
        return state;
    }
}

/** Idempotently owns the desktop and mobile VitePress account controls. */
export class HostedAcademyAccountControls {
    private readonly client: HostedAcademyAccountClient;
    private readonly document: Document;
    private language: HostedAcademyAccountLanguage = 'en';
    private readonly unsubscribe: () => void;

    constructor(options: HostedAcademyAccountControlsOptions = {}) {
        this.client = options.client ?? new HostedAcademyAccountClient();
        this.document = options.document ?? document;
        this.unsubscribe = this.client.subscribe(() => this.render());
    }

    sync(language: HostedAcademyAccountLanguage): void {
        this.language = language;
        this.mountDesktopControl();
        this.mountMobileControl();
        this.render();
        void this.client.ensureLoaded();
    }

    destroy(): void {
        this.unsubscribe();
        this.document.getElementById(DESKTOP_ACCOUNT_ID)?.remove();
        this.document.getElementById(MOBILE_ACCOUNT_ID)?.remove();
    }

    private mountDesktopControl(): void {
        const target = this.document.querySelector<HTMLElement>('.VPNavBar .content-body');
        if (!target) return;
        const control = this.control(DESKTOP_ACCOUNT_ID, false);
        if (!target.contains(control)) {
            const anchor = target.querySelector<HTMLElement>('.VPNavBarAppearance');
            target.insertBefore(control, anchor);
        }
    }

    private mountMobileControl(): void {
        const target = this.document.querySelector<HTMLElement>('#NavScreenGroup-more');
        if (!target) return;
        const control = this.control(MOBILE_ACCOUNT_ID, true);
        if (!target.contains(control)) target.prepend(control);
    }

    private control(id: string, mobile: boolean): HTMLElement {
        const existing = this.document.getElementById(id);
        if (existing) return existing;
        const control = this.document.createElement('div');
        control.id = id;
        control.className = mobile
            ? 'item yomu-hosted-account yomu-hosted-account-mobile'
            : 'yomu-hosted-account yomu-hosted-account-desktop';
        control.dataset.yomuHostedAccount = mobile ? 'mobile' : 'desktop';
        control.dataset.yomuLocalize = 'off';
        control.dataset.jpdbReaderSurfaceIgnore = 'true';
        return control;
    }

    private render(): void {
        for (const control of this.document.querySelectorAll<HTMLElement>('[data-yomu-hosted-account]')) {
            this.renderControl(control);
        }
    }

    private renderControl(control: HTMLElement): void {
        const state = this.client.state;
        const copy = COPY[this.language];
        control.setAttribute('aria-busy', String(state.phase === 'loading' || state.busy));
        const existingDetails = control.querySelector<HTMLDetailsElement>('details');
        const wasOpen = existingDetails?.open ?? false;
        const details = this.document.createElement('details');
        details.className = 'yomu-hosted-account-details';
        details.open = wasOpen;

        const summary = this.document.createElement('summary');
        summary.className = 'yomu-hosted-account-summary';
        summary.setAttribute('aria-label', copy.account);
        const summaryText = this.document.createElement('span');
        summaryText.className = 'yomu-hosted-account-summary-text';
        summaryText.textContent = state.phase === 'signed-in' && state.displayName
            ? state.displayName
            : copy.account;
        const stateMark = this.document.createElement('span');
        stateMark.className = 'yomu-hosted-account-state-mark';
        stateMark.dataset.state = state.phase;
        stateMark.setAttribute('aria-hidden', 'true');
        summary.append(stateMark, summaryText);

        const panel = this.document.createElement('div');
        panel.className = 'yomu-hosted-account-panel';
        const status = this.document.createElement('p');
        status.className = 'yomu-hosted-account-status';
        status.setAttribute('role', state.error ? 'alert' : 'status');
        status.setAttribute('aria-live', state.error ? 'assertive' : 'polite');
        status.textContent = accountStatusText(state, copy);
        panel.append(status);

        const actions = this.document.createElement('div');
        actions.className = 'yomu-hosted-account-actions';
        const actionsDisabled = state.phase === 'loading' || state.busy;
        if (state.phase === 'signed-in') {
            actions.append(
                this.accountLink(copy.profileSync, PROFILE_SYNC_PATH),
                this.actionButton(copy.signOut, () => this.client.signOut(), actionsDisabled),
            );
        } else {
            actions.append(
                this.actionButton(copy.signIn, () => this.client.beginReaderAuth(), actionsDisabled),
                this.actionButton(copy.createAccount, () => this.client.beginReaderAuth(), actionsDisabled),
            );
        }
        panel.append(actions);
        details.append(summary, panel);
        control.replaceChildren(details);
    }

    private actionButton(label: string, action: () => Promise<void>, disabled: boolean): HTMLButtonElement {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = 'yomu-hosted-account-action';
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener('click', () => void action());
        return button;
    }

    private accountLink(label: string, href: string): HTMLAnchorElement {
        const link = this.document.createElement('a');
        link.className = 'yomu-hosted-account-action';
        link.textContent = label;
        link.href = href;
        return link;
    }
}

type HostedAcademyAccountCopy = typeof COPY.en | typeof COPY.ja;

function accountStatusText(state: HostedAcademyAccountState, copy: HostedAcademyAccountCopy): string {
    if (state.error) return copy.unavailable;
    if (state.phase === 'loading') return copy.loading;
    if (state.phase === 'signed-in' && state.displayName) return copy.signedInAs(state.displayName);
    if (state.phase === 'signed-in') return copy.signedIn;
    return copy.signedOut;
}

function readInit(): RequestInit {
    return { method: 'GET', credentials: 'same-origin', cache: 'no-store' };
}

function mutationInit(jsonBody: boolean): RequestInit {
    return {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        ...(jsonBody ? {
            headers: { 'content-type': 'application/json' },
            body: '{}',
        } : {}),
    };
}

let hostedAcademyAccountControls: HostedAcademyAccountControls | undefined;

/** Client-only VitePress lifecycle seam. Safe to call after every route render. */
export function syncHostedAcademyAccountControls(language: HostedAcademyAccountLanguage): void {
    hostedAcademyAccountControls ??= new HostedAcademyAccountControls();
    hostedAcademyAccountControls.sync(language);
}
