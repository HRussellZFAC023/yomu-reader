import {
    formatGraphCoordinate,
    graphEdgeCurveControl,
    graphEllipseOffset,
    graphQuadraticPoint,
} from './kanji-graph-geometry';

export function installKanjiGraphDrag(root: HTMLElement): void {
        const graph = root.querySelector<HTMLElement>('.jpdb-reader-origin-graph-wrap');
        if (!graph) return;
        const nodes = Array.from(graph.querySelectorAll<HTMLElement>('[data-graph-node]'));
        const edgeGroups = Array.from(graph.querySelectorAll<SVGGElement>('.jpdb-reader-origin-edge-group[data-from][data-to]'));
        const nodeById = new Map(nodes.map(node => [node.dataset.graphNode ?? '', node]));
        let updateScheduled = false;
        const readNodeGeometry = (node: HTMLElement) => {
            const graphRect = graph.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const fallbackX = Number(node.dataset.x ?? 50);
            const fallbackY = Number(node.dataset.y ?? 50);
            if (!graphRect.width || !graphRect.height || !nodeRect.width || !nodeRect.height) {
                return {
                    x: fallbackX,
                    y: fallbackY,
                    rx: Number(node.dataset.rx ?? 6),
                    ry: Number(node.dataset.ry ?? 8),
                };
            }
            return {
                x: ((nodeRect.left + nodeRect.width / 2 - graphRect.left) / graphRect.width) * 100,
                y: ((nodeRect.top + nodeRect.height / 2 - graphRect.top) / graphRect.height) * 100,
                rx: (nodeRect.width / graphRect.width) * 50,
                ry: (nodeRect.height / graphRect.height) * 50,
            };
        };
        const edgePath = (from: ReturnType<typeof readNodeGeometry>, to: ReturnType<typeof readNodeGeometry>) => {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const sourceOffset = graphEllipseOffset(dx, dy, from.rx + 0.8, from.ry + 0.8);
            const targetOffset = graphEllipseOffset(dx, dy, to.rx + 1.75, to.ry + 1.75);
            const x1 = from.x + dx * sourceOffset;
            const y1 = from.y + dy * sourceOffset;
            const x2 = to.x - dx * targetOffset;
            const y2 = to.y - dy * targetOffset;
            const curve = graphEdgeCurveControl(x1, y1, x2, y2);
            return {
                d: `M${formatGraphCoordinate(x1)} ${formatGraphCoordinate(y1)} Q${formatGraphCoordinate(curve.x)} ${formatGraphCoordinate(curve.y)} ${formatGraphCoordinate(x2)} ${formatGraphCoordinate(y2)}`,
                points: [
                    graphQuadraticPoint(x1, y1, curve.x, curve.y, x2, y2, 0.38),
                    graphQuadraticPoint(x1, y1, curve.x, curve.y, x2, y2, 0.66),
                ],
            };
        };
        const updateLines = () => {
            for (const group of edgeGroups) {
                const from = group.dataset.from ? nodeById.get(group.dataset.from) : undefined;
                const to = group.dataset.to ? nodeById.get(group.dataset.to) : undefined;
                if (!from || !to) continue;
                const path = edgePath(readNodeGeometry(from), readNodeGeometry(to));
                group.querySelector<SVGPathElement>('.jpdb-reader-origin-edge')?.setAttribute('d', path.d);
                group.querySelectorAll<SVGCircleElement>('.jpdb-reader-origin-edge-particle').forEach((particle, index) => {
                    const point = path.points[index];
                    if (!point) return;
                    particle.setAttribute('cx', formatGraphCoordinate(point.x));
                    particle.setAttribute('cy', formatGraphCoordinate(point.y));
                });
            }
        };
        const scheduleLineUpdate = () => {
            if (updateScheduled) return;
            updateScheduled = true;
            requestAnimationFrame(() => {
                updateScheduled = false;
                updateLines();
            });
        };
        const outboundToggle = graph.querySelector<HTMLInputElement>('[data-origin-outbound-toggle]');
        if (outboundToggle) {
            const syncOutboundVisibility = () => {
                graph.classList.toggle('show-outbound', outboundToggle.checked);
                scheduleLineUpdate();
            };
            outboundToggle.addEventListener('change', syncOutboundVisibility);
            syncOutboundVisibility();
        }

        for (const node of nodes) {
            let pointerId = -1;
            let startX = 0;
            let startY = 0;
            let startLeft = Number(node.dataset.x ?? 50);
            let startTop = Number(node.dataset.y ?? 50);
            let moved = false;

            node.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                pointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                startLeft = Number(node.dataset.x ?? 50);
                startTop = Number(node.dataset.y ?? 50);
                moved = false;
                node.classList.add('dragging');
                node.setPointerCapture?.(event.pointerId);
                event.preventDefault();
            });
            node.addEventListener('pointermove', event => {
                if (event.pointerId !== pointerId) return;
                const rect = graph.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const nodeRect = node.getBoundingClientRect();
                const padX = Math.max(6, (nodeRect.width / rect.width) * 50 + 2);
                const padY = Math.max(9, (nodeRect.height / rect.height) * 50 + 2);
                const nextX = Math.max(padX, Math.min(100 - padX, startLeft + ((event.clientX - startX) / rect.width) * 100));
                const nextY = Math.max(padY, Math.min(100 - padY, startTop + ((event.clientY - startY) / rect.height) * 100));
                if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) moved = true;
                node.dataset.x = String(nextX);
                node.dataset.y = String(nextY);
                node.style.left = `${nextX}%`;
                node.style.top = `${nextY}%`;
                scheduleLineUpdate();
                event.preventDefault();
            });
            const finish = (event: PointerEvent) => {
                if (event.pointerId !== pointerId) return;
                node.releasePointerCapture?.(pointerId);
                pointerId = -1;
                node.classList.remove('dragging');
                if (moved) node.dataset.dragged = 'true';
                updateLines();
            };
            node.addEventListener('pointerup', finish);
            node.addEventListener('pointercancel', finish);
            node.addEventListener('click', event => {
                if (node.dataset.dragged !== 'true') return;
                delete node.dataset.dragged;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
        }
        requestAnimationFrame(updateLines);
    }

