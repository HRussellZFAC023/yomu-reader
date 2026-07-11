/**
 * Yomu Academy — study-mode screens: syllabus, cast, review, settings.
 * Calm paper surfaces per the Visual Bible; no card walls, no eyebrows.
 */

import type { CourseView, CourseWeekView } from '../content/course';
import { ACADEMY_CAST } from '../cast';
import { TEXTBOOK_GUESTS } from '../cast/registry';
import { resolveSprite } from '../engine/assets';
import { bondRank, MAX_BOND_RANK, type WorldState } from '../world/state';

export interface SyllabusCallbacks {
    onOpenWeek(view: CourseWeekView): void;
}

export function renderSyllabus(host: HTMLElement, course: CourseView, state: WorldState, callbacks: SyllabusCallbacks): void {
    host.innerHTML = '';
    const screen = document.createElement('section');
    screen.className = 'academy-study academy-syllabus';
    const heading = document.createElement('h1');
    heading.textContent = 'Lessons';
    screen.append(heading);
    const summary = document.createElement('p');
    summary.className = 'academy-study-support';
    summary.textContent = `${course.weeks.length} weeks · jump anywhere — nothing here is locked.`;
    screen.append(summary);

    let currentTerm = '';
    let list: HTMLElement | null = null;
    for (const week of course.weeks) {
        const term = week.termLabel ?? 'Course';
        if (term !== currentTerm) {
            currentTerm = term;
            const termHeading = document.createElement('h2');
            termHeading.textContent = term;
            screen.append(termHeading);
            list = document.createElement('div');
            list.className = 'academy-syllabus-list';
            screen.append(list);
        }
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'academy-syllabus-row';
        row.dataset.availability = week.availability;
        if (week.order === state.weekIndex) row.classList.add('is-current');
        const title = document.createElement('span');
        title.className = 'academy-syllabus-title';
        title.textContent = week.title.en;
        row.append(title);
        if (week.title.ja) {
            const ja = document.createElement('span');
            ja.className = 'academy-syllabus-ja';
            ja.lang = 'ja';
            ja.textContent = week.title.ja;
            row.append(ja);
        }
        const meta = document.createElement('span');
        meta.className = 'academy-syllabus-meta';
        const bits = [week.jlpt, week.mapping?.minna ?? undefined].filter(Boolean);
        meta.textContent = week.availability === 'coming-soon' ? `${bits.join(' · ')} — in preparation` : bits.join(' · ');
        row.append(meta);
        if (week.availability !== 'coming-soon') {
            row.addEventListener('click', () => callbacks.onOpenWeek(week));
        } else {
            row.disabled = true;
        }
        list?.append(row);
    }
    host.append(screen);
}

export function renderCast(host: HTMLElement, state: WorldState): void {
    host.innerHTML = '';
    const screen = document.createElement('section');
    screen.className = 'academy-study academy-cast';
    const heading = document.createElement('h1');
    heading.textContent = 'Class';
    screen.append(heading);
    const grid = document.createElement('div');
    grid.className = 'academy-cast-grid';
    for (const member of ACADEMY_CAST) {
        const card = document.createElement('article');
        card.className = 'academy-cast-member';
        const resolved = resolveSprite(member.id, 'neutral');
        if (resolved) {
            const image = document.createElement('img');
            image.src = resolved.url;
            image.alt = member.name;
            image.loading = 'lazy';
            image.dataset.quality = resolved.quality;
            card.append(image);
        }
        const name = document.createElement('h2');
        name.textContent = member.name;
        const kana = document.createElement('p');
        kana.lang = 'ja';
        kana.className = 'academy-cast-kana';
        kana.textContent = member.kana;
        const role = document.createElement('p');
        role.className = 'academy-cast-role';
        role.textContent = member.role;
        card.append(name, kana, role);
        const points = state.bonds[member.id] ?? 0;
        const rank = bondRank(points);
        const bond = document.createElement('p');
        bond.className = 'academy-cast-bond';
        bond.textContent = rank > 0 ? `Bond ${rank} / ${MAX_BOND_RANK}` : 'Not yet close';
        card.append(bond);
        grid.append(card);
    }
    screen.append(grid);

    const guestsHeading = document.createElement('h2');
    guestsHeading.textContent = 'Guests from the textbooks';
    screen.append(guestsHeading);
    const guests = document.createElement('div');
    guests.className = 'academy-cast-guests';
    for (const guest of TEXTBOOK_GUESTS) {
        const chip = document.createElement('span');
        chip.className = 'academy-cast-guest';
        chip.textContent = `${guest.name}（${guest.kana}）`;
        guests.append(chip);
    }
    screen.append(guests);
    host.append(screen);
}

export interface SettingsCallbacks {
    onToggleFurigana(value: boolean): void;
    onToggleTranslations(value: boolean): void;
    onToggleReducedMotion(value: boolean): void;
    onReplayPrologue(): void;
}

export function renderSettings(host: HTMLElement, state: WorldState, callbacks: SettingsCallbacks): void {
    host.innerHTML = '';
    const screen = document.createElement('section');
    screen.className = 'academy-study academy-settings';
    const heading = document.createElement('h1');
    heading.textContent = 'Settings';
    screen.append(heading);

    const rows: { label: string; value: boolean; onChange(value: boolean): void }[] = [
        { label: 'Show furigana', value: state.settings.showFurigana, onChange: callbacks.onToggleFurigana },
        { label: 'Show translations', value: state.settings.showTranslations, onChange: callbacks.onToggleTranslations },
        { label: 'Reduce motion', value: state.settings.reducedMotion, onChange: callbacks.onToggleReducedMotion },
    ];
    for (const row of rows) {
        const label = document.createElement('label');
        label.className = 'academy-settings-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = row.value;
        input.addEventListener('change', () => row.onChange(input.checked));
        const text = document.createElement('span');
        text.textContent = row.label;
        label.append(input, text);
        screen.append(label);
    }

    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'academy-settings-action';
    replay.textContent = 'Replay the first day';
    replay.addEventListener('click', () => callbacks.onReplayPrologue());
    screen.append(replay);
    host.append(screen);
}

export function renderReviewStub(host: HTMLElement, dueCount: number, onStart: () => void): void {
    host.innerHTML = '';
    const screen = document.createElement('section');
    screen.className = 'academy-study academy-review';
    const heading = document.createElement('h1');
    heading.textContent = 'Review';
    const body = document.createElement('p');
    body.className = 'academy-study-support';
    body.textContent = dueCount > 0 ? `${dueCount} items are due.` : 'Nothing due right now.';
    screen.append(heading, body);
    if (dueCount > 0) {
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'academy-settings-action';
        start.textContent = 'Start review';
        start.addEventListener('click', onStart);
        screen.append(start);
    }
    host.append(screen);
}
