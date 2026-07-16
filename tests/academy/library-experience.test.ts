import { createMemoryAcademyPersistence } from '../../src/academy/persistence/indexeddb';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hasSeenIntroduction, introductionId, markIntroductionSeen } from '../../src/academy/routing/location-introductions';
import { transitionAcademyRoute } from '../../src/academy/routing/route-history';
import { openVocabularySheet, renderLibraryIntroduction, renderLibraryScreen } from '../../src/academy/ui/library-screen';
import { createAcademyShell } from '../../src/academy/ui/shell';
import type { AcademyStudyVocabulary } from '../../src/academy/integration/study-module';
import type { LibraryVocabularySheet } from '../../src/academy/content/library-vocabulary-sheet';
import { AUTHORED_VOCABULARY_ATTRIBUTE } from '../../src/reader/lookup/authored-vocabulary';

const WORDS: readonly AcademyStudyVocabulary[] = [
    { id: 'station', expression: '駅', reading: 'えき', meaning: 'station', source: 'week-1: directions', audioAvailable: true },
    { id: 'right', expression: '右', reading: 'みぎ', meaning: 'right', source: 'week-1: directions', audioAvailable: true },
] as const;

const SHEET: LibraryVocabularySheet = {
    id: 'l1-l02:sensei-chapter-1-2-vocabulary',
    lessonId: 'l1-l02',
    title: 'Chapter 1-2 Vocabulary Sheet',
    sourceId: 'moodle-vocabulary:chapter-1-2',
    sourceStatus: 'exact-source',
    items: [
        {
            id: 'row-1',
            expression: 'げんきな',
            studyExpression: 'げんきな',
            reading: 'げんきな',
            meaning: 'healthy, lively',
            sourcePronunciation: 'genki na',
            sourceMeaning: 'healthy, lively',
            fieldProvenance: { words: 'source-provided', reading: 'source-provided', meaning: 'source-provided' },
            source: { id: 'source-row-1', title: 'Chapter 1-2 Vocabulary Sheet', page: 1, row: 1 },
            reviewSeed: { id: 'review:l1-l02:sheet:p1:r1', conceptId: 'concept:l1-l02:source-vocabulary:sheet:p1:r1', sourceQuestionId: 'source-row-1' },
        },
        {
            id: 'row-2',
            expression: '駅',
            studyExpression: '駅',
            reading: 'えき',
            meaning: 'station',
            sourcePronunciation: null,
            sourceMeaning: null,
            fieldProvenance: { words: 'source-provided', reading: 'yomu-support', meaning: 'yomu-support' },
            source: { id: 'source-row-2', title: 'Chapter 1-2 Vocabulary Sheet', page: 1, row: 2 },
            reviewSeed: { id: 'review:l1-l02:sheet:p1:r2', conceptId: 'concept:l1-l02:source-vocabulary:sheet:p1:r2', sourceQuestionId: 'source-row-2' },
        },
    ],
};
const WORLD_CSS = readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

afterEach(() => document.body.replaceChildren());

describe('Academy Library experience', () => {
    it('persists a generic location introduction and never marks it twice', async () => {
        const id = introductionId('place', 'library');
        const first = markIntroductionSeen(undefined, id);
        expect(hasSeenIntroduction(first, id)).toBe(true);
        expect(markIntroductionSeen(first, id)).toEqual([id]);

        const persistence = createMemoryAcademyPersistence();
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'review',
            routeHistory: [{ route: 'campus' }],
            presentationMode: 'story',
            seenIntroductions: first,
            updatedAt: 1,
        });
        expect((await persistence.checkpoint.load())?.seenIntroductions).toEqual([id]);
    });

    it('offers one clear Library appointment before a first visit becomes a return visit', () => {
        const continueToLibrary = vi.fn();
        const introduction = renderLibraryIntroduction('en', continueToLibrary);
        expect(introduction.querySelector('.academy-library-dialogue-title')?.textContent).toBe('The Library');
        expect(introduction.querySelector('.academy-library-line')?.textContent).toContain('exact Sensei sheet');
        expect(introduction.querySelector('.academy-library-line')?.textContent).toContain('lesson you chose to revisit');
        expect(introduction.querySelector('.academy-library-line')?.textContent).toContain('real review schedule');
        expect(introduction.querySelector('.academy-library-line')?.textContent).toContain('Type follows when an example sentence is available');
        expect(introduction.querySelector('.academy-library-sensei')).not.toBeNull();
        expect(introduction.querySelectorAll('.academy-library-dialogue-actions button')).toHaveLength(1);
        introduction.querySelector<HTMLButtonElement>('.academy-library-dialogue-continue')?.click();
        expect(continueToLibrary).toHaveBeenCalledOnce();

        const returning = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: WORDS, onBack() {}, onStart() {}, onPlay() {},
        });
        expect(returning.querySelector('.academy-library-dialogue')).toBeNull();
        expect(returning.querySelector('.academy-library-marker')?.textContent).toBe('Evening');
        expect(returning.querySelector('.academy-library-desk')).not.toBeNull();

        const japanese = renderLibraryScreen({
            language: 'ja', sheet: SHEET, due: WORDS, onBack() {}, onStart() {}, onPlay() {},
        });
        expect(japanese.querySelector('.academy-library-marker')?.textContent).toBe('夕方');
    });

    it('uses real route history to return from the Library to campus', () => {
        const fromCampus = transitionAcademyRoute({
            route: 'campus' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, { kind: 'push', route: 'review' });
        expect(transitionAcademyRoute(fromCampus, { kind: 'back' })).toMatchObject({
            route: 'campus',
            routeHistory: [],
        });
    });

    it('makes the whole grounded session browsable before study and keeps Yomu reading markup', () => {
        const onStart = vi.fn();
        const screen = renderLibraryScreen({
            language: 'en',
            sheet: SHEET,
            due: WORDS,
            onBack() {},
            onStart,
            onPlay() {},
        });
        document.body.append(screen);
        screen.querySelector<HTMLButtonElement>('.academy-library-sheet-button')?.click();

        const rows = screen.querySelectorAll('.academy-vocabulary-sheet-word');
        expect(rows).toHaveLength(SHEET.items.length);
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-japanese')?.textContent).toBe('げんきな');
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-reading')?.textContent).toBe('genki na');
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-meaning')?.textContent).toBe('healthy, lively');
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-source')?.textContent).toBe('Page 1 · row 1');
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-japanese')?.getAttribute('data-yomu-furigana-mode')).toBe('all');
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-japanese')?.getAttribute('data-yomu-runtime-surface')).toBe('academy-copy');
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-japanese')?.getAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(JSON.stringify([{
            surface: 'げんきな', lemma: 'げんきな', reading: 'げんきな',
        }]));
        expect(rows[1]?.querySelector('.academy-vocabulary-sheet-japanese')?.getAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(JSON.stringify([{
            surface: '駅', lemma: '駅', reading: 'えき',
        }]));
        expect(rows[0]?.querySelector('.academy-vocabulary-sheet-audio')).not.toBeNull();
        expect(rows[1]?.querySelector('.academy-vocabulary-sheet-reading')?.textContent).toBe('Study reading: えき');
        expect(rows[1]?.querySelector('.academy-vocabulary-sheet-meaning')?.textContent).toBe('Study meaning: station');
        expect(rows[1]?.querySelector('.academy-vocabulary-sheet-reading')?.getAttribute('data-field-provenance')).toBe('yomu-support');
        expect(rows[1]?.querySelector('.academy-vocabulary-sheet-meaning')?.getAttribute('data-field-provenance')).toBe('yomu-support');
        expect(rows[1]?.getAttribute('data-yomu-study-expression')).toBe('駅');
        expect(screen.querySelector('.academy-vocabulary-sheet-enrichment')?.textContent)
            .toContain('enabled installed dictionaries');
        screen.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')?.click();
        expect(onStart).toHaveBeenCalledOnce();
        expect(screen.querySelector('.academy-vocabulary-sheet-layer')).toBeNull();
    });

    it('has a narrow-layout-safe place structure with one non-duplicated journey action', () => {
        const screen = renderLibraryScreen({
            language: 'en',
            sheet: SHEET,
            due: WORDS,
            onBack() {},
            onStart() {},
            onPlay() {},
        });
        expect(screen.querySelector('.academy-background picture, picture.academy-background')).not.toBeNull();
        expect(screen.querySelector('.academy-library-place-header')).not.toBeNull();
        expect(screen.querySelector('.academy-library-desk')).not.toBeNull();
        expect(screen.querySelector('.academy-utility')).toBeNull();
        expect(screen.querySelectorAll('.academy-library-desk > button:not(.academy-library-back)')).toHaveLength(1);
        expect(screen.querySelector('.academy-library-start-button')).toBeNull();

        openVocabularySheet(screen, { language: 'en', sheet: SHEET, due: WORDS, onPlay() {} });
        expect(screen.querySelector('.academy-vocabulary-sheet-list')).not.toBeNull();
        expect(screen.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(SHEET.items.length);
    });

    it('keeps an empty due queue distinct from the browsable source sheet', () => {
        const onStart = vi.fn();
        const screen = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: [], onBack() {}, onStart, onPlay() {},
        });
        document.body.append(screen);

        expect(screen.dataset.dueCount).toBe('0');
        expect(screen.dataset.queueState).toBe('new');
        expect(screen.querySelector('.academy-library-start-button')).toBeNull();
        expect(screen.querySelector('.academy-library-count, .academy-library-next-due, .academy-library-source-summary')).toBeNull();
        screen.querySelector<HTMLButtonElement>('.academy-library-sheet-button')?.click();
        expect(screen.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(2);
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-title')?.textContent).toBe('Word → Type');
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-note')?.textContent)
            .toBe('Yomu’s real review schedule keeps the due dates. Cards begin with Word, and Type follows when a card has an example sentence.');
        expect(screen.querySelector('.academy-vocabulary-sheet-start')?.textContent).toBe('Study new words');
        screen.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')?.click();
        expect(onStart).toHaveBeenCalledOnce();
    });

    it('identifies the selected lesson in the narrow header and screen contract', () => {
        const screen = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: [], onBack() {}, onStart() {}, onPlay() {},
        });

        expect(screen.dataset.lessonId).toBe('l1-l02');
        expect(screen.querySelector('.academy-library-moment')?.textContent).toContain('l1-l02');
    });

    it('shows an already seeded syllabus as cleared without inventing a due card', () => {
        const screen = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: [], syllabusState: 'cleared', onBack() {}, onStart() {}, onPlay() {},
        });
        document.body.append(screen);

        expect(screen.dataset.queueState).toBe('cleared');
        expect(screen.querySelector('.academy-library-note')?.textContent).toContain('real next review date');
        screen.querySelector<HTMLButtonElement>('.academy-library-sheet-button')?.click();
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-title')?.textContent).toBe('You are caught up');
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-note')?.textContent).toContain('will not pull reviews forward');
        expect(screen.querySelector('.academy-vocabulary-sheet-start')).toBeNull();
    });

    it('does not pretend an empty current lesson has a teacher sheet to study', () => {
        const sheet: LibraryVocabularySheet = {
            id: 'l2-l02:no-exact-source-vocabulary',
            lessonId: 'l2-l02',
            title: 'Words for this week',
            sourceId: 'academy:l2-l02:no-exact-source-vocabulary',
            sourceStatus: 'not-provided',
            items: [],
        };
        const screen = renderLibraryScreen({
            language: 'en', sheet, due: [], onBack() {}, onStart() {}, onPlay() {},
        });
        document.body.append(screen);

        expect(screen.dataset.queueState).toBe('empty');
        expect(screen.querySelector('.academy-library-sheet-button')?.textContent).toBe('View vocabulary status');
        screen.querySelector<HTMLButtonElement>('.academy-library-sheet-button')?.click();
        expect(screen.querySelector('.academy-vocabulary-sheet-summary')?.textContent).toContain('No verified teacher rows');
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-title')?.textContent).toBe('Your current study queue');
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-note')?.textContent)
            .toContain('no review cards due');
        expect(screen.querySelector('.academy-vocabulary-sheet-start')).toBeNull();
    });

    it('keeps scheduled reviews available when the current lesson has no verified sheet', () => {
        const sheet: LibraryVocabularySheet = {
            id: 'l2-l02:no-exact-source-vocabulary',
            lessonId: 'l2-l02',
            title: 'Words for this week',
            sourceId: 'academy:l2-l02:no-exact-source-vocabulary',
            sourceStatus: 'not-provided',
            items: [],
        };
        const screen = renderLibraryScreen({
            language: 'en', sheet, due: WORDS, onBack() {}, onStart() {}, onPlay() {},
        });

        expect(screen.dataset.queueState).toBe('due');
        expect(screen.querySelector('.academy-library-note')?.textContent).toContain('scheduled review cards are still available');
        screen.querySelector<HTMLButtonElement>('.academy-library-sheet-button')?.click();
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-title')?.textContent).toBe('Word → Type');
        expect(screen.querySelector('.academy-vocabulary-sheet-start')?.textContent).toBe('Start review');
    });

    it('previews only the scheduler-owned next due card while retaining the full source sheet', () => {
        const screen = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: WORDS, onBack() {}, onStart() {}, onPlay() {},
        });
        expect(screen.dataset.queueState).toBe('due');
        expect(screen.querySelectorAll('.academy-library-desk > button:not(.academy-library-back)')).toHaveLength(1);
        screen.querySelector<HTMLButtonElement>('.academy-library-sheet-button')?.click();
        expect(screen.querySelector('.academy-vocabulary-sheet-journey-title')?.textContent).toBe('Word → Type');
        expect(screen.querySelector('.academy-vocabulary-sheet-start')?.textContent).toBe('Start review');
    });

    it('keeps the source sheet above Reader chrome with narrow-screen touch and overflow guards', () => {
        expect(WORLD_CSS).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-library-screen\s*\{[^}]*display:\s*flex[^}]*overflow-y:\s*auto/s);
        expect(WORLD_CSS).toMatch(/\.academy-vocabulary-sheet-layer\s*\{[^}]*place-items:\s*end stretch/s);
        expect(WORLD_CSS).toMatch(/\.academy-vocabulary-sheet\s*\{[^}]*max-height:\s*calc\(100dvh - max\(6px, env\(safe-area-inset-top\)\)\)/s);
        expect(WORLD_CSS).toMatch(/\.academy-vocabulary-sheet-actions > button\s*\{[^}]*min-height:\s*44px/s);
        expect(WORLD_CSS).toMatch(/\.academy-vocabulary-sheet-word\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
        expect(WORLD_CSS).toMatch(/\.academy-vocabulary-sheet-enrichment\s*\{[^}]*grid-column:\s*auto/s);
        expect(WORLD_CSS).toMatch(/@media \(max-width: 380px\)[\s\S]*\.academy-vocabulary-sheet-actions\s*\{[^}]*grid-template-columns:\s*1fr/s);
    });

    it('suspends the Reader floating control only while the vocabulary dialog is open', () => {
        const floating = document.createElement('button');
        floating.className = 'jpdb-reader-fab';
        document.body.append(floating);
        const screen = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: WORDS, onBack() {}, onStart() {}, onPlay() {},
        });
        document.body.append(screen);

        const dialog = openVocabularySheet(screen, { language: 'en', sheet: SHEET, due: WORDS, onPlay() {} });
        expect(floating.inert).toBe(true);
        expect(floating.style.getPropertyValue('visibility')).toBe('hidden');
        expect(floating.style.getPropertyPriority('visibility')).toBe('important');
        expect(screen.querySelector<HTMLElement>('.academy-library-desk')?.inert).toBe(true);
        expect(screen.querySelector('.academy-library-desk')?.getAttribute('aria-hidden')).toBe('true');

        dialog.close();
        expect(floating.inert).toBeFalsy();
        expect(floating.style.getPropertyValue('visibility')).toBe('');
        expect(screen.querySelector<HTMLElement>('.academy-library-desk')?.inert).toBeFalsy();
        expect(screen.querySelector('.academy-library-desk')?.hasAttribute('aria-hidden')).toBe(false);
    });

    it('marks Japanese and English meaning fragments with their spoken languages', () => {
        const screen = renderLibraryScreen({
            language: 'ja', sheet: SHEET, due: [], onBack() {}, onStart() {}, onPlay() {},
        });
        openVocabularySheet(screen, { language: 'ja', sheet: SHEET, due: [], onPlay() {} });

        const sourceMeaning = screen.querySelector<HTMLElement>('[data-vocabulary-id="row-1"] .academy-vocabulary-sheet-meaning');
        expect(sourceMeaning?.lang).toBe('en');
        const supportedMeaning = screen.querySelector<HTMLElement>('[data-vocabulary-id="row-2"] .academy-vocabulary-sheet-meaning');
        expect(supportedMeaning?.textContent).toBe('学習用の意味：station');
        expect(supportedMeaning?.querySelector<HTMLElement>('[lang="ja"]')?.textContent).toBe('学習用の意味：');
        expect(supportedMeaning?.querySelector<HTMLElement>('[lang="en"]')?.textContent).toBe('station');
    });

    it('restores Reader chrome when route disposal removes an open sheet', () => {
        const floating = document.createElement('button');
        floating.className = 'jpdb-reader-fab';
        const screen = renderLibraryScreen({
            language: 'en', sheet: SHEET, due: WORDS, onBack() {}, onStart() {}, onPlay() {},
        });
        document.body.append(floating, screen);
        openVocabularySheet(screen, { language: 'en', sheet: SHEET, due: WORDS, onPlay() {} });

        screen.dispatchEvent(new CustomEvent('academy:dispose'));

        expect(screen.querySelector('.academy-vocabulary-sheet-layer')).toBeNull();
        expect(floating.inert).toBeFalsy();
        expect(floating.style.getPropertyValue('visibility')).toBe('');
    });

    it('hides the Academy overflow control while Reader Study owns its controls', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const shell = createAcademyShell(host, {
            language: 'en', onLanguage() {}, onMute() {}, onNavigate() {}, onPresentationMode() {},
        });
        shell.setUtilityVisible?.(false);
        expect(host.querySelector<HTMLElement>('.academy-utility')?.hidden).toBe(true);
        shell.dispose();
    });
});
