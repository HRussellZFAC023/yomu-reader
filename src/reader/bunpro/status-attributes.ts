import type { CardRenderData } from '../cards/render-data';
import { escapeHtml } from '../dom';

export function bunproDefinitionStatusAttributes(status: CardRenderData['bunproDefinitionStatus']): string {
    if (!status) return '';
    const reason = 'reason' in status ? ` data-bunpro-definition-reason="${escapeHtml(status.reason)}"` : '';
    return ` data-bunpro-definition-status="${escapeHtml(status.state)}"${reason}`;
}
