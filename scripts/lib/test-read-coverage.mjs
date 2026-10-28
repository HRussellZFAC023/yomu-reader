import { relative } from 'node:path';
import { selectInputs } from './stage-cache.mjs';

export function testReadCoverage(root, graph, modules, events) {
    const failures = new Set();
    const precautionary = new Set();
    for (const { test, path } of events) {
        const deps = graph.tests[test];
        if (!deps) throw new Error(`trace test missing from graph: ${test}`);
        const inputs = deps.map(file => relative(root, file));
        // Unknown modules already select their consumers for every edit.
        if (inputs.some(file => modules[file]?.reads.unknown.length)) { precautionary.add(test); continue; }
        const targets = [...inputs, ...inputs.flatMap(file => modules[file]?.reads.targets ?? [])];
        if (!Object.keys(selectInputs({ [path]: true }, targets)).length) failures.add(`${test}: uncovered read ${path}`);
    }
    return { failures: [...failures], precautionary: [...precautionary] };
}
