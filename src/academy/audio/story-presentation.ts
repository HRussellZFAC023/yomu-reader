import type { ThemeSlot } from './types';

/** Chapter 1's authored score/environment changes, keyed to canonical scene IDs. */
export const BLANK_ATLAS_SCENE_THEMES = Object.freeze({
    'scene:blank-atlas:arrival-greetings': 'opening.invitation',
    'scene:blank-atlas:sound-script-map': 'classroom.focus',
    'scene:blank-atlas:classroom-survival': 'classroom.focus',
    'scene:blank-atlas:sentence-frames': 'classroom.focus',
    'scene:blank-atlas:useful-vocabulary': 'classroom.focus',
    'scene:blank-atlas:mission-sound': 'world.lab',
    'scene:blank-atlas:mission-text': 'library.quiet',
    'scene:blank-atlas:mission-speaking': 'classroom.focus',
    'scene:blank-atlas:reading-writing': 'classroom.focus',
    'scene:blank-atlas:transfer': 'unlock.world',
    'scene:blank-atlas:close': 'ending.reflective',
} as const satisfies Readonly<Record<string, ThemeSlot>>);

export function themeForStoryScene(sceneId: string): ThemeSlot | undefined {
    return (BLANK_ATLAS_SCENE_THEMES as Readonly<Record<string, ThemeSlot>>)[sceneId];
}
