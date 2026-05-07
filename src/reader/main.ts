import { AudioPlayer } from './audio';
import { APP_NAME, APP_PUCK, SETTINGS_TITLE } from './constants';
import {
    HAS_JAPANESE,
    applyTokensToTextNode,
    collectTextTargetsIn,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
} from './dom';
import { JpdbClient } from './jpdb';
import { ImageOcrController } from './ocr';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import {
    AUDIO_GUIDE_URL,
    AUDIO_SOURCE_OPTIONS,
    DEFAULT_SETTINGS,
    loadSettings,
    matchesShortcut,
    mergeDictionaryPreferences,
    normalizeAudioSource,
    saveSettings,
} from './settings';
import { READER_CSS } from './styles';
import { SubtitlePlayerController } from './subtitles';
import type { AudioSourceSetting, DictionaryPreference, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import {
    YomitanDictionaryStore,
    glossaryToHtml,
    parseYomitanSettingsExport,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

class ReaderApp {
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private audio = new AudioPlayer(() => this.settings);
    private dictionaries = new YomitanDictionaryStore();
    private subtitles = new SubtitlePlayerController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.jpdb.parse([text]))[0] ?? [],
        onSettingsChange: () => void saveSettings(this.settings),
        onToast: message => this.toast(message),
    });
    private ocr = new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.jpdb.parse([text]))[0] ?? [],
        onLookup: (text, sentence) => this.lookupText(text, sentence),
        onToast: message => this.toast(message),
    });
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private fab?: HTMLButtonElement;
    private lastCard?: JPDBCard;
    private selectionTimer?: number;
    private autoScanTimer?: number;
    private autoScanObserver?: MutationObserver;
    private asbScanTimer?: number;
    private hoverLookupTimer?: number;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private cardRenderRequest = 0;

    async init(): Promise<void> {
        this.settings = await loadSettings();
        this.settings = applyUrlBootstrapSettings(this.settings);
        this.installStyles();
        this.applyTheme();
        this.installFab();
        this.bindEvents();
        this.subtitles.init();
        this.ocr.init();

        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
            GM_registerMenuCommand(`${APP_NAME} scan visible page`, () => this.scanVisiblePage());
            GM_registerMenuCommand(`${APP_NAME} scan nearby images`, () => this.ocr.scanVisible());
            GM_registerMenuCommand(`${APP_NAME} show puck`, () => {
                this.settings.showFloatingButton = true;
                void saveSettings(this.settings).then(() => this.installFab());
            });
        }

        this.setupAutoScan();
        if (!this.settings.apiKey) {
            this.toast(`${APP_NAME} is installed. Add your JPDB API key to start.`);
            this.showSettings();
        } else if (this.settings.scanVisiblePage || this.settings.autoScanJapanese) {
            void this.scanVisiblePage({ silent: true });
        }
    }

    private installStyles(): void {
        if (typeof GM_addStyle === 'function') GM_addStyle(READER_CSS);
        else {
            const style = document.createElement('style');
            style.textContent = READER_CSS;
            document.head.appendChild(style);
        }
    }

    private applyTheme(): void {
        document.documentElement.classList.toggle('jpdb-reader-theme-dark', this.settings.theme === 'dark');
        document.documentElement.classList.toggle('jpdb-reader-theme-light', this.settings.theme === 'light');
        document.documentElement.classList.toggle('jpdb-reader-hide-known', this.settings.hideKnownFurigana);
    }

    private installFab(): void {
        this.fab?.remove();
        this.fab = undefined;
        if (!this.settings.showFloatingButton) return;

        const button = document.createElement('button');
        button.className = 'jpdb-reader-fab';
        button.type = 'button';
        button.textContent = APP_PUCK;
        button.title = APP_NAME;
        button.dataset.jpdbReaderRoot = 'true';
        button.addEventListener('click', () => this.showQuickMenu(button));
        document.body.appendChild(button);
        this.fab = button;
    }

    private setupAutoScan(): void {
        this.autoScanObserver?.disconnect();
        this.autoScanObserver = new MutationObserver(mutations => {
            if (mutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (mutations.every(mutationInsideReaderRoot)) return;
            else this.scheduleAutoScan(900);
        });
        this.autoScanObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.addEventListener('scroll', () => this.scheduleAutoScan(500), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(700), { passive: true });
        this.scheduleAutoScan(600);
    }

    private scheduleAutoScan(delay: number): void {
        if (!this.settings.autoScanJapanese || !this.settings.apiKey.trim()) return;
        window.clearTimeout(this.autoScanTimer);
        this.autoScanTimer = window.setTimeout(() => {
            void this.scanAsbPlayerSubtitles();
            if (collectVisibleTextTargets(1).length > 0) {
                void this.scanVisiblePage({ silent: true });
            }
        }, delay);
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (!this.settings.autoScanJapanese || !this.settings.apiKey.trim()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        document.addEventListener('click', event => {
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word) return;

            event.preventDefault();
            event.stopPropagation();
            if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word);
        }, { capture: true });

        document.addEventListener('pointerover', event => {
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word || event.pointerType === 'touch') return;
            if (!this.shouldLookupOnHover(event)) return;
            window.clearTimeout(this.hoverLookupTimer);
            this.hoverLookupTimer = window.setTimeout(() => {
                if (!word.isConnected || !word.matches(':hover')) return;
                if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
                void this.showWord(word);
            }, 180);
        }, { capture: true });

        document.addEventListener('pointerout', event => {
            const related = event.relatedTarget as Node | null;
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word || (related && word.contains(related))) return;
            window.clearTimeout(this.hoverLookupTimer);
        }, { capture: true });

        document.addEventListener('keyup', () => {
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 120);
        });

        document.addEventListener('mouseup', () => {
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 140);
        });

        document.addEventListener('touchend', () => {
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 180);
        }, { passive: true });

        document.addEventListener('keydown', event => {
            if (matchesShortcut(event, this.settings.shortcuts.closePopup) && this.hasOpenReaderDialog()) {
                event.preventDefault();
                this.dismiss();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
                event.preventDefault();
                void this.scanVisiblePage({ silent: true });
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
                event.preventDefault();
                this.showSettings();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
                event.preventDefault();
                this.settings.ocrEnabled = !this.settings.ocrEnabled;
                void saveSettings(this.settings);
                this.ocr.refresh();
                this.toast(this.settings.ocrEnabled ? 'OCR enabled.' : 'OCR hidden.');
                return;
            }
            if (this.lastCard && this.activePopover && matchesShortcut(event, this.settings.shortcuts.playAudio)) {
                event.preventDefault();
                void this.playAudio(this.lastCard);
            }
        });
    }

    private shouldLookupOnHover(event: MouseEvent): boolean {
        if (this.settings.popupActivationMode === 'hover') return true;
        if (this.settings.popupActivationMode !== 'modifier') return false;
        if (this.settings.scanModifierKey === 'shift') return event.shiftKey;
        if (this.settings.scanModifierKey === 'alt') return event.altKey;
        if (this.settings.scanModifierKey === 'ctrl') return event.ctrlKey;
        return event.metaKey;
    }

    private hasOpenReaderDialog(): boolean {
        return Boolean(this.activePopover || this.activeBackdrop || document.querySelector('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop'));
    }

    private async lookupSelection(): Promise<void> {
        const selected = getSelectionText();
        if (selected.length < 1 || selected.length > 120 || !HAS_JAPANESE.test(selected)) return;
        if ((document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) return;
        await this.lookupText(selected, getSelectionSentence());
    }

    private async lookupText(text: string, sentence = text): Promise<void> {
        const selected = text.replace(/\s+/g, ' ').trim();
        if (!selected || !HAS_JAPANESE.test(selected)) return;
        try {
            const [tokens] = await this.jpdb.parse([sentence]);
            const selectedToken = pickTokenForSelection(tokens, selected);
            if (!selectedToken) {
                this.showTokenList(tokens, selected);
                return;
            }
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence);
        } catch (error) {
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : [];
            if (localEntries.length) this.showLocalDictionaryPopup(selected, localEntries);
            else this.toast(error instanceof Error ? error.message : 'JPDB lookup failed.');
        }
    }

    private async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        try {
            const targets = collectVisibleTextTargets();
            if (!targets.length) {
                if (!options.silent) this.toast('No unscanned Japanese text found.');
                return;
            }

            const parsed = await this.jpdb.parse(targets.map(target => target.text));
            targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
            if (!options.silent) this.toast(`Scanned ${targets.length} visible text ${targets.length === 1 ? 'block' : 'blocks'}.`);
        } catch (error) {
            if (!options.silent) this.toast(error instanceof Error ? error.message : 'JPDB scan failed.');
        }
    }

    private async scanAsbPlayerSubtitles(): Promise<void> {
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return;

        const targets = roots.flatMap(root => collectTextTargetsIn(root, 12, false)).slice(0, 12);
        if (!targets.length) return;

        try {
            const parsed = await this.jpdb.parse(targets.map(target => target.text));
            targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
        }
    }

    private async showWord(word: HTMLElement): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.jpdb.getCard(vid, sid);
        if (!card) {
            this.toast('That word is no longer in the local JPDB cache. Scan it again.');
            return;
        }
        void this.showCard(card, word.dataset.sentence || undefined, word);
    }

    private showTokenList(tokens: JPDBToken[], selected: string): void {
        if (!tokens.length) return;
        const popover = this.createPopover();
        popover.innerHTML = `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map(token => `
                    <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                        ${escapeHtml(token.card.spelling)} ${token.card.reading !== token.card.spelling ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>` : ''}
                    </button>
                `).join('')}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml(selected)}</div>
        `;
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
            if (!button) return;
            const card = this.jpdb.getCard(Number(button.dataset.vid), Number(button.dataset.sid));
            if (card) void this.showCard(card, tokens.find(t => t.card === card)?.sentence);
        });
        this.mountPopover(popover);
    }

    private showLocalDictionaryPopup(term: string, entries: YomitanTermEntry[]): void {
        const popover = this.createPopover();
        popover.innerHTML = `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${escapeHtml(term)}</div>
                    <div class="jpdb-reader-reading">Yomitan dictionaries</div>
                </div>
            </div>
            ${this.renderLocalDefinitions(entries)}
        `;
        this.mountPopover(popover);
    }

    private showQuickMenu(anchor: HTMLElement): void {
        const popover = this.createPopover();
        popover.innerHTML = `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${APP_NAME}</div>
                    <div class="jpdb-reader-reading">Select Japanese text, tap subtitle words, or read text in images.</div>
                </div>
            </div>
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 2">
                    <button class="jpdb-reader-btn" data-action="ocr">Scan images</button>
                    <button class="jpdb-reader-btn" data-action="settings">Settings</button>
                </div>
            </div>
        `;
        popover.addEventListener('click', event => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
            if (action === 'ocr') void this.ocr.scanVisible();
            if (action === 'settings') this.showSettings();
            event.stopPropagation();
        });
        this.mountPopover(popover, anchor);
    }

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: { autoPlay?: boolean } = {}): Promise<void> {
        const requestId = ++this.cardRenderRequest;
        this.lastCard = card;
        const state = card.cardState[0] ?? 'not-in-deck';
        const popover = this.createPopover();
        const localEntries = this.settings.localDictionariesEnabled
            ? await this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const kanjiEntries = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? await this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const metaEntries = this.settings.localDictionariesEnabled
            ? await this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const meanings = card.meanings.slice(0, 6)
            .map(meaning => `<div class="jpdb-reader-meaning">${escapeHtml(meaning.glosses.join('; '))}</div>`)
            .join('');
        const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
        const cardPos = formatPartOfSpeech(card.partOfSpeech);
        const cardPosDetails = formatPartOfSpeechDetails(card.partOfSpeech);

        popover.innerHTML = `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <a class="jpdb-reader-spelling jpdb-reader-jpdb-link jpdb-${state}" href="${jpdbUrl}" target="_blank" rel="noopener" title="Open on JPDB">${escapeHtml(card.spelling)}</a>
                    ${card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(card.reading)}</div>` : ''}
                </div>
                ${this.settings.showPitchAccent ? renderPitch(card) : ''}
            </div>
            ${cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(cardPosDetails)}">${escapeHtml(cardPos)}</div>` : ''}
            <div class="jpdb-reader-meanings">${meanings || '<div class="jpdb-reader-help">No meanings returned.</div>'}</div>
            <div class="jpdb-reader-meta">
                ${card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : ''}
                <span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(state)}</span>
            </div>
            ${this.renderTermMeta(metaEntries)}
            ${this.renderLocalDefinitions(localEntries)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row" style="--cols: 4">
                    <button class="jpdb-reader-btn add" data-action="add">Add</button>
                    <button class="jpdb-reader-btn nf" data-action="neverforget">${card.cardState.includes('never-forget') ? 'Forget' : 'Never'}</button>
                    <button class="jpdb-reader-btn blacklist" data-action="blacklist">${card.cardState.includes('blacklisted') ? 'Unlist' : 'Blacklist'}</button>
                    <button class="jpdb-reader-btn" data-action="audio">Audio</button>
                </div>
                ${this.settings.enableReviews ? this.renderReviewButtons() : ''}
            </div>
        `;

        if (requestId !== this.cardRenderRequest) return;
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            void this.handleCardAction(button, card, sentence);
        });

        this.mountPopover(popover, anchor);
        if (options.autoPlay !== false && this.shouldAutoPlay(card)) void this.playAudio(card);
    }

    private shouldAutoPlay(card: JPDBCard): boolean {
        if (!this.settings.autoPlayAudio) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
        this.lastAutoAudioKey = key;
        this.lastAutoAudioAt = now;
        return true;
    }

    private renderLocalDefinitions(entries: YomitanTermEntry[]): string {
        if (!entries.length) return '';
        return `
            <div class="jpdb-reader-local">
                <div class="jpdb-reader-local-title">Yomitan dictionaries</div>
                ${entries.map(entry => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span>${escapeHtml(entry.expression)}</span>
                            ${entry.reading && entry.reading !== entry.expression ? `<span class="jpdb-reader-local-reading">${escapeHtml(entry.reading)}</span>` : ''}
                            <span class="jpdb-reader-local-dict">${escapeHtml(this.dictionaryLabel(entry.dictionary))}</span>
                        </div>
                        <div class="jpdb-reader-local-glossary">
                            ${entry.glossary.slice(0, 4).map(item => `<div>${glossaryToHtml(item)}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private renderKanjiDefinitions(entries: YomitanKanjiEntry[]): string {
        if (!entries.length) return '';
        return `
            <div class="jpdb-reader-local jpdb-reader-kanji">
                <div class="jpdb-reader-local-title">Kanji dictionaries</div>
                ${entries.map(entry => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span class="jpdb-reader-kanji-char">${escapeHtml(entry.character)}</span>
                            <span class="jpdb-reader-local-dict">${escapeHtml(this.dictionaryLabel(entry.dictionary))}</span>
                        </div>
                        <div class="jpdb-reader-kanji-readings">
                            ${entry.onyomi.length ? `<span>On ${escapeHtml(entry.onyomi.join('、'))}</span>` : ''}
                            ${entry.kunyomi.length ? `<span>Kun ${escapeHtml(entry.kunyomi.join('、'))}</span>` : ''}
                        </div>
                        <div class="jpdb-reader-local-glossary">
                            ${entry.meanings.slice(0, 6).map(meaning => `<div>${escapeHtml(meaning)}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private renderTermMeta(entries: YomitanMetaEntry[]): string {
        const items = entries
            .map(entry => this.renderMetaEntry(entry))
            .filter(Boolean)
            .slice(0, 8);
        if (!items.length) return '';
        return `<div class="jpdb-reader-meta jpdb-reader-dict-meta">${items.join('')}</div>`;
    }

    private renderMetaEntry(entry: YomitanMetaEntry): string {
        const label = this.dictionaryLabel(entry.dictionary);
        if (entry.mode === 'freq') {
            const value = formatMetaFrequency(entry.data);
            return value ? `<span class="jpdb-reader-chip" title="${escapeHtml(label)}">${escapeHtml(label)} ${escapeHtml(value)}</span>` : '';
        }
        if (entry.mode === 'pitch') {
            const value = formatMetaPitch(entry.data);
            return value ? `<span class="jpdb-reader-chip" title="${escapeHtml(label)}">pitch ${escapeHtml(value)}</span>` : '';
        }
        return '';
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private renderReviewButtons(): string {
        if (this.settings.twoButtonReviews) {
            return `
                <div class="jpdb-reader-row" style="--cols: 2">
                    <button class="jpdb-reader-btn fail" data-action="grade" data-grade="fail">FAIL</button>
                    <button class="jpdb-reader-btn pass" data-action="grade" data-grade="pass">PASS</button>
                </div>
            `;
        }
        return `
            <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 5">
                <button class="jpdb-reader-btn nothing" data-action="grade" data-grade="nothing">NOTHING</button>
                <button class="jpdb-reader-btn something" data-action="grade" data-grade="something">SOMETHING</button>
                <button class="jpdb-reader-btn hard" data-action="grade" data-grade="hard">HARD</button>
                <button class="jpdb-reader-btn okay" data-action="grade" data-grade="okay">OKAY</button>
                <button class="jpdb-reader-btn easy" data-action="grade" data-grade="easy">EASY</button>
            </div>
        `;
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        try {
            if (action === 'audio') await this.playAudio(card);
            if (action === 'add') {
                await this.jpdb.addToDeck(this.settings.miningDeck || 'forq', card, sentence);
                if (this.settings.addToForq && this.settings.miningDeck !== 'forq') await this.jpdb.addToDeck('forq', card, sentence);
                this.toast('Added to JPDB.');
            }
            if (action === 'neverforget') await this.toggleDeck(card, 'never-forget', this.settings.neverForgetDeck);
            if (action === 'blacklist') await this.toggleDeck(card, 'blacklisted', this.settings.blacklistDeck);
            if (action === 'grade') {
                await this.jpdb.reviewCard(card, button.dataset.grade as JPDBGrade);
                this.toast('Review sent.');
            }
            if (action !== 'audio') await this.showCard(card, sentence, undefined, { autoPlay: false });
        } catch (error) {
            this.toast(error instanceof Error ? error.message : 'Action failed.');
        } finally {
            button.disabled = false;
        }
    }

    private async toggleDeck(card: JPDBCard, state: 'never-forget' | 'blacklisted', deck: string): Promise<void> {
        if (card.cardState.includes(state)) {
            await this.jpdb.removeFromDeck(deck, card);
            this.toast('Removed from deck.');
        } else {
            await this.jpdb.addToDeck(deck, card);
            this.toast('Added to deck.');
        }
    }

    private async playAudio(card: JPDBCard): Promise<void> {
        try {
            await this.audio.play(card);
        } catch (error) {
            this.toast(error instanceof Error ? error.message : 'Audio playback failed.');
        }
    }

    private showSettings(): void {
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.setAttribute('role', 'dialog');
        form.setAttribute('aria-modal', 'true');
        form.setAttribute('aria-label', SETTINGS_TITLE);
        form.tabIndex = -1;
        form.innerHTML = `
            <div class="jpdb-reader-settings-head">
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            <div class="jpdb-reader-settings-scroll">
            <fieldset>
                <legend>JPDB</legend>
                ${input('apiKey', 'API key', this.settings.apiKey, 'password')}
                <div class="grid">
                    ${input('miningDeck', 'Mining deck', this.settings.miningDeck)}
                    ${input('neverForgetDeck', 'Never forget deck', this.settings.neverForgetDeck)}
                    ${input('blacklistDeck', 'Blacklist deck', this.settings.blacklistDeck)}
                    ${select('twoButtonReviews', 'Review buttons', this.settings.twoButtonReviews ? 'true' : 'false', [['false', 'Five grades'], ['true', 'Pass/fail']])}
                </div>
                ${checkbox('addToForq', 'Also add mined cards to forq', this.settings.addToForq)}
                ${checkbox('enableReviews', 'Show review buttons', this.settings.enableReviews)}
            </fieldset>
            <fieldset>
                <legend>Audio</legend>
                ${checkbox('audioEnabled', 'Enable audio playback for terms', this.settings.audioEnabled)}
                ${checkbox('autoPlayAudio', 'Auto-play search result audio', this.settings.autoPlayAudio)}
                ${checkbox('audioEnableDefaultSources', 'Enable Default Audio Sources', this.settings.audioEnableDefaultSources)}
                <div class="grid">
                    ${select('audioSelectionMode', 'Audio returned by source', this.settings.audioSelectionMode, [['first', 'First audio'], ['random', 'Random audio']])}
                    ${checkbox('audioViaBlob', 'Fetch as blob for iOS Tampermonkey', this.settings.audioViaBlob)}
                    ${input('audioTimeoutMs', 'Audio timeout (ms)', String(this.settings.audioTimeoutMs), 'number')}
                </div>
                <div class="jpdb-reader-audio-sources">
                    <div class="jpdb-reader-audio-source-head">
                        <span>#</span>
                        <span>Audio source</span>
                        <span>URL / voice</span>
                    </div>
                    ${renderAudioSourceRows(this.settings.audioSources)}
                </div>
                <div class="jpdb-reader-help">Supports {term}, {reading}, and {language}. See the <a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.</div>
            </fieldset>
            <fieldset>
                <legend>Reader</legend>
                <div class="grid">
                    ${checkbox('parseSelection', 'Lookup selected text', this.settings.parseSelection)}
                    ${checkbox('autoScanJapanese', 'Auto-scan when Japanese is detected', this.settings.autoScanJapanese)}
                    ${checkbox('scanVisiblePage', 'Scan visible page on load', this.settings.scanVisiblePage)}
                    ${checkbox('showFloatingButton', 'Show floating puck on pages', this.settings.showFloatingButton)}
                    ${checkbox('showFurigana', 'Enable furigana annotations', this.settings.showFurigana)}
                    ${checkbox('showPitchAccent', 'Show pitch accent', this.settings.showPitchAccent)}
                    ${checkbox('hideKnownFurigana', 'Hide furigana for known cards only', this.settings.hideKnownFurigana)}
                    ${select('popupActivationMode', 'Popup activation', this.settings.popupActivationMode, [['click', 'Tap or click'], ['hover', 'Hover'], ['modifier', 'Hold key + hover']])}
                    ${select('scanModifierKey', 'Hover lookup key', this.settings.scanModifierKey, [['shift', 'Shift'], ['alt', 'Alt'], ['ctrl', 'Ctrl'], ['meta', 'Command / Windows']])}
                </div>
                <div class="grid">
                    ${select('theme', 'Theme', this.settings.theme, [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}
                    ${select('popupMode', 'Popup mode', this.settings.popupMode, [['auto', 'Auto'], ['sheet', 'Bottom sheet'], ['popover', 'Popover']])}
                </div>
            </fieldset>
            <fieldset>
                <legend>OCR</legend>
                <div class="grid">
                    ${checkbox('ocrEnabled', 'Enable image OCR', this.settings.ocrEnabled)}
                    ${checkbox('ocrAutoScanImages', 'Auto-scan readable images near the viewport', this.settings.ocrAutoScanImages)}
                    ${checkbox('ocrShowTextOverlay', 'Show tappable OCR text over images', this.settings.ocrShowTextOverlay)}
                    ${checkbox('ocrTapToScan', 'Show OCR button on images', this.settings.ocrTapToScan)}
                    ${select('ocrProvider', 'OCR endpoint type', this.settings.ocrProvider, [['custom-json', 'YomiNinja / custom JSON'], ['off', 'No endpoint']])}
                    ${input('ocrEndpointUrl', 'OCR endpoint URL', this.settings.ocrEndpointUrl)}
                    ${input('ocrEngine', 'OCR engine', this.settings.ocrEngine)}
                    ${input('ocrLanguage', 'OCR language', this.settings.ocrLanguage)}
                    ${input('ocrMaxImagePixels', 'Max image pixels sent', String(this.settings.ocrMaxImagePixels), 'number')}
                    ${input('ocrMinImageArea', 'Minimum image area', String(this.settings.ocrMinImageArea), 'number')}
                    ${input('ocrMaxImagesPerPage', 'Max images per page', String(this.settings.ocrMaxImagesPerPage), 'number')}
                    ${input('ocrPrefetchMargin', 'Prefetch margin (px)', String(this.settings.ocrPrefetchMargin), 'number')}
                </div>
                <div class="jpdb-reader-help">For iPhone, use a desktop or server OCR endpoint over Tailnet. The request is YomiNinja-shaped JSON with base64_image, language_code, ocr_engine, and detection_only.</div>
            </fieldset>
            <fieldset>
                <legend>Video</legend>
                <div class="grid">
                    ${checkbox('subtitlePlayerEnabled', 'Enable video subtitle player', this.settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', 'Auto-detect page subtitles', this.settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', 'Show subtitle overlay', this.settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleSecondaryVisible', 'Show native subtitles when available', this.settings.subtitleSecondaryVisible)}
                    ${checkbox('subtitleMiningPause', 'Pause video when mining subtitle', this.settings.subtitleMiningPause)}
                    ${input('subtitleFontSize', 'Subtitle font size', String(this.settings.subtitleFontSize), 'number')}
                    ${input('subtitleBottomOffset', 'Subtitle bottom offset (%)', String(this.settings.subtitleBottomOffset), 'number')}
                    ${input('subtitleSeekPadding', 'Subtitle seek padding (seconds)', String(this.settings.subtitleSeekPadding), 'number')}
                </div>
            </fieldset>
            <fieldset>
                <legend>Yomitan</legend>
                <div class="grid">
                    ${checkbox('localDictionariesEnabled', 'Show imported dictionary definitions', this.settings.localDictionariesEnabled)}
                    ${checkbox('localDictionaryShowKanji', 'Show kanji dictionary cards', this.settings.localDictionaryShowKanji)}
                    ${input('localDictionaryMaxResults', 'Dictionary result limit', String(this.settings.localDictionaryMaxResults), 'number')}
                </div>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status>Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities">
                    ${renderDictionaryPreferenceRows(this.settings.dictionaryPreferences)}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">Import settings</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">Export settings</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">Import dictionaries</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">Export dictionaries</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Supports Yomitan settings JSON, Yomitan dictionary ZIPs, and Yomitan Dexie dictionary exports.</div>
            </fieldset>
            <fieldset>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${input('shortcuts.scanPage', 'Scan page', this.settings.shortcuts.scanPage)}
                    ${input('shortcuts.openSettings', 'Open settings', this.settings.shortcuts.openSettings)}
                    ${input('shortcuts.playAudio', 'Play audio', this.settings.shortcuts.playAudio)}
                    ${input('shortcuts.closePopup', 'Close popup', this.settings.shortcuts.closePopup)}
                    ${input('shortcuts.previousSubtitle', 'Previous subtitle', this.settings.shortcuts.previousSubtitle)}
                    ${input('shortcuts.nextSubtitle', 'Next subtitle', this.settings.shortcuts.nextSubtitle)}
                    ${input('shortcuts.copySubtitle', 'Copy subtitle', this.settings.shortcuts.copySubtitle)}
                    ${input('shortcuts.toggleOcr', 'Toggle OCR', this.settings.shortcuts.toggleOcr)}
                </div>
            </fieldset>
            </div>
            <div class="footer">
                <button class="jpdb-reader-btn" type="button" data-action="cancel">Cancel</button>
                <button class="jpdb-reader-btn add" type="submit">Save</button>
            </div>
        `;

        const backdrop = this.createBackdrop();
        form.addEventListener('submit', event => {
            event.preventDefault();
            const data = new FormData(form);
            this.settings = readFormSettings(data, this.settings);
            void saveSettings(this.settings).then(() => {
                this.jpdb.clear();
                this.applyTheme();
                this.installFab();
                this.subtitles.refresh();
                this.ocr.refresh();
                this.scheduleAutoScan(100);
                this.dismiss();
                this.toast('Settings saved.');
            });
        });
        form.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dismiss());
        form.addEventListener('click', event => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
            if (!action || action === 'cancel') return;
            event.preventDefault();
            event.stopPropagation();
            void this.handleSettingsAction(form, action);
        });
        this.dismiss();
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activePopover = form;
        form.focus();
        void this.refreshDictionaryStatus(form);
    }

    private async refreshDictionaryStatus(form: HTMLFormElement): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-dictionary-status]');
        const priorities = form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities');
        try {
            const summary = await this.dictionaries.summary();
            const names = summary.dictionaries.map(item => item.title);
            const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names);
            if (merged.length !== this.settings.dictionaryPreferences.length) {
                this.settings.dictionaryPreferences = merged;
                await saveSettings(this.settings);
            }
            if (status) {
                status.textContent = summary.dictionaries.length
                    ? `${summary.dictionaries.length} dictionaries, ${summary.terms.toLocaleString()} terms, ${summary.kanji.toLocaleString()} kanji, ${summary.termMeta.toLocaleString()} metadata rows.`
                    : 'No local dictionaries imported yet.';
            }
            if (priorities) priorities.innerHTML = renderDictionaryPreferenceRows(this.settings.dictionaryPreferences);
        } catch (error) {
            if (status) status.textContent = error instanceof Error ? error.message : 'Dictionary status unavailable.';
        }
    }

    private async handleSettingsAction(form: HTMLFormElement, action: string): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-import-status]');
        const setStatus = (message: string) => {
            if (status) status.textContent = message;
        };

        try {
            if (action === 'import-yomitan-settings') {
                const file = await pickFile(form, 'settings');
                if (!file) return;
                const json = JSON.parse(await file.text()) as unknown;
                const readerSettings = getReaderSettingsExport(json);
                if (readerSettings) {
                    this.settings = { ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } };
                } else {
                    const imported = parseYomitanSettingsExport(json);
                    this.settings = {
                        ...this.settings,
                        ...imported.settings,
                        shortcuts: {
                            ...this.settings.shortcuts,
                            ...(imported.settings.shortcuts ?? {}),
                        },
                    };
                }
                const importedNames = (await this.dictionaries.summary().catch(() => ({ dictionaries: [] }))).dictionaries.map(item => item.title);
                this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames);
                await saveSettings(this.settings);
                setStatus('Settings imported.');
                this.applyTheme();
                this.installFab();
                this.subtitles.refresh();
                this.showSettings();
                return;
            }

            if (action === 'export-reader-settings') {
                downloadBlob(new Blob([JSON.stringify({
                    formatName: 'kotoba-reader-settings',
                    formatVersion: 1,
                    exportedAt: new Date().toISOString(),
                    settings: this.settings,
                }, null, 2)], { type: 'application/json' }), `kotoba-settings-${dateStamp()}.json`);
                setStatus('Settings exported.');
                return;
            }

            if (action === 'import-yomitan-dictionary') {
                const file = await pickFile(form, 'dictionary');
                if (!file) return;
                const summary = await this.dictionaries.importFile(file, message => setStatus(message));
                this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
                await saveSettings(this.settings);
                setStatus(`Imported ${summary.entries.toLocaleString()} records from ${summary.dictionaries.length} dictionary source${summary.dictionaries.length === 1 ? '' : 's'}.`);
                this.showSettings();
                return;
            }

            if (action === 'export-yomitan-dictionary') {
                const blob = await this.dictionaries.exportJson();
                downloadBlob(blob, `kotoba-dictionaries-${dateStamp()}.json`);
                setStatus('Dictionaries exported.');
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Import failed.');
        }
    }

    private createPopover(): HTMLElement {
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.tabIndex = -1;
        if (this.shouldUseSheet()) popover.classList.add('jpdb-reader-sheet');
        return popover;
    }

    private mountPopover(popover: HTMLElement, anchor?: HTMLElement): void {
        const backdrop = this.createBackdrop();
        this.dismiss();
        document.body.append(backdrop, popover);
        this.activeBackdrop = backdrop;
        this.activePopover = popover;

        if (!popover.classList.contains('jpdb-reader-sheet')) {
            positionPopover(popover, anchor);
        }
        popover.focus();
    }

    private createBackdrop(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'jpdb-reader-backdrop';
        backdrop.dataset.jpdbReaderRoot = 'true';
        backdrop.addEventListener('click', () => this.dismiss());
        return backdrop;
    }

    private shouldUseSheet(): boolean {
        if (this.settings.popupMode === 'sheet') return true;
        if (this.settings.popupMode === 'popover') return false;
        return window.innerWidth <= 768 || matchMedia('(pointer: coarse)').matches;
    }

    private dismiss(): void {
        this.cardRenderRequest++;
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
        this.activePopover = undefined;
        this.activeBackdrop = undefined;
    }

    private toast(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'jpdb-reader-toast';
        toast.dataset.jpdbReaderRoot = 'true';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }
}

function pauseActiveVideo(): void {
    const videos = Array.from(document.querySelectorAll('video'));
    const playable = videos
        .filter(video => video.readyState > 0)
        .sort((a, b) => {
            const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
            const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
            return Number(a.paused) - Number(b.paused) || bArea - aArea;
        });
    playable[0]?.pause();
}

function mutationTouchesAsbPlayer(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    return nodes.some(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
    });
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

function pickTokenForSelection(tokens: JPDBToken[] = [], selected: string): JPDBToken | undefined {
    const exact = tokens.find(token => token.card.spelling === selected || token.card.reading === selected);
    if (exact) return exact;

    return tokens.find(token => selected.includes(token.card.spelling) || token.card.spelling.includes(selected));
}

function formatMetaFrequency(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'string') return `#${value}`;
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const display = record.displayValue ?? record.frequency ?? record.value;
    if (display == null) return '';
    return `#${String(display)}`;
}

function formatMetaPitch(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const positions = Array.isArray(record.pitches) ? record.pitches : Array.isArray(record.positions) ? record.positions : [];
    if (positions.length) return positions.slice(0, 4).map(String).join(', ');
    if (typeof record.position === 'number') return String(record.position);
    return '';
}

function renderPitch(card: JPDBCard): string {
    const [pitch] = card.pitchAccent;
    if (!pitch) return '';

    const morae = splitMorae(card.reading);
    const highs = Array.from(pitch).filter(ch => ch === 'H' || ch === 'L').slice(0, morae.length);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === 'H' ? 10 : 29}`).join(' ');
    const cls = getPitchClassName(pitch);
    return `<div class="jpdb-reader-pitch"><svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle cx="${9 + index * 24}" cy="${level === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
    </svg></div>`;
}

function splitMorae(reading: string): string[] {
    const small = new Set('ゃゅょャュョァィゥェォ');
    const morae: string[] = [];
    for (const char of Array.from(reading)) {
        if (morae.length && small.has(char)) morae[morae.length - 1] += char;
        else morae.push(char);
    }
    return morae;
}

function getPitchClassName(pitch: string): string {
    const drops = (pitch.match(/HL/g) ?? []).length;
    const rises = (pitch.match(/LH/g) ?? []).length;
    if (pitch.startsWith('H') && drops === 1) return 'atamadaka';
    if (pitch.startsWith('L') && rises === 1 && !pitch.endsWith('L')) return 'heiban';
    if (pitch.startsWith('L') && rises === 1 && pitch.endsWith('L')) return 'nakadaka';
    if (rises > 1 || drops > 1) return 'kifuku';
    return 'odaka';
}

function positionPopover(popover: HTMLElement, anchor?: HTMLElement): void {
    const selection = window.getSelection();
    const rect = anchor?.getBoundingClientRect()
        ?? (selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined);
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const fallbackLeft = (window.innerWidth - width) / 2;
    const fallbackTop = window.innerHeight * 0.18;
    const left = rect ? rect.left + (rect.width - width) / 2 : fallbackLeft;
    const top = rect && rect.top > height + 10 ? rect.top - height - 8 : (rect ? rect.bottom + 8 : fallbackTop);
    popover.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
}

function input(name: string, label: string, value: string, type = 'text'): string {
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"></label>`;
}

function checkbox(name: string, label: string, checked: boolean): string {
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}>${label}</label>`;
}

function select(name: string, label: string, value: string, options: [string, string][]): string {
    return `<label>${label}<select name="${name}">${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select></label>`;
}

function renderAudioSourceRows(sources: AudioSourceSetting[]): string {
    const count = Math.max(sources.length + 1, 3);
    const rows = Array.from({ length: count }, (_, index) => sources[index] ?? {
        type: index === 0 ? 'custom-json' : 'jpod101',
        url: '',
        voice: '',
        enabled: false,
    } satisfies AudioSourceSetting);

    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row">
                <label class="inline jpdb-reader-audio-index">
                    <input name="audioSources.${index}.enabled" type="checkbox" ${source.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <select name="audioSources.${index}.type" aria-label="Audio source ${index + 1}">
                    ${AUDIO_SOURCE_OPTIONS.map(([optionValue, text]) =>
                        `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? 'selected' : ''}>${escapeHtml(text)}</option>`,
                    ).join('')}
                </select>
                <div class="jpdb-reader-audio-source-fields">
                    <input name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="URL for Custom URL sources">
                    <input name="audioSources.${index}.voice" type="text" value="${escapeHtml(source.voice)}" placeholder="Voice for text-to-speech">
                </div>
            </div>
        `).join('')}
    `;
}

function renderDictionaryPreferenceRows(preferences: DictionaryPreference[]): string {
    if (!preferences.length) return '<div class="jpdb-reader-help">Import Yomitan settings or dictionaries to manage dictionary priority.</div>';
    return `
        <div class="jpdb-reader-dictionary-head">
            <span>#</span>
            <span>Dictionary</span>
            <span>Alias</span>
        </div>
        <input type="hidden" name="dictionaryPreferenceCount" value="${preferences.length}">
        ${preferences.map((preference, index) => `
            <div class="jpdb-reader-dictionary-row">
                <label class="inline jpdb-reader-dictionary-toggle">
                    <input name="dictionaryPreferences.${index}.enabled" type="checkbox" ${preference.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <input name="dictionaryPreferences.${index}.name" type="text" value="${escapeHtml(preference.name)}" readonly aria-label="Dictionary name">
                <input name="dictionaryPreferences.${index}.alias" type="text" value="${escapeHtml(preference.alias)}" aria-label="Dictionary alias">
                <input name="dictionaryPreferences.${index}.priority" type="number" value="${preference.priority}" aria-label="Dictionary priority">
            </div>
        `).join('')}
    `;
}

function readFormSettings(data: FormData, current: ReaderSettings): ReaderSettings {
    const get = (key: string) => String(data.get(key) ?? '');
    const has = (key: string) => data.has(key);
    const number = (key: string, fallback: number) => readNumber(get(key), fallback);
    const audioSources = readAudioSources(data);
    return {
        ...current,
        apiKey: get('apiKey').trim(),
        audioEnabled: has('audioEnabled'),
        autoPlayAudio: has('autoPlayAudio'),
        audioSources,
        audioEnableDefaultSources: has('audioEnableDefaultSources'),
        audioSourceUrl: audioSources.find(source => source.url.trim())?.url.trim() ?? current.audioSourceUrl,
        audioViaBlob: has('audioViaBlob'),
        audioTimeoutMs: Math.max(1000, number('audioTimeoutMs', current.audioTimeoutMs)),
        audioSelectionMode: get('audioSelectionMode') === 'random' ? 'random' : 'first',
        parseSelection: has('parseSelection'),
        popupActivationMode: ['click', 'hover', 'modifier'].includes(get('popupActivationMode')) ? get('popupActivationMode') as ReaderSettings['popupActivationMode'] : 'click',
        scanModifierKey: ['shift', 'alt', 'ctrl', 'meta'].includes(get('scanModifierKey')) ? get('scanModifierKey') as ReaderSettings['scanModifierKey'] : 'shift',
        autoScanJapanese: has('autoScanJapanese'),
        scanVisiblePage: has('scanVisiblePage'),
        showFloatingButton: has('showFloatingButton'),
        showFurigana: has('showFurigana'),
        showPitchAccent: has('showPitchAccent'),
        hideKnownFurigana: has('hideKnownFurigana'),
        ocrEnabled: has('ocrEnabled'),
        ocrAutoScanImages: has('ocrAutoScanImages'),
        ocrShowTextOverlay: has('ocrShowTextOverlay'),
        ocrTapToScan: has('ocrTapToScan'),
        ocrProvider: ['off', 'yomininja-json', 'custom-json'].includes(get('ocrProvider')) ? get('ocrProvider') as ReaderSettings['ocrProvider'] : 'custom-json',
        ocrEndpointUrl: get('ocrEndpointUrl').trim(),
        ocrEngine: get('ocrEngine').trim() || 'MangaOCR',
        ocrLanguage: get('ocrLanguage').trim() || 'ja-JP',
        ocrMaxImagePixels: Math.max(160000, Math.min(2800000, number('ocrMaxImagePixels', current.ocrMaxImagePixels))),
        ocrMinImageArea: Math.max(10000, Math.min(800000, number('ocrMinImageArea', current.ocrMinImageArea))),
        ocrMaxImagesPerPage: Math.max(1, Math.min(30, number('ocrMaxImagesPerPage', current.ocrMaxImagesPerPage))),
        ocrPrefetchMargin: Math.max(0, Math.min(3000, number('ocrPrefetchMargin', current.ocrPrefetchMargin))),
        localDictionariesEnabled: has('localDictionariesEnabled'),
        localDictionaryShowKanji: has('localDictionaryShowKanji'),
        localDictionaryMaxResults: Math.max(1, Math.min(64, number('localDictionaryMaxResults', current.localDictionaryMaxResults))),
        dictionaryPreferences: readDictionaryPreferences(data, current.dictionaryPreferences),
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: has('subtitleOverlayVisible'),
        subtitleSecondaryVisible: has('subtitleSecondaryVisible'),
        subtitleFontSize: Math.max(16, Math.min(64, number('subtitleFontSize', current.subtitleFontSize))),
        subtitleBottomOffset: Math.max(2, Math.min(40, number('subtitleBottomOffset', current.subtitleBottomOffset))),
        subtitleMiningPause: has('subtitleMiningPause'),
        subtitleSeekPadding: Math.max(-2, Math.min(2, number('subtitleSeekPadding', current.subtitleSeekPadding))),
        theme: get('theme') as ReaderSettings['theme'],
        popupMode: get('popupMode') as ReaderSettings['popupMode'],
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
        shortcuts: {
            scanPage: get('shortcuts.scanPage'),
            openSettings: get('shortcuts.openSettings'),
            playAudio: get('shortcuts.playAudio'),
            closePopup: get('shortcuts.closePopup'),
            previousSubtitle: get('shortcuts.previousSubtitle'),
            nextSubtitle: get('shortcuts.nextSubtitle'),
            copySubtitle: get('shortcuts.copySubtitle'),
            toggleOcr: get('shortcuts.toggleOcr'),
        },
    };
}

function readNumber(value: string, fallback: number): number {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function applyUrlBootstrapSettings(settings: ReaderSettings): ReaderSettings {
    const params = new URLSearchParams(location.search);
    const apiKey = params.get('apiKey')?.trim();
    const audio = params.get('audio')?.trim();
    const ocr = params.get('ocr')?.trim();
    if (!apiKey && !audio && !ocr) return settings;

    const audioSources = audio
        ? [{ type: 'custom-json', url: audio, voice: '', enabled: true } satisfies AudioSourceSetting, ...settings.audioSources.filter(source => source.url !== audio)]
        : settings.audioSources;

    return {
        ...settings,
        apiKey: apiKey || settings.apiKey,
        audioSources,
        audioSourceUrl: audio || settings.audioSourceUrl,
        ocrEndpointUrl: ocr || settings.ocrEndpointUrl,
    };
}

function readDictionaryPreferences(data: FormData, current: DictionaryPreference[]): DictionaryPreference[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('dictionaryPreferenceCount')) || 0);
    if (!count) return current;

    return Array.from({ length: count }, (_, index) => ({
        name: get(`dictionaryPreferences.${index}.name`).trim(),
        alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
        enabled: data.has(`dictionaryPreferences.${index}.enabled`),
        priority: readNumber(get(`dictionaryPreferences.${index}.priority`), index),
    }))
        .filter(item => item.name)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function readAudioSources(data: FormData): AudioSourceSetting[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('audioSourceCount')) || 0);
    const sources: AudioSourceSetting[] = [];

    for (let index = 0; index < count; index++) {
        const source = normalizeAudioSource({
            type: get(`audioSources.${index}.type`),
            url: get(`audioSources.${index}.url`).trim(),
            voice: get(`audioSources.${index}.voice`).trim(),
            enabled: data.has(`audioSources.${index}.enabled`),
        });
        if (!source) continue;
        if (!source.enabled && !source.url && !source.voice) continue;
        sources.push(source);
    }

    return sources;
}

function getReaderSettingsExport(value: unknown): ReaderSettings | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as { formatName?: string; settings?: unknown };
    return (record.formatName === 'kotoba-reader-settings' || record.formatName === 'jpdb-popup-reader-settings')
        && record.settings
        && typeof record.settings === 'object'
        ? record.settings as ReaderSettings
        : null;
}

function pickFile(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File | null> {
    const inputEl = root.querySelector<HTMLInputElement>(`input[data-file="${type}"]`);
    if (!inputEl) return Promise.resolve(null);

    return new Promise(resolve => {
        inputEl.onchange = () => {
            const file = inputEl.files?.[0] ?? null;
            inputEl.value = '';
            resolve(file);
        };
        inputEl.click();
    });
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

void new ReaderApp().init();
