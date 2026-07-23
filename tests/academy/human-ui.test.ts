import fs from 'node:fs';
import path from 'node:path';
import { academyText } from '../../src/reader/app/academy-copy';
import { renderAccessScreen } from '../../src/academy/ui/access-screen';
import { renderLessonFork } from '../../src/academy/ui/lesson-screen';
import { renderLoadingScreen } from '../../src/academy/ui/loading-screen';
import { renderProfileScreen } from '../../src/academy/ui/profile-screen';
import { createAcademyShell } from '../../src/academy/ui/shell';
import { renderCampusScreen, renderJournalScreen } from '../../src/academy/ui/world-screen';

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Academy human interface', () => {
    it('opens with one concise invitation and no system-status prose', () => {
        const screen = renderAccessScreen({ language: 'en', onSubmit: vi.fn() });

        expect(screen.querySelector('.academy-eyebrow')).toBeNull();
        expect(screen.querySelector('.academy-title')?.textContent).toBe('よむ Academy');
        expect(screen.querySelector('.academy-lede')?.textContent).toBe('A playable Japanese course from first kana to N1.');
        expect(screen.querySelector('.academy-access-form')).toHaveProperty('hidden', false);
        expect(screen.querySelectorAll('.academy-access-actions button')).toHaveLength(2);
        expect(screen.textContent).not.toContain('learning record');
        expect(screen.textContent).not.toContain('Online');
        expect(academyText('en', 'accessUnavailable')).toBe('Couldn’t check that code. Try again.');
    });

    it('opens the canonical support checkout in an isolated new tab', () => {
        const supportDonation = { open: vi.fn() };
        const screen = renderAccessScreen({ language: 'en', onSubmit: vi.fn(), supportDonation });
        document.body.append(screen);
        screen.querySelector<HTMLButtonElement>('.academy-get-code')?.click();

        expect(supportDonation.open).toHaveBeenCalledTimes(1);
        expect(screen.querySelector('.academy-donation-dialog')).toBeNull();
        expect(screen.querySelector<HTMLInputElement>('input[name="code"]')).not.toBeNull();
    });

    it('keeps the overflow menu to global preferences rather than regular workflows', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const onPresentationMode = vi.fn();
        const onNavigate = vi.fn();
        const onLanguage = vi.fn();
        const onMute = vi.fn();
        const shell = createAcademyShell(host, {
            language: 'en',
            onLanguage,
            onMute,
            onNavigate,
            onPresentationMode,
        });

        expect(host.querySelector('.academy-brand')).toBeNull();
        expect(host.querySelector('.academy-network-state')).toBeNull();
        const offlineNotice = host.querySelector<HTMLElement>('.academy-offline-notice')!;
        expect(offlineNotice.hidden).toBe(true);
        shell.setConnectivity?.(false);
        expect(offlineNotice.hidden).toBe(false);
        expect(offlineNotice.textContent).toContain('Keep learning here.');
        shell.setConnectivity?.(true);
        expect(offlineNotice.hidden).toBe(true);
        const utilityToggle = host.querySelector<HTMLElement>('.academy-utility-toggle')!;
        expect(utilityToggle.getAttribute('aria-label')).toBe('Menu');
        expect(utilityToggle.title).toBe('Menu');
        expect(utilityToggle.dataset.tooltip).toBe('Menu');
        shell.setLearnerActionsVisible(true);
        shell.setNavigation(true, 'campus');
        expect(host.querySelector('.academy-header-actions > .academy-navigation')).toBeNull();
        expect(host.querySelector('.academy-learner-actions')).toBeNull();
        expect(host.querySelector('.academy-class-path-button')).toBeNull();
        expect(host.querySelector('.academy-end-today-button')).toBeNull();
        expect(host.querySelector('.academy-class-board-button')).toBeNull();
        expect(host.querySelector('.academy-chrome-button[data-route]')).toBeNull();
        expect(onNavigate).not.toHaveBeenCalled();
        expect(host.querySelector('.academy-achievements-button')).toBeNull();
        expect(host.querySelector('.academy-choose-lesson-button')).toBeNull();
        expect('setNetwork' in shell).toBe(false);
        const menuOrder = [...host.querySelectorAll<HTMLButtonElement>('.academy-header-actions button')]
            .map(button => button.className);
        expect(menuOrder).toEqual([
            'academy-chrome-button academy-presentation-button',
            'academy-chrome-button academy-language-button',
            'academy-chrome-button academy-mute-button',
        ]);
        const linkOrder = [...host.querySelectorAll<HTMLAnchorElement>('.academy-header-actions a')]
            .map(link => [link.textContent, link.getAttribute('href'), link.target] as const);
        expect(linkOrder).toEqual([
            ['Yomu home', 'https://yomureader.com/', ''],
            ['Study', 'https://yomureader.com/study/', ''],
            ['Support', 'https://yomureader.com/support', ''],
            ['Discord', 'https://discord.gg/jD6NPURewD', '_blank'],
            ['GitHub', 'https://github.com/HRussellZFAC023/yomu-reader', '_blank'],
        ]);
        expect(host.querySelectorAll('.academy-header-actions .academy-utility-divider')).toHaveLength(1);
        const languageButton = host.querySelector<HTMLButtonElement>('.academy-language-button')!;
        expect(languageButton.textContent).toBe('日本語');
        expect(languageButton.lang).toBe('ja');
        languageButton.click();
        expect(onLanguage).toHaveBeenCalledTimes(1);
        const muteButton = host.querySelector<HTMLButtonElement>('.academy-mute-button')!;
        expect(muteButton.textContent).toBe('Sound on');
        expect(muteButton.getAttribute('aria-pressed')).toBe('false');
        muteButton.click();
        expect(onMute).toHaveBeenCalledTimes(1);
        shell.setMuted(true);
        expect(muteButton.textContent).toBe('Sound off');
        expect(muteButton.getAttribute('aria-pressed')).toBe('true');
        const presentation = host.querySelector<HTMLButtonElement>('.academy-presentation-button')!;
        // Destination-named: in story mode the control names the course view it opens.
        expect(presentation.textContent).toBe('Course view');
        expect(presentation.getAttribute('aria-pressed')).toBeNull();
        expect(presentation.getAttribute('aria-label')).toBe('Switch to course view');
        expect(host.querySelector('.academy-root')?.getAttribute('data-presentation-mode')).toBe('story');
        presentation.click();
        expect(onPresentationMode).toHaveBeenCalledWith('course');
        shell.setPresentationMode('course');
        expect(presentation.textContent).toBe('Story view');
        expect(presentation.getAttribute('aria-label')).toBe('Switch to story view');
        expect(host.querySelector('.academy-root')?.getAttribute('data-presentation-mode')).toBe('course');
        shell.setClassBoardAccess('available');
        expect(host.querySelector('.academy-settings-button')).toBeNull();
        const shellStyles = fs.readFileSync(path.resolve('src/academy/styles/shell.css'), 'utf8');
        expect(shellStyles).toMatch(/\.academy-chrome-button\s*\{[^}]*width:\s*100%[^}]*border-radius:\s*5px 10px 6px 8px[^}]*text-align:\s*left/s);
        shell.setLanguage('ja');
        expect(host.querySelector('.academy-presentation-button')?.textContent).toBe('物語ビュー');
        expect(utilityToggle.getAttribute('aria-label')).toBe('メニュー');
        expect(utilityToggle.title).toBe('メニュー');
        expect(utilityToggle.dataset.tooltip).toBe('メニュー');
        const utility = host.querySelector<HTMLDetailsElement>('.academy-utility')!;
        utility.open = true;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(utility.open).toBe(false);
        expect(host.textContent).not.toContain('Online');
        shell.dispose();
    });

    it('turns persistent controls into Japanese annotation roots after a language change', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const shell = createAcademyShell(host, {
            language: 'en',
            onLanguage: vi.fn(),
            onMute: vi.fn(),
            onNavigate: vi.fn(),
            onPresentationMode: vi.fn(),
        });
        const presentation = host.querySelector<HTMLButtonElement>('.academy-presentation-button');
        expect(host.querySelector<HTMLButtonElement>('.academy-class-board-button')).toBeNull();
        expect(presentation?.dataset.jpdbReaderSurfaceIgnore).toBe('');

        shell.setLanguage('ja');

        expect(document.documentElement.lang).toBe('ja');
        expect(presentation?.lang).toBe('ja');
        expect(presentation?.dataset.jpdbReaderSurfaceIgnore).toBeUndefined();
        expect(presentation?.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(presentation?.dataset.yomuFuriganaMode).toBe('all');
        shell.dispose();
    });

    it('starts each replacement screen at its own top-left origin', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const shell = createAcademyShell(host, {
            language: 'en',
            onLanguage: vi.fn(),
            onMute: vi.fn(),
            onNavigate: vi.fn(),
            onPresentationMode: vi.fn(),
        });
        const screenHost = host.querySelector<HTMLElement>('.academy-screen-host')!;
        shell.replace(document.createElement('section'));
        screenHost.scrollTop = 180;
        screenHost.scrollLeft = 24;
        document.documentElement.scrollTop = 96;
        document.documentElement.scrollLeft = 12;

        const next = document.createElement('section');
        shell.replace(next);

        expect(screenHost.scrollTop).toBe(0);
        expect(screenHost.scrollLeft).toBe(0);
        expect(document.documentElement.scrollTop).toBe(0);
        expect(document.documentElement.scrollLeft).toBe(0);
        expect(screenHost.firstElementChild).toBe(next);
        shell.dispose();
    });

    it('keeps concise accessible names when visible Japanese receives ruby and pitch markup', () => {
        const screen = renderProfileScreen({ language: 'ja', onSubmit: vi.fn() });
        const name = screen.querySelector<HTMLInputElement>('input[name="displayName"]')!;
        expect(name.getAttribute('aria-label')).toBe('りえ先生には、なんと呼んでほしいですか。');
        name.value = 'ミナ';
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();
        const reason = screen.querySelector<HTMLTextAreaElement>('textarea[name="learningReason"]')!;
        expect(name.getAttribute('aria-label')).toBe('りえ先生には、なんと呼んでほしいですか。');
        expect(reason.getAttribute('aria-label')).toBe('なぜ日本語を勉強していますか。');
        reason.value = '小説を読むため';
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();
        expect(screen.dataset.profileStep).toBe('portrait');
        const submit = screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!;
        const portraits = screen.querySelector<HTMLFieldSetElement>('.academy-portrait-fieldset')!;
        const firstPortrait = portraits.querySelector<HTMLInputElement>('input[type="radio"]')!;
        const firstImage = portraits.querySelector<HTMLImageElement>('img')!;

        expect(submit.getAttribute('aria-label')).toBe('りえ先生に伝える');
        submit.innerHTML = '<span class="jpdb-reader-word">りえ<ruby>先生<rt>せんせい</rt></ruby>に伝える</span>';
        expect(submit.getAttribute('aria-label')).toBe('りえ先生に伝える');
        expect(portraits.getAttribute('aria-label')).toBe('物語の中の姿を選んでください');
        expect(firstPortrait.getAttribute('aria-label')).toBe('カメラと地図');
        expect(firstPortrait.closest('label')?.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(portraits.querySelector('.academy-portrait-caption')).toBeNull();
        expect(portraits.textContent).not.toContain('カメラと地図');
        expect(firstImage.alt).toBe('');
    });

    it('gives phone portrait selection a full paper page above a separate action strip', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/vn-stage.css'), 'utf8');
        const screenStyles = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');
        const phone = styles.slice(styles.indexOf('@media (max-width: 700px)'));
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-object-slot\s*\{[^}]*inset:\s*max\(64px[^}]*96px/s);
        expect(styles).toMatch(/\.academy-profile-vn-entry \.academy-portrait-option\s*\{[^}]*overflow:\s*visible/s);
        expect(screenStyles).toMatch(/\.academy-profile-screen \.academy-portrait-option\s*\{[^}]*background:\s*transparent/s);
        expect(screenStyles).not.toMatch(/\.academy-profile-screen \.academy-portrait-image\s*\{[^}]*height:\s*112px/s);
        expect(styles).toMatch(/\.academy-profile-vn-entry \.academy-portrait-option::before\s*\{[^}]*height:\s*62%[^}]*clip-path:/s);
        expect(styles).toMatch(/\.academy-profile-vn-entry \.academy-portrait-image\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center bottom/s);
        expect(phone).toMatch(/@media \(max-width: 420px\)[\s\S]*data-profile-step='portrait'\] \.academy-portrait-option\s*\{[^}]*min-height:\s*clamp\(150px, 24dvh, 190px\)/s);
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-dialogue\s*\{[^}]*height:\s*72px/s);
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-line-body\s*\{[^}]*display:\s*none/s);
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-dialogue-header\s*\{[^}]*position:\s*fixed;[^}]*top:\s*max\(8px[^}]*right:\s*max\(8px[^}]*display:\s*block/s);
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-dialogue-header \.academy-vn-reading-toggle,[\s\S]*\.academy-vn-translation-toggle\s*\{[^}]*display:\s*none/s);
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-navigation\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
        expect(phone).toMatch(/data-profile-step='portrait'\] \.academy-vn-back\s*\{[^}]*grid-row:\s*1/s);
        expect(phone).toMatch(/html:has\(\.academy-profile-screen\) \.jpdb-reader-fab\s*\{[^}]*top:\s*max\(8px[^}]*bottom:\s*auto/s);
    });

    it('keeps Academy form controls at the stable iOS editing size on phones', () => {
        const shellStyles = fs.readFileSync(path.resolve('src/academy/styles/shell.css'), 'utf8');
        expect(shellStyles).toMatch(
            /@media \(max-width: 700px\)\s*\{\s*\.academy-root :is\(input, textarea, select\)\s*\{[^}]*font-size:\s*16px !important/s,
        );
    });

    it('keeps profile prompts inside the dialogue and exposes portrait focus', () => {
        const screen = renderProfileScreen({ language: 'en', onSubmit: vi.fn() });
        const vnStyles = fs.readFileSync(path.resolve('src/academy/styles/vn-stage.css'), 'utf8');
        const screenStyles = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');
        const name = screen.querySelector<HTMLInputElement>('input[name="displayName"]')!;

        expect(name.closest('.academy-profile-inline-action')?.closest('.academy-vn-action-slot')).not.toBeNull();
        expect(screen.querySelector('.academy-vn-object-slot')?.getAttribute('data-empty')).toBe('true');
        name.value = 'Mina';
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();
        const reason = screen.querySelector<HTMLTextAreaElement>('textarea[name="learningReason"]')!;
        expect(reason.closest('.academy-profile-inline-action')?.closest('.academy-vn-action-slot')).not.toBeNull();
        expect(screen.querySelector('.academy-vn-object-slot')?.getAttribute('data-empty')).toBe('true');
        expect(vnStyles).toMatch(/\.academy-portrait-option:has\(input:focus-visible\)\s*\{[^}]*outline:\s*3px solid[^}]*outline-offset:\s*3px/s);
        expect(screenStyles).toMatch(/\.academy-start-screen \.academy-title,[\s\S]*font-size:\s*clamp\(3rem, 4\.2vw, 3\.6rem\)/s);
        expect(screenStyles).toMatch(/\.academy-start-screen \.academy-route-choice:hover,[\s\S]*color:\s*#18231d;[\s\S]*\.academy-route-choice:focus-visible \.academy-route-description\s*\{[^}]*color:\s*#18231d/s);
    });

    it('renders setup as a full-bleed Rie conversation and waits for portrait consent before showing the learner', () => {
        const screen = renderProfileScreen({ language: 'ja', onSubmit: vi.fn() });
        const styles = fs.readFileSync(path.resolve('src/academy/styles/vn-stage.css'), 'utf8');
        const name = screen.querySelector<HTMLInputElement>('input[name="displayName"]')!;
        expect(screen.classList.contains('academy-vn-stage')).toBe(true);
        expect(screen.querySelector('form')).toBeNull();
        expect(screen.querySelector('[data-character="rie"]')).not.toBeNull();
        expect(screen.querySelector('[data-character="learner"]')).toBeNull();
        expect(screen.querySelector('.academy-vn-log-button')).not.toBeNull();
        expect(screen.querySelector('[data-profile-step="name"]')).not.toBeNull();
        name.value = 'ミナ';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        expect(screen.querySelector('[data-character="learner"]')).toBeNull();
        expect(styles).toMatch(/\.academy-profile-screen \.academy-vn-object-slot\s*\{[^}]*pointer-events:\s*auto;/s);
        expect(styles).toMatch(/\.academy-profile-vn-entry \.academy-portrait-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();
        expect(screen.querySelector('[data-character="learner"]')).toBeNull();
        screen.querySelector<HTMLTextAreaElement>('textarea[name="learningReason"]')!.value = '物語を読むため';
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();
        expect(screen.querySelector('[data-character="learner"]')?.getAttribute('data-display-name')).toBe('ミナ');
        const player = screen.querySelector<HTMLImageElement>('[data-character="learner"] img')!;
        const planner = screen.querySelector<HTMLInputElement>('input[value="quality-3"]')!;
        planner.checked = true;
        planner.dispatchEvent(new Event('change', { bubbles: true }));
        expect(player.src).toContain('quality-3__picker__v001.png');
    });

    it('keeps the complete setup history available from portrait selection and restores Log focus', () => {
        const screen = renderProfileScreen({ language: 'en', onSubmit: vi.fn() });
        document.body.replaceChildren(screen);
        const name = screen.querySelector<HTMLInputElement>('input[name="displayName"]')!;
        name.value = 'Mina';
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();
        const reason = screen.querySelector<HTMLTextAreaElement>('textarea[name="learningReason"]')!;
        reason.value = 'To read novels';
        screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!.click();

        const logButton = screen.querySelector<HTMLButtonElement>('.academy-vn-log-button')!;
        const log = screen.querySelector<HTMLElement>('.academy-vn-log-panel')!;
        expect(logButton.disabled).toBe(false);
        logButton.focus();
        logButton.click();
        expect(log.hidden).toBe(false);
        expect(log.querySelectorAll('.academy-vn-log-entry')).toHaveLength(3);
        expect(log.textContent).toContain('Mina');
        log.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(log.hidden).toBe(true);
        expect(document.activeElement).toBe(logButton);
    });

    it('moves Back through Rie dialogue steps without losing values, then uses route history', () => {
        const onBack = vi.fn();
        const screen = renderProfileScreen({ language: 'en', onSubmit: vi.fn(), onBack });
        document.body.replaceChildren(screen);
        const name = screen.querySelector<HTMLInputElement>('input[name="displayName"]')!;
        const action = (): HTMLButtonElement => screen.querySelector<HTMLButtonElement>('.academy-profile-advance')!;
        const back = (): HTMLButtonElement => screen.querySelector<HTMLButtonElement>('.academy-vn-back')!;

        name.value = 'Mina';
        action().click();
        const reason = screen.querySelector<HTMLTextAreaElement>('textarea[name="learningReason"]')!;
        reason.value = 'To read novels';
        action().click();
        back().click();

        expect(name.value).toBe('Mina');
        expect(reason.value).toBe('To read novels');
        expect(document.activeElement).toBe(reason);
        back().click();
        expect(document.activeElement).toBe(name);
        back().click();
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('does not narrate online state while loading', () => {
        expect(renderLoadingScreen('en', true).textContent).toBe('One moment…');
        expect(renderLoadingScreen('en', false).textContent).toBe('One moment…');
    });

    it('presents Lesson 0 as a decisive three-way choice without an explanatory card', () => {
        const screen = renderLessonFork('en', undefined, vi.fn());
        const japanese = renderLessonFork('ja', undefined, vi.fn());
        expect(screen.querySelector('.academy-lede')).toBeNull();
        expect(screen.querySelectorAll('.academy-fork-choice')).toHaveLength(3);
        expect(screen.querySelectorAll('.academy-fork-marker')).toHaveLength(3);
        expect(screen.querySelectorAll('.academy-fork-outcome')).toHaveLength(3);
        expect(screen.querySelector('[data-fork="sound"]')?.textContent).toContain('語学ラボ');
        expect(screen.querySelector('[data-fork="text"]')?.textContent).toContain('図書館');
        expect(screen.querySelector('[data-fork="speaking"]')?.textContent).toContain('教室前');
        expect(japanese.querySelector('[data-fork="sound"]')?.textContent).toContain('語学ラボ');
        expect(japanese.querySelector('[data-fork="text"]')?.textContent).toContain('図書館');
        expect(japanese.querySelector('[data-fork="speaking"]')?.textContent).toContain('教室前');
    });

    it('uses the courtyard as a current place with route-backed exits', () => {
        const onEnter = vi.fn();
        const screen = renderCampusScreen('en', true, onEnter);
        document.body.append(screen);
        const library = screen.querySelector<HTMLButtonElement>('[data-location="library"]');
        expect(screen.dataset.currentPlace).toBe('courtyard');
        expect(screen.querySelector('.academy-world-title')?.textContent).toBe('中庭');
        expect(screen.querySelector('[data-location="street"]')).not.toBeNull();
        library?.click();
        expect(onEnter).toHaveBeenCalledWith('library');
    });

    it('does not use a generic recommended-mode hub', () => {
        expect(renderCampusScreen('en', false, vi.fn()).querySelector('.academy-objective')).toBeNull();
        const speaking = renderCampusScreen('en', false, vi.fn(), 'speaking');
        expect(speaking.querySelector('.academy-objective')).toBeNull();
        expect(speaking.querySelector('[data-recommended="true"]')).toBeNull();
        expect(speaking.querySelector('[data-location="cafe"]')?.textContent).toContain('カフェ');
        expect(speaking.querySelector<HTMLButtonElement>('[data-location="lab"]')?.disabled).toBe(false);
        expect(speaking.querySelectorAll('.academy-world-exit')).toHaveLength(6);
    });

    it('opens on the character list rather than pre-opened profile cards', () => {
        const screen = renderLockedJournalScreen();
        expect(screen.querySelector('.academy-character-directory')).not.toBeNull();
        expect(screen.querySelector('.academy-character-page')?.hasAttribute('hidden')).toBe(true);
        expect(screen.querySelector('.academy-player-profile')).toBeNull();
        expect(screen.querySelector('.academy-journal-profile')).toBeNull();

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        expect(styles).toMatch(/\.academy-character-directory\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(136px, 1fr\)\)/s);
    });

    it('opens Aakash only after meeting him and returns to the complete directory', () => {
        for (const language of ['en', 'ja'] as const) {
            const screen = renderJournalScreen(
                language,
                { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
                { rieChapters: [1], aakashChapters: [1], aakashUnlocked: true },
                { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
            );
            const directory = screen.querySelector<HTMLElement>('.academy-character-directory')!;
            const open = directory.querySelector<HTMLButtonElement>('[data-character="aakash"] button')!;
            expect(open.disabled).toBe(false);
            open.click();
            const page = screen.querySelector<HTMLElement>('.academy-character-page')!;
            const portrait = page.querySelector<HTMLImageElement>('.academy-journal-portrait')!;

            expect(portrait.src).toContain('/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v009.png');
            expect(portrait.alt).toBe('Aakash-san');
            expect(page.querySelector('h2')?.textContent).toBe('Aakash-san');
            expect(directory.hidden).toBe(true);
            page.querySelector<HTMLButtonElement>('.academy-character-page-back')?.click();
            expect(directory.hidden).toBe(false);
        }
    });

    it('lists the whole cast without term grouping and unlocks pages through meetings', () => {
        const screen = renderLockedJournalScreen();
        const directory = screen.querySelector<HTMLElement>('.academy-character-directory')!;
        const entries = [...directory.querySelectorAll<HTMLElement>('.academy-character-entry')];
        const ids = entries.map(entry => entry.dataset.character);

        expect(ids).toContain('rie');
        expect(ids).toContain('peter');
        expect(ids).toContain('shaun');
        expect(ids).toContain('sophie');
        expect(ids).toContain('xingyu');
        expect(ids).toContain('felix');
        expect(new Set(ids).size).toBe(ids.length);
        expect(directory.textContent).not.toContain('First term');
        expect(directory.querySelector('[data-character="rie"]')?.getAttribute('data-unlocked')).toBe('true');
        expect(directory.querySelector('[data-character="peter"]')?.getAttribute('data-unlocked')).toBe('false');
        expect(directory.querySelector<HTMLButtonElement>('[data-character="peter"] button')?.disabled).toBe(true);
        expect(directory.querySelector('[data-character="shaun"] img')).toBeNull();
        expect(directory.querySelector('[data-character="xingyu"] img')).toBeNull();
        expect(directory.querySelector('[data-character="peter"]')?.textContent).toContain('Meet them to open their page');
    });

    it('keeps the character list and an opened dossier within the phone width', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-screen \.academy-title\s*\{[^}]*max-width:\s*calc\(100% - 48px\)[^}]*margin-left:\s*48px[^}]*font-size:\s*clamp\(1\.5rem, 7\.5vw, 2rem\)/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-character-directory\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-character-dossier\s*\{[^}]*margin-top:\s*34px/s);
    });
});

function renderLockedJournalScreen(): HTMLElement {
    return renderJournalScreen(
        'en',
        { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
        { rieChapters: [1], aakashChapters: [], aakashUnlocked: false },
        { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
    );
}
