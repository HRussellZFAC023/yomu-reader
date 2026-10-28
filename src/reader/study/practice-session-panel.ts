import { el, replaceChildrenWith } from '../dom/builder';
import { uiText, type UiCopyKey } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { managedSessionStorage } from '../app/storage';
import { bindAuthorizedReaderFormSubmit, isDirectTrustedReaderInteraction } from '../ui/trusted-interaction';
import { PracticeSessions, type PracticeSession, type PracticeSessionView, type PracticeAction, type PracticeMaterial, type PracticePurpose } from './practice-session';

const TAB_KEY = 'yomu:practice-session-tab:v1';
const PURPOSE_LABELS: Record<PracticePurpose, UiCopyKey> = {
    recognition: 'practiceRecognition', cloze: 'practiceCloze', writing: 'practiceWriting',
    listening: 'practiceListening', speaking: 'practiceSpeaking',
};
const TEXT_PURPOSES: readonly PracticePurpose[] = ['recognition', 'cloze', 'writing'];

interface PracticePanelOptions {
    readonly language: () => InterfaceLanguage;
    readonly selection: () => { readonly title: string; readonly material: readonly PracticeMaterial[] };
    readonly leave: () => void;
    readonly sessions?: PracticeSessions;
}

export function practiceSessionTabOpen(): boolean { return tabLocation() !== undefined; }

export class PracticeSessionPanel {
    readonly element = el('section', { class: 'yomu-practice-panel', tabIndex: -1, dataset: { practicePanel: true } });
    private sessions?: PracticeSessions;
    private session?: PracticeSession;
    private unsubscribe?: () => void;
    private operation = 0;
    private pendingView?: { operation: number; promise: Promise<void> };
    private visible = false;
    private initialized = false;
    private busy = false;
    private renderedTurn = '';
    private renderedLanguage: InterfaceLanguage | undefined;
    private audioUrl?: string;
    private focusTurn?: string;
    private sourceSessionId?: string;
    private sourceSummary?: { title: string; sourceTotal: number };

    constructor(private readonly options: PracticePanelOptions) {
        this.sessions = options.sessions;
        this.element.addEventListener('keydown', event => this.keydown(event));
    }

    async show(parent: HTMLElement): Promise<void> {
        this.visible = true;
        this.element.hidden = false;
        parent.insertBefore(this.element, parent.querySelector('[data-newtab-app-nav]'));
        if (this.pendingView?.operation === this.operation) {
            await this.pendingView.promise;
            return;
        }
        if (this.initialized) {
            if (this.session) {
                this.writeLocation(this.session.view().id);
                this.render(this.session, this.session.view());
            }
            else await this.home();
            return;
        }
        this.initialized = true;
        const location = tabLocation();
        this.sourceSessionId = location?.sourceSessionId;
        if (location?.sessionId) await this.resume(location.sessionId);
        else await this.home();
    }

    async pause(): Promise<boolean> {
        const session = this.session;
        if (session && session.view().status !== 'complete' && session.view().status !== 'paused') {
            const result = await session.pause();
            if (result.kind !== 'applied' && session.view().status !== 'complete') return false;
        }
        return true;
    }

    hide(): void {
        this.visible = false;
        this.operation += 1;
        this.element.hidden = true;
        this.element.querySelectorAll('audio').forEach(audio => audio.pause());
        try { managedSessionStorage.removeItem(TAB_KEY); } catch { /* The session itself remains durable. */ }
    }

    destroy(): void {
        this.visible = false;
        this.operation += 1;
        this.releaseSession();
        this.clearAudio();
        this.element.remove();
    }

    private manager(): PracticeSessions { return this.sessions ??= new PracticeSessions(); }
    private text(key: UiCopyKey): string { return uiText(this.options.language(), key); }

    private openView(run: (operation: number) => Promise<void>): Promise<void> {
        const operation = ++this.operation;
        const pending = { operation, promise: run(operation) };
        this.pendingView = pending;
        return pending.promise.finally(() => {
            if (this.pendingView === pending) this.pendingView = undefined;
        });
    }

    private home(error?: UiCopyKey): Promise<void> {
        return this.openView(operation => this.renderHome(operation, error));
    }

    private async renderHome(operation: number, error?: UiCopyKey): Promise<void> {
        const source = this.session?.view();
        if (source) {
            this.sourceSessionId = source.id;
            this.sourceSummary = { title: source.title, sourceTotal: source.sourceTotal };
        }
        this.releaseSession();
        this.clearAudio();
        this.writeLocation(null);
        const selection = this.options.selection();
        const purpose = el('select', { 'aria-label': this.text('practicePurpose'), dataset: { practicePurpose: true } },
            TEXT_PURPOSES.map(value => el('option', { value }, this.text(PURPOSE_LABELS[value]))));
        const start = this.button('practiceStart', () => { void this.start(purpose.value as PracticePurpose, selection); }, 'start');
        let readinessRevision = 0;
        const syncReadiness = async () => {
            const revision = ++readinessRevision;
            start.disabled = true;
            try {
                const selectedPurpose = purpose.value as PracticePurpose;
                const ready = await this.manager().countReady(this.sourceSessionId
                    ? { purpose: selectedPurpose, fromSession: this.sourceSessionId }
                    : { purpose: selectedPurpose, ...selection });
                if (!this.visible || operation !== this.operation || revision !== readinessRevision) return;
                start.disabled = ready === 0;
                this.element.querySelector('[data-practice-status]')?.replaceChildren(ready ? '' : this.text('practiceNoMaterial'));
            } catch {
                if (this.visible && operation === this.operation && revision === readinessRevision) this.showError('practiceUnavailable');
            }
        };
        purpose.addEventListener('change', () => { void syncReadiness(); });
        const saved = el('div', { class: 'yomu-practice-saved' });
        const sourceTitle = el('p', {}, this.sourceSessionId ? this.sourceSummary?.title ?? this.text('practicePreparing') : selection.title);
        const sourceCount = el('p', {}, this.text('practiceWordsCount').replace('{count}', String(this.sourceSessionId ? this.sourceSummary?.sourceTotal ?? 0 : selection.material.length)));
        replaceChildrenWith(this.element,
            el('h1', {}, this.text('practiceTitle')),
            sourceTitle, sourceCount,
            this.sourceSessionId && selection.material.length ? this.button('practiceCurrentSelection', () => {
                this.sourceSessionId = undefined; this.sourceSummary = undefined; void this.home();
            }, 'current-selection') : null,
            el('label', {}, this.text('practicePurpose'), purpose),
            start,
            el('small', {}, this.text('practiceScheduleUnchanged')),
            this.status(), saved,
            this.button('practiceBack', () => this.options.leave(), 'exit'),
        );
        await syncReadiness();
        if (error) this.showError(error);
        try {
            const sessions = await this.manager().list();
            if (!this.visible || operation !== this.operation) return;
            if (this.sourceSessionId) {
                const source = sessions.find(session => session.id === this.sourceSessionId);
                if (source) {
                    this.sourceSummary = { title: source.title, sourceTotal: source.sourceTotal };
                    sourceTitle.textContent = source.title;
                    sourceCount.textContent = this.text('practiceWordsCount').replace('{count}', String(source.sourceTotal));
                } else {
                    sourceTitle.textContent = this.text('practiceUnavailable');
                    sourceCount.replaceChildren();
                    this.showError('practiceUnavailable');
                }
            }
            if (!sessions.length) return;
            replaceChildrenWith(saved, el('h2', {}, this.text('practiceSaved')),
                sessions.map(session => el('div', { class: 'yomu-practice-saved-row' },
                    el('span', {}, `${session.title} · ${this.text(PURPOSE_LABELS[session.purpose])} · ${session.position}/${session.total}`),
                    this.button('practiceResume', () => { void this.resume(session.id); }, 'resume'),
                )));
        } catch { if (this.visible && operation === this.operation) this.showError('practiceUnavailable'); }
    }

    private start(purpose: PracticePurpose, selection: ReturnType<PracticePanelOptions['selection']>): Promise<void> {
        return this.openView(operation => this.startSession(operation, purpose, selection));
    }

    private async startSession(operation: number, purpose: PracticePurpose, selection: ReturnType<PracticePanelOptions['selection']>): Promise<void> {
        this.showError('practicePreparing');
        try {
            const session = await this.manager().start(this.sourceSessionId
                ? { purpose, fromSession: this.sourceSessionId }
                : { purpose, material: selection.material, title: selection.title });
            if (!this.visible || operation !== this.operation) { session.close(); return; }
            this.adopt(session);
        } catch (error) {
            if (!this.visible || operation !== this.operation) return;
            this.showError((error as { code?: unknown })?.code === 'PRACTICE_NO_MATERIAL' ? 'practiceNoMaterial' : 'practiceUnavailable');
        }
    }

    private resume(id: string): Promise<void> {
        return this.openView(operation => this.resumeSession(operation, id));
    }

    private async resumeSession(operation: number, id: string): Promise<void> {
        try {
            const session = await this.manager().resume(id);
            if (!this.visible || operation !== this.operation) { session.close(); return; }
            this.adopt(session);
        } catch {
            if (!this.visible || operation !== this.operation) return;
            await this.home('practiceUnavailable');
        }
    }

    private adopt(session: PracticeSession): void {
        this.releaseSession();
        this.session = session;
        this.renderedTurn = '';
        this.writeLocation(session.view().id);
        this.unsubscribe = session.subscribe(view => this.render(session, view));
    }

    private render(session: PracticeSession, view: PracticeSessionView): void {
        if (!this.visible || session !== this.session) return;
        if (view.turn !== this.renderedTurn || this.options.language() !== this.renderedLanguage) {
            const previous = view.turn === this.renderedTurn ? this.element.querySelector<HTMLInputElement>('[data-practice-input]') : null;
            const draft = previous?.value;
            const selection = previous ? [previous.selectionStart, previous.selectionEnd] as const : null;
            this.renderedTurn = view.turn;
            this.renderedLanguage = this.options.language();
            this.clearAudio();
            this.renderTurn(session, view);
            this.focusTurn = view.turn;
            const input = this.element.querySelector<HTMLInputElement>('[data-practice-input]');
            if (input && draft !== undefined) {
                input.value = draft;
                if (selection) input.setSelectionRange(selection[0], selection[1]);
            }
        }
        this.element.setAttribute('aria-busy', String(this.busy || view.status === 'saving'));
        const blocked = this.busy || view.transitionPending || view.status === 'conflict';
        this.element.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button[data-practice-command]').forEach(control => { control.disabled = blocked; });
        if (view.status === 'conflict') {
            this.showError('practiceConflict');
            this.element.querySelector('[data-practice-status]')?.append(this.button('practiceReopen', () => { void this.resume(view.id); }, 'reopen'));
        }
        else if (view.status === 'save-failed') this.showError('practiceSaveFailed');
        else this.element.querySelector('[data-practice-status]')?.replaceChildren();
        if (!blocked && this.focusTurn === view.turn) queueMicrotask(() => {
            if (!this.visible || this.busy || !this.element.isConnected || session !== this.session || session.view().turn !== view.turn
                || this.element.closest('[inert]')) return;
            const input = this.element.querySelector<HTMLInputElement>('[data-practice-input]');
            if (input?.disabled) return;
            if (document.activeElement === document.body || this.element.contains(document.activeElement)) {
                this.focusTurn = undefined;
                (input ?? this.element).focus();
            }
        });
    }

    private renderTurn(session: PracticeSession, view: PracticeSessionView): void {
        const heading = el('header', {},
            el('h1', {}, this.text(PURPOSE_LABELS[view.purpose])),
            el('p', {}, this.text('practicePosition').replace('{current}', String(Math.min(view.position + 1, view.total))).replace('{total}', String(view.total))));
        if (!view.current || view.phase === 'paused') {
            replaceChildrenWith(this.element, heading,
                el('h2', {}, this.text(view.phase === 'paused' ? 'practicePause' : 'practiceComplete')),
                view.phase === 'paused' ? this.commandButton('practiceResume', session, view, { kind: 'continue' }) : null,
                this.button('practiceNew', () => { void this.home(); }, 'new'),
                this.button('practiceBack', () => this.options.leave(), 'exit'), this.status());
            return;
        }
        const current = view.current;
        const prompt = el('div', { class: 'yomu-practice-prompt', lang: current.language }, current.prompt);
        const content: HTMLElement[] = [heading, prompt];
        if (current.audio) {
            this.audioUrl = URL.createObjectURL(current.audio);
            content.push(el('audio', { controls: true, src: this.audioUrl, 'aria-label': this.text('practiceAudio') }));
        }
        const written = view.purpose === 'writing' || view.purpose === 'cloze';
        if (written && !current.response.revealed) content.push(this.answerForm(session, view));
        if (current.response.latest) content.push(el('p', { role: 'status', dataset: { practiceFeedback: true } },
            this.text(current.response.latest === 'correct' ? 'practiceCorrect' : current.response.latest === 'accepted' ? 'practiceAccepted' : 'practiceDifferent')));
        if (current.answer) content.push(el('div', { class: 'yomu-practice-answer', dataset: { practiceAnswer: true } },
            el('strong', {}, current.answer.spelling), el('span', {}, current.answer.reading), el('p', {}, current.answer.meaning)));
        const actions = el('div', { class: 'yomu-practice-actions' },
            !current.response.revealed ? this.commandButton('reveal', session, view, { kind: 'reveal' })
                : written && current.response.attempts ? this.commandButton('practiceNext', session, view, { kind: 'next' })
                    : [this.commandButton('practiceNotYet', session, view, { kind: 'self-check', outcome: 'again' }),
                        this.commandButton('practiceRemembered', session, view, { kind: 'self-check', outcome: 'recalled' })],
            this.commandButton('practiceSkip', session, view, { kind: 'skip' }),
            this.commandButton('practicePause', session, view, { kind: 'pause' }));
        replaceChildrenWith(this.element, ...content, actions, this.status());
    }

    private answerForm(session: PracticeSession, view: PracticeSessionView): HTMLFormElement {
        const input = el('input', {
            type: 'text', value: view.current?.response.draft ?? '', autocomplete: 'off', spellcheck: false,
            'aria-label': this.text('practiceResponse'), dataset: { practiceInput: true },
        });
        const form = el('form', {}, input, el('button', { type: 'submit', dataset: { practiceCommand: 'answer' } }, this.text('practiceCheck')));
        let composing = false;
        input.addEventListener('compositionstart', event => { if (this.accept(event, input)) composing = true; });
        input.addEventListener('compositionend', event => { if (this.accept(event, input)) composing = false; });
        input.addEventListener('input', event => {
            if (!this.accept(event, input) || session !== this.session) return;
            void session.dispatch({ kind: 'draft', text: input.value, turn: view.turn });
        });
        bindAuthorizedReaderFormSubmit(form, () => {
            if (composing || !this.visible || session !== this.session || !this.element.contains(form)) return;
            if (!input.value.trim()) { this.showError('practiceEmptyAnswer'); return; }
            void this.act(session, view.turn, { kind: 'answer', text: input.value });
        });
        return form;
    }

    private commandButton(key: UiCopyKey, session: PracticeSession, view: PracticeSessionView, action: PracticeAction): HTMLButtonElement {
        const button = this.button(key, () => { void this.act(session, view.turn, action); }, action.kind);
        button.dataset.practiceCommand = action.kind;
        return button;
    }

    private async act(session: PracticeSession, turn: string, action: PracticeAction): Promise<void> {
        if (this.busy || session !== this.session) return;
        this.busy = true;
        this.render(session, session.view());
        try { await session.dispatch({ ...action, turn }); }
        finally { this.busy = false; this.render(session, session.view()); }
    }

    private button(key: UiCopyKey, run: () => void, action: string): HTMLButtonElement {
        const button = el('button', { type: 'button', dataset: { practiceAction: action } }, this.text(key));
        button.addEventListener('click', event => {
            if (!this.accept(event, button)) return;
            event.preventDefault(); event.stopPropagation(); run();
        });
        return button;
    }

    private accept(event: Event, control: HTMLElement): boolean {
        return this.visible && this.element.isConnected && this.element.contains(control)
            && !this.element.closest('[inert]') && isDirectTrustedReaderInteraction(event);
    }

    private keydown(event: KeyboardEvent): void {
        if (!this.accept(event, this.element) || !this.session || this.busy || event.repeat || event.isComposing
            || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.target instanceof Element && event.target.closest('input, textarea, select, button, audio')) return;
        const view = this.session.view();
        if (view.status !== 'ready' || !view.current || (event.key !== ' ' && event.key !== 'Enter')) return;
        event.preventDefault(); event.stopPropagation();
        const action: PracticeAction = !view.current.response.revealed ? { kind: 'reveal' }
            : (view.purpose === 'writing' || view.purpose === 'cloze') && view.current.response.attempts
                ? { kind: 'next' } : { kind: 'self-check', outcome: 'recalled' };
        void this.act(this.session, view.turn, action);
    }
    private status(): HTMLElement { return el('p', { role: 'status', dataset: { practiceStatus: true } }); }
    private showError(key: UiCopyKey): void { this.element.querySelector('[data-practice-status]')?.replaceChildren(this.text(key)); }
    private clearAudio(): void {
        this.element.querySelectorAll('audio').forEach(audio => audio.pause());
        if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
        this.audioUrl = undefined;
    }
    private releaseSession(): void { this.unsubscribe?.(); this.unsubscribe = undefined; this.session?.close(); this.session = undefined; }
    private writeLocation(sessionId: string | null): void {
        try { managedSessionStorage.setItem(TAB_KEY, JSON.stringify({ version: 1, sessionId, sourceSessionId: this.sourceSessionId })); }
        catch { /* Saved sessions remain available from the local session list. */ }
    }
}

function tabLocation(): { sessionId: string | null; sourceSessionId?: string } | undefined {
    try {
        const value = JSON.parse(managedSessionStorage.getItem(TAB_KEY) ?? 'null');
        return value?.version === 1 && (value.sessionId === null || typeof value.sessionId === 'string')
            && (value.sourceSessionId === undefined || typeof value.sourceSessionId === 'string') ? value : undefined;
    } catch { return undefined; }
}
