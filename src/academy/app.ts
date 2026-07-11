/**
 * Yomu Academy — orchestrator.
 *
 * Thin coordination only: owns world state and the current screen, and
 * delegates everything else (engine, screens, content, cast). No HTML
 * template strings; every surface builds its own DOM.
 */

import { createShell, type ShellController, type ShellRoute } from './ui/shell';
import { renderCast, renderSettings, renderSyllabus } from './ui/screens';
import { renderArea, renderMap } from './world/map';
import { advanceSlot, addBondPoints, bondRank, loadWorldState, markSceneSeen, saveWorldState, type WorldState } from './world/state';
import { castAtSpot } from './cast';
import { bondSceneForArea } from './story/bonds';
import type { AreaActivityKind, AreaDefinition } from './world/areas';
import { loadCourse, weekSceneScript, type CourseView, type CourseWeekView } from './content/course';
import { runScene } from './engine/runtime';
import { DomStage } from './engine/stage';
import type { SceneScript } from './engine/script';
import { PROLOGUE_SCENE } from './story/prologue';
import {
    bindFoundationPlayer,
    createFoundationPlayerState,
    renderFoundationPlayer,
    type FoundationPlayerState,
} from './foundation-player';
import { renderWeekComponents } from './player/week-components';
import { renderWeekExercise } from './player/week-exercises';
import { StudyProgress } from './world/study-progress';
import type { FoundationLesson } from './foundation-course';

export class AcademyApp {
    private readonly host: HTMLElement;
    private shell!: ShellController;
    private state: WorldState;
    private course: CourseView = { weeks: [], authoredCount: 0, warnings: [] };
    private readonly progress = new StudyProgress();

    constructor(host: HTMLElement) {
        this.host = host;
        this.state = loadWorldState();
    }

    async start(): Promise<void> {
        this.shell = createShell(this.host);
        this.shell.onNavigate(route => this.renderRoute(route));
        this.course = await loadCourse();
        this.progress.attach(this.course);
        if (!this.state.flags['story:prologue-complete']) {
            await this.playScene(PROLOGUE_SCENE);
        }
        this.shell.navigate('map');
    }

    private save(): void {
        saveWorldState(this.state);
    }

    private renderRoute(route: ShellRoute): void {
        switch (route) {
            case 'map':
                renderMap(this.shell.screen, this.state, { onEnterArea: area => this.enterArea(area) });
                break;
            case 'syllabus':
                renderSyllabus(this.shell.screen, this.course, this.state, { onOpenWeek: week => void this.openWeek(week) });
                break;
            case 'review':
                this.renderReview();
                break;
            case 'cast':
                renderCast(this.shell.screen, this.state);
                break;
            case 'settings':
                renderSettings(this.shell.screen, this.state, {
                    onToggleFurigana: value => this.updateSettings({ showFurigana: value }),
                    onToggleTranslations: value => this.updateSettings({ showTranslations: value }),
                    onToggleReducedMotion: value => this.updateSettings({ reducedMotion: value }),
                    onReplayPrologue: () => void this.playScene(PROLOGUE_SCENE, { replay: true }),
                });
                break;
        }
    }

    private updateSettings(update: Partial<WorldState['settings']>): void {
        this.state.settings = { ...this.state.settings, ...update };
        this.save();
        this.renderRoute('settings');
    }

    private enterArea(area: AreaDefinition): void {
        renderArea(this.shell.screen, this.state, area.id, {
            onBack: () => this.shell.navigate('map'),
            onActivity: (fromArea, kind) => void this.startActivity(fromArea, kind),
        });
    }

    private async startActivity(area: AreaDefinition, kind: AreaActivityKind): Promise<void> {
        switch (kind) {
            case 'class-lesson': {
                const week = this.course.weeks.find(candidate => candidate.order === this.state.weekIndex && candidate.availability !== 'coming-soon')
                    ?? this.course.weeks.find(candidate => candidate.availability !== 'coming-soon');
                if (week) await this.openWeek(week, { advanceOnFinish: true });
                break;
            }
            case 'bond-scene': {
                const spotAlias: Record<string, string> = { campus: 'quad', park: 'garden', street: 'station' };
                const present = castAtSpot((spotAlias[area.id] ?? area.id) as never).map(member => member.id);
                const entry = bondSceneForArea(
                    area.id,
                    area.id === 'classroom' ? ['rie', ...present] : present,
                    character => bondRank(this.state.bonds[character] ?? 0),
                    this.state.seenScenes,
                );
                if (entry) {
                    await this.playScene(entry.scene);
                } else {
                    await this.playSmallTalk(area);
                }
                this.spendSlot();
                break;
            }
            default:
                // Other activity players land in later slices; keep the map honest.
                this.enterArea(area);
                break;
        }
    }

    private async playSmallTalk(area: AreaDefinition): Promise<void> {
        const scene: SceneScript = {
            id: `smalltalk:${area.id}:${this.state.weekIndex}:${this.state.slot}`,
            nodes: [
                { kind: 'stage', plate: this.state.slot === 'evening' && area.plates.evening ? area.plates.evening : area.plates.day },
                { kind: 'line', en: `You spend a while at the ${area.name.toLowerCase()}. The Japanese around you sounds a little less like noise than last week.` },
                { kind: 'end' },
            ],
        };
        await this.playScene(scene);
    }

    private spendSlot(): void {
        advanceSlot(this.state);
        this.save();
        this.shell.navigate('map');
    }

    private async openWeek(view: CourseWeekView, options: { advanceOnFinish?: boolean } = {}): Promise<void> {
        if (view.week) {
            const script = weekSceneScript(view.week, 'classroom__evening-lamplit');
            if (script) await this.playScene(script);
            this.renderWeekStudy(view);
        } else if (view.foundation) {
            this.renderFoundationLesson(view.foundation);
        }
        if (options.advanceOnFinish) {
            // The lesson consumed the class slot.
            advanceSlot(this.state);
            this.save();
        }
    }

    private renderFoundationLesson(lesson: FoundationLesson): void {
        this.shell.setImmersive(false);
        const screen = this.shell.screen;
        screen.innerHTML = '';
        const wrap = document.createElement('section');
        wrap.className = 'academy-study academy-lesson';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'academy-area-back';
        back.textContent = '← Lessons';
        back.addEventListener('click', () => this.shell.navigate('syllabus'));
        wrap.append(back);
        const playerHost = document.createElement('div');
        const playerState: FoundationPlayerState = createFoundationPlayerState();
        const rerender = () => {
            playerHost.innerHTML = renderFoundationPlayer(lesson, playerState);
            bindFoundationPlayer(playerHost, lesson, playerState, {
                render: rerender,
                onComplete: () => this.shell.navigate('syllabus'),
            });
        };
        rerender();
        wrap.append(playerHost);
        screen.append(wrap);
    }

    private renderWeekStudy(view: CourseWeekView): void {
        this.shell.setImmersive(false);
        const screen = this.shell.screen;
        screen.innerHTML = '';
        const wrap = document.createElement('section');
        wrap.className = 'academy-study academy-lesson';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'academy-area-back';
        back.textContent = '← Lessons';
        back.addEventListener('click', () => this.shell.navigate('syllabus'));
        wrap.append(back);

        const heading = document.createElement('h1');
        heading.textContent = view.title.en;
        wrap.append(heading);
        if (view.title.ja) {
            const ja = document.createElement('p');
            ja.lang = 'ja';
            ja.className = 'academy-lesson-ja-title';
            ja.textContent = view.title.ja;
            wrap.append(ja);
        }
        const mapping = document.createElement('p');
        mapping.className = 'academy-study-support';
        mapping.textContent = [view.mapping?.ucl, view.mapping?.minna ?? undefined, view.jlpt].filter(Boolean).join(' · ');
        wrap.append(mapping);

        const week = view.week as Record<string, unknown> | undefined;
        const explanation = week?.explanation as { recap?: string; intro?: string; grammarPoints?: { title?: string; explanation?: string; examples?: { ja?: string; en?: string }[] }[] } | undefined;
        if (explanation?.intro) {
            const intro = document.createElement('p');
            intro.className = 'academy-lesson-intro';
            intro.textContent = explanation.intro;
            wrap.append(intro);
        }
        for (const point of explanation?.grammarPoints ?? []) {
            const block = document.createElement('section');
            block.className = 'academy-grammar-point';
            if (point.title) {
                const title = document.createElement('h2');
                title.textContent = point.title;
                block.append(title);
            }
            if (point.explanation) {
                const body = document.createElement('p');
                body.textContent = point.explanation;
                block.append(body);
            }
            for (const example of point.examples ?? []) {
                if (!example.ja) continue;
                const ja = document.createElement('p');
                ja.lang = 'ja';
                ja.className = 'academy-grammar-example';
                ja.textContent = example.ja;
                block.append(ja);
                if (example.en) {
                    const en = document.createElement('p');
                    en.className = 'academy-grammar-example-en';
                    en.textContent = example.en;
                    block.append(en);
                }
            }
            wrap.append(block);
        }

        const components = (week?.components ?? []) as Parameters<typeof renderWeekComponents>[1];
        if (components.length) {
            renderWeekComponents(wrap, components, result => {
                this.progress.recordAttempt(view.id, result.exerciseId, result.correct);
            });
        }
        screen.append(wrap);
    }

    private renderReview(): void {
        const queue = this.progress.dueReviews();
        const screen = this.shell.screen;
        screen.innerHTML = '';
        const wrap = document.createElement('section');
        wrap.className = 'academy-study academy-review';
        const heading = document.createElement('h1');
        heading.textContent = 'Review';
        wrap.append(heading);
        const support = document.createElement('p');
        support.className = 'academy-study-support';
        support.textContent = queue.length
            ? `${queue.length} due — answers here reschedule each item.`
            : 'Nothing due right now. Finish a lesson and items will come back on a spaced schedule.';
        wrap.append(support);
        for (const entry of queue) {
            wrap.append(
                renderWeekExercise(entry.exercise, result => {
                    this.progress.recordReview(entry.weekId, result.exerciseId, result.correct);
                }),
            );
        }
        screen.append(wrap);
    }

    private async playScene(script: SceneScript, options: { replay?: boolean } = {}): Promise<void> {
        this.shell.setImmersive(true);
        const stage = new DomStage(this.shell.screen, this.state.settings, {
            onSettingsChanged: settings => {
                this.state.settings = { ...settings };
                this.save();
            },
        });
        const result = await runScene(script, { stage, flags: { ...this.state.flags } });
        this.shell.setImmersive(false);
        const firstTime = markSceneSeen(this.state, script.id);
        for (const [flag, value] of Object.entries(result.flags)) {
            if (flag.startsWith('bond:')) {
                // Bond points award once, on the first completion only.
                if (firstTime && !options.replay && typeof value === 'number') {
                    addBondPoints(this.state, flag.slice('bond:'.length), value);
                }
            } else {
                this.state.flags[flag] = value;
            }
        }
        this.save();
    }
}

export async function mountAcademy(host: HTMLElement | null): Promise<void> {
    if (!host) return;
    const app = new AcademyApp(host);
    await app.start();
}
