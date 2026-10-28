// Hosted shells are both sync inputs and outputs. Key authored bytes while the
// writer owns its marked blocks and revisions, so undo can restore a cached pair.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const hostedTemplates = ['pdf-reader', 'video-player'].flatMap(surface =>
    ['index.html', 'sw.js'].map(file => `docs/public/${surface}/${file}`));
function authoredTemplate(source) {
    for (const [start, end] of [
        ['// yomu:runtime-companions:start', '// yomu:runtime-companions:end'],
        ['// yomu:runtime-cache:start', '// yomu:runtime-cache:end'],
        ['/* yomu:appearance-boot:start */', '/* yomu:appearance-boot:end */'],
        ['<!-- yomu:site-nav:start -->', '<!-- yomu:site-nav:end -->'],
    ]) {
        if (source.split(start).length !== 2 || source.split(end).length !== 2) continue;
        const from = source.indexOf(start) + start.length;
        const to = source.indexOf(end);
        if (to >= from) source = source.slice(0, from) + source.slice(to);
    }
    return source.replace(/(const APPEARANCE_REVISION = ')[a-f\d]{12}(';)/g, '$1<generated>$2');
}
export function hostedTemplateInputs(root) {
    return Object.fromEntries(hostedTemplates.map(path => [path, authoredTemplate(readFileSync(join(root, path), 'utf8'))]));
}
