/**
 * Yomu Academy — map hub and area screens.
 *
 * The map is the day-loop home: a full-bleed painted backdrop with area
 * markers positioned on real Bloomsbury geography. Choosing an area shows
 * its plate full-bleed with the activities available this slot. Locked
 * areas are visible but dimmed, with an honest unlock hint.
 */

import { AREAS, areaById, type AreaActivityKind, type AreaDefinition } from './areas';
import { isAreaUnlocked, type WorldState } from './state';
import { resolvePlate } from '../engine/assets';
import { castAtSpot } from '../cast';
import { resolveSprite } from '../engine/assets';

export interface MapCallbacks {
    onEnterArea(area: AreaDefinition): void;
}

const ACTIVITY_LABELS: Record<AreaActivityKind, { en: string; kana: string }> = {
    'class-lesson': { en: 'Class', kana: 'じゅぎょう' },
    review: { en: 'Review', kana: 'ふくしゅう' },
    'kanji-study': { en: 'Kanji', kana: 'かんじ' },
    reading: { en: 'Reading', kana: 'よむ' },
    listening: { en: 'Listening', kana: 'きく' },
    'bond-scene': { en: 'Spend time', kana: 'はなす' },
    minigame: { en: 'Practice', kana: 'れんしゅう' },
};

export function activityLabel(kind: AreaActivityKind): { en: string; kana: string } {
    return ACTIVITY_LABELS[kind];
}

export function renderMap(host: HTMLElement, state: WorldState, callbacks: MapCallbacks): void {
    host.innerHTML = '';
    const map = document.createElement('section');
    map.className = 'academy-map';
    const backdrop = document.createElement('div');
    backdrop.className = 'academy-map-backdrop';
    const arc = state.flags['story:japan-trip'] ? 'japan' : 'london';
    const backdropPlate = resolvePlate(arc === 'japan' ? 'tokyo-street__rain-night' : 'campus-entrance__blue-hour-arrival');
    if (backdropPlate) backdrop.style.backgroundImage = `url("${backdropPlate.wide}")`;
    map.append(backdrop);

    const heading = document.createElement('header');
    heading.className = 'academy-map-heading';
    const title = document.createElement('h1');
    title.textContent = arc === 'japan' ? 'Japan' : 'Bloomsbury';
    const status = document.createElement('p');
    status.textContent = `Week ${state.weekIndex + 1} · ${state.slot === 'day' ? 'Day' : 'Evening'}`;
    heading.append(title, status);
    map.append(heading);

    const markers = document.createElement('div');
    markers.className = 'academy-map-markers';
    for (const area of AREAS.filter(candidate => candidate.arc === arc)) {
        const unlocked = isAreaUnlocked(state, area);
        if (!unlocked && !Number.isFinite(area.unlockWeek)) continue;
        if (!unlocked && area.unlockWeek > state.weekIndex + 4) continue;
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'academy-map-marker';
        marker.style.left = `${area.map.x}%`;
        marker.style.top = `${area.map.y}%`;
        marker.disabled = !unlocked;
        const name = document.createElement('span');
        name.className = 'academy-map-marker-name';
        name.textContent = area.name;
        const kana = document.createElement('span');
        kana.className = 'academy-map-marker-kana';
        kana.lang = 'ja';
        kana.textContent = area.kana;
        marker.append(kana, name);
        if (!unlocked) {
            const hint = document.createElement('span');
            hint.className = 'academy-map-marker-hint';
            hint.textContent = area.unlockFlag ? 'Story' : `Week ${area.unlockWeek + 1}`;
            marker.append(hint);
            marker.setAttribute('aria-label', `${area.name} — locked`);
        } else {
            marker.addEventListener('click', () => callbacks.onEnterArea(area));
        }
        markers.append(marker);
    }
    map.append(markers);
    host.append(map);
}

export interface AreaCallbacks {
    onActivity(area: AreaDefinition, kind: AreaActivityKind): void;
    onBack(): void;
}

export function renderArea(host: HTMLElement, state: WorldState, areaId: string, callbacks: AreaCallbacks): void {
    const area = areaById(areaId);
    if (!area) {
        callbacks.onBack();
        return;
    }
    host.innerHTML = '';
    const screen = document.createElement('section');
    screen.className = 'academy-area';
    const backdrop = document.createElement('div');
    backdrop.className = 'academy-area-backdrop';
    const plateId = state.slot === 'evening' && area.plates.evening ? area.plates.evening : area.plates.day;
    const plate = resolvePlate(plateId);
    if (plate) {
        const portrait = window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
        backdrop.style.backgroundImage = `url("${portrait && plate.mobile ? plate.mobile : plate.wide}")`;
    }
    screen.append(backdrop);

    // Who is around: cast members whose home spot matches this area.
    const spotAlias: Record<string, string> = { campus: 'quad', park: 'garden', street: 'station' };
    const present = castAtSpot((spotAlias[area.id] ?? area.id) as never).slice(0, 2);
    if (present.length) {
        const sprites = document.createElement('div');
        sprites.className = 'academy-area-sprites';
        present.forEach((member, index) => {
            const resolved = resolveSprite(member.id, 'neutral');
            if (!resolved) return;
            const image = document.createElement('img');
            image.className = 'academy-sprite is-on';
            image.dataset.side = index === 0 ? 'right' : 'left';
            image.dataset.quality = resolved.quality;
            image.src = resolved.url;
            image.alt = '';
            sprites.append(image);
        });
        screen.append(sprites);
    }

    const panel = document.createElement('div');
    panel.className = 'academy-area-panel';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'academy-area-back';
    back.textContent = '← Map';
    back.addEventListener('click', () => callbacks.onBack());
    const heading = document.createElement('h1');
    heading.textContent = area.name;
    const kana = document.createElement('p');
    kana.className = 'academy-area-kana';
    kana.lang = 'ja';
    kana.textContent = area.kana;
    panel.append(back, heading, kana);

    const list = document.createElement('div');
    list.className = 'academy-area-activities';
    for (const kind of area.activities) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-area-activity';
        const label = ACTIVITY_LABELS[kind];
        const jp = document.createElement('span');
        jp.lang = 'ja';
        jp.className = 'academy-area-activity-kana';
        jp.textContent = label.kana;
        const en = document.createElement('span');
        en.textContent = label.en;
        button.append(jp, en);
        button.addEventListener('click', () => callbacks.onActivity(area, kind));
        list.append(button);
    }
    panel.append(list);
    screen.append(panel);
    host.append(screen);
}
