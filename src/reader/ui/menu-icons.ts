// One stroke icon set for the puck's radial menu and the extension toolbar menu
// (scripts/lib/extension-popup-actions.mjs reads the same JSON), so both places
// draw the same 16-unit shapes with the same weight, caps and corner radii.
// Built with DOM APIs: the toolbar copy must pass Firefox's store checker, which
// rejects markup assignment, and the puck shares the shapes, not a markup string.
import MENU_ICON_SHAPES from './menu-icons.json';

export type MenuIconName = keyof typeof MENU_ICON_SHAPES;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ATTRIBUTES: Readonly<Record<string, string>> = {
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
};

type IconShapes = readonly (readonly [string, Readonly<Record<string, string>>])[];

function iconShapes(name: MenuIconName): IconShapes {
    return (MENU_ICON_SHAPES[name] ?? MENU_ICON_SHAPES.fallback) as unknown as IconShapes;
}

export function menuIcon(name: MenuIconName, doc: Document = document): SVGSVGElement {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    for (const [attribute, value] of Object.entries(SVG_ATTRIBUTES)) svg.setAttribute(attribute, value);
    svg.dataset.icon = name;
    for (const [tag, attributes] of iconShapes(name)) {
        const shape = doc.createElementNS(SVG_NS, tag);
        for (const [attribute, value] of Object.entries(attributes)) shape.setAttribute(attribute, value);
        svg.append(shape);
    }
    return svg;
}

/** The same icon as markup, for surfaces rendered from template strings. */
export function menuIconMarkup(name: MenuIconName): string {
    const attributes = (values: Readonly<Record<string, string>>): string => Object.entries(values)
        .map(([attribute, value]) => ` ${attribute}="${value}"`)
        .join('');
    const shapes = iconShapes(name).map(([tag, values]) => `<${tag}${attributes(values)}/>`).join('');
    return `<svg${attributes({ ...SVG_ATTRIBUTES, 'data-icon': name })}>${shapes}</svg>`;
}
