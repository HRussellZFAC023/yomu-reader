import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';
import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import { projectCharacterDirectory } from '../../src/academy/domain/progress-projections';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { renderClassPathScreen } from '../../src/academy/ui/class-path-screen';
import { renderJournalScreen } from '../../src/academy/ui/world-screen';

function renderDirectory(aakashUnlocked = false): HTMLElement {
    return renderJournalScreen(
        'en',
        { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
        { rieChapters: [1], aakashChapters: aakashUnlocked ? [1] : [], aakashUnlocked },
        { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
    );
}

describe('Academy character directory presentation', () => {
    it('keeps every non-legend character in one ordered directory', () => {
        const directory = renderDirectory().querySelector<HTMLElement>('.academy-character-directory')!;
        const entries = [...directory.querySelectorAll<HTMLElement>(':scope > .academy-character-entry')];
        const expectedIds = ACADEMY_CAST
            .filter(member => member.category !== 'textbook-legend')
            .map(member => member.id);

        expect(entries.map(entry => entry.dataset.character)).toEqual(expectedIds);
        expect(directory.querySelectorAll(':scope > section, :scope > ul')).toHaveLength(0);
    });

    it('shows an earned learner-owned journal line from canonical evidence', async () => {
        const record = createLearnerRecord();
        await record.record({
            kind: 'journal-line-recorded',
            eventId: 'milestone:lesson-zero-first-repair:journal-line',
            journalLineId: 'journal:lesson-zero:first-classroom-repair',
            characterId: 'rie',
            text: {
                ja: '「もう一度お願いします」と言って、授業を続けられた。',
                en: 'I asked Rie-sensei to repeat it, and class kept moving.',
            },
            activityId: 'activity:lesson-zero-reconstruct-repair',
            sourceQuestionId: 'source-question:classroom-phrase-09',
        });
        const projection = await record.snapshot();
        const screen = renderJournalScreen(
            'en',
            { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            {
                characters: projectCharacterDirectory(projection),
                journalLines: Object.values(projection.journalLines),
            },
            { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
        );

        const line = screen.querySelector<HTMLElement>('[data-journal-line-id="journal:lesson-zero:first-classroom-repair"]')!;
        expect(line.textContent).toBe('I asked Rie-sensei to repeat it, and class kept moving.');
        expect(line.dataset.activityId).toBe('activity:lesson-zero-reconstruct-repair');
    });

    it('keeps identity-safe portraits and unlocks met character pages', () => {
        const screen = renderDirectory(true);
        const directory = screen.querySelector<HTMLElement>('.academy-character-directory')!;
        const aakash = directory.querySelector<HTMLElement>('[data-character="aakash"]')!;
        const xingyu = directory.querySelector<HTMLElement>('[data-character="xingyu"]')!;

        expect(aakash.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
        expect(aakash.querySelector<HTMLImageElement>('img')?.src).toContain('/characters/aakash/');
        expect(aakash.dataset.portraitState).toBe('available');
        expect(xingyu.querySelector('img')).toBeNull();
        expect(xingyu.dataset.portraitState).toBe('locked');
        expect(xingyu.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);

        aakash.querySelector<HTMLButtonElement>('button')?.click();
        expect(screen.querySelector('.academy-character-page')?.hasAttribute('hidden')).toBe(false);
    });

    it('shows Rie’s complete production expression gallery with distinct performances', () => {
        const screen = renderDirectory();
        screen.querySelector<HTMLButtonElement>('[data-character="rie"] button')?.click();
        const sprites = [...screen.querySelectorAll<HTMLImageElement>(
            '.academy-character-sprite-gallery[data-character="rie"] img',
        )];

        expect(sprites.map(sprite => [sprite.dataset.expression, sprite.dataset.angle])).toEqual([
            ['comedic', 'right-three-quarter'],
            ['determined', 'left-three-quarter'],
            ['encouraging-listening', 'right-three-quarter'],
            ['happy', 'front-near-front'],
            ['neutral', 'front-near-front'],
            ['sad-vulnerable', 'left-three-quarter'],
            ['thoughtful', 'left-three-quarter'],
            ['surprised-shocked', 'right-three-quarter'],
        ]);
        expect(new Set(sprites.map(sprite => sprite.src)).size).toBe(sprites.length);
    });

    it('wires Tom 2 review art and Steve approved art into unlocked character pages', async () => {
        const record = createLearnerRecord();
        await record.record({
            kind: 'characters-encountered',
            eventId: 'encounter:asset-upgrade-review',
            encounterId: 'story:asset-upgrade-review',
            sceneId: 'scene:asset-upgrade-review',
            attendeeIds: ['tom2', 'steve'],
        });
        const screen = renderJournalScreen(
            'en',
            { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            { characters: projectCharacterDirectory(await record.snapshot()) },
            { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
        );

        for (const [characterId, expectedCount] of [['tom2', 3], ['steve', 5]] as const) {
            screen.querySelector<HTMLButtonElement>(`[data-character="${characterId}"] button`)?.click();
            const gallery = screen.querySelector<HTMLElement>(`.academy-character-sprite-gallery[data-character="${characterId}"]`)!;
            expect(gallery.querySelectorAll('img')).toHaveLength(expectedCount);
            expect([...gallery.querySelectorAll<HTMLImageElement>('img')]
                .every(image => image.src.includes(`/academy/art/characters/${characterId}/`))).toBe(true);
            screen.querySelector<HTMLButtonElement>('.academy-character-page-back')?.click();
        }
    });

    it('opens Xingyu-san on her portrait-backed page with every grounded revisit path', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            {
                kind: 'characters-encountered',
                eventId: 'encounter:class-week:l1-l03',
                encounterId: 'class-week:l1-l03',
                sceneId: 'scene:class-week:l1-l03',
                attendeeIds: ['xingyu', 'peter', 'felix'],
            },
            {
                kind: 'characters-encountered',
                eventId: 'encounter:story:s1e04-welcome-frequency',
                encounterId: 'story:s1e04-welcome-frequency',
                sceneId: 'scene:story:s1e04-welcome-frequency',
                attendeeIds: ['xingyu'],
            },
        ]);
        const characters = projectCharacterDirectory(await record.snapshot());
        const xingyu = characters.find(character => character.characterId === 'xingyu')!;
        const peter = characters.find(character => character.characterId === 'peter')!;
        const felix = characters.find(character => character.characterId === 'felix')!;
        const onRevisit = vi.fn();
        const screen = renderJournalScreen(
            'en',
            { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            { characters },
            { onReplayRie: vi.fn(), onReplayAakash: vi.fn(), onRevisit },
        );

        expect(xingyu).toMatchObject({
            name: 'Xingyu',
            unlocked: true,
            revisitPaths: [
                { kind: 'class-week', targetId: 'l1-l03' },
                { kind: 'story-episode', targetId: 's1e04-welcome-frequency' },
            ],
        });
        expect(xingyu.portrait).toContain('/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.png');
        expect(peter.portrait).toContain('/characters/peter/peter__neutral-quiet-observer__front-near-front__fullbody__v003.png');
        expect(felix.portrait).toContain(
            '/characters/felix/felix__neutral-curly-dark-blond-glasses-paper-cat__front-near-front__fullbody__v002.png',
        );

        const entry = screen.querySelector<HTMLElement>('[data-character="xingyu"]')!;
        expect(entry.dataset.unlocked).toBe('true');
        expect(entry.querySelector<HTMLImageElement>('img')?.src)
            .toContain('/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.png');
        expect(entry.querySelector('.academy-character-name')?.textContent).toBe('Xingyu-san');
        entry.querySelector<HTMLButtonElement>('button')?.click();

        const page = screen.querySelector<HTMLElement>('.academy-character-dossier[data-character="xingyu"]')!;
        expect(page.querySelector('h2')?.textContent).toBe('Xingyu-san');
        expect(page.querySelector<HTMLImageElement>('img')?.src)
            .toContain('/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.png');
        const revisits = [...page.querySelectorAll<HTMLButtonElement>('.academy-character-revisit')];
        expect(revisits.map(button => [button.dataset.revisitKind, button.dataset.encounterId])).toEqual([
            ['class-week', 'class-week:l1-l03'],
            ['story-episode', 'story:s1e04-welcome-frequency'],
        ]);
        revisits.forEach(button => button.click());
        expect(onRevisit.mock.calls.map(([path]) => path)).toEqual(xingyu.revisitPaths);

        screen.querySelector<HTMLButtonElement>('.academy-character-page-back')?.click();
        screen.querySelector<HTMLButtonElement>('[data-character="peter"] button')?.click();
        const peterGallery = screen.querySelector<HTMLElement>('.academy-character-sprite-gallery[data-character="peter"]')!;
        const peterSprites = [...peterGallery.querySelectorAll<HTMLImageElement>('img')];
        expect(peterSprites).toHaveLength(7);
        expect(new Set(peterSprites.map(sprite => sprite.dataset.expression))).toEqual(new Set([
            'neutral',
            'encouraging-listening',
            'happy',
            'thoughtful',
            'determined',
            'surprised-shocked',
            'sad-vulnerable',
        ]));
        expect(new Set(peterSprites.map(sprite => sprite.dataset.angle))).toEqual(new Set([
            'left-three-quarter',
            'front-near-front',
            'right-three-quarter',
        ]));
        expect(peterSprites.every(sprite => sprite.src.includes('/academy/art/characters/peter/'))).toBe(true);

        screen.querySelector<HTMLButtonElement>('.academy-character-page-back')?.click();
        screen.querySelector<HTMLButtonElement>('[data-character="felix"] button')?.click();
        const felixGallery = screen.querySelector<HTMLElement>('.academy-character-sprite-gallery[data-character="felix"]')!;
        const felixSprites = [...felixGallery.querySelectorAll<HTMLImageElement>('img')];
        expect(felixSprites).toHaveLength(7);
        expect(new Set(felixSprites.map(sprite => sprite.dataset.expression))).toEqual(new Set([
            'neutral',
            'encouraging-listening',
            'happy',
            'thoughtful',
            'determined',
            'surprised-shocked',
            'sad-vulnerable',
        ]));
        expect(new Set(felixSprites.map(sprite => sprite.dataset.angle))).toEqual(new Set([
            'left-three-quarter',
            'front-near-front',
            'right-three-quarter',
        ]));
        expect(felixSprites.every(sprite => sprite.src.includes('/academy/art/characters/felix/'))).toBe(true);
        expect(screen.querySelector('.academy-character-dossier-gallery > .academy-journal-portrait')).toBeNull();
    });

    it('groups each name and status on one caption strip with bounded stagger order', () => {
        const entries = [...renderDirectory().querySelectorAll<HTMLElement>('.academy-character-entry')];

        for (const entry of entries) {
            const caption = entry.querySelector('.academy-character-caption');
            expect(caption?.children).toHaveLength(2);
            expect(caption?.querySelector('.academy-character-name')).not.toBeNull();
            expect(caption?.querySelector('.academy-character-state')).not.toBeNull();
            expect(Number(entry.style.getPropertyValue('--academy-character-order'))).toBeLessThanOrEqual(12);
        }
    });

    it('pages the class book without a nested scrolling directory and keeps learning lines reachable', async () => {
        const record = createLearnerRecord();
        await record.record({
            kind: 'journal-line-recorded',
            eventId: 'milestone:journal-book-page:line',
            journalLineId: 'journal:book-page:line',
            characterId: 'rie',
            text: { ja: 'もう一度お願いします。', en: 'One more time, please.' },
            activityId: 'activity:journal-book-page',
            sourceQuestionId: 'source-question:journal-book-page',
        });
        const snapshot = await record.snapshot();
        const screen = renderJournalScreen(
            'en',
            { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            { characters: projectCharacterDirectory(snapshot), journalLines: Object.values(snapshot.journalLines) },
            { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
        );
        const directory = screen.querySelector<HTMLElement>('.academy-character-directory')!;
        const entries = [...directory.querySelectorAll<HTMLElement>(':scope > .academy-character-entry')];
        const next = screen.querySelector<HTMLButtonElement>('.academy-journal-page-next')!;
        const tabs = screen.querySelector<HTMLElement>('.academy-journal-book-tabs')!;
        const peopleTab = screen.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;

        expect(screen.querySelector('.academy-journal-book')).not.toBeNull();
        expect([...tabs.children].every(child => child.getAttribute('role') === 'tab')).toBe(true);
        expect(tabs.querySelector('.academy-journal-profile-sync')).toBeNull();
        expect(entries.filter(entry => !entry.hidden)).toHaveLength(6);
        expect(next.disabled).toBe(false);
        next.click();
        expect(entries.slice(0, 6).every(entry => entry.hidden)).toBe(true);

        tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(peopleTab.getAttribute('aria-selected')).toBe('false');
        expect(directory.hidden).toBe(true);
        expect(screen.querySelector<HTMLElement>('.academy-journal-learning-lines')?.hidden).toBe(false);
        expect(screen.querySelector('[data-journal-line-id="journal:book-page:line"]')?.textContent)
            .toBe('One more time, please.');
    });

    it('defines a finite journal opening and petals that never animate backward', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

        expect(styles).toMatch(/\.academy-journal-screen \.academy-journal-book\s*\{[^}]*overflow:\s*visible[^}]*animation:\s*academy-journal-book-open/s);
        expect(styles).toMatch(/\.academy-journal-screen \.academy-journal-book-content\s*\{[^}]*overflow:\s*hidden/s);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.academy-journal-screen \.academy-journal-book,[\s\S]*animation:\s*none !important/s);
        expect(styles).toContain('animation: academy-courtyard-petal-drift 6.5s linear 1 both;');
        expect(styles).not.toMatch(/academy-courtyard-petal-drift[^;]*infinite/);
        expect(styles).toMatch(/@keyframes academy-courtyard-petal-drift\s*\{[^}]*0%[^}]*translate:\s*-8px -12px[\s\S]*100%[^}]*translate:\s*28px 52px/s);
    });

    it('keeps Class and Journal on the same canonical encounter directory', async () => {
        const record = createLearnerRecord();
        await record.record({
            kind: 'characters-encountered',
            eventId: 'encounter:class-week:l1-l01',
            encounterId: 'class-week:l1-l01',
            sceneId: 'scene:class-week:l1-l01',
            attendeeIds: ['aakash', 'peter'],
        });
        const characters = projectCharacterDirectory(await record.snapshot());
        const journal = renderJournalScreen(
            'en',
            { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            { characters },
            { onReplayRie: vi.fn(), onReplayAakash: vi.fn() },
        );
        const classScreen = renderClassPathScreen({
            language: 'en',
            plan: validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
                path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'), 'utf8',
            ))),
            currentOrder: 2,
            playableWeekIds: new Set(['orientation', 'l1-l01']),
            characters,
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });

        for (const characterId of ['aakash', 'peter']) {
            expect(journal.querySelector<HTMLElement>(`[data-character="${characterId}"]`)?.dataset.unlocked).toBe('true');
            expect(journal.querySelector<HTMLButtonElement>(`[data-character="${characterId}"] button`)?.disabled).toBe(false);
            expect(classScreen.querySelector<HTMLElement>(`.academy-class-person-card[data-cast-id="${characterId}"]`)?.dataset.unlocked).toBe('true');
        }
        expect(classScreen.querySelector('[data-cast-id="aakash"] .academy-class-person-name')?.textContent).toBe('Aakash-san');
        expect(journal.querySelector('[data-character="xingyu"]')?.getAttribute('data-unlocked')).toBe('false');
        expect(classScreen.querySelector('.academy-class-person-card[data-cast-id="xingyu"]')?.getAttribute('data-unlocked')).toBe('false');
    });

    it('defines overflow, phone spacing, feedback, and reduced-motion safeguards', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');
        const worldStyles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

        expect(styles).toMatch(/\.academy-journal-screen \.academy-character-entry\s*\{[^}]*overflow:\s*visible/s);
        expect(styles).toMatch(/\.academy-journal-screen \.academy-character-portrait\s*\{[^}]*top:\s*-30px/s);
        expect(styles).toMatch(/\.academy-journal-screen \.academy-character-caption\s*\{[^}]*background:/s);
        expect(styles).toMatch(/@media \(min-width: 521px\)[\s\S]*\.academy-journal-screen \.academy-panel-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
        expect(styles).toMatch(/@media \(min-width: 521px\)[\s\S]*\.academy-journal-screen \.academy-journal-profile-sync\s*\{[^}]*width:\s*fit-content[^}]*border-radius:\s*4px/s);
        expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-journal-screen \.academy-character-directory\s*\{[^}]*row-gap:\s*50px/s);
        expect(styles).toMatch(/\.academy-journal-screen \.academy-character-open:not\(:disabled\):is\(:hover, :focus-visible\)/s);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.academy-journal-screen \.academy-character-entry,[\s\S]*\.academy-journal-screen \.academy-character-open,[\s\S]*\.academy-journal-screen \.academy-character-portrait\s*\{[^}]*animation:\s*none/s);
        expect(worldStyles).toMatch(/\.academy-character-dossier-gallery\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*overflow:\s*visible/s);
        expect(worldStyles).toMatch(/\.academy-character-sprite-gallery\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*min-width:\s*0/s);
        expect(worldStyles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-character-dossier-gallery \.academy-character-sprite-gallery-image\s*\{[^}]*max-height:\s*none/s);
    });
});
