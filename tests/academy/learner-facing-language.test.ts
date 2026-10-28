import { readFileSync } from 'node:fs';

const SHARED_LEARNER_RENDERERS = [
    'src/academy/ui/aakash-directions-scene.ts',
    'src/academy/ui/blank-atlas-scene-props.ts',
    'src/academy/ui/lesson-vocabulary-prerequisite.ts',
    'src/academy/ui/lesson-zero-vowel-screen.ts',
    'src/academy/ui/story-screen.ts',
    'src/academy/ui/world-screen.ts',
] as const;

const ARTIFICIAL_PHRASES = [
    /First sound lab/iu,
    /Sound lab/iu,
    /Blank route/iu,
    /route note/iu,
    /Practice the notice/iu,
    /registered practice/iu,
    /Learning route/iu,
    /one true role/iu,
    /keep the truth small/iu,
    /both lines are true/iu,
] as const;

describe('Academy learner-facing language', () => {
    it.each(SHARED_LEARNER_RENDERERS)('%s avoids known artificial interface phrases', filename => {
        const source = readFileSync(filename, 'utf8');
        ARTIFICIAL_PHRASES.forEach(pattern => expect(source).not.toMatch(pattern));
    });

    it('does not name the upstream classroom platform in the shared vocabulary screen', () => {
        expect(readFileSync('src/academy/ui/lesson-vocabulary-prerequisite.ts', 'utf8'))
            .not.toMatch(/Moodle/iu);
    });
});
