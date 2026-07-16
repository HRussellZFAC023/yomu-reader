export type AcademySpriteExpression =
    | 'neutral'
    | 'encouraging'
    | 'happy'
    | 'repair'
    | 'determined'
    | 'sad-vulnerable'
    | 'comedic';

export interface AcademySpriteSource {
    readonly still: string;
    readonly animated?: string;
}

export interface AcademySpriteOptions {
    readonly characterId: string;
    readonly alt: string;
    readonly className: string;
    readonly expressions: Readonly<Partial<Record<AcademySpriteExpression, AcademySpriteSource>>> & {
        readonly neutral: AcademySpriteSource;
    };
    readonly initialExpression?: AcademySpriteExpression;
}

/**
 * A restrained sprite surface: animated WebP/GIF is selected only when the
 * learner allows motion, and the still image remains the canonical fallback.
 */
export function createAcademySprite(options: AcademySpriteOptions): HTMLPictureElement {
    const picture = document.createElement('picture');
    picture.className = `academy-sprite ${options.className}`;
    picture.dataset.character = options.characterId;
    const animated = document.createElement('source');
    animated.media = '(prefers-reduced-motion: no-preference)';
    animated.dataset.spriteAnimatedSource = '';
    const image = document.createElement('img');
    image.alt = options.alt;
    image.decoding = 'async';
    image.dataset.character = options.characterId;
    picture.append(animated, image);
    Object.defineProperty(picture, 'academySpriteSources', { value: options.expressions, writable: true });
    setAcademySpriteExpression(picture, options.initialExpression ?? 'neutral');
    return picture;
}

/** Refresh an existing sprite when a cast member changes to a new art contract. */
export function setAcademySpriteSources(
    picture: HTMLPictureElement,
    expressions: AcademySpriteOptions['expressions'],
): void {
    const sprite = picture as AcademySpriteElement;
    if (spriteSourcesEqual(sprite.academySpriteSources, expressions)) return;
    sprite.academySpriteSources = expressions;
    delete picture.dataset.expression;
}

export function setAcademySpriteExpression(
    picture: HTMLPictureElement,
    expression: AcademySpriteExpression,
): void {
    const sources = (picture as AcademySpriteElement).academySpriteSources;
    const source = sources?.[expression] ?? sources?.neutral;
    const image = picture.querySelector<HTMLImageElement>('img');
    const animated = picture.querySelector<HTMLSourceElement>('[data-sprite-animated-source]');
    if (!source || !image || !animated) throw new TypeError('Academy sprite is missing its source contract.');
    if (picture.dataset.expression === expression) return;
    picture.dataset.expression = expression;
    delete picture.dataset.expressionTransition;
    void picture.offsetWidth;
    picture.dataset.expressionTransition = 'true';
    image.src = source.still;
    if (source.animated) animated.srcset = source.animated;
    else animated.removeAttribute('srcset');
}

interface AcademySpriteElement extends HTMLPictureElement {
    academySpriteSources?: AcademySpriteOptions['expressions'];
}

function spriteSourcesEqual(
    left: AcademySpriteOptions['expressions'] | undefined,
    right: AcademySpriteOptions['expressions'],
): boolean {
    const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right)]);
    return [...keys].every(key => left?.[key as AcademySpriteExpression]?.still === right[key as AcademySpriteExpression]?.still
        && left?.[key as AcademySpriteExpression]?.animated === right[key as AcademySpriteExpression]?.animated);
}
