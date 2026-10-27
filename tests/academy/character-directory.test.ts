import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import { projectCharacterDirectory } from '../../src/academy/domain/progress-projections';
import { renderJournalScreen } from '../../src/academy/ui/world-screen';

describe('Academy character directory presentation', () => {

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
});
