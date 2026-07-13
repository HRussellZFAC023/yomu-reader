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

    it('pins the scene and veil to the dynamic viewport instead of content height', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');
        expect(styles).toMatch(/\.academy-screen\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/s);
        expect(styles).toMatch(/\.academy-screen-veil\s*\{[^}]*min-height:\s*inherit;/s);
    });

    it('opens an accessible one-time support letter and returns focus on close', async () => {
        const checkout = { start: vi.fn(async () => {}) };
        const screen = renderAccessScreen({ language: 'en', onSubmit: vi.fn(), checkout });
        document.body.append(screen);
        const trigger = screen.querySelector<HTMLButtonElement>('.academy-get-code')!;
        trigger.focus();
        trigger.click();
        const dialog = screen.querySelector<HTMLDialogElement>('.academy-donation-dialog')!;

        expect(dialog.open).toBe(true);
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('academy-donation-title');
        expect(screen.querySelector<HTMLElement>('.academy-screen-veil')?.inert).toBe(true);
        dialog.querySelector<HTMLFormElement>('.academy-donation-form')
            ?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(checkout.start).toHaveBeenCalledWith(10);

        dialog.querySelector<HTMLButtonElement>('.academy-donation-close')?.click();
        expect(dialog.open).toBe(false);
        expect(screen.querySelector<HTMLElement>('.academy-screen-veil')?.inert).toBe(false);
        expect(document.activeElement).toBe(trigger);
    });

    it('restores inert background state when an open support letter is disposed', () => {
        const screen = renderAccessScreen({ language: 'en', onSubmit: vi.fn(), checkout: { start: vi.fn() } });
        document.body.append(screen);
        screen.querySelector<HTMLButtonElement>('.academy-get-code')?.click();
        const veil = screen.querySelector<HTMLElement>('.academy-screen-veil')!;
        expect(veil.inert).toBe(true);

        screen.dispatchEvent(new CustomEvent('academy:dispose'));

        expect(veil.inert).toBe(false);
        expect(veil.hasAttribute('aria-hidden')).toBe(false);
    });

    it('keeps persistent branding and network status out of the scene chrome', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const onSettings = vi.fn();
        const onClassBoard = vi.fn();
        const onChooseLesson = vi.fn();
        const onEndForToday = vi.fn();
        const shell = createAcademyShell(host, {
            language: 'en',
            onLanguage: vi.fn(),
            onMute: vi.fn(),
            onNavigate: vi.fn(),
            onSettings,
            onClassBoard,
            onChooseLesson,
            onEndForToday,
        });

        expect(host.querySelector('.academy-brand')).toBeNull();
        expect(host.querySelector('.academy-network-state')).toBeNull();
        expect(host.querySelector('.academy-utility-toggle')?.getAttribute('aria-label')).toBe('Menu');
        const learnerActions = host.querySelector<HTMLElement>('.academy-learner-actions')!;
        expect(learnerActions.hidden).toBe(true);
        shell.setLearnerActionsVisible(true);
        expect(learnerActions.hidden).toBe(false);
        host.querySelector<HTMLButtonElement>('.academy-choose-lesson-button')?.click();
        host.querySelector<HTMLButtonElement>('.academy-end-today-button')?.click();
        expect(onChooseLesson).toHaveBeenCalledOnce();
        expect(onEndForToday).toHaveBeenCalledOnce();
        shell.setNavigation(true, 'campus');
        expect(host.querySelector('.academy-header-actions > .academy-navigation')).not.toBeNull();
        expect(host.querySelector<HTMLButtonElement>('.academy-achievements-button')?.disabled).toBe(true);
        expect(host.querySelector('.academy-achievements-button')?.textContent).toContain('Achievements');
        const classBoard = host.querySelector<HTMLButtonElement>('.academy-class-board-button')!;
        expect(classBoard.dataset.access).toBe('account-required');
        expect(classBoard.textContent).toBe('Class board · account');
        classBoard.click();
        expect(onClassBoard).toHaveBeenCalledWith('account-required');
        shell.setClassBoardAccess('available');
        expect(classBoard.textContent).toBe('Class board');
        host.querySelector<HTMLButtonElement>('.academy-settings-button')?.click();
        expect(onSettings).toHaveBeenCalledOnce();
        const shellStyles = fs.readFileSync(path.resolve('src/academy/styles/shell.css'), 'utf8');
        expect(shellStyles).toMatch(/\.academy-chrome-button\s*\{[^}]*width:\s*100%[^}]*border-radius:\s*5px 10px 6px 8px[^}]*text-align:\s*left/s);
        expect(shellStyles).toMatch(/\.academy-nav-button\s*\{[^}]*width:\s*100%[^}]*border-radius:\s*5px 10px 6px 8px[^}]*text-align:\s*left/s);
        shell.setLanguage('ja');
        expect(host.querySelector('.academy-choose-lesson-button')?.textContent).toBe('レッスンを選ぶ');
        expect(host.querySelector('.academy-end-today-button')?.textContent).toBe('今日はここまで');
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
        });
        const audio = host.querySelector<HTMLButtonElement>('.academy-chrome-button');
        expect(audio?.dataset.jpdbReaderSurfaceIgnore).toBe('');

        shell.setLanguage('ja');

        expect(document.documentElement.lang).toBe('ja');
        expect(audio?.lang).toBe('ja');
        expect(audio?.dataset.jpdbReaderSurfaceIgnore).toBeUndefined();
        expect(audio?.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(audio?.dataset.yomuFuriganaMode).toBe('all');
        shell.dispose();
    });

    it('keeps concise accessible names when visible Japanese receives ruby and pitch markup', () => {
        const screen = renderProfileScreen({ language: 'ja', onSubmit: vi.fn() });
        const submit = screen.querySelector<HTMLButtonElement>('.academy-profile-actions button')!;
        const name = screen.querySelector<HTMLInputElement>('input[name="displayName"]')!;
        const reason = screen.querySelector<HTMLTextAreaElement>('textarea[name="learningReason"]')!;
        const portraits = screen.querySelector<HTMLFieldSetElement>('.academy-portrait-fieldset')!;
        const firstPortrait = portraits.querySelector<HTMLInputElement>('input[type="radio"]')!;
        const firstImage = portraits.querySelector<HTMLImageElement>('img')!;

        expect(submit.getAttribute('aria-label')).toBe('りえ先生に伝える');
        submit.innerHTML = '<span class="jpdb-reader-word">りえ<ruby>先生<rt>せんせい</rt></ruby>に伝える</span>';
        expect(submit.getAttribute('aria-label')).toBe('りえ先生に伝える');
        expect(name.getAttribute('aria-label')).toBe('りえ先生になんと呼んでほしいですか。');
        expect(reason.getAttribute('aria-label')).toBe('なぜ日本語を勉強していますか。');
        expect(portraits.getAttribute('aria-label')).toBe('物語の中の姿を選んでください');
        expect(firstPortrait.getAttribute('aria-label')).toBe('カメラと折りたたみ地図を持つ学習者');
        expect(firstImage.alt).toBe('');
    });

    it('keeps the annotated profile form outside Rie’s dedicated cutout at desktop and mobile breakpoints', () => {
        const screen = renderProfileScreen({ language: 'ja', onSubmit: vi.fn() });
        const panel = screen.querySelector('.academy-profile-screen .academy-panel') ?? screen.querySelector('.academy-panel');
        expect(panel?.querySelector(':scope > .academy-character-cutout')).not.toBeNull();
        expect(panel?.querySelector(':scope > .academy-panel-content')).not.toBeNull();
        const styles = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');
        expect(styles).toMatch(/\.academy-profile-screen \.academy-panel\s*\{[^}]*grid-template-columns:\s*minmax\(250px, 34%\) minmax\(0, 1fr\)/s);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-profile-screen \.academy-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(styles).toMatch(/\.academy-profile-screen \.academy-character-cutout\s*\{[^}]*overflow:\s*hidden/s);
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
        expect(screen.querySelector('[data-fork="sound"]')?.textContent).toContain('LL教室');
        expect(screen.querySelector('[data-fork="text"]')?.textContent).toContain('図書館');
        expect(screen.querySelector('[data-fork="speaking"]')?.textContent).toContain('教室前');
        expect(japanese.querySelector('[data-fork="sound"]')?.textContent).toContain('LL教室');
        expect(japanese.querySelector('[data-fork="text"]')?.textContent).toContain('図書館');
        expect(japanese.querySelector('[data-fork="speaking"]')?.textContent).toContain('教室前');
    });

    it('keeps campus geography fixed and animates the chosen route before entry', () => {
        vi.useFakeTimers();
        const onEnter = vi.fn();
        const screen = renderCampusScreen('en', true, onEnter);
        document.body.append(screen);
        const library = screen.querySelector<HTMLButtonElement>('[data-location="library"]');
        expect(screen.querySelectorAll('.academy-route-network path')).toHaveLength(4);
        expect(screen.querySelector('.academy-map-entrance')?.textContent).toBe('入口');

        library?.focus();
        expect(screen.querySelector('.academy-minimap-destination')?.textContent).toBe('図書館');
        library?.click();
        expect(screen.dataset.traveling).toBe('library');
        expect(onEnter).not.toHaveBeenCalled();
        vi.advanceTimersByTime(360);
        expect(onEnter).toHaveBeenCalledWith('library');
    });

    it('foregrounds the chosen learning mode without hiding the rest of campus', () => {
        const speaking = renderCampusScreen('en', false, vi.fn(), 'speaking');
        expect(speaking.querySelector('.academy-objective')).toBeNull();
        expect(speaking.querySelector('[data-recommended="true"]')).toBeNull();
        expect(speaking.querySelector('[data-location="cafe"]')?.textContent).toContain('カフェ');
        expect(speaking.querySelector<HTMLButtonElement>('[data-location="cafe"]')?.disabled).toBe(false);
        expect(speaking.querySelector<HTMLButtonElement>('[data-location="lab"]')?.disabled).toBe(true);
        expect(speaking.querySelectorAll('.academy-location')).toHaveLength(4);
    });

    it('lets Rie break the journal paper edge without changing the other profiles', () => {
        const screen = renderJournalScreen(
            'en',
            { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            { rieChapters: [1], aakashChapters: [], aakashUnlocked: false },
            { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
        );
        const rie = screen.querySelector<HTMLImageElement>('[data-character="rie"]')!;
        const rieProfile = rie.closest('.academy-journal-profile');

        expect(rieProfile?.classList.contains('academy-journal-rie')).toBe(true);
        expect(screen.querySelector('.academy-player-profile.academy-journal-rie')).toBeNull();

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        expect(styles).toMatch(/\.academy-journal-rie\s*\{[^}]*overflow:\s*visible/s);
        expect(styles).toMatch(/\.academy-journal-rie\s*\{[^}]*grid-template-columns:\s*minmax\(230px, 39%\)[^}]*margin-block:\s*76px 16px/s);
        expect(styles).toMatch(/\.academy-journal-rie \.academy-journal-portrait\s*\{[^}]*width:\s*clamp\(300px, 32vw, 350px\)[^}]*margin:\s*-82px 0 -28px -42px/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-rie \.academy-journal-portrait\s*\{[^}]*position:\s*absolute[^}]*top:\s*-82px[^}]*width:\s*clamp\(174px, 48vw, 196px\)/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-rie \.academy-journal-copy h2\s*\{[^}]*min-height:\s*174px/s);
    });

    it('uses the Aakash sprite as a release-blocked journal cutout in both languages', () => {
        for (const language of ['en', 'ja'] as const) {
            const screen = renderJournalScreen(
                language,
                { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
                { rieChapters: [1], aakashChapters: [1], aakashUnlocked: true },
                { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
            );
            const profile = screen.querySelector<HTMLElement>('.academy-journal-aakash')!;
            const portrait = profile.querySelector<HTMLImageElement>('[data-character="aakash"]')!;

            expect(portrait.src).toContain('/academy/art/characters/aakash/aakash__neutral__halfbody__v001.png');
            expect(portrait.alt).toBe('Aakash');
            expect(portrait.classList.contains('academy-journal-event-portrait')).toBe(false);
            expect(profile.querySelector('h2')?.textContent).toBe('Aakash');
        }

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        expect(styles).toMatch(/\.academy-journal-aakash\s*\{[^}]*overflow:\s*visible/s);
        expect(styles).toMatch(/\.academy-journal-aakash \.academy-journal-aakash-portrait\s*\{[^}]*height:\s*clamp\(330px, 42vw, 390px\)[^}]*margin:\s*-62px auto -20px -8px/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-aakash \.academy-journal-aakash-portrait\s*\{[^}]*position:\s*absolute[^}]*top:\s*-62px/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-aakash \.academy-journal-copy h2\s*\{[^}]*min-height:\s*146px/s);
    });

    it('recomposes every journal heading and profile inside the phone paper width', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-screen \.academy-title\s*\{[^}]*max-width:\s*100%[^}]*font-size:\s*clamp\(1\.5rem, 7\.5vw, 2rem\)[^}]*overflow-wrap:\s*anywhere[^}]*padding-left:\s*clamp\(38px, 11vw, 46px\)/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-player-profile\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*overflow:\s*visible/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-player-profile \.academy-journal-copy\s*\{[^}]*width:\s*100%/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-rie \.academy-journal-copy h2,[\s\S]*\.academy-journal-aakash \.academy-journal-copy h2\s*\{[^}]*box-sizing:\s*border-box[^}]*max-width:\s*100%[^}]*overflow-wrap:\s*anywhere/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-rie \.academy-journal-copy > \.academy-button,[\s\S]*\.academy-journal-aakash \.academy-journal-copy > \.academy-button\s*\{[^}]*width:\s*100%[^}]*white-space:\s*normal/s);
    });

    it('binds the Academy shell to the real logo and よむ palette metadata', () => {
        const index = fs.readFileSync(path.resolve('public/academy/index.html'), 'utf8');
        const manifest = JSON.parse(fs.readFileSync(path.resolve('public/academy/manifest.webmanifest'), 'utf8')) as {
            theme_color: string;
            icons: Array<{ src: string }>;
        };
        expect(index).toContain('href="/yomu-icon.svg"');
        expect(manifest.theme_color).toBe('#181b18');
        expect(manifest.icons.some(icon => icon.src === '/yomu-icon.svg')).toBe(true);
    });
});
