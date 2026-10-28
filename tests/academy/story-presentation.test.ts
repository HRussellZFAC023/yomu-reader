import {
    BLANK_ATLAS_SCENE_THEMES,
    themeForStoryScene,
} from '../../src/academy/audio/story-presentation';

describe('Chapter 1 story presentation', () => {
    it('binds every canonical scene to its authored score without leaking to other chapters', () => {
        expect(BLANK_ATLAS_SCENE_THEMES).toEqual({
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
        });
        expect(themeForStoryScene('scene:blank-atlas:mission-text')).toBe('library.quiet');
        expect(themeForStoryScene('scene:margin-map:opening')).toBeUndefined();
    });
});
