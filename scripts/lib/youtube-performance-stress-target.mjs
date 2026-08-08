/**
 * Install the interaction-target resolver used by the YouTube performance
 * profile. The function is deliberately self-contained because Playwright
 * serializes it into the page; it must not close over module state.
 */
export function installYoutubePerformanceStressTargetSelector() {
    window.__yomuProfileSelectStressTarget = selectStressTarget;
    window.__yomuProfileWaitForStressTarget = waitForStressTarget;

    // Scrolling moves the source immediately, while its pointer-transparent
    // annotation portal catches up on a later paint. Precise coverage can
    // stretch that reconciliation beyond one frame. Start the lookup clock
    // only after this exact source occurrence owns its painted point.
    function waitForStressTarget(selector, request, timeoutMs) {
        return new Promise(resolve => {
            const startedAt = performance.now();
            let timer = 0;
            const finish = target => {
                window.clearTimeout(timer);
                resolve(target);
            };
            const sample = () => {
                const target = selectStressTarget(selector, request);
                if (target) return finish(target);
                if (performance.now() - startedAt >= timeoutMs) return finish(null);
                requestAnimationFrame(sample);
            };
            timer = window.setTimeout(sample, timeoutMs);
            requestAnimationFrame(sample);
        });
    }

    function selectStressTarget(selector, request) {
        if (!validTargetRequest(request)) return null;
        const occurrence = requestedOccurrence(request);
        const words = [...document.querySelectorAll(selector)].filter(word => word instanceof HTMLElement);
        const candidates = words
            .map((word, domIndex) => {
                const lane = stressLane(word);
                return { word, domIndex, lane, priority: targetPriority(lane, word) };
            })
            .filter(candidate => candidateMatchesRequest(candidate, request))
            .sort((left, right) => left.priority - right.priority || left.domIndex - right.domIndex);
        const candidate = candidates[occurrence];
        if (!candidate) return null;
        // Resolve only the requested occurrence. Falling through to another
        // expression or DOM position makes two profiler runs incomparable.
        return resolveRequestedTarget(candidate, occurrence);
    }

    function validTargetRequest(request) {
        if (!request) return false;
        return typeof request.expression === 'string' && typeof request.lane === 'string';
    }

    function requestedOccurrence(request) {
        if (!Number.isSafeInteger(request.occurrence)) return 0;
        if (request.occurrence < 0) return 0;
        return request.occurrence;
    }

    function candidateMatchesRequest(candidate, request) {
        if (candidate.lane !== request.lane) return false;
        if (targetExpression(candidate.word) !== request.expression) return false;
        if (!request.sourceText) return true;
        return sourceTextForWord(candidate.word) === request.sourceText;
    }

    function resolveRequestedTarget(candidate, occurrence) {
        const target = stressTargetForWord(candidate.word, candidate.domIndex, candidate.lane);
        if (!target) return null;
        const { priority, domIndex, ...result } = target;
        void priority;
        void domIndex;
        return {
            ...result,
            occurrence,
            sourceText: sourceTextForWord(candidate.word),
        };
    }

    function stressTargetForWord(word, domIndex, lane) {
        const mirror = word.closest('.jpdb-reader-additive-text-mirror');
        // Projected mirror words are full-host shells. Their source fragments,
        // not the shell's broad bounding box, are the visible/token geometry.
        const geometryElements = mirror
            ? [...word.querySelectorAll('.jpdb-reader-source-fragment')]
            : [word];
        if (!geometryElements.length) return null;
        const sourceText = mirror?.dataset.sourceText ?? '';
        const sourceStart = Number.parseInt(word.dataset.yomuSourceStart ?? '', 10);
        const sourceEnd = Number.parseInt(word.dataset.yomuSourceEnd ?? '', 10);
        for (const geometryElement of geometryElements) {
            for (const rect of geometryElement.getClientRects()) {
                for (const point of rectProbePoints(rect)) {
                    if (!pointInsideViewport(point)) continue;
                    const eventTarget = document.elementFromPoint(point.x, point.y);
                    if (!(eventTarget instanceof Element)) continue;
                    const identity = mirror
                        ? mirroredSourceIdentity(eventTarget, sourceText, sourceStart, sourceEnd, point)
                        : directWordIdentity(eventTarget, word);
                    if (!identity) continue;
                    const expected = word.dataset.expression
                        || word.dataset.surface
                        || word.textContent?.replace(/\s+/gu, '').slice(0, 6)
                        || '';
                    return {
                        priority: targetPriority(lane, word),
                        domIndex,
                        x: Math.round(point.x),
                        y: Math.round(point.y),
                        expected,
                        text: word.textContent?.replace(/\s+/gu, '').slice(0, 24) ?? '',
                        surface: word.dataset.surface ?? '',
                        expression: word.dataset.expression ?? '',
                        lane,
                        eventTarget: elementLabel(eventTarget),
                        geometry: {
                            rect: roundedRect(rect),
                            sourceRect: identity.sourceRect ? roundedRect(identity.sourceRect) : null,
                            sourceHost: identity.sourceHost ? elementLabel(identity.sourceHost) : '',
                            sourceStart: Number.isFinite(sourceStart) ? sourceStart : null,
                            sourceEnd: Number.isFinite(sourceEnd) ? sourceEnd : null,
                        },
                    };
                }
            }
        }
        return null;
    }

    function stressLane(word) {
        if (word.closest('.jpdb-reader-document-annotation-portal')) return 'portal';
        if (word.closest('.jpdb-reader-additive-text-mirror')) return 'mirror';
        if (word.closest('.jpdb-ocr-line')) return 'ocr';
        return 'word';
    }

    function targetPriority(lane, word) {
        if (lane === 'portal' && word.dataset.jpdbReaderPassive !== 'true') return 0;
        if (lane === 'mirror' && word.dataset.jpdbReaderPassive !== 'true') return 1;
        if (lane === 'word') return 2;
        if (lane === 'ocr') return 3;
        if (lane === 'portal') return 4;
        return 5;
    }

    function targetExpression(word) {
        return word.dataset.expression
            || word.dataset.surface
            || word.textContent?.replace(/\s+/gu, '').slice(0, 6)
            || '';
    }

    function sourceTextForWord(word) {
        return word.closest('.jpdb-reader-additive-text-mirror')?.dataset.sourceText ?? '';
    }

    function directWordIdentity(eventTarget, word) {
        return eventTarget.closest('.jpdb-reader-word') === word ? {} : null;
    }

    function mirroredSourceIdentity(eventTarget, sourceText, sourceStart, sourceEnd, point) {
        // A different painted reader word (most importantly the fixed OCR
        // overlay used by this same profile) owns the point. Looking through it
        // would measure a word the user cannot actually interact with.
        if (eventTarget.closest('.jpdb-reader-word')) return null;
        if (!sourceText || !Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) return null;
        for (const ancestor of composedAncestors(eventTarget, 18)) {
            const source = sourceTextSnapshot(ancestor);
            if (source.text !== sourceText || sourceEnd > source.text.length) continue;
            const range = sourceRange(source.nodes, sourceStart, sourceEnd);
            if (!range) continue;
            const sourceRect = [...range.getClientRects()].find(rect => pointInsideRect(point, rect, 0.75));
            if (sourceRect) return { sourceHost: ancestor, sourceRect };
        }
        return null;
    }

    function sourceTextSnapshot(root) {
        const nodes = [];
        let text = '';
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.jpdb-reader-text-mirror,[data-jpdb-reader-root],script,style')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            nodes.push({ node, start: text.length });
            text += node.data;
        }
        return { text, nodes };
    }

    function sourceRange(nodes, start, end) {
        const startBoundary = sourceBoundary(nodes, start, 'start');
        const endBoundary = sourceBoundary(nodes, end, 'end');
        if (!startBoundary || !endBoundary) return null;
        const range = document.createRange();
        range.setStart(startBoundary.node, startBoundary.offset);
        range.setEnd(endBoundary.node, endBoundary.offset);
        return range;
    }

    function sourceBoundary(nodes, offset, side) {
        let boundary = null;
        for (const entry of nodes) {
            const end = entry.start + entry.node.data.length;
            if (offset < entry.start || offset > end) continue;
            const candidate = { node: entry.node, offset: offset - entry.start };
            if (side === 'start' && offset < end) return candidate;
            boundary = candidate;
            if (side === 'end' && offset > entry.start) return candidate;
        }
        return boundary;
    }

    function rectProbePoints(rect) {
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        if (width <= 1 || height <= 1) return [];
        const y = rect.top + height / 2;
        return [0.5, 0.25, 0.75].map(fraction => ({ x: rect.left + width * fraction, y }));
    }

    function pointInsideViewport(point) {
        return point.x >= 10
            && point.y >= 10
            && point.x <= window.innerWidth - 10
            && point.y <= window.innerHeight - 10;
    }

    function pointInsideRect(point, rect, slack) {
        return point.x >= rect.left - slack
            && point.x <= rect.right + slack
            && point.y >= rect.top - slack
            && point.y <= rect.bottom + slack;
    }

    function composedAncestors(element, limit) {
        const ancestors = [];
        let current = element;
        for (let depth = 0; current && depth < limit; depth += 1) {
            ancestors.push(current);
            const root = current.getRootNode();
            current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        }
        return ancestors;
    }

    function elementLabel(element) {
        return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;
    }

    function roundedRect(rect) {
        return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height']
            .map(key => [key, Math.round(Number(rect[key] ?? 0) * 10) / 10]));
    }
}
