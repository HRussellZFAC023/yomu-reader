import { AnkiConnectClient, type AnkiLookupResult } from './anki';
import { copyText } from './browser-ui';
import { normalizeCardStates } from './card-state';
import { JpdbClient } from './jpdb';
import { renderStudyToolResult } from './study-render';
import { uiText } from './i18n';
import type { MiningContext } from './mining-context';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';
import { YomitanDictionaryStore } from './yomitan';

interface CardActionControllerOptions {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    anki: AnkiConnectClient;
    dictionaries: YomitanDictionaryStore;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    resolveMiningContext: (card: JPDBCard, sentence?: string) => Promise<MiningContext>;
    showCard: (card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: { autoPlay?: boolean; trigger?: 'modal' | 'hover'; navigation?: 'reset' | 'preserve' | 'push-current'; preservePosition?: boolean }) => Promise<void>;
    getActivePopoverAnchor: () => HTMLElement | undefined;
    getActivePopoverMode: () => 'modal' | 'hover' | undefined;
    showSettings: (panel?: string) => void;
    playAudio: (card: JPDBCard) => Promise<void>;
    playSentenceAudio: (sentence?: string) => Promise<void>;
    toast: (message: string) => void;
}

export class CardActionController {
    constructor(private options: CardActionControllerOptions) {}

    async perform(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<boolean> {
        switch (action) {
            case 'study-translate':
            case 'study-grammar':
                await renderStudyToolResult(button, action, sentence);
                return false;
            case 'study-read-sentence':
                await this.options.playSentenceAudio(sentence);
                return false;
            case 'copy-word':
                await copyText(card.spelling);
                this.options.toast(uiText(this.options.getSettings().interfaceLanguage, 'copiedWord'));
                return false;
            case 'audio':
                await this.options.playAudio(card);
                return false;
            case 'setup-dictionaries':
                this.options.showSettings('dictionaries');
                return false;
            case 'setup-jpdb':
                this.options.showSettings('basics');
                return false;
            case 'add':
                await this.addToJpdb(card, sentence);
                return true;
            case 'anki':
                await this.addToAnki(card, sentence);
                return true;
            case 'anki-edit':
                await this.openAnkiNote(button);
                return true;
            case 'neverforget':
                await this.changeJpdbDeckState(card, 'never-forget', this.options.getSettings().neverForgetDeck, 'Add a JPDB API key to change JPDB deck state.');
                return true;
            case 'blacklist':
                await this.changeJpdbDeckState(card, 'blacklisted', this.options.getSettings().blacklistDeck, 'Add a JPDB API key to change JPDB deck state.');
                return true;
            case 'grade':
                await this.gradeCard(button, card);
                return true;
            default:
                return Boolean(action);
        }
    }

    private assertJpdbActionAllowed(card: JPDBCard, message: string): void {
        if (!this.options.getSettings().jpdbMiningEnabled) throw new Error('JPDB mining actions are disabled in settings.');
        if (!this.options.isJpdbBackedCard(card)) throw new Error(message);
    }

    private async addToJpdb(card: JPDBCard, sentence?: string): Promise<void> {
        const settings = this.options.getSettings();
        this.assertJpdbActionAllowed(card, 'Add a JPDB API key to add cards to JPDB, or use Add to Anki.');
        await this.options.jpdb.addToDeck(settings.miningDeck || 'forq', card, sentence);
        if (settings.addToForq && settings.miningDeck !== 'forq') await this.options.jpdb.addToDeck('forq', card, sentence);
        if (settings.ankiEnabled && settings.ankiMineWithJpdb) await this.addToAnki(card, sentence);
        this.options.toast(`${uiText(settings.interfaceLanguage, 'add')} JPDB.`);
    }

    private async openAnkiNote(button: HTMLButtonElement): Promise<void> {
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw new Error('Anki note not found.');
        await this.options.anki.browseNote(noteId);
        this.options.toast('Opened in Anki.');
    }

    private async changeJpdbDeckState(card: JPDBCard, state: 'never-forget' | 'blacklisted', deck: string, message: string): Promise<void> {
        this.assertJpdbActionAllowed(card, message);
        await this.toggleDeck(card, state, deck);
    }

    private async gradeCard(button: HTMLButtonElement, card: JPDBCard): Promise<void> {
        const grade = button.dataset.grade as JPDBGrade;
        const ankiCardId = Number(button.dataset.ankiCardId);
        if (Number.isFinite(ankiCardId) && ankiCardId > 0) {
            await this.options.anki.answerCard(ankiCardId, grade);
            return;
        }
        this.assertJpdbActionAllowed(card, 'Add a JPDB API key to review JPDB cards.');
        await this.options.jpdb.reviewCard(card, grade);
    }

    private async addToAnki(card: JPDBCard, sentence?: string): Promise<void> {
        const existing: AnkiLookupResult = await this.options.anki.findExistingCards(card);
        if (existing.primary) {
            this.options.toast('Already in Anki. Use Edit in Anki instead.');
            await this.options.showCard(card, sentence, this.options.getActivePopoverAnchor(), {
                autoPlay: false,
                trigger: this.options.getActivePopoverMode() === 'hover' ? 'hover' : 'modal',
                navigation: 'preserve',
                preservePosition: true,
            });
            return;
        }

        const settings = this.options.getSettings();
        const [localEntries, kanjiEntries, metaEntries] = await Promise.all([
            settings.localDictionariesEnabled
                ? this.options.dictionaries.lookup(card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            settings.localDictionariesEnabled && settings.localDictionaryShowKanji
                ? this.options.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            settings.localDictionariesEnabled
                ? this.options.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
        ]);
        const context = await this.options.resolveMiningContext(card, sentence);
        await this.options.anki.addCard(card, context.sentence || sentence, {
            imageDataUrl: context.imageDataUrl,
            localEntries,
            kanjiEntries,
            metaEntries,
            dictionaryPreferences: settings.dictionaryPreferences,
            sourceTitle: context.sourceTitle || document.title,
            sourceUrl: context.sourceUrl || location.href,
        });
        this.options.toast(context.imageDataUrl ? 'Sent to Anki with context image.' : 'Sent to Anki.');
    }

    private async toggleDeck(card: JPDBCard, state: 'never-forget' | 'blacklisted', deck: string): Promise<void> {
        if (normalizeCardStates(card.cardState).includes(state)) {
            await this.options.jpdb.removeFromDeck(deck, card);
            this.options.toast('Removed from deck.');
        } else {
            await this.options.jpdb.addToDeck(deck, card);
            this.options.toast('Added to deck.');
        }
    }
}
