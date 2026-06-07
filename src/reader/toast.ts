export function showReaderToast(message: string, durationMs = 3200): void {
    const toast = document.createElement('div');
    toast.className = 'jpdb-reader-toast';
    toast.dataset.jpdbReaderRoot = 'true';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), durationMs);
}
