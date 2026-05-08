import { APP_NAME } from './constants';
import { saveSettings } from './settings';
import type { ReaderSettings } from './types';

interface OnboardingOptions {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    showSettings: () => void;
}

export class OnboardingController {
    private panel?: HTMLElement;
    private backdrop?: HTMLElement;

    constructor(private readonly options: OnboardingOptions) {}

    async showIfNeeded(): Promise<boolean> {
        if (this.options.getSettings().onboardingSeen) return false;
        this.show();
        return true;
    }

    private show(): void {
        this.close();
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'jpdb-reader-backdrop jpdb-reader-onboarding-backdrop';
        this.backdrop.dataset.jpdbReaderRoot = 'true';

        this.panel = document.createElement('section');
        this.panel.className = 'jpdb-reader-onboarding';
        this.panel.dataset.jpdbReaderRoot = 'true';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-label', `${APP_NAME} welcome`);
        this.panel.tabIndex = -1;

        const eyebrow = element('div', 'jpdb-reader-onboarding-eyebrow', 'Japanese, wherever it appears');
        const title = element('h2', '', APP_NAME);
        const copy = element(
            'p',
            '',
            'Turn Japanese text, subtitles, and image text into tappable dictionary cards. Mine useful words, play audio, and keep the page readable while you study.',
        );
        const featureGrid = document.createElement('div');
        featureGrid.className = 'jpdb-reader-onboarding-grid';
        [
            ['Text', 'Hover or tap Japanese words once a page is scanned.'],
            ['Images', 'Readable image text can be detected quietly near the viewport.'],
            ['Video', 'Subtitle words become tappable when subtitles are available.'],
            ['Control', 'Open Settings any time to turn features off, change shortcuts, or tune the accent color.'],
        ].forEach(([heading, text]) => {
            const card = document.createElement('div');
            card.append(element('strong', '', heading), element('span', '', text));
            featureGrid.append(card);
        });

        const actions = document.createElement('div');
        actions.className = 'jpdb-reader-onboarding-actions';
        const setup = button('Add API key');
        setup.className = 'jpdb-reader-btn add';
        setup.addEventListener('click', () => void this.complete(true));
        const browse = button('Use defaults');
        browse.className = 'jpdb-reader-btn';
        browse.addEventListener('click', () => void this.complete(false));
        actions.append(setup, browse);

        const note = element('p', 'jpdb-reader-onboarding-note', 'YouTube immersion filtering is included, but starts off. Enable it only when you want a stricter Japanese-only YouTube session.');
        this.panel.append(eyebrow, title, copy, featureGrid, actions, note);
        document.body.append(this.backdrop, this.panel);
        this.panel.focus();
    }

    private async complete(openSettings: boolean): Promise<void> {
        const settings = { ...this.options.getSettings(), onboardingSeen: true };
        this.options.setSettings(settings);
        await saveSettings(settings);
        this.close();
        if (openSettings) this.options.showSettings();
    }

    private close(): void {
        this.panel?.remove();
        this.backdrop?.remove();
        this.panel = undefined;
        this.backdrop = undefined;
    }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
}

function button(text: string): HTMLButtonElement {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    return node;
}
